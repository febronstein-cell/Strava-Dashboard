-- Lab update (run once in: Supabase > SQL Editor > New query > Run). Safe to run again.
--
-- 1) "thresholds" accepts more kinds: LT1 / LT2 / VT1 / VT2 (heart rate, power, pace), resting HR, VO2max.
--    Fill the table by hand in: Supabase > Table Editor > thresholds > Insert row.
--      kind       test_date    value  unit
--      ftp        2026-09-10   285    W
--      lthr       2026-09-10   187    bpm
--      lt1_hr     2026-09-10   150    bpm
--      lt2_hr     2026-09-10   178    bpm
--      vt1_hr     2026-09-10   152    bpm
--      vt2_hr     2026-09-10   180    bpm
--      run_threshold_pace  2026-09-10  255  s/km     (4:15 /km = 255 seconds)
--      css        2026-09-10   92     s/100m
--    (the example values are only illustrations: use your own tests)
alter table public.thresholds drop constraint if exists thresholds_kind_check;
alter table public.thresholds
  add constraint thresholds_kind_check check (kind in (
    'ftp', 'lthr', 'max_hr', 'resting_hr', 'vo2max',
    'lt1_hr', 'lt2_hr', 'vt1_hr', 'vt2_hr',
    'lt1_power', 'lt2_power', 'lt1_pace', 'lt2_pace',
    'run_threshold_pace', 'css'
  ));

-- 2) Written workout analyses (reserved for the AI analysis of each workout; empty for now).
create table if not exists public.workout_analysis (
  activity_id bigint primary key,
  model       text,
  summary     text        not null,
  details     jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
alter table public.workout_analysis enable row level security;
