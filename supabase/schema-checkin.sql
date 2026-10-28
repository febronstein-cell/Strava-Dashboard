-- Daily check-in (feature 2). Run once in the Supabase SQL Editor (safe to run again).
-- One row per day (America/Sao_Paulo). Imported values (Garmin, intervals.icu) never overwrite a field typed by hand:
-- "sources" records where each field came from.

create table if not exists public.checkins (
  day                date primary key,
  wake_time          text,
  sleep_hours        numeric(4, 2),
  sleep_source       text check (sleep_source in ('watch', 'manual')),
  sleep_score        numeric(5, 1),
  resting_hr         numeric(5, 1),
  hrv                numeric(6, 1),               -- overnight average rMSSD, ms
  hrv_status         text check (hrv_status in ('balanced', 'unbalanced', 'low', 'poor')),
  training_readiness numeric(5, 1),
  legs               smallint check (legs between 1 and 5),
  energy             smallint check (energy between 1 and 5),
  pain               jsonb       not null default '[]'::jsonb,   -- [{location, score 0-10, stride?}]
  notes              text,
  sources            jsonb       not null default '{}'::jsonb,   -- field -> garmin | intervals | manual
  signal             text check (signal in ('green', 'yellow', 'red')),
  signal_reasons     jsonb       not null default '[]'::jsonb,
  updated_at         timestamptz not null default now()
);

alter table public.checkins enable row level security;
