"""
Golf Team App — Phase 1 backend
Run with: uvicorn main:app --reload
"""
import os
from typing import Optional
from uuid import UUID

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_KEY = os.environ["SUPABASE_SERVICE_KEY"]  # server-side key, never sent to frontend

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

app = FastAPI(title="Golf Team App API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your frontend domain before going live
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_current_player(authorization: Optional[str] = Header(None)) -> dict:
    """Validates the Supabase JWT sent from the frontend and returns the player row."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing auth token")
    token = authorization.split(" ", 1)[1]
    user = supabase.auth.get_user(token)
    if not user or not user.user:
        raise HTTPException(401, "Invalid token")
    player = supabase.table("players").select("*").eq("id", user.user.id).single().execute()
    if not player.data:
        raise HTTPException(404, "Player profile not found")
    return player.data


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class HoleIn(BaseModel):
    hole_number: int
    par: int
    handicap: int
    yardage: Optional[int] = None
    tee_box: Optional[str] = None


class CourseIn(BaseModel):
    name: str
    holes: list[HoleIn]


class RoundStartIn(BaseModel):
    course_id: UUID
    tournament_id: Optional[UUID] = None


class HoleScoreIn(BaseModel):
    hole_id: UUID
    strokes: int
    putts: Optional[int] = None
    fairway_hit: Optional[bool] = None
    gir: Optional[bool] = None


class TournamentIn(BaseModel):
    name: str
    course_id: UUID
    slug: str


# ---------------------------------------------------------------------------
# Courses (admin/coach creates these — manual entry for Phase 1;
# OCR auto-fill comes in Phase 4 and will POST to this same endpoint)
# ---------------------------------------------------------------------------

@app.post("/courses")
def create_course(course: CourseIn, player=Depends(get_current_player)):
    if player["role"] != "coach":
        raise HTTPException(403, "Only coaches can create courses")
    if len(course.holes) not in (9, 18):
        raise HTTPException(400, "Course must have 9 or 18 holes")

    course_row = supabase.table("courses").insert(
        {"name": course.name, "created_by": player["id"]}
    ).execute().data[0]

    holes_payload = [
        {"course_id": course_row["id"], **h.model_dump()} for h in course.holes
    ]
    supabase.table("holes").insert(holes_payload).execute()

    return course_row


@app.get("/courses")
def list_courses():
    """Lists all courses — used to populate the course picker before starting a round."""
    courses = supabase.table("courses").select("id, name, created_at").order("name").execute().data
    return courses


@app.get("/courses/{course_id}")
def get_course(course_id: UUID):
    course = supabase.table("courses").select("*").eq("id", str(course_id)).single().execute().data
    if not course:
        raise HTTPException(404, "Course not found")
    holes = (
        supabase.table("holes")
        .select("*")
        .eq("course_id", str(course_id))
        .order("hole_number")
        .execute()
        .data
    )
    course["holes"] = holes
    return course


# ---------------------------------------------------------------------------
# Tournaments
# ---------------------------------------------------------------------------

@app.post("/tournaments")
def create_tournament(t: TournamentIn, player=Depends(get_current_player)):
    if player["role"] != "coach":
        raise HTTPException(403, "Only coaches can create tournaments")
    row = supabase.table("tournaments").insert(
        {"name": t.name, "course_id": str(t.course_id), "slug": t.slug, "created_by": player["id"]}
    ).execute().data[0]
    return row


@app.get("/tournaments/{slug}/leaderboard")
def get_public_leaderboard(slug: str):
    """Public, unauthenticated endpoint — this is what the family/friends link hits."""
    tournament = (
        supabase.table("tournaments").select("*").eq("slug", slug).single().execute().data
    )
    if not tournament:
        raise HTTPException(404, "Tournament not found")

    rounds = (
        supabase.table("rounds")
        .select("id, completed_at, players(full_name)")
        .eq("tournament_id", tournament["id"])
        .execute()
        .data
    )

    leaderboard = []
    for r in rounds:
        scores = (
            supabase.table("hole_scores")
            .select("strokes, holes(par)")
            .eq("round_id", r["id"])
            .execute()
            .data
        )
        total_strokes = sum(s["strokes"] for s in scores)
        total_par = sum(s["holes"]["par"] for s in scores)
        leaderboard.append(
            {
                "player_name": r["players"]["full_name"],
                "holes_played": len(scores),
                "total_strokes": total_strokes,
                "score_to_par": total_strokes - total_par,
                "completed": r["completed_at"] is not None,
            }
        )

    leaderboard.sort(key=lambda x: x["score_to_par"])
    return {"tournament_name": tournament["name"], "leaderboard": leaderboard}


# ---------------------------------------------------------------------------
# Rounds & hole-by-hole scoring (players use these)
# ---------------------------------------------------------------------------

@app.post("/rounds/start")
def start_round(r: RoundStartIn, player=Depends(get_current_player)):
    row = supabase.table("rounds").insert(
        {
            "player_id": player["id"],
            "course_id": str(r.course_id),
            "tournament_id": str(r.tournament_id) if r.tournament_id else None,
        }
    ).execute().data[0]
    return row


@app.post("/rounds/{round_id}/holes")
def submit_hole_score(round_id: UUID, score: HoleScoreIn, player=Depends(get_current_player)):
    round_row = supabase.table("rounds").select("*").eq("id", str(round_id)).single().execute().data
    if not round_row or round_row["player_id"] != player["id"]:
        raise HTTPException(403, "Not your round")

    score_data = score.model_dump()
    score_data["hole_id"] = str(score_data["hole_id"])

    row = supabase.table("hole_scores").upsert(
        {"round_id": str(round_id), **score_data},
        on_conflict="round_id,hole_id",
    ).execute().data[0]
    return row


@app.post("/rounds/{round_id}/complete")
def complete_round(round_id: UUID, player=Depends(get_current_player)):
    round_row = supabase.table("rounds").select("*").eq("id", str(round_id)).single().execute().data
    if not round_row or round_row["player_id"] != player["id"]:
        raise HTTPException(403, "Not your round")

    scores = supabase.table("hole_scores").select("putts").eq("round_id", str(round_id)).execute().data
    total_putts = sum(s["putts"] for s in scores if s["putts"] is not None) or None

    updated = supabase.table("rounds").update(
        {"completed_at": "now()", "total_putts": total_putts}
    ).eq("id", str(round_id)).execute().data[0]
    return updated


@app.get("/rounds/{round_id}/summary")
def round_summary(round_id: UUID, player=Depends(get_current_player)):
    """
    Summary for a single round, at whatever point it's at — this works for a
    finished round OR one still in progress, so it's what powers both the
    'turn' summary after 9 holes and the final summary after 18.
    """
    round_row = supabase.table("rounds").select("*").eq("id", str(round_id)).single().execute().data
    if not round_row:
        raise HTTPException(404, "Round not found")
    if round_row["player_id"] != player["id"] and player["role"] != "coach":
        raise HTTPException(403, "Not authorized")

    scores = (
        supabase.table("hole_scores")
        .select("strokes, putts, fairway_hit, gir, holes(hole_number, par)")
        .eq("round_id", str(round_id))
        .execute()
        .data
    )

    if not scores:
        return {"holes_played": 0}

    total_strokes = sum(s["strokes"] for s in scores)
    total_par = sum(s["holes"]["par"] for s in scores)
    putts_total = sum(s["putts"] for s in scores if s["putts"] is not None)
    girs_hit = sum(1 for s in scores if s["gir"])
    fairway_scores = [s for s in scores if s["fairway_hit"] is not None]
    fairways_hit = sum(1 for s in fairway_scores if s["fairway_hit"])

    return {
        "holes_played": len(scores),
        "total_strokes": total_strokes,
        "score_to_par": total_strokes - total_par,
        "putts": putts_total,
        "gir_count": girs_hit,
        "gir_pct": round(100 * girs_hit / len(scores), 1),
        "fairway_count": fairways_hit,
        "fairway_pct": round(100 * fairways_hit / len(fairway_scores), 1) if fairway_scores else None,
        "completed": round_row["completed_at"] is not None,
        "started_at": round_row["started_at"],
        "completed_at": round_row["completed_at"],
    }


@app.get("/players/{player_id}/rounds")
def player_rounds(player_id: UUID, player=Depends(get_current_player)):
    """Lists every round a player has (in-progress or completed), newest
    first, with a quick summary of each — used for the coach's per-player
    round history view."""
    if player["id"] != str(player_id) and player["role"] != "coach":
        raise HTTPException(403, "Not authorized")

    rounds = (
        supabase.table("rounds")
        .select("id, started_at, completed_at, courses(name)")
        .eq("player_id", str(player_id))
        .order("started_at", desc=True)
        .execute()
        .data
    )

    results = []
    for r in rounds:
        scores = (
            supabase.table("hole_scores")
            .select("strokes, holes(par)")
            .eq("round_id", r["id"])
            .execute()
            .data
        )
        total_strokes = sum(s["strokes"] for s in scores)
        total_par = sum(s["holes"]["par"] for s in scores)
        results.append({
            "id": r["id"],
            "course_name": r["courses"]["name"] if r["courses"] else "Unknown course",
            "started_at": r["started_at"],
            "completed_at": r["completed_at"],
            "holes_played": len(scores),
            "score_to_par": (total_strokes - total_par) if scores else None,
            "completed": r["completed_at"] is not None,
        })
    return results


def _compute_player_stats(player_id: str) -> dict:
    """Shared stats logic — used by both the player's own stats screen and
    the coach's team overview, so both stay consistent."""
    completed_rounds = (
        supabase.table("rounds")
        .select("id, completed_at")
        .eq("player_id", player_id)
        .not_.is_("completed_at", "null")
        .order("completed_at", desc=True)
        .execute()
        .data
    )

    if not completed_rounds:
        return {"rounds_played": 0, "last_round": None}

    round_ids = [r["id"] for r in completed_rounds]

    all_scores = (
        supabase.table("hole_scores")
        .select("round_id, strokes, putts, fairway_hit, gir, holes(par)")
        .in_("round_id", round_ids)
        .execute()
        .data
    )

    total_score_to_par = 0
    fairways_hit = fairways_total = 0
    girs_hit = holes_total = 0
    putts_total = 0

    for s in all_scores:
        total_score_to_par += s["strokes"] - s["holes"]["par"]
        holes_total += 1
        if s["gir"]:
            girs_hit += 1
        if s["fairway_hit"] is not None:
            fairways_total += 1
            if s["fairway_hit"]:
                fairways_hit += 1
        if s["putts"]:
            putts_total += s["putts"]

    # Front-9 / back-9 breakdown for the most recent completed round
    most_recent_id = completed_rounds[0]["id"]
    last_round_scores = (
        supabase.table("hole_scores")
        .select("strokes, holes(hole_number, par)")
        .eq("round_id", most_recent_id)
        .execute()
        .data
    )
    front = [s for s in last_round_scores if s["holes"]["hole_number"] <= 9]
    back = [s for s in last_round_scores if s["holes"]["hole_number"] > 9]

    def to_par(scores):
        if not scores:
            return None
        return sum(s["strokes"] for s in scores) - sum(s["holes"]["par"] for s in scores)

    last_round = {
        "date": completed_rounds[0]["completed_at"],
        "front9_to_par": to_par(front),
        "back9_to_par": to_par(back),
        "total_to_par": to_par(last_round_scores),
    }

    return {
        "rounds_played": len(completed_rounds),
        "scoring_avg_to_par": round(total_score_to_par / len(completed_rounds), 2),
        "gir_pct": round(100 * girs_hit / holes_total, 1) if holes_total else None,
        "fairway_pct": round(100 * fairways_hit / fairways_total, 1) if fairways_total else None,
        "putts_per_round": round(putts_total / len(completed_rounds), 2),
        "last_round": last_round,
    }


@app.get("/players/{player_id}/stats")
def player_stats(player_id: UUID, player=Depends(get_current_player)):
    if player["id"] != str(player_id) and player["role"] != "coach":
        raise HTTPException(403, "Not authorized")
    return _compute_player_stats(str(player_id))


@app.get("/coach/team-stats")
def team_stats(player=Depends(get_current_player)):
    """Coach-only: every player's stats in one call, for the coach dashboard."""
    if player["role"] != "coach":
        raise HTTPException(403, "Coach access only")

    all_players = (
        supabase.table("players")
        .select("id, full_name, role")
        .order("full_name")
        .execute()
        .data
    )

    results = []
    for p in all_players:
        stats = _compute_player_stats(p["id"])
        results.append({"player_id": p["id"], "full_name": p["full_name"], "role": p["role"], **stats})

    return results
