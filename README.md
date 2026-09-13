# Golf Team App — Phase 0/1 Scaffold

This is a working starting point for: manual course entry, hole-by-hole score
entry, scoring stats, and a live public tournament leaderboard. It's Phase 1
from the build plan — practice sections, the coach dashboard, and scorecard
OCR come next.

## 0. Working from an older/underpowered computer? Use GitHub Codespaces

This project includes a `.devcontainer` config, so you can develop entirely
in the browser instead of running Python/Node locally:

1. Push this project to a GitHub repo (create an empty repo, then from this
   folder: `git init && git add . && git commit -m "init" && git remote add
   origin <your-repo-url> && git push -u origin main`)
2. On the repo's GitHub page, click **Code → Codespaces → Create codespace
   on main**
3. Wait a minute or two — it automatically installs both the backend
   (Python/FastAPI) and frontend (Node/Vite) dependencies for you
   (`.devcontainer/setup.sh` runs this automatically)
4. You get a full VS Code editor in your browser, plus a terminal, with
   everything already installed — your local machine just needs a browser
5. When you run `uvicorn` or `npm run dev` inside the Codespace terminal,
   Codespaces auto-forwards the ports and gives you a clickable preview URL
   — you can open that URL on your phone or any other computer to test
6. Free tier: 60 core-hours/month, which is generous for a project this
   size. It pauses automatically when idle.

Everything below works the same whether you're in a Codespace or running
locally — the commands are identical.

## 1. Set up Supabase (free tier is plenty for a 21-player team)

1. Create a project at supabase.com
2. In the SQL Editor, run `backend/schema.sql` — this creates all the tables,
   enables real-time sync, and sets up row-level security so players can only
   edit their own scores while you (as coach) can see everyone's.
3. In your Supabase Auth settings, enable email sign-in (or whatever method
   you want your players using).
4. After each player signs up, insert a matching row in the `players` table
   with their `id` (matches their auth user id), `full_name`, and `role`
   ('player' or 'coach' — set yourself to 'coach').
5. Grab your Project URL, anon public key, and service_role key from
   Project Settings → API.

## 2. Run the backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   
pip install -r requirements.txt
cp .env.example .env         
uvicorn main:app --reload
```

Backend runs at http://localhost:8000. Visit http://localhost:8000/docs for
an interactive API explorer — useful for testing endpoints before the
frontend is wired up.

## 3. Run the frontend

```bash
cd frontend
npm install
cp .env.example .env.local     # fill in your Supabase URL + anon key
npm run dev
```

Frontend runs at http://localhost:5173.

- `/` — player score entry (needs login)
- `/t/your-tournament-slug` — public leaderboard, no login, this is the link
  you'd text to family/friends during a tournament

## What's stubbed vs. real

- **Real:** course creation, hole-by-hole score entry, round completion,
  scoring average / GIR% / fairway% calculation, live public leaderboard
  (polls every 10s — swap for a Supabase real-time subscription if you want
  instant push instead of polling).
- **Stubbed for you to wire up:** the actual Supabase Auth login UI (there
  are pre-built components for this — `@supabase/auth-ui-react` is the
  fastest path), and the course/tournament picker screen before starting a
  round (currently hardcoded to a placeholder course ID in `ScoreEntry.jsx`).

## Next steps (later phases)

- Add `role='coach'` dashboard view aggregating all active rounds live
- Add practice section tables (putting, short game, irons, driver combine)
  and entry screens
- Add scorecard photo → OCR → course auto-creation, feeding the same
  `POST /courses` endpoint this scaffold already has
- Add real PNG icons to `frontend/public/` for the home-screen install icon
  (`icon-192.png`, `icon-512.png`)
