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


# ---------------------------------------------------------------------------
# Practice Combines
#
# Each combine is defined once, here, as data — not hardcoded per-combine UI
# or logic. To add a new combine (e.g. a putting combine tomorrow), add a new
# entry to COMBINE_DEFINITIONS with its own attempt count and result/point
# options; the submit/list endpoints and the frontend both work generically
# off this definition, no new code needed for the simple attempt-based ones.
# ---------------------------------------------------------------------------

COMBINE_DEFINITIONS = {
    "tour_level_driver": {
        "name": "Tour-Level Driver Combine",
        "category": "Driver",
        "objective": "Improve driver accuracy and distance.",
        "instructions": "Hit 10 drives.",
        "scoring_type": "sum_points",
        "attempts": 10,
        "attempt_labels": None,  # default labels "Attempt 1", "Attempt 2", ...
        "results": [
            {"code": "fairway_long", "label": "Fairway + Long", "points": 3},
            {"code": "fairway", "label": "Fairway", "points": 2},
            {"code": "near", "label": "Near Fairway", "points": 1},
            {"code": "miss", "label": "Missed Fairway", "points": 0},
        ],
        "max_points": 30,
        "benchmarks": [
            {"level": "D1", "range": "18-24"},
            {"level": "PGA", "range": "24-30"},
        ],
    },
    "speed_accuracy_ladder": {
        "name": "Speed + Accuracy Ladder",
        "category": "Driver",
        "objective": "Improve swing speed and accuracy.",
        "instructions": "Hit 5 drives each at increasing speed levels.",
        "scoring_type": "sum_points",
        "attempts": 5,
        "attempt_labels": ["Speed Level 1", "Speed Level 2", "Speed Level 3", "Speed Level 4", "Speed Level 5"],
        "results": [
            {"code": "fairway", "label": "Fairway", "points": 2},
            {"code": "near", "label": "Near Fairway", "points": 1},
            {"code": "miss", "label": "Missed Fairway", "points": 0},
        ],
        "max_points": 10,
        "benchmarks": [
            {"level": "D1", "range": "12-16"},
            {"level": "PGA", "range": "16-20"},
        ],
    },
    "three_six_nine_circle": {
        "name": "3-6-9 Circle Drill",
        "category": "Putting",
        "objective": "Build consistency putting from inside 10 feet.",
        "instructions": "Putt 10 balls each from 3, 6, and 9 feet (30 total).",
        "scoring_type": "sum_points",
        "attempts": 30,
        "attempt_labels": [f"{d} ft — Putt {i}" for d in (3, 6, 9) for i in range(1, 11)],
        "results": [
            {"code": "make", "label": "Make", "points": 1},
            {"code": "miss", "label": "Miss", "points": 0},
        ],
        "max_points": 30,
        "benchmarks": [
            {"level": "D2", "range": "15-20"},
            {"level": "D1", "range": "18-22"},
            {"level": "PGA", "range": "22-26"},
        ],
    },
    "lag_putting": {
        "name": "Lag Putting Combine",
        "category": "Putting",
        "objective": "Improve distance control on long putts.",
        "instructions": "Putt 10 balls each from 20, 40, and 60 feet (30 total). Score each putt by how close it finishes.",
        "scoring_type": "sum_points",
        "attempts": 30,
        "attempt_labels": [f"{d} ft — Putt {i}" for d in (20, 40, 60) for i in range(1, 11)],
        "results": [
            {"code": "inside3", "label": "Make / Inside 3 ft", "points": 3},
            {"code": "inside6", "label": "Inside 6 ft", "points": 2},
            {"code": "inside10", "label": "Inside 10 ft", "points": 1},
            {"code": "outside10", "label": "Outside 10 ft", "points": 0},
        ],
        "max_points": 90,
        "benchmarks": [
            {"level": "D2", "range": "35-45"},
            {"level": "D1", "range": "42-55"},
            {"level": "PGA", "range": "55-65"},
        ],
    },
    "pressure_ladder": {
        "name": "Pressure Ladder",
        "category": "Putting",
        "objective": "Build pressure putting under increasing distance.",
        "instructions": "Putt 2 balls each from 5, 7, 9, 11, and 13 feet. A distance only counts as a completion if BOTH putts are made.",
        "scoring_type": "ladder_completions",
        "groups": [
            {"label": "5 ft"},
            {"label": "7 ft"},
            {"label": "9 ft"},
            {"label": "11 ft"},
            {"label": "13 ft"},
        ],
        "sub_attempts_per_group": 2,
        "results": [
            {"code": "make", "label": "Make", "points": 1},
            {"code": "miss", "label": "Miss", "points": 0},
        ],
        "max_points": 5,  # max possible completions
        "benchmarks": [
            {"level": "D2", "range": "0-1"},
            {"level": "D1", "range": "1-2"},
            {"level": "PGA", "range": "3-5"},
        ],
    },
    "make_percentage_test": {
        "name": "Make-Percentage Test",
        "category": "Putting",
        "objective": "Measure short-range make percentage under volume.",
        "instructions": "Putt 20 balls each from 5 feet and 8 feet (40 total).",
        "scoring_type": "sum_points",
        "attempts": 40,
        "attempt_labels": [f"{d} ft — Putt {i}" for d in (5, 8) for i in range(1, 21)],
        "results": [
            {"code": "make", "label": "Make", "points": 1},
            {"code": "miss", "label": "Miss", "points": 0},
        ],
        "max_points": 40,
        "benchmarks": [
            {"level": "D2", "range": "16-22"},
            {"level": "D1", "range": "20-26"},
            {"level": "PGA", "range": "28-34"},
        ],
    },
    "tournament_putting_challenge": {
        "name": "Tournament Putting Challenge",
        "category": "Putting",
        "objective": "Simulate real course putting conditions.",
        "instructions": "Putt 5 balls each on a left-to-right breaker, right-to-left breaker, uphill putt, and downhill putt (20 total). Score each putt by how close it finishes.",
        "scoring_type": "sum_points",
        "attempts": 20,
        "attempt_labels": [
            f"{cond} — Putt {i}"
            for cond in ("L-to-R Breaker", "R-to-L Breaker", "Uphill", "Downhill")
            for i in range(1, 6)
        ],
        "results": [
            {"code": "inside3", "label": "Make / Inside 3 ft", "points": 3},
            {"code": "inside6", "label": "Inside 6 ft", "points": 2},
            {"code": "inside10", "label": "Inside 10 ft", "points": 1},
            {"code": "outside10", "label": "Outside 10 ft", "points": 0},
        ],
        "max_points": 60,
        "benchmarks": [
            {"level": "D2", "range": "18-26"},
            {"level": "D1", "range": "22-30"},
            {"level": "PGA", "range": "30-36"},
        ],
    },
    "ladder_distance_control": {
        "name": "Ladder Distance Control",
        "category": "Short Game",
        "objective": "Improve distance control with wedges.",
        "instructions": "Hit 5 shots each to targets at 20, 30, 40, and 50 yards (20 total).",
        "scoring_type": "sum_points",
        "attempts": 20,
        "attempt_labels": [f"{d} yds — Shot {i}" for d in (20, 30, 40, 50) for i in range(1, 6)],
        "results": [
            {"code": "inside3", "label": "Inside 3 ft", "points": 3},
            {"code": "inside6", "label": "Inside 6 ft", "points": 2},
            {"code": "inside10", "label": "Inside 10 ft", "points": 1},
            {"code": "outside10", "label": "Outside 10 ft", "points": 0},
        ],
        "max_points": 60,
        "benchmarks": [
            {"level": "D1", "range": "18-24"},
            {"level": "PGA", "range": "24-30"},
        ],
    },
    "up_and_down_gauntlet": {
        "name": "Up-and-Down Gauntlet",
        "category": "Short Game",
        "objective": "Improve consistency around the green.",
        "instructions": "Play 9 different short game shots. Score each attempt.",
        "scoring_type": "sum_points",
        "attempts": 9,
        "attempt_labels": None,
        "results": [
            {"code": "updown", "label": "Up-and-Down", "points": 1},
            {"code": "miss", "label": "Miss", "points": 0},
        ],
        "max_points": 9,
        "benchmarks": [
            {"level": "D1", "range": "5-7"},
            {"level": "PGA", "range": "7-9"},
        ],
    },
    "wedge_combine": {
        "name": "Wedge Combine",
        "category": "Wedges",
        "objective": "Improve wedge distance control from key scoring distances.",
        "instructions": "Hit 10 shots each from 50, 75, and 100 yards (30 total).",
        "scoring_type": "sum_points",
        "attempts": 30,
        "attempt_labels": [f"{d} yds — Shot {i}" for d in (50, 75, 100) for i in range(1, 11)],
        "results": [
            {"code": "inside5", "label": "Inside 5 ft", "points": 3},
            {"code": "inside10", "label": "Inside 10 ft", "points": 2},
            {"code": "inside20", "label": "Inside 20 ft", "points": 1},
            {"code": "outside20", "label": "Outside 20 ft", "points": 0},
        ],
        "max_points": 90,
        "benchmarks": [
            {"level": "D2", "range": "35-50"},
            {"level": "D1", "range": "45-60"},
            {"level": "PGA", "range": "60-75"},
        ],
    },
    "trajectory_triathlon": {
        "name": "Trajectory Triathlon Combine",
        "category": "Any Club",
        "objective": "Master trajectory control.",
        "instructions": "Hit 5 shots each with low, medium, and high trajectories (15 total).",
        "scoring_type": "sum_points",
        "attempts": 15,
        "attempt_labels": [f"{traj} — Shot {i}" for traj in ("Low", "Medium", "High") for i in range(1, 6)],
        "results": [
            {"code": "hit", "label": "Target Hit", "points": 2},
            {"code": "near", "label": "Near Miss", "points": 1},
            {"code": "miss", "label": "Miss", "points": 0},
        ],
        "max_points": 30,
        "benchmarks": [
            {"level": "D1", "range": "18-24"},
            {"level": "PGA", "range": "24-30"},
        ],
    },
    "mid_iron_college_combine": {
        "name": "College Combine (6-Iron & 4-Iron)",
        "category": "Mid Irons / Woods",
        "objective": "Improve mid-iron accuracy.",
        "instructions": "Hit 10 shots each with 6-iron and 4-iron (20 total).",
        "scoring_type": "sum_points",
        "attempts": 20,
        "attempt_labels": [f"{club} — Shot {i}" for club in ("6-Iron", "4-Iron") for i in range(1, 11)],
        "results": [
            {"code": "inside10", "label": "Inside 10 ft", "points": 3},
            {"code": "inside20", "label": "Inside 20 ft", "points": 2},
            {"code": "inside30", "label": "Inside 30 ft", "points": 1},
            {"code": "outside30", "label": "Outside 30 ft", "points": 0},
        ],
        "max_points": 60,
        "benchmarks": [
            {"level": "D1", "range": "30-40"},
            {"level": "PGA", "range": "40-50"},
        ],
    },
    "fairway_finder_challenge": {
        "name": "Fairway Finder Challenge",
        "category": "Mid Irons / Woods",
        "objective": "Improve fairway accuracy.",
        "instructions": "Hit 10 shots with fairway wood.",
        "scoring_type": "sum_points",
        "attempts": 10,
        "attempt_labels": None,
        "results": [
            {"code": "fairway", "label": "Fairway Hit", "points": 2},
            {"code": "near", "label": "Near Fairway", "points": 1},
            {"code": "miss", "label": "Miss", "points": 0},
        ],
        "max_points": 20,
        "benchmarks": [
            {"level": "D1", "range": "12-16"},
            {"level": "PGA", "range": "16-20"},
        ],
    },
}


class CombineSubmitIn(BaseModel):
    attempts: list[str]  # result codes, one per attempt, in order
    player_id: Optional[UUID] = None  # who this combine is FOR — defaults to
    # whoever is logged in, but any teammate can log it on someone else's
    # behalf (e.g. practicing in pairs and one person runs the phone).


@app.get("/combines")
def list_combines():
    """Returns every combine definition — the frontend builds its rules
    sheet and entry screen entirely from this, no per-combine frontend code."""
    return [{"slug": slug, **definition} for slug, definition in COMBINE_DEFINITIONS.items()]


@app.get("/combines/{slug}")
def get_combine(slug: str):
    definition = COMBINE_DEFINITIONS.get(slug)
    if not definition:
        raise HTTPException(404, "Combine not found")
    return {"slug": slug, **definition}


@app.post("/combines/{slug}/submit")
def submit_combine(slug: str, submission: CombineSubmitIn, player=Depends(get_current_player)):
    definition = COMBINE_DEFINITIONS.get(slug)
    if not definition:
        raise HTTPException(404, "Combine not found")

    scoring_type = definition.get("scoring_type", "sum_points")
    valid_codes = {r["code"] for r in definition["results"]}

    if scoring_type == "ladder_completions":
        expected_length = len(definition["groups"]) * definition["sub_attempts_per_group"]
    else:
        expected_length = definition["attempts"]

    if len(submission.attempts) != expected_length:
        raise HTTPException(400, f"Expected {expected_length} attempts, got {len(submission.attempts)}")

    for code in submission.attempts:
        if code not in valid_codes:
            raise HTTPException(400, f"Invalid result code: {code}")

    if scoring_type == "ladder_completions":
        per_group = definition["sub_attempts_per_group"]
        total_points = 0
        for g in range(len(definition["groups"])):
            group_codes = submission.attempts[g * per_group:(g + 1) * per_group]
            if all(code == "make" for code in group_codes):
                total_points += 1
    else:
        points_by_code = {r["code"]: r["points"] for r in definition["results"]}
        total_points = sum(points_by_code[code] for code in submission.attempts)

    # Who this combine is actually FOR — defaults to whoever is logged in,
    # but can be a teammate (validated as a real player) if logged on their
    # behalf during group practice.
    target_player_id = player["id"]
    if submission.player_id is not None:
        target = supabase.table("players").select("id").eq("id", str(submission.player_id)).single().execute().data
        if not target:
            raise HTTPException(400, "Selected player not found")
        target_player_id = str(submission.player_id)

    row = supabase.table("combine_sessions").insert({
        "player_id": target_player_id,
        "combine_type": slug,
        "attempts": submission.attempts,
        "total_points": total_points,
    }).execute().data[0]

    return {**row, "max_points": definition["max_points"], "benchmarks": definition["benchmarks"]}


@app.get("/players/{player_id}/combines")
def player_combines(player_id: UUID, combine_type: Optional[str] = None, player=Depends(get_current_player)):
    """History of a player's combine sessions, optionally filtered to one
    combine type. Used both for the player's own practice history and the
    coach's view into any player's progress."""
    if player["id"] != str(player_id) and player["role"] != "coach":
        raise HTTPException(403, "Not authorized")

    query = (
        supabase.table("combine_sessions")
        .select("*")
        .eq("player_id", str(player_id))
        .order("completed_at", desc=True)
    )
    if combine_type:
        query = query.eq("combine_type", combine_type)

    return query.execute().data


# ---------------------------------------------------------------------------
# Team roster, live rounds, scorecards, and combine summaries
# ---------------------------------------------------------------------------

@app.get("/team/players")
def team_players(player=Depends(get_current_player)):
    """Full roster — any signed-in player can call this (not coach-only).
    Used for the 'who is this combine for' picker so teammates can log
    scores for each other during group practice."""
    return (
        supabase.table("players")
        .select("id, full_name, role")
        .order("full_name")
        .execute()
        .data
    )


@app.get("/coach/live-rounds")
def live_rounds(player=Depends(get_current_player)):
    """Coach-only: every round currently in progress (not yet completed),
    with a live running score — for watching practice/tournament rounds
    hole-by-hole as they happen."""
    if player["role"] != "coach":
        raise HTTPException(403, "Coach access only")

    rounds = (
        supabase.table("rounds")
        .select("id, started_at, players(full_name), courses(name)")
        .is_("completed_at", "null")
        .execute()
        .data
    )

    results = []
    for r in rounds:
        scores = (
            supabase.table("hole_scores")
            .select("strokes, holes(hole_number, par)")
            .eq("round_id", r["id"])
            .execute()
            .data
        )
        total_strokes = sum(s["strokes"] for s in scores)
        total_par = sum(s["holes"]["par"] for s in scores)
        last_hole = max((s["holes"]["hole_number"] for s in scores), default=0)
        results.append({
            "round_id": r["id"],
            "player_name": r["players"]["full_name"],
            "course_name": r["courses"]["name"] if r["courses"] else "Unknown course",
            "started_at": r["started_at"],
            "holes_played": len(scores),
            "current_hole": last_hole + 1 if last_hole < 18 else last_hole,
            "score_to_par": (total_strokes - total_par) if scores else None,
        })

    results.sort(key=lambda x: (x["score_to_par"] is None, x["score_to_par"]))
    return results


@app.get("/rounds/{round_id}/scorecard")
def round_scorecard(round_id: UUID, player=Depends(get_current_player)):
    """Full hole-by-hole detail for a round — the actual scorecard, not just
    the aggregate summary from /rounds/{id}/summary."""
    round_row = supabase.table("rounds").select("*").eq("id", str(round_id)).single().execute().data
    if not round_row:
        raise HTTPException(404, "Round not found")
    if round_row["player_id"] != player["id"] and player["role"] != "coach":
        raise HTTPException(403, "Not authorized")

    course = supabase.table("courses").select("name").eq("id", round_row["course_id"]).single().execute().data
    all_holes = (
        supabase.table("holes")
        .select("id, hole_number, par, handicap, yardage")
        .eq("course_id", round_row["course_id"])
        .order("hole_number")
        .execute()
        .data
    )
    scores = (
        supabase.table("hole_scores")
        .select("hole_id, strokes, putts, fairway_hit, gir")
        .eq("round_id", str(round_id))
        .execute()
        .data
    )
    scores_by_hole = {s["hole_id"]: s for s in scores}

    holes_out = []
    for h in all_holes:
        s = scores_by_hole.get(h["id"])
        holes_out.append({
            "hole_number": h["hole_number"],
            "par": h["par"],
            "handicap": h["handicap"],
            "yardage": h["yardage"],
            "strokes": s["strokes"] if s else None,
            "putts": s["putts"] if s else None,
            "fairway_hit": s["fairway_hit"] if s else None,
            "gir": s["gir"] if s else None,
        })

    return {
        "course_name": course["name"] if course else "Unknown course",
        "started_at": round_row["started_at"],
        "completed_at": round_row["completed_at"],
        "holes": holes_out,
    }


@app.get("/players/{player_id}/combines/summary")
def player_combines_summary(player_id: UUID, player=Depends(get_current_player)):
    """Every combine type this player has attempted, with their average and
    best score plus which benchmark tier (D2/D1/PGA) their average falls
    into — the data behind the coach's Combines tab."""
    if player["id"] != str(player_id) and player["role"] != "coach":
        raise HTTPException(403, "Not authorized")

    sessions = (
        supabase.table("combine_sessions")
        .select("combine_type, total_points, completed_at")
        .eq("player_id", str(player_id))
        .execute()
        .data
    )

    by_type = {}
    for s in sessions:
        by_type.setdefault(s["combine_type"], []).append(s)

    results = []
    for slug, defn in COMBINE_DEFINITIONS.items():
        attempts_list = by_type.get(slug, [])
        if not attempts_list:
            results.append({
                "slug": slug,
                "name": defn["name"],
                "category": defn["category"],
                "max_points": defn["max_points"],
                "benchmarks": defn["benchmarks"],
                "attempts_count": 0,
                "average": None,
                "best": None,
                "last_completed_at": None,
            })
            continue

        points = [a["total_points"] for a in attempts_list]
        results.append({
            "slug": slug,
            "name": defn["name"],
            "category": defn["category"],
            "max_points": defn["max_points"],
            "benchmarks": defn["benchmarks"],
            "attempts_count": len(points),
            "average": round(sum(points) / len(points), 1),
            "best": max(points),
            "last_completed_at": max(a["completed_at"] for a in attempts_list),
        })

    return results
