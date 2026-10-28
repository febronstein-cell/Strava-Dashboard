-- Planned vs done (feature 3). Run once in the Supabase SQL Editor (safe to run again).

-- Laps of an activity, fetched once from Strava and kept (they never change), summarised:
-- [{elapsedS, movingS, distM, speed, hr, watts}]
create table if not exists public.activity_laps (
  activity_id bigint primary key,
  laps        jsonb       not null default '[]'::jsonb,
  fetched_at  timestamptz not null default now()
);

-- Manual re-match of an activity to a planned entry (or to "unplanned" when slot is null).
create table if not exists public.plan_matches (
  activity_id bigint primary key,
  week_start  date        not null,
  day         smallint    check (day between 0 and 6),
  slot        smallint,
  updated_at  timestamptz not null default now()
);
create index if not exists plan_matches_week on public.plan_matches (week_start);

alter table public.activity_laps enable row level security;
alter table public.plan_matches enable row level security;
