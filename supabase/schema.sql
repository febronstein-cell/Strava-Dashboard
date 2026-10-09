-- Schema for the Strava dashboard (Supabase / Postgres).
-- Paste this whole file in: Supabase > SQL Editor > New query > Run.
-- Safe to run more than once (everything uses "if not exists").
--
-- Access model: only the server (Next.js on Vercel and the local scripts) talks to the database,
-- using the SECRET key, which bypasses Row Level Security. RLS is ON for every table with NO
-- policies, so the public/anon key cannot read or write anything.

-- ------------------------------------------------------------------ activities
-- One row per Strava activity (swim, bike, run, strength, other).
create table if not exists public.activities (
  id            bigint primary key,                 -- Strava activity id
  name          text        not null,
  sport         text        not null check (sport in ('run', 'ride', 'swim', 'strength', 'other')),
  start_local   timestamp   not null,               -- local start time (no time zone)
  distance      real        not null default 0,     -- meters
  moving_time   integer     not null,               -- seconds (use for pace, HR, cadence)
  elapsed_time  integer     not null,               -- seconds (use for volume and totals)
  elevation     real        not null default 0,     -- meters
  race          boolean     not null default false,
  indoor        boolean     not null default false,
  hr            smallint,                           -- average heart rate (bpm)
  hr_max        smallint,
  cad           real,                               -- average cadence as Strava reports it
  watts         smallint,                           -- average power (W)
  np            smallint,                           -- normalized power (W)
  device_watts  boolean,
  start_lat     double precision,
  start_lng     double precision,
  polyline      text,                               -- simplified route (encoded polyline)
  synced_at     timestamptz not null default now()
);
create index if not exists activities_start_idx on public.activities (start_local desc);
create index if not exists activities_sport_idx on public.activities (sport);

-- ----------------------------------------------------------------- power curve
-- Best average power for each duration (5 s ... 3 h).
create table if not exists public.power_curve (
  duration_s    integer primary key,
  watts         integer     not null,
  activity_id   bigint,
  activity_name text,
  activity_date timestamp,
  indoor        boolean     not null default false,
  updated_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------- races
-- Your results (filled by hand): used by the future "Races" tab.
create table if not exists public.races (
  id               bigserial primary key,
  name             text        not null,
  race_date        date        not null,
  location         text,
  distance_label   text,                             -- e.g. "70.3", "Olympic"
  finish_seconds   integer,                          -- total time
  swim_seconds     integer,
  t1_seconds       integer,
  bike_seconds     integer,
  t2_seconds       integer,
  run_seconds      integer,
  overall_rank     integer,
  category_rank    integer,
  category         text,
  notes            text,
  created_at       timestamptz not null default now()
);
create index if not exists races_date_idx on public.races (race_date desc);

-- ------------------------------------------------------------- training program
-- Planned weeks: used by the future "Training Program" tab.
create table if not exists public.training_weeks (
  id               bigserial primary key,
  week_start       date        not null unique,      -- the Monday of the week
  title            text,
  planned_hours    numeric(5, 2),
  planned_sessions jsonb       not null default '[]'::jsonb,  -- [{day, sport, minutes, notes}]
  notes            text,
  created_at       timestamptz not null default now()
);

-- ------------------------------------------------------------------- thresholds
-- Test results over time: used by the future "Thresholds" analysis.
create table if not exists public.thresholds (
  id         bigserial primary key,
  test_date  date    not null,
  kind       text    not null check (kind in ('ftp', 'lthr', 'run_threshold_pace', 'css', 'max_hr')),
  value      numeric not null,
  unit       text    not null,                       -- "W", "bpm", "s/km", "s/100m"
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists thresholds_idx on public.thresholds (kind, test_date desc);

-- ------------------------------------------------------------------- sync state
-- Small key/value store (last sync time, backfill progress...).
create table if not exists public.sync_state (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ security
alter table public.activities     enable row level security;
alter table public.power_curve    enable row level security;
alter table public.races          enable row level security;
alter table public.training_weeks enable row level security;
alter table public.thresholds     enable row level security;
alter table public.sync_state     enable row level security;
-- (no policies on purpose: only the server, with the secret key, can access the data)
