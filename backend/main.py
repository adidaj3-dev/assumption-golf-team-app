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
        .select("*, players(full_name), hole_scores(strokes, holes(par))")
        .eq("tournament_id", tournament["id"])
        .execute()
        .data
    )

    leaderboard = []
    for r in rounds:
        scores = r.get("hole_scores", [])
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
    }


@app.get("/players/{player_id}/stats")
def player_stats(player_id: UUID, player=Depends(get_current_player)):
    if player["id"] != str(player_id) and player["role"] != "coach":
        raise HTTPException(403, "Not authorized")

    rounds = (
        supabase.table("rounds")
        .select("*, hole_scores(strokes, putts, fairway_hit, gir, holes(par))")
        .eq("player_id", str(player_id))
        .not_.is_("completed_at", "null")
        .execute()
        .data
    )

    if not rounds:
        return {"rounds_played": 0}

    total_score_to_par = 0
    fairways_hit = fairways_total = 0
    girs_hit = holes_total = 0
    putts_total = 0

    for r in rounds:
        for s in r["hole_scores"]:
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

    return {
        "rounds_played": len(rounds),
        "scoring_avg_to_par": round(total_score_to_par / len(rounds), 2),
        "gir_pct": round(100 * girs_hit / holes_total, 1) if holes_total else None,
        "fairway_pct": round(100 * fairways_hit / fairways_total, 1) if fairways_total else None,
        "putts_per_round": round(putts_total / len(rounds), 2),
    }
