-- Plan A / B / C: versions of a planned week, and sessions moved to another day inside a version.
-- training_weeks stays: its planned_sessions holds the plan of record (the version in force on each day), so every
-- reader that already uses it judges each day against the right plan.

create table if not exists public.plan_versions (
  id                bigserial primary key,
  week_start        date        not null,
  label             text        not null check (label in ('A', 'B', 'C')),
  status            text        not null check (status in ('draft', 'active', 'superseded')),
  parent_version_id bigint      references public.plan_versions (id) on delete set null,
  created_at        timestamptz not null default now(),
  activated_at      timestamptz,
  effective_from    date,
  reason            text,
  log_event_id      bigint      references public.context_events (id) on delete set null,
  week_label        text,
  target_hours      numeric(5, 2),
  days              jsonb       not null default '[]'::jsonb  -- the 7 days, each session with a stable id
);
create index if not exists plan_versions_week on public.plan_versions (week_start);
-- one active version per week
create unique index if not exists plan_versions_one_active on public.plan_versions (week_start) where status = 'active';

create table if not exists public.session_moves (
  id              bigserial primary key,
  plan_version_id bigint      not null references public.plan_versions (id) on delete cascade,
  session_id      text        not null,
  from_date       date        not null,
  to_date         date        not null,
  created_at      timestamptz not null default now()
);
create index if not exists session_moves_version on public.session_moves (plan_version_id);

alter table public.plan_versions enable row level security;
alter table public.session_moves enable row level security;
