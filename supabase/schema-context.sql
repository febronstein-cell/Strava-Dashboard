-- Context Log, session status and event follow-ups. Run once in the Supabase SQL Editor (safe to run again).
-- Health notes live ONLY in these tables and are read or written only through the protected routes of the site.

create table if not exists public.context_notes (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  note_date   date        not null,                 -- the day the note is about (default today)
  text        text        not null,
  edited_at   timestamptz,
  confirmed   boolean     not null default true      -- false when it was entered through the API with auto-confirm
);
create index if not exists context_notes_date on public.context_notes (note_date);

create table if not exists public.context_events (
  id           bigserial primary key,
  note_id      bigint      not null references public.context_notes (id) on delete cascade,
  type         text        not null check (type in ('GI', 'illness', 'injury_pain', 'fatigue', 'sleep', 'stress', 'travel', 'other')),
  body_area    text,                                 -- 'stomach', 'calf'... or null
  severity     smallint    not null check (severity between 1 and 5),
  cause_stated text,                                 -- only what the athlete said, never a diagnosis
  tags         text[]      not null default '{}',    -- short context tags ('post-gym', 'before-run', 'meal')
  started_at   timestamp,                            -- local time, when stated
  ended_at     timestamp,
  status       text        not null default 'open' check (status in ('open', 'closed')),
  closed_reason text,                                -- 'recovered' or 'manual'
  created_at   timestamptz not null default now()
);
create index if not exists context_events_status on public.context_events (status);

-- Status of each planned session: done, partial, skipped or changed (planned_ref = week:day:slot).
create table if not exists public.session_status (
  id           bigserial primary key,
  status_date  date        not null,
  sport        text        not null,
  planned_ref  text        not null unique,
  status       text        not null check (status in ('done', 'partial', 'skipped', 'changed')),
  percent_done smallint    check (percent_done between 0 and 100),
  reason_tag   text,
  note         text,
  event_id     bigint      references public.context_events (id) on delete set null,
  source       text        not null default 'manual' check (source in ('manual', 'ai')),
  updated_at   timestamptz not null default now()
);
create index if not exists session_status_date on public.session_status (status_date);

-- One answer per event per day: how is it today, 1 to 10 (10 = back to normal).
create table if not exists public.event_followups (
  id             bigserial primary key,
  event_id       bigint      not null references public.context_events (id) on delete cascade,
  followup_date  date        not null,
  recovery_score smallint    not null check (recovery_score between 1 and 10),
  trend          text        not null check (trend in ('worse', 'same', 'better')),
  red_flags      jsonb       not null default '[]'::jsonb,
  note           text,
  created_at     timestamptz not null default now(),
  unique (event_id, followup_date)
);

alter table public.context_notes enable row level security;
alter table public.context_events enable row level security;
alter table public.session_status enable row level security;
alter table public.event_followups enable row level security;
