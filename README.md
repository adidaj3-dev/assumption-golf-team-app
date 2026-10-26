# Assumption Golf Team App

A phone-first team platform for a college golf program: live hole-by-hole scoring,
practice combines, qualifiers, lineups, team events, and a coach dashboard that sees
every round and practice session as it happens.

Built by the head men's golf coach at Assumption University (NCAA Division II) for a
21-player roster, to replace scattered scorecards, group texts, and spreadsheets.

> **Status:** in active development. Built with AI-assisted development; designed,
> directed, and tested by the coach who runs the program.

## The problem

A college coach needs to know how every player is trending: scoring, greens in regulation,
putting, short game, and how they perform when it counts in qualifiers. That data usually
lives in paper scorecards and memory. Families want to follow tournaments live, and players
want to see where they stand. This app puts all of it in one place.

## What it does

**For players** (installs to the phone home screen like a native app)
- Enter scores hole by hole, with fairways, greens in regulation, and putts
- Resume a round, save and exit, and review full scorecards afterward
- Personal stats: scoring average, GIR %, fairway %, putting, broken out by round type
- Log practice combines and see their results over time

**For the coach**
- Live dashboard of every active round and practice session as players finish holes
- Team-wide stats and standings across rounds and combines
- Qualifier rounds with assigned groups, cross-signed scorecards, and qualifying standings
- Lineup builder for tournament travel squads
- Course setup and round corrections

**Practice combines:** 13 built-in tests across driver, irons, wedges, short game, and
putting, each with scoring rules and benchmark ranges (e.g. Division I and tour level).

**Team events:** 12 formats for intrasquad competition, including stroke play, best ball,
scrambles, alternate shot, Chapman, skins, Stableford, Wolf, and the team's own
"Greyhound Cup." Teams can be auto-generated.

**For families:** one public, no-login leaderboard link per tournament.

## Built with

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, installable PWA |
| Backend | Python, FastAPI |
| Database & auth | Supabase (Postgres, row-level security so players can only edit their own scores) |
| Dev environment | GitHub Codespaces (works from any computer with a browser) |

## Roadmap

- Scorecard photo → automatic course setup (OCR)
- Real-time push updates instead of polling
- An unbranded version other college programs can use

## Run it yourself

Requires a free Supabase project, Python 3.10+, and Node 18+. The repo includes a
`.devcontainer`, so **Code → Codespaces → Create codespace** installs everything automatically.

1. **Database:** in your Supabase project's SQL Editor, run `backend/schema.sql`.
   Enable email sign-in, and give each player a row in `players` (set your own `role` to `coach`).
2. **Backend:**
   ```bash
   cd backend
   python -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   # create backend/.env with SUPABASE_URL and SUPABASE_SERVICE_KEY
   uvicorn main:app --reload        # API docs at http://localhost:8000/docs
   ```
3. **Frontend:**
   ```bash
   cd frontend
   npm install
   # create frontend/.env.local with VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_BASE
   npm run dev                      # http://localhost:5173
   ```

Never commit `.env` files. The service key bypasses row-level security.
