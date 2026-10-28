-- Session RPE and manual sessions (feature 5). Run once in the Supabase SQL Editor (safe to run again).

-- How hard a Strava session felt, 1 to 10.
create table if not exists public.activity_rpe (
  activity_id bigint primary key,
  rpe         smallint    not null check (rpe between 1 and 10),
  updated_at  timestamptz not null default now()
);

-- Sessions with nothing on Strava (a pool swim without a watch, a gym session...).
create table if not exists public.manual_activities (
  id          bigserial primary key,
  started_at  timestamp   not null,                 -- local time (America/Sao_Paulo), like the Strava dates
  sport       text        not null check (sport in ('run', 'ride', 'swim', 'strength', 'other')),
  elapsed_s   integer     not null check (elapsed_s > 0 and elapsed_s <= 86400),
  distance_m  numeric(9, 1) not null default 0,
  rpe         smallint    check (rpe between 1 and 10),
  name        text,
  notes       text,
  created_at  timestamptz not null default now()
);

alter table public.activity_rpe enable row level security;
alter table public.manual_activities enable row level security;

-- The swim test (CSS) is stored in the thresholds table (kind 'css', value in seconds per 100 m), already allowed.
