-- Season: race calendar with priorities and the phases of the year (feature 1).
-- Run once in the Supabase SQL Editor (safe to run again). The site keeps working before it runs: it then uses the
-- calendar of site.config.ts and the phases built into lib/season-plan.ts.
--
-- Note: the older "races" table holds race RESULTS detected from Strava (rewritten by the sync), so the calendar
-- lives in its own table.

create table if not exists public.season_races (
  id          bigserial primary key,
  name        text        not null,
  race_date   date        not null,
  location    text,
  type        text        not null check (type in ('sprint', 'olympic', '70.3', 'ironman', 'run', 'other')),
  priority    text        not null check (priority in ('A', 'B', 'C')),
  goal        text,
  status      text        not null default 'upcoming' check (status in ('upcoming', 'done', 'dnf')),
  result      text,                                  -- finish time once done, e.g. "4:49:19"
  cycle_start date,                                  -- optional fixed start of the build-up
  notes       text,
  created_at  timestamptz not null default now(),
  unique (name, race_date)
);

create table if not exists public.season_phases (
  id          bigserial primary key,
  start_date  date        not null,
  end_date    date        not null,
  name        text        not null,
  focus       text        not null check (focus in ('swim', 'bike', 'run', 'mixed', 'race-specific', 'taper', 'recovery')),
  hours_min   numeric(4, 1) not null,
  hours_max   numeric(4, 1) not null,
  run_km_min  numeric(5, 1),
  run_km_max  numeric(5, 1),
  notes       text,
  created_at  timestamptz not null default now(),
  unique (start_date, name),
  check (end_date >= start_date),
  check (hours_max >= hours_min)
);

alter table public.season_races enable row level security;
alter table public.season_phases enable row level security;

-- ---- seed: the calendar and the phases as planned on 2026-10-28
insert into public.season_races (name, race_date, location, type, priority, goal, status, result, cycle_start, notes) values
  ('Ironman 70.3 Florianópolis', '2026-10-18', 'Florianópolis, SC', '70.3', 'A', null, 'done', '4:49:19', '2026-08-03', '1.9 km swim · 90 km bike · 21.1 km run'),
  ('Troféu Brasil de Triathlon · Stage 4', '2026-12-13', 'Santos, SP · Praia da Aparecida', 'olympic', 'B', null, 'upcoming', null, null, 'Final stage of the 2026 circuit'),
  ('IRONMAN 70.3 Brasília', '2027-04-18', 'Brasília, DF', '70.3', 'A', null, 'upcoming', null, null, '1.9 km swim · 90 km bike · 21.1 km run'),
  ('IRONMAN Brasil', '2027-06-13', 'Florianópolis, SC', 'ironman', 'A', null, 'upcoming', null, null, '3.8 km swim · 180 km bike · 42.2 km run')
on conflict (name, race_date) do nothing;

insert into public.season_phases (start_date, end_date, name, focus, hours_min, hours_max, run_km_min, run_km_max, notes) values
  ('2026-10-26', '2026-11-08', 'Re-entry and run-led build', 'run', 14, 24, 55, 125, null),
  ('2026-11-09', '2026-11-15', 'Swim focus, week 1', 'swim', 25, 25, 90, 90, null),
  ('2026-11-16', '2026-11-22', 'Swim focus, week 2 (lighter)', 'swim', 18, 19, 65, 70, null),
  ('2026-11-23', '2026-12-06', 'Bike focus', 'bike', 23, 25, 75, 75, 'Hypoxia starts Nov 23'),
  ('2026-12-07', '2026-12-13', 'Santos week, mini taper (B race)', 'taper', 16, 19, 55, 55, null),
  ('2026-12-14', '2026-12-20', 'Recovery', 'recovery', 14, 14, 45, 45, null),
  ('2026-12-21', '2027-01-17', 'Run focus', 'run', 25, 27, 100, 115, null),
  ('2027-01-18', '2027-02-21', 'Build, 3:1 cycles', 'mixed', 26, 28, 100, 100, null),
  ('2027-02-22', '2027-04-04', '70.3 build, long-course work begins', 'race-specific', 28, 30, 100, 130, null),
  ('2027-04-05', '2027-04-18', 'Taper and Brasília 70.3', 'taper', 20, 20, 70, 70, null),
  ('2027-04-19', '2027-04-25', 'Recovery', 'recovery', 14, 14, 45, 45, null),
  ('2027-04-26', '2027-05-30', 'Ironman build', 'race-specific', 28, 30, 100, 120, null),
  ('2027-05-31', '2027-06-13', 'Taper and Ironman Brasil', 'taper', 20, 20, 70, 70, null)
on conflict (start_date, name) do nothing;
