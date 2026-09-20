"""
Golf Team App — Phase 1 backend
Run with: uvicorn main:app --reload
"""
import os
import random
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
    round_type: str = "individual"  # 'team' | 'individual' | 'qualifier' | 'tournament'
    event_id: Optional[UUID] = None  # set when round_type == 'tournament'


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
    if player["role"] not in ("coach", "captain"):
        raise HTTPException(403, "Only coaches and captains can create courses")
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

VALID_ROUND_TYPES = {"team", "individual", "qualifier", "tournament"}


PLAYABLE_EVENT_FORMATS = {"stroke_individual", "stroke_team", "best_ball"}  # formats with working play/leaderboard


@app.post("/rounds/start")
def start_round(r: RoundStartIn, player=Depends(get_current_player)):
    if r.round_type not in VALID_ROUND_TYPES:
        raise HTTPException(400, f"Invalid round_type: {r.round_type}")

    if r.round_type == "tournament":
        if not r.event_id:
            raise HTTPException(400, "event_id is required for a tournament round")
        event = supabase.table("events").select("format_type").eq("id", str(r.event_id)).single().execute().data
        if not event:
            raise HTTPException(404, "Event not found")
        if event["format_type"] not in PLAYABLE_EVENT_FORMATS:
            raise HTTPException(400, f"'{event['format_type']}' rounds aren't playable yet — coming in a later update")

    row = supabase.table("rounds").insert(
        {
            "player_id": player["id"],
            "course_id": str(r.course_id),
            "tournament_id": str(r.tournament_id) if r.tournament_id else None,
            "round_type": r.round_type,
            "event_id": str(r.event_id) if r.event_id else None,
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
    # Any signed-in teammate can view any round — small-team transparency.

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
    # Any signed-in teammate can view any player's stats/rounds — small-team
    # transparency, not just coach-only.

    rounds = (
        supabase.table("rounds")
        .select("id, started_at, completed_at, round_type, course_id, courses(name)")
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
        course_total_holes = _course_hole_count(r["course_id"])
        is_complete_length = len(scores) in (9, 18) and len(scores) == course_total_holes
        counts_for_standings = (
            r["round_type"] == "team" and r["completed_at"] is not None and is_complete_length
        )
        results.append({
            "id": r["id"],
            "course_name": r["courses"]["name"] if r["courses"] else "Unknown course",
            "started_at": r["started_at"],
            "completed_at": r["completed_at"],
            "round_type": r["round_type"],
            "holes_played": len(scores),
            "score_to_par": (total_strokes - total_par) if scores else None,
            "completed": r["completed_at"] is not None,
            "counts_for_standings": counts_for_standings,
        })
    return results


def _course_hole_count(course_id: str) -> int:
    """How many holes a course has — used to decide whether a round was
    actually played to completion (9 or 18 holes) for standings purposes."""
    holes = supabase.table("holes").select("id").eq("course_id", course_id).execute().data
    return len(holes)


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
    # Any signed-in teammate can view any player's stats/rounds — small-team
    # transparency, not just coach-only.
    return _compute_player_stats(str(player_id))


@app.get("/coach/team-stats")
def team_stats(player=Depends(get_current_player)):
    """Coach-only: every player's stats in one call, for the coach dashboard."""
    if player["role"] != "coach":
        raise HTTPException(403, "Coach access only")

    all_players = (
        supabase.table("players")
        .select("id, full_name, role")
        .neq("role", "coach")  # players and captains both count as roster members; never a coach
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
    # Any signed-in teammate can view any player's stats/rounds — small-team
    # transparency, not just coach-only.

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
    scores for each other during group practice.

    Players never see the coach in this list. The coach DOES see themself
    (as well as every player) so they can still log their own combines/rounds
    — they just never show up in a PLAYER's view of the roster."""
    all_rows = (
        supabase.table("players")
        .select("id, full_name, role")
        .order("full_name")
        .execute()
        .data
    )
    if player["role"] == "coach":
        return all_rows
    return [p for p in all_rows if p["role"] != "coach"]


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
    # Any signed-in teammate can view any round — small-team transparency.

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
    # Any signed-in teammate can view any player's stats/rounds — small-team
    # transparency, not just coach-only.

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


# ---------------------------------------------------------------------------
# Individual Standings — men's/women's season rankings based ONLY on
# completed (9 or 18 hole) Team Rounds, with fixed rank-based tiers.
# ---------------------------------------------------------------------------

def _standings_avg(player_id: str) -> Optional[float]:
    """Average score-to-par across this player's completed Team Rounds that
    were actually played to a full 9 or 18 holes. Returns None if they have
    no qualifying rounds yet."""
    rounds = (
        supabase.table("rounds")
        .select("id, course_id, completed_at")
        .eq("player_id", player_id)
        .eq("round_type", "team")
        .not_.is_("completed_at", "null")
        .execute()
        .data
    )

    scores_to_par = []
    for r in rounds:
        scores = (
            supabase.table("hole_scores")
            .select("strokes, holes(par)")
            .eq("round_id", r["id"])
            .execute()
            .data
        )
        course_total_holes = _course_hole_count(r["course_id"])
        if len(scores) in (9, 18) and len(scores) == course_total_holes:
            total_strokes = sum(s["strokes"] for s in scores)
            total_par = sum(s["holes"]["par"] for s in scores)
            scores_to_par.append(total_strokes - total_par)

    if not scores_to_par:
        return None
    return round(sum(scores_to_par) / len(scores_to_par), 2)


def _standings_tier(team: str, rank: int) -> str:
    if team == "women":
        return "In" if rank <= 5 else "Individual"
    # men
    if rank <= 5:
        return "Starting Lineup"
    if rank <= 9:
        return "Qualifier"
    return "Outside Cut Line"


@app.get("/standings")
def standings(team: str, player=Depends(get_current_player)):
    if team not in ("men", "women"):
        raise HTTPException(400, "team must be 'men' or 'women'")

    roster = (
        supabase.table("players")
        .select("id, full_name")
        .eq("team", team)
        .neq("role", "coach")
        .execute()
        .data
    )

    entries = []
    for p in roster:
        avg = _standings_avg(p["id"])
        entries.append({"player_id": p["id"], "full_name": p["full_name"], "scoring_avg_to_par": avg})

    entries.sort(key=lambda e: (e["scoring_avg_to_par"] is None, e["scoring_avg_to_par"]))

    for i, e in enumerate(entries):
        e["rank"] = i + 1
        e["tier"] = _standings_tier(team, i + 1)

    return entries


# ---------------------------------------------------------------------------
# Combine Standings — same men's/women's tiering as Individual Standings,
# but ranked by season-wide combine performance instead of scoring average.
# ---------------------------------------------------------------------------

def _combine_standings_score(player_id: str) -> Optional[float]:
    """Average, across every combine attempt this player has ever logged, of
    what percentage of that combine's max possible points they scored.
    Averaging percentages (not raw points) is what makes attempts across
    different combines comparable on one scale."""
    sessions = (
        supabase.table("combine_sessions")
        .select("combine_type, total_points")
        .eq("player_id", player_id)
        .execute()
        .data
    )
    if not sessions:
        return None

    percentages = []
    for s in sessions:
        definition = COMBINE_DEFINITIONS.get(s["combine_type"])
        if not definition:
            continue
        percentages.append(100 * s["total_points"] / definition["max_points"])

    if not percentages:
        return None
    return round(sum(percentages) / len(percentages), 1)


@app.get("/combine-standings")
def combine_standings(team: str, player=Depends(get_current_player)):
    if team not in ("men", "women"):
        raise HTTPException(400, "team must be 'men' or 'women'")

    roster = (
        supabase.table("players")
        .select("id, full_name")
        .eq("team", team)
        .neq("role", "coach")
        .execute()
        .data
    )

    entries = []
    for p in roster:
        score = _combine_standings_score(p["id"])
        entries.append({"player_id": p["id"], "full_name": p["full_name"], "combine_score_pct": score})

    # Higher percentage is better, so sort descending (None goes last).
    entries.sort(key=lambda e: (e["combine_score_pct"] is None, -(e["combine_score_pct"] or 0)))

    for i, e in enumerate(entries):
        e["rank"] = i + 1
        e["tier"] = _standings_tier(team, i + 1)

    return entries


# ---------------------------------------------------------------------------
# Tournament Events — Phase 1: event setup + random team/pairing generator.
# Actual per-format scoring/live leaderboards come in later phases; for now
# this handles creating an event and assigning players into teams/pairings.
# ---------------------------------------------------------------------------

FORMAT_LABELS = {
    "stroke_individual": "Stroke Play — Individual",
    "stroke_team": "Stroke Play — Team",
    "best_ball": "Best Ball",
    "scramble_2": "2-Man Scramble",
    "scramble_4": "4-Man Scramble",
    "alt_shot": "Alternate Shot",
    "shamble": "Shamble",
    "chapman": "Chapman (Pinehurst)",
    "skins": "Skins",
    "stableford": "Stableford",
    "greyhound_cup": "Greyhound Cup",
    "wolf": "Wolf",
    "match_play": "Match Play",
}

VALID_FORMATS = set(FORMAT_LABELS.keys())


class EventIn(BaseModel):
    name: str
    event_date: Optional[str] = None  # "YYYY-MM-DD"
    course_id: Optional[UUID] = None
    format_type: str
    num_holes: int = 18


class GenerateTeamsIn(BaseModel):
    player_ids: list[UUID]
    group_size: int


class TeamIn(BaseModel):
    team_name: str
    player_ids: list[UUID]


class SaveTeamsIn(BaseModel):
    teams: list[TeamIn]


@app.get("/event-formats")
def list_event_formats():
    """Every supported tournament format, for the event-creation dropdown."""
    return [{"value": k, "label": v} for k, v in FORMAT_LABELS.items()]


@app.post("/events")
def create_event(event: EventIn, player=Depends(get_current_player)):
    if player["role"] not in ("coach", "captain"):
        raise HTTPException(403, "Only coaches and captains can create events")
    if event.format_type not in VALID_FORMATS:
        raise HTTPException(400, f"Invalid format_type: {event.format_type}")
    if event.num_holes not in (6, 9, 18, 36):
        raise HTTPException(400, "num_holes must be 6, 9, 18, or 36")

    row = supabase.table("events").insert({
        "name": event.name,
        "event_date": event.event_date,
        "course_id": str(event.course_id) if event.course_id else None,
        "format_type": event.format_type,
        "num_holes": event.num_holes,
        "created_by": player["id"],
    }).execute().data[0]
    return row


@app.get("/events")
def list_events(player=Depends(get_current_player)):
    """Every event, newest first — visible to the whole team."""
    return (
        supabase.table("events")
        .select("*, courses(name)")
        .order("created_at", desc=True)
        .execute()
        .data
    )


@app.get("/events/{event_id}")
def get_event(event_id: UUID, player=Depends(get_current_player)):
    event = supabase.table("events").select("*, courses(name)").eq("id", str(event_id)).single().execute().data
    if not event:
        raise HTTPException(404, "Event not found")

    teams = supabase.table("event_teams").select("id, team_name").eq("event_id", str(event_id)).execute().data
    for t in teams:
        members = (
            supabase.table("event_team_members")
            .select("player_id, players(full_name)")
            .eq("event_team_id", t["id"])
            .execute()
            .data
        )
        t["members"] = [{"player_id": m["player_id"], "full_name": m["players"]["full_name"]} for m in members]

    event["teams"] = teams
    return event


@app.post("/events/{event_id}/generate-teams")
def generate_teams(event_id: UUID, body: GenerateTeamsIn, player=Depends(get_current_player)):
    """Randomly shuffles the given players into teams/pairings of the given
    size, replacing any teams already saved for this event. If the player
    count doesn't divide evenly, the last team just gets the remainder."""
    if player["role"] not in ("coach", "captain"):
        raise HTTPException(403, "Only coaches and captains can generate teams")
    if body.group_size < 1:
        raise HTTPException(400, "group_size must be at least 1")

    event = supabase.table("events").select("id").eq("id", str(event_id)).single().execute().data
    if not event:
        raise HTTPException(404, "Event not found")

    # Clear any existing teams for this event first.
    existing = supabase.table("event_teams").select("id").eq("event_id", str(event_id)).execute().data
    for t in existing:
        supabase.table("event_teams").delete().eq("id", t["id"]).execute()

    shuffled = [str(pid) for pid in body.player_ids]
    random.shuffle(shuffled)

    groups = [shuffled[i:i + body.group_size] for i in range(0, len(shuffled), body.group_size)]

    saved_teams = []
    for i, group in enumerate(groups):
        team_row = supabase.table("event_teams").insert({
            "event_id": str(event_id),
            "team_name": f"Team {i + 1}",
        }).execute().data[0]
        for pid in group:
            supabase.table("event_team_members").insert({
                "event_team_id": team_row["id"],
                "player_id": pid,
            }).execute()
        saved_teams.append({"id": team_row["id"], "team_name": team_row["team_name"], "player_ids": group})

    return saved_teams


@app.put("/events/{event_id}/teams")
def save_teams(event_id: UUID, body: SaveTeamsIn, player=Depends(get_current_player)):
    """Manually save/overwrite an event's teams — used after a coach tweaks
    the randomly-generated groupings."""
    if player["role"] not in ("coach", "captain"):
        raise HTTPException(403, "Only coaches and captains can edit teams")

    event = supabase.table("events").select("id").eq("id", str(event_id)).single().execute().data
    if not event:
        raise HTTPException(404, "Event not found")

    existing = supabase.table("event_teams").select("id").eq("event_id", str(event_id)).execute().data
    for t in existing:
        supabase.table("event_teams").delete().eq("id", t["id"]).execute()

    saved_teams = []
    for team in body.teams:
        team_row = supabase.table("event_teams").insert({
            "event_id": str(event_id),
            "team_name": team.team_name,
        }).execute().data[0]
        for pid in team.player_ids:
            supabase.table("event_team_members").insert({
                "event_team_id": team_row["id"],
                "player_id": str(pid),
            }).execute()
        saved_teams.append({"id": team_row["id"], "team_name": team_row["team_name"]})

    return saved_teams


@app.delete("/events/{event_id}")
def delete_event(event_id: UUID, player=Depends(get_current_player)):
    if player["role"] not in ("coach", "captain"):
        raise HTTPException(403, "Only coaches and captains can delete events")
    supabase.table("events").delete().eq("id", str(event_id)).execute()
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Phase 2: live leaderboard for stroke play events (individual and team).
# Built entirely from the same per-player round/hole_scores data every other
# round type already produces — no separate scoring pipeline needed.
# ---------------------------------------------------------------------------

@app.get("/events/{event_id}/leaderboard")
def event_leaderboard(event_id: UUID, player=Depends(get_current_player)):
    event = supabase.table("events").select("*").eq("id", str(event_id)).single().execute().data
    if not event:
        raise HTTPException(404, "Event not found")
    if event["format_type"] not in PLAYABLE_EVENT_FORMATS:
        raise HTTPException(400, f"Live leaderboard for '{event['format_type']}' isn't built yet")

    # Every round tied to this event, one per player (a player could in
    # theory start more than one; take their most recent).
    rounds = (
        supabase.table("rounds")
        .select("id, player_id, completed_at, players(full_name)")
        .eq("event_id", str(event_id))
        .order("started_at", desc=True)
        .execute()
        .data
    )
    latest_round_by_player = {}
    for r in rounds:
        if r["player_id"] not in latest_round_by_player:
            latest_round_by_player[r["player_id"]] = r

    def score_for_round(round_id):
        scores = (
            supabase.table("hole_scores")
            .select("strokes, holes(par)")
            .eq("round_id", round_id)
            .execute()
            .data
        )
        if not scores:
            return None, 0
        total_strokes = sum(s["strokes"] for s in scores)
        total_par = sum(s["holes"]["par"] for s in scores)
        return total_strokes - total_par, len(scores)

    if event["format_type"] == "stroke_individual":
        leaderboard = []
        for pid, r in latest_round_by_player.items():
            score_to_par, holes_played = score_for_round(r["id"])
            leaderboard.append({
                "player_name": r["players"]["full_name"],
                "score_to_par": score_to_par,
                "holes_played": holes_played,
                "completed": r["completed_at"] is not None,
            })
        leaderboard.sort(key=lambda e: (e["score_to_par"] is None, e["score_to_par"]))
        return {"format_type": event["format_type"], "leaderboard": leaderboard}

    # stroke_team: sum each team's members' individual scores-to-par
    teams = supabase.table("event_teams").select("id, team_name").eq("event_id", str(event_id)).execute().data

    if event["format_type"] == "best_ball":
        # For each hole, take the best (lowest) strokes among teammates who
        # have recorded that hole; the team's score is the sum of those
        # per-hole bests, compared to par for the holes actually covered.
        team_leaderboard = []
        for t in teams:
            members = (
                supabase.table("event_team_members")
                .select("player_id, players(full_name)")
                .eq("event_team_id", t["id"])
                .execute()
                .data
            )
            member_rows = []
            best_strokes_by_hole = {}
            par_by_hole = {}
            for m in members:
                r = latest_round_by_player.get(m["player_id"])
                if not r:
                    member_rows.append({"player_name": m["players"]["full_name"], "score_to_par": None, "holes_played": 0})
                    continue
                indiv_score_to_par, indiv_holes_played = score_for_round(r["id"])
                member_rows.append({
                    "player_name": m["players"]["full_name"],
                    "score_to_par": indiv_score_to_par,
                    "holes_played": indiv_holes_played,
                })
                hole_scores = (
                    supabase.table("hole_scores")
                    .select("hole_id, strokes, holes(par)")
                    .eq("round_id", r["id"])
                    .execute()
                    .data
                )
                for hs in hole_scores:
                    hid = hs["hole_id"]
                    par_by_hole[hid] = hs["holes"]["par"]
                    if hid not in best_strokes_by_hole or hs["strokes"] < best_strokes_by_hole[hid]:
                        best_strokes_by_hole[hid] = hs["strokes"]

            if best_strokes_by_hole:
                team_strokes = sum(best_strokes_by_hole.values())
                team_par = sum(par_by_hole[hid] for hid in best_strokes_by_hole)
                team_score_to_par = team_strokes - team_par
                holes_played = len(best_strokes_by_hole)
            else:
                team_score_to_par = None
                holes_played = 0

            team_leaderboard.append({
                "team_name": t["team_name"],
                "team_score_to_par": team_score_to_par,
                "holes_played": holes_played,
                "members": member_rows,
            })

        team_leaderboard.sort(key=lambda e: (e["team_score_to_par"] is None, e["team_score_to_par"] or 0))
        return {"format_type": event["format_type"], "leaderboard": team_leaderboard}

    # stroke_team
    team_leaderboard = []
    for t in teams:
        members = (
            supabase.table("event_team_members")
            .select("player_id, players(full_name)")
            .eq("event_team_id", t["id"])
            .execute()
            .data
        )
        member_rows = []
        team_total = 0
        any_score = False
        for m in members:
            r = latest_round_by_player.get(m["player_id"])
            if not r:
                member_rows.append({"player_name": m["players"]["full_name"], "score_to_par": None, "holes_played": 0})
                continue
            score_to_par, holes_played = score_for_round(r["id"])
            member_rows.append({
                "player_name": m["players"]["full_name"],
                "score_to_par": score_to_par,
                "holes_played": holes_played,
            })
            if score_to_par is not None:
                team_total += score_to_par
                any_score = True

        team_leaderboard.append({
            "team_name": t["team_name"],
            "team_score_to_par": team_total if any_score else None,
            "members": member_rows,
        })

    team_leaderboard.sort(key=lambda e: (e["team_score_to_par"] is None, e["team_score_to_par"] or 0))
    return {"format_type": event["format_type"], "leaderboard": team_leaderboard}
