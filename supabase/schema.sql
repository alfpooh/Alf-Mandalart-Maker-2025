-- Mandalart planner schema.
--
-- Two kinds of plan live in the same table: anonymous drafts (owner_id null,
-- reachable only via draft_token, expiring after 24h) and owned plans
-- (owner_id set, no expiry). Signing in turns the first into the second.
--
-- Apply with: supabase db push   — or paste into the SQL editor.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale       text not null default 'en' check (locale in ('ko', 'en', 'fi')),
  created_at   timestamptz not null default now()
);

comment on table public.profiles is 'One row per signed-in user, created by handle_new_user().';

-- ---------------------------------------------------------------------------
-- plans
-- ---------------------------------------------------------------------------

create table if not exists public.plans (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users (id) on delete cascade,
  draft_token text unique,
  main_goal   text not null check (char_length(main_goal) between 1 and 500),
  language    text not null default 'en' check (language in ('ko', 'en', 'fi')),
  status      text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  is_public   boolean not null default false,
  share_slug  text unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  expires_at  timestamptz,

  -- A plan is either an anonymous draft or owned. Never both, never neither:
  -- without this, a claim that half-succeeded would leave a row nobody can read.
  constraint plans_ownership check (
    (owner_id is null and draft_token is not null and expires_at is not null) or
    (owner_id is not null and draft_token is null and expires_at is null)
  )
);

create index if not exists plans_owner_idx on public.plans (owner_id, updated_at desc);
create index if not exists plans_expiry_idx on public.plans (expires_at) where expires_at is not null;

-- ---------------------------------------------------------------------------
-- subgoals — exactly 8 per plan, positions 0..7
-- ---------------------------------------------------------------------------

create table if not exists public.subgoals (
  id       uuid primary key default gen_random_uuid(),
  plan_id  uuid not null references public.plans (id) on delete cascade,
  position smallint not null check (position between 0 and 7),
  content  text not null check (char_length(content) between 1 and 300),
  unique (plan_id, position)
);

create index if not exists subgoals_plan_idx on public.subgoals (plan_id, position);

-- ---------------------------------------------------------------------------
-- actions — exactly 8 per subgoal, positions 0..7
-- ---------------------------------------------------------------------------

create table if not exists public.actions (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid not null references public.plans (id) on delete cascade,
  subgoal_id uuid not null references public.subgoals (id) on delete cascade,
  position   smallint not null check (position between 0 and 7),
  content    text not null check (char_length(content) between 1 and 300),
  metric     text,
  cadence    text not null default 'once' check (cadence in ('once', 'weekly', 'monthly')),
  due_date   date,

  -- 0 means not started; the five stages are the ladder above it. Constrained
  -- to exact values so a stray slider can never write 63%.
  progress   smallint not null default 0 check (progress in (0, 10, 25, 50, 75, 100)),

  updated_at timestamptz not null default now(),
  unique (subgoal_id, position)
);

create index if not exists actions_plan_idx on public.actions (plan_id);
create index if not exists actions_subgoal_idx on public.actions (subgoal_id, position);

-- ---------------------------------------------------------------------------
-- action_dependencies — "action_id cannot start until depends_on_id is 100%"
-- ---------------------------------------------------------------------------

create table if not exists public.action_dependencies (
  plan_id       uuid not null references public.plans (id) on delete cascade,
  action_id     uuid not null references public.actions (id) on delete cascade,
  depends_on_id uuid not null references public.actions (id) on delete cascade,
  rationale     text,
  confidence    real not null default 0.5 check (confidence between 0 and 1),

  -- Protects an edge a person created or confirmed from being dropped the next
  -- time dependencies are re-analyzed.
  user_edited   boolean not null default false,

  primary key (action_id, depends_on_id),
  constraint no_self_dependency check (action_id <> depends_on_id)
);

create index if not exists deps_plan_idx on public.action_dependencies (plan_id);
create index if not exists deps_prerequisite_idx on public.action_dependencies (depends_on_id);

comment on table public.action_dependencies is
  'Acyclicity is enforced in the application (lib/graph.ts breakCycles), not here.';

-- ---------------------------------------------------------------------------
-- progress_logs — the free-text note is the record; the percentage summarizes it
-- ---------------------------------------------------------------------------

create table if not exists public.progress_logs (
  id                 uuid primary key default gen_random_uuid(),
  plan_id            uuid not null references public.plans (id) on delete cascade,
  action_id          uuid not null references public.actions (id) on delete cascade,
  raw_text           text not null check (char_length(raw_text) between 1 and 2000),
  inferred_progress  smallint check (inferred_progress in (0, 10, 25, 50, 75, 100)),
  confirmed_progress smallint not null check (confirmed_progress in (0, 10, 25, 50, 75, 100)),
  confidence         real check (confidence between 0 and 1),
  created_at         timestamptz not null default now()
);

create index if not exists logs_action_idx on public.progress_logs (action_id, created_at desc);
create index if not exists logs_plan_idx on public.progress_logs (plan_id, created_at desc);

-- ---------------------------------------------------------------------------
-- anon_quota — one generation per fingerprint per day
-- ---------------------------------------------------------------------------
-- fingerprint is a salted hash of the client IP. The raw address is never
-- stored, and rows are deleted once they are a few days old.

create table if not exists public.anon_quota (
  fingerprint text not null,
  day         date not null,
  count       integer not null default 0,
  primary key (fingerprint, day)
);

create index if not exists anon_quota_day_idx on public.anon_quota (day);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- Anonymous drafts are deliberately unreachable through these policies: the
-- server reads them with the service role after checking draft_token itself.
-- A policy cannot verify a bearer token, so letting anon read plans at all
-- would expose every draft.

alter table public.profiles            enable row level security;
alter table public.plans               enable row level security;
alter table public.subgoals            enable row level security;
alter table public.actions             enable row level security;
alter table public.action_dependencies enable row level security;
alter table public.progress_logs       enable row level security;
alter table public.anon_quota          enable row level security;

drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists plans_owner on public.plans;
create policy plans_owner on public.plans
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists plans_public_read on public.plans;
create policy plans_public_read on public.plans
  for select using (is_public and share_slug is not null);

-- Child tables inherit access from their plan.
drop policy if exists subgoals_via_plan on public.subgoals;
create policy subgoals_via_plan on public.subgoals
  for all
  using (exists (
    select 1 from public.plans p
    where p.id = subgoals.plan_id
      and (p.owner_id = auth.uid() or (p.is_public and p.share_slug is not null))
  ))
  with check (exists (
    select 1 from public.plans p where p.id = subgoals.plan_id and p.owner_id = auth.uid()
  ));

drop policy if exists actions_via_plan on public.actions;
create policy actions_via_plan on public.actions
  for all
  using (exists (
    select 1 from public.plans p
    where p.id = actions.plan_id
      and (p.owner_id = auth.uid() or (p.is_public and p.share_slug is not null))
  ))
  with check (exists (
    select 1 from public.plans p where p.id = actions.plan_id and p.owner_id = auth.uid()
  ));

drop policy if exists deps_via_plan on public.action_dependencies;
create policy deps_via_plan on public.action_dependencies
  for all
  using (exists (
    select 1 from public.plans p
    where p.id = action_dependencies.plan_id
      and (p.owner_id = auth.uid() or (p.is_public and p.share_slug is not null))
  ))
  with check (exists (
    select 1 from public.plans p
    where p.id = action_dependencies.plan_id and p.owner_id = auth.uid()
  ));

-- Progress notes stay private even when the plan is shared publicly.
drop policy if exists logs_via_plan on public.progress_logs;
create policy logs_via_plan on public.progress_logs
  for all
  using (exists (
    select 1 from public.plans p where p.id = progress_logs.plan_id and p.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.plans p where p.id = progress_logs.plan_id and p.owner_id = auth.uid()
  ));

-- No policies on anon_quota: the service role bypasses RLS, and nothing else
-- has any business reading it.

-- ---------------------------------------------------------------------------
-- Triggers and helpers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists plans_touch on public.plans;
create trigger plans_touch before update on public.plans
  for each row execute function public.touch_updated_at();

drop trigger if exists actions_touch on public.actions;
create trigger actions_touch before update on public.actions
  for each row execute function public.touch_updated_at();

-- A profile row for every new sign-in.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

/**
 * Moves an anonymous draft to a user, atomically.
 *
 * Called right after sign-in with the token the browser was holding. A partial
 * claim would leave the user's Mandalart orphaned, so ownership and expiry move
 * in one statement. Returns null when the token is unknown or already expired,
 * which the caller reports rather than retrying.
 */
create or replace function public.claim_draft(token text, new_owner uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  claimed uuid;
begin
  update public.plans
     set owner_id = new_owner,
         draft_token = null,
         expires_at = null,
         status = 'active'
   where draft_token = token
     and owner_id is null
     and expires_at > now()
  returning id into claimed;

  return claimed;
end;
$$;

revoke all on function public.claim_draft(text, uuid) from public, anon;

/** Deletes drafts nobody claimed, and quota rows old enough to be useless. */
create or replace function public.purge_expired()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.plans where expires_at is not null and expires_at < now();
  delete from public.anon_quota where day < current_date - 7;
end;
$$;

revoke all on function public.purge_expired() from public, anon;
