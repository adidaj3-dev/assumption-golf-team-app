-- Golf Team App — Phase 1 schema
-- Run this in the Supabase SQL editor (or psql) to set up your database.
-- This file reflects the actual live setup, including fixes made after the
-- initial rollout (the is_coach() helper and the player self-signup policy
-- below) — if you ever need to rebuild the database from scratch, this is
-- the single source of truth.

-- Players (extends Supabase auth.users with team-specific info)
create table players (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text not null,
    role text not null default 'player' check (role in ('player', 'coach')),
    created_at timestamptz default now()
);

-- Courses
create table courses (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    created_by uuid references players(id),
    created_at timestamptz default now()
);

-- Holes (par + handicap per hole, per course)
create table holes (
    id uuid primary key default gen_random_uuid(),
    course_id uuid not null references courses(id) on delete cascade,
    hole_number int not null check (hole_number between 1 and 18),
    par int not null check (par between 3 and 5),
    handicap int not null check (handicap between 1 and 18),
    yardage int,
    tee_box text,
    unique (course_id, hole_number)
);

-- Tournaments (a round of play tied to a public leaderboard link)
create table tournaments (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    course_id uuid not null references courses(id),
    slug text not null unique,          -- used in the public URL, e.g. fall-invite-2026
    is_active boolean default true,
    created_by uuid references players(id),
    created_at timestamptz default now()
);

-- Rounds (one player's round, tournament OR practice)
create table rounds (
    id uuid primary key default gen_random_uuid(),
    player_id uuid not null references players(id),
    course_id uuid not null references courses(id),
    tournament_id uuid references tournaments(id),  -- null = practice round
    started_at timestamptz default now(),
    completed_at timestamptz,
    total_putts int
);

-- Hole-by-hole scores for a round
create table hole_scores (
    id uuid primary key default gen_random_uuid(),
    round_id uuid not null references rounds(id) on delete cascade,
    hole_id uuid not null references holes(id),
    strokes int not null,
    putts int,
    fairway_hit boolean,      -- null for par 3s where it doesn't apply
    gir boolean,
    created_at timestamptz default now(),
    unique (round_id, hole_id)
);

-- Enable real-time on the tables the leaderboard/dashboard need to watch live
alter publication supabase_realtime add table rounds;
alter publication supabase_realtime add table hole_scores;

-- Row Level Security: players manage their own rounds/scores, coaches see everything
alter table rounds enable row level security;
alter table hole_scores enable row level security;
alter table players enable row level security;

-- Helper function used by the "coach can read everything" policies below.
-- This runs with elevated privileges (security definer) specifically so it
-- can check a player's role WITHOUT re-triggering the policy that's calling
-- it — checking players.role directly inside a policy ON the players table
-- causes infinite recursion in Postgres, which this function avoids.
create or replace function is_coach()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from players where id = auth.uid() and role = 'coach');
$$;

create policy "players read own row" on players
    for select using (auth.uid() = id);

create policy "coaches read all players" on players
    for select using (is_coach());

-- Lets a newly signed-up user create their OWN player row (id must match
-- their own auth id), and only ever as role='player' — this is what makes
-- the app's signup form work. Without it, sign-ups succeed in Supabase Auth
-- but silently fail to get a matching players row.
create policy "users can create own player row" on players
    for insert with check (auth.uid() = id and role = 'player');

create policy "players manage own rounds" on rounds
    for all using (auth.uid() = player_id);

create policy "coaches read all rounds" on rounds
    for select using (is_coach());

create policy "players manage own hole_scores" on hole_scores
    for all using (exists (select 1 from rounds r where r.id = round_id and r.player_id = auth.uid()));

create policy "coaches read all hole_scores" on hole_scores
    for select using (is_coach());

-- Public (anonymous) read access to a tournament's data, via the tournament's own tables — 
-- handled in the API layer (Phase 1 backend) rather than direct table access, so anonymous
-- visitors never touch the players/rounds tables directly.

-- Practice combines (driver, putting, etc.) — combine_type + attempts are
-- validated against the COMBINE_DEFINITIONS dict in the backend, not here.
create table combine_sessions (
    id uuid primary key default gen_random_uuid(),
    player_id uuid not null references players(id),
    combine_type text not null,
    attempts jsonb not null,       -- ordered array of result codes, e.g. ["fairway","near",...]
    total_points int not null,
    completed_at timestamptz default now()
);

alter table combine_sessions enable row level security;

create policy "players manage own combine_sessions" on combine_sessions
    for all using (auth.uid() = player_id);

create policy "coaches read all combine_sessions" on combine_sessions
    for select using (is_coach());
