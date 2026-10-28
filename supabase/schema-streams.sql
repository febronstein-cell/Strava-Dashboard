-- Time in zone and durability from Strava streams (features 4 and 6). Run once in the Supabase SQL Editor.
-- Each activity's streams are fetched ONCE and reduced to moving-time histograms (seconds per bpm, per 5 W band,
-- per 5 s/km band) plus the durability numbers; the raw streams are not kept. Zones are computed from these
-- histograms with the current thresholds, so changing FTP, LTHR or the zones needs no new fetch.

create table if not exists public.activity_streams (
  activity_id bigint primary key,
  sport       text        not null,
  start_date  date        not null,
  summary     jsonb       not null,       -- see lib/zones.ts (StreamSummary) and lib/durability.ts
  version     smallint    not null default 1,
  fetched_at  timestamptz not null default now()
);
create index if not exists activity_streams_date on public.activity_streams (start_date);

alter table public.activity_streams enable row level security;
