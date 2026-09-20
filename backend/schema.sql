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
    role text not null default 'player' check (role in ('player', 'captain', 'coach')),
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

-- Men's/Women's team split, for the Individual Standings tab. Set at
-- signup for new players; existing players need this set manually once
-- (Table Editor → players → team column) since it didn't exist before.
alter table players add column team text check (team in ('men', 'women'));

-- What kind of round this is. 'team' rounds are the only ones that count
-- toward season scoring average / standings — and only once COMPLETE (9 or
-- 18 holes, checked in the backend against the course's actual hole count).
-- 'tournament' is stored but not yet wired up to real functionality.
alter table rounds add column round_type text not null default 'individual'
    check (round_type in ('team', 'individual', 'qualifier', 'tournament'));

-- Captain role, added on top of player/coach.
alter table players drop constraint players_role_check;
alter table players add constraint players_role_check
    check (role in ('player', 'captain', 'coach'));

-- Tournament formats system (Phase 1: event setup + team/pairing generator).
-- Actual play/scoring for each format comes in later phases — this is just
-- the event shell and its team assignments.
create table events (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    event_date date,
    course_id uuid references courses(id),
    format_type text not null check (format_type in (
        'stroke_individual', 'stroke_team', 'best_ball', 'scramble_2', 'scramble_4',
        'alt_shot', 'shamble', 'chapman', 'skins', 'stableford',
        'greyhound_cup', 'wolf', 'match_play'
    )),
    num_holes int not null default 18 check (num_holes in (6, 9, 18, 36)),
    status text not null default 'setup' check (status in ('setup', 'active', 'completed')),
    created_by uuid references players(id),
    created_at timestamptz default now()
);

create table event_teams (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null references events(id) on delete cascade,
    team_name text not null
);

create table event_team_members (
    id uuid primary key default gen_random_uuid(),
    event_team_id uuid not null references event_teams(id) on delete cascade,
    player_id uuid not null references players(id)
);

alter table events enable row level security;
alter table event_teams enable row level security;
alter table event_team_members enable row level security;

-- Everyone on the team can see events and team assignments (same
-- transparency model as everything else); only the backend (service role,
-- gated in Python to coach/captain) ever writes them.
create policy "anyone signed in reads events" on events
    for select using (auth.role() = 'authenticated');
create policy "anyone signed in reads event_teams" on event_teams
    for select using (auth.role() = 'authenticated');
create policy "anyone signed in reads event_team_members" on event_team_members
    for select using (auth.role() = 'authenticated');

-- Phase 2: tie a round to a tournament event so stroke play (individual and
-- team) can compute a live leaderboard from the same per-player round data
-- every other round type already uses.
alter table rounds add column event_id uuid references events(id);
