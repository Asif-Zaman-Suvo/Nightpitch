-- Custom Tournament Maker: schema `app`.
-- Does not alter public.users, public.predictions, public.knockout_predictions,
-- or public.handle_new_user. The new auth trigger is separate.
-- Do not add schema `app` to the Supabase Data API exposed schemas.
-- No World Cup seed data.

create schema app;

comment on schema app is
  'Custom Tournament Maker. Not exposed via the Data API.';

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table app.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_not_blank
    check (char_length(btrim(display_name)) > 0)
);

create trigger profiles_set_updated_at
  before update on app.profiles
  for each row execute function app.set_updated_at();

create function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = app
as $$
begin
  insert into app.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'display_name'), ''),
      'Organizer'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Does not replace public.on_auth_user_created / public.handle_new_user.
create trigger app_on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------
-- tournaments
-- ---------------------------------------------------------------------------

create table app.tournaments (
  id uuid primary key default gen_random_uuid(),
  public_id text not null,
  owner_id uuid not null references app.profiles (id),
  name text not null,
  description text not null default '',
  timezone text not null default 'UTC',
  score_label text not null default 'Goals',
  visibility text not null default 'unlisted',
  status text not null default 'draft',
  archived_from text,
  version integer not null default 1,
  next_team_number integer not null default 1,
  next_match_number integer not null default 1,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournaments_public_id_crockford
    check (public_id ~ '^[0-9A-HJ-KM-NP-TV-Z]{8}$'),
  constraint tournaments_name_not_blank
    check (char_length(btrim(name)) > 0),
  constraint tournaments_timezone_not_blank
    check (char_length(btrim(timezone)) > 0),
  constraint tournaments_score_label_not_blank
    check (char_length(btrim(score_label)) > 0),
  constraint tournaments_visibility_known
    check (visibility in ('public', 'unlisted', 'private')),
  constraint tournaments_status_known
    check (status in ('draft', 'published', 'completed', 'archived')),
  constraint tournaments_archived_from_agrees
    check (
      (status = 'archived' and archived_from in ('published', 'completed'))
      or (status <> 'archived' and archived_from is null)
    ),
  constraint tournaments_version_positive
    check (version >= 1),
  constraint tournaments_next_team_number_positive
    check (next_team_number >= 1),
  constraint tournaments_next_match_number_positive
    check (next_match_number >= 1)
);

create unique index tournaments_public_id_key on app.tournaments (public_id);

create index tournaments_owner_status_idx
  on app.tournaments (owner_id, status)
  where deleted_at is null;

create trigger tournaments_set_updated_at
  before update on app.tournaments
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- teams
-- ---------------------------------------------------------------------------

create table app.teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references app.tournaments (id) on delete cascade,
  number integer not null,
  name text not null,
  short_name text not null default '',
  color text,
  seed integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_number_positive check (number >= 1),
  constraint teams_name_not_blank check (char_length(btrim(name)) > 0),
  constraint teams_color_hex
    check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint teams_seed_positive check (seed is null or seed >= 1),
  unique (id, tournament_id),
  unique (tournament_id, number)
);

create unique index teams_tournament_name_lower_key
  on app.teams (tournament_id, lower(name));

create index teams_tournament_id_idx on app.teams (tournament_id);

create trigger teams_set_updated_at
  before update on app.teams
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- stages
-- ---------------------------------------------------------------------------

create table app.stages (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references app.tournaments (id) on delete cascade,
  position smallint not null,
  name text not null,
  stage_type text not null,
  rules jsonb not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stages_position_positive check (position >= 1),
  constraint stages_name_not_blank check (char_length(btrim(name)) > 0),
  constraint stages_type_known check (stage_type in ('round_robin', 'knockout')),
  constraint stages_rules_schema_v1
    check (
      jsonb_typeof(rules) = 'object'
      and rules->>'schemaVersion' = '1'
    ),
  unique (id, tournament_id),
  unique (tournament_id, position)
);

create index stages_tournament_id_idx on app.stages (tournament_id, position);

create trigger stages_set_updated_at
  before update on app.stages
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- stage_groups
-- ---------------------------------------------------------------------------

create table app.stage_groups (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null,
  stage_id uuid not null,
  position smallint not null,
  name text not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stage_groups_position_positive check (position >= 1),
  constraint stage_groups_name_not_blank check (char_length(btrim(name)) > 0),
  foreign key (stage_id, tournament_id)
    references app.stages (id, tournament_id) on delete cascade,
  unique (id, tournament_id),
  unique (stage_id, position),
  unique (stage_id, name)
);

create index stage_groups_stage_id_idx on app.stage_groups (stage_id);

create trigger stage_groups_set_updated_at
  before update on app.stage_groups
  for each row execute function app.set_updated_at();

create function app.enforce_group_stage_type()
returns trigger
language plpgsql
set search_path = app
as $$
declare
  stype text;
begin
  select stage_type into stype
  from stages
  where id = new.stage_id and tournament_id = new.tournament_id;

  if stype is distinct from 'round_robin' then
    raise exception 'groups belong only to round-robin stages';
  end if;

  return new;
end;
$$;

create trigger stage_groups_round_robin_only
  before insert or update on app.stage_groups
  for each row execute function app.enforce_group_stage_type();

-- ---------------------------------------------------------------------------
-- stage_entries
-- ---------------------------------------------------------------------------

create table app.stage_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null,
  stage_id uuid not null,
  group_id uuid,
  slot smallint not null,
  source_kind text not null,
  source_team_id uuid,
  source_group_id uuid,
  source_rank smallint,
  source_stage_id uuid,
  source_position smallint,
  source_pool_rank smallint,
  source_comparison text,
  source_match_id uuid,
  source_outcome text,
  confirmed_team_id uuid,
  confirmed_via text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stage_entries_slot_positive check (slot >= 1),
  constraint stage_entries_source_kind_known
    check (source_kind in ('team', 'group_rank', 'pooled_rank', 'match_outcome')),
  constraint stage_entries_source_rank_positive
    check (source_rank is null or source_rank >= 1),
  constraint stage_entries_source_position_positive
    check (source_position is null or source_position >= 1),
  constraint stage_entries_source_pool_rank_positive
    check (source_pool_rank is null or source_pool_rank >= 1),
  constraint stage_entries_source_comparison_known
    check (source_comparison is null or source_comparison in ('raw', 'points_per_match')),
  constraint stage_entries_source_outcome_known
    check (source_outcome is null or source_outcome in ('winner', 'loser')),
  constraint stage_entries_confirmed_via_known
    check (confirmed_via is null or confirmed_via in ('resolution', 'override')),
  constraint stage_entries_confirmed_pair
    check (
      (confirmed_team_id is null and confirmed_via is null)
      or (confirmed_team_id is not null and confirmed_via is not null)
    ),
  constraint stage_entries_source_shape check (
    (
      source_kind = 'team'
      and source_team_id is not null
      and confirmed_team_id is not null
      and source_group_id is null
      and source_rank is null
      and source_stage_id is null
      and source_position is null
      and source_pool_rank is null
      and source_comparison is null
      and source_match_id is null
      and source_outcome is null
    )
    or (
      source_kind = 'group_rank'
      and source_group_id is not null
      and source_rank is not null
      and source_team_id is null
      and source_stage_id is null
      and source_position is null
      and source_pool_rank is null
      and source_comparison is null
      and source_match_id is null
      and source_outcome is null
    )
    or (
      source_kind = 'pooled_rank'
      and source_stage_id is not null
      and source_position is not null
      and source_pool_rank is not null
      and source_comparison is not null
      and source_team_id is null
      and source_group_id is null
      and source_rank is null
      and source_match_id is null
      and source_outcome is null
    )
    or (
      source_kind = 'match_outcome'
      and source_match_id is not null
      and source_outcome is not null
      and confirmed_team_id is null
      and source_team_id is null
      and source_group_id is null
      and source_rank is null
      and source_stage_id is null
      and source_position is null
      and source_pool_rank is null
      and source_comparison is null
    )
  ),
  foreign key (stage_id, tournament_id)
    references app.stages (id, tournament_id) on delete cascade,
  foreign key (group_id, tournament_id)
    references app.stage_groups (id, tournament_id),
  foreign key (source_team_id, tournament_id)
    references app.teams (id, tournament_id),
  foreign key (confirmed_team_id, tournament_id)
    references app.teams (id, tournament_id),
  foreign key (source_group_id, tournament_id)
    references app.stage_groups (id, tournament_id)
    deferrable initially deferred,
  foreign key (source_stage_id, tournament_id)
    references app.stages (id, tournament_id)
    deferrable initially deferred,
  unique (id, tournament_id)
);

-- source_match_id FK is added after matches exists.

create unique index stage_entries_grouped_slot_key
  on app.stage_entries (stage_id, group_id, slot)
  where group_id is not null;

create unique index stage_entries_knockout_slot_key
  on app.stage_entries (stage_id, slot)
  where group_id is null;

create unique index stage_entries_one_team_source_key
  on app.stage_entries (stage_id, source_team_id)
  where source_kind = 'team';

create unique index stage_entries_one_confirmed_team_key
  on app.stage_entries (stage_id, confirmed_team_id)
  where confirmed_team_id is not null;

create index stage_entries_stage_id_idx on app.stage_entries (stage_id);

create index stage_entries_source_group_id_idx
  on app.stage_entries (source_group_id)
  where source_group_id is not null;

create index stage_entries_source_stage_id_idx
  on app.stage_entries (source_stage_id)
  where source_stage_id is not null;

create trigger stage_entries_set_updated_at
  before update on app.stage_entries
  for each row execute function app.set_updated_at();

create function app.enforce_entry_sources()
returns trigger
language plpgsql
set search_path = app
as $$
declare
  entry_stage_position smallint;
  entry_stage_type text;
  source_stage_position smallint;
  group_stage_id uuid;
  group_stage_position smallint;
  match_stage_position smallint;
begin
  select position, stage_type
    into entry_stage_position, entry_stage_type
  from stages
  where id = new.stage_id and tournament_id = new.tournament_id;

  if not found then
    raise exception 'entry stage % is not in tournament %', new.stage_id, new.tournament_id;
  end if;

  if entry_stage_type = 'round_robin' then
    if new.group_id is null then
      raise exception 'round-robin entry requires a group';
    end if;
    if not exists (
      select 1 from stage_groups
      where id = new.group_id
        and stage_id = new.stage_id
        and tournament_id = new.tournament_id
    ) then
      raise exception 'entry group must belong to the entry stage';
    end if;
  elsif new.group_id is not null then
    raise exception 'knockout entry cannot belong to a group';
  end if;

  if new.source_group_id is not null then
    select stage_id into group_stage_id
    from stage_groups
    where id = new.source_group_id and tournament_id = new.tournament_id;

    if not found then
      raise exception 'source group is not in this tournament';
    end if;

    select position into group_stage_position
    from stages
    where id = group_stage_id;

    if group_stage_position >= entry_stage_position then
      raise exception 'group-rank source must be an earlier stage';
    end if;
  end if;

  if new.source_stage_id is not null then
    select position into source_stage_position
    from stages
    where id = new.source_stage_id and tournament_id = new.tournament_id;

    if not found then
      raise exception 'source stage is not in this tournament';
    end if;

    if source_stage_position >= entry_stage_position then
      raise exception 'pooled or match source must be an earlier stage';
    end if;
  end if;

  if new.source_match_id is not null then
    select s.position into match_stage_position
    from matches m
    join stages s on s.id = m.stage_id
    where m.id = new.source_match_id and m.tournament_id = new.tournament_id;

    if not found then
      raise exception 'source match is not in this tournament';
    end if;

    if match_stage_position >= entry_stage_position then
      raise exception 'match-outcome source must be an earlier stage';
    end if;
  end if;

  return new;
end;
$$;

create trigger stage_entries_enforce_sources
  before insert or update on app.stage_entries
  for each row execute function app.enforce_entry_sources();

-- ---------------------------------------------------------------------------
-- tie_orders
-- ---------------------------------------------------------------------------

create table app.tie_orders (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null,
  stage_id uuid not null,
  group_id uuid,
  team_id uuid not null,
  position smallint not null,
  created_at timestamptz not null default now(),
  constraint tie_orders_position_positive check (position >= 1),
  foreign key (stage_id, tournament_id)
    references app.stages (id, tournament_id) on delete cascade,
  foreign key (group_id, tournament_id)
    references app.stage_groups (id, tournament_id),
  foreign key (team_id, tournament_id)
    references app.teams (id, tournament_id)
);

create unique index tie_orders_group_team_key
  on app.tie_orders (stage_id, group_id, team_id)
  where group_id is not null;

create unique index tie_orders_group_position_key
  on app.tie_orders (stage_id, group_id, position)
  where group_id is not null;

create unique index tie_orders_pool_team_key
  on app.tie_orders (stage_id, team_id)
  where group_id is null;

create unique index tie_orders_pool_position_key
  on app.tie_orders (stage_id, position)
  where group_id is null;

create function app.enforce_tie_order_group()
returns trigger
language plpgsql
set search_path = app
as $$
begin
  if new.group_id is not null and not exists (
    select 1 from stage_groups
    where id = new.group_id
      and stage_id = new.stage_id
      and tournament_id = new.tournament_id
  ) then
    raise exception 'tie-order group must belong to the tie-order stage';
  end if;

  return new;
end;
$$;

create trigger tie_orders_group_in_stage
  before insert or update on app.tie_orders
  for each row execute function app.enforce_tie_order_group();

-- ---------------------------------------------------------------------------
-- matches
-- ---------------------------------------------------------------------------

create table app.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null,
  stage_id uuid not null,
  group_id uuid,
  round_number smallint not null,
  match_number integer not null,
  starts_at timestamptz,
  venue text,
  status text not null default 'scheduled',
  decided_by text,
  decider_score_1 integer,
  decider_score_2 integer,
  forfeit_position smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_round_number_positive check (round_number >= 1),
  constraint matches_match_number_positive check (match_number >= 1),
  constraint matches_status_known
    check (status in ('scheduled', 'postponed', 'cancelled', 'completed')),
  constraint matches_decided_by_known
    check (
      decided_by is null
      or decided_by in ('regular', 'extra_time', 'penalties', 'forfeit')
    ),
  constraint matches_completed_iff_result
    check (
      (status = 'completed' and decided_by is not null)
      or (
        status in ('scheduled', 'postponed', 'cancelled')
        and decided_by is null
      )
    ),
  constraint matches_decider_scores
    check (
      (
        decider_score_1 is null
        and decider_score_2 is null
      )
      or (
        decider_score_1 is not null
        and decider_score_2 is not null
        and decider_score_1 >= 0
        and decider_score_2 >= 0
        and decider_score_1 <> decider_score_2
        and decided_by in ('extra_time', 'penalties')
      )
    ),
  constraint matches_forfeit_position
    check (
      (decided_by = 'forfeit' and forfeit_position in (1, 2))
      or (decided_by is distinct from 'forfeit' and forfeit_position is null)
    ),
  foreign key (stage_id, tournament_id)
    references app.stages (id, tournament_id) on delete cascade,
  foreign key (group_id, tournament_id)
    references app.stage_groups (id, tournament_id),
  unique (id, tournament_id),
  unique (tournament_id, match_number)
);

create index matches_stage_round_idx on app.matches (stage_id, round_number);

create trigger matches_set_updated_at
  before update on app.matches
  for each row execute function app.set_updated_at();

create function app.enforce_match_group()
returns trigger
language plpgsql
set search_path = app
as $$
declare
  stype text;
begin
  select stage_type into stype
  from stages
  where id = new.stage_id and tournament_id = new.tournament_id;

  if not found then
    raise exception 'match stage % is not in tournament %', new.stage_id, new.tournament_id;
  end if;

  if stype = 'round_robin' then
    if new.group_id is null then
      raise exception 'round-robin match requires a group';
    end if;
    if not exists (
      select 1 from stage_groups
      where id = new.group_id
        and stage_id = new.stage_id
        and tournament_id = new.tournament_id
    ) then
      raise exception 'match group must belong to the match stage';
    end if;
  elsif new.group_id is not null then
    raise exception 'knockout match cannot belong to a group';
  end if;

  return new;
end;
$$;

create trigger matches_group_matches_stage
  before insert or update on app.matches
  for each row execute function app.enforce_match_group();

alter table app.stage_entries
  add constraint stage_entries_source_match_fk
  foreign key (source_match_id, tournament_id)
  references app.matches (id, tournament_id)
  deferrable initially deferred;

create index stage_entries_source_match_id_idx
  on app.stage_entries (source_match_id)
  where source_match_id is not null;

-- ---------------------------------------------------------------------------
-- match_participants
-- ---------------------------------------------------------------------------

create table app.match_participants (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null,
  match_id uuid not null,
  position smallint not null,
  source_kind text not null,
  source_entry_id uuid,
  source_match_id uuid,
  source_outcome text,
  score integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint match_participants_position_known check (position in (1, 2)),
  constraint match_participants_source_kind_known
    check (source_kind in ('entry', 'match_outcome')),
  constraint match_participants_source_outcome_known
    check (source_outcome is null or source_outcome in ('winner', 'loser')),
  constraint match_participants_score_nonnegative
    check (score is null or score >= 0),
  constraint match_participants_source_shape check (
    (
      source_kind = 'entry'
      and source_entry_id is not null
      and source_match_id is null
      and source_outcome is null
    )
    or (
      source_kind = 'match_outcome'
      and source_match_id is not null
      and source_outcome is not null
      and source_entry_id is null
    )
  ),
  foreign key (match_id, tournament_id)
    references app.matches (id, tournament_id) on delete cascade,
  foreign key (source_entry_id, tournament_id)
    references app.stage_entries (id, tournament_id)
    deferrable initially deferred,
  foreign key (source_match_id, tournament_id)
    references app.matches (id, tournament_id)
    deferrable initially deferred,
  unique (match_id, position)
);

create index match_participants_match_id_idx
  on app.match_participants (match_id);

create index match_participants_source_match_id_idx
  on app.match_participants (source_match_id)
  where source_match_id is not null;

create trigger match_participants_set_updated_at
  before update on app.match_participants
  for each row execute function app.set_updated_at();

create function app.enforce_participant_source()
returns trigger
language plpgsql
set search_path = app
as $$
declare
  match_stage uuid;
  match_round smallint;
  entry_stage uuid;
  source_stage uuid;
  source_round smallint;
begin
  select stage_id, round_number
    into match_stage, match_round
  from matches
  where id = new.match_id and tournament_id = new.tournament_id;

  if not found then
    raise exception 'participant match is not in this tournament';
  end if;

  if new.source_kind = 'entry' then
    select stage_id into entry_stage
    from stage_entries
    where id = new.source_entry_id and tournament_id = new.tournament_id;

    if not found then
      raise exception 'source entry is not in this tournament';
    end if;

    if entry_stage <> match_stage then
      raise exception 'source entry must be in the same stage as the match';
    end if;
  else
    if new.source_match_id = new.match_id then
      raise exception 'a match cannot source itself';
    end if;

    select stage_id, round_number
      into source_stage, source_round
    from matches
    where id = new.source_match_id and tournament_id = new.tournament_id;

    if not found then
      raise exception 'source match is not in this tournament';
    end if;

    if source_stage <> match_stage then
      raise exception 'source match must be in the same stage';
    end if;

    if source_round >= match_round then
      raise exception 'source match must be in an earlier round';
    end if;
  end if;

  return new;
end;
$$;

create trigger match_participants_enforce_source
  before insert or update on app.match_participants
  for each row execute function app.enforce_participant_source();

-- A lower round_number is a strict order, so participant sources cannot cycle.
-- The publish command still checks the whole definition in the engine.

create function app.enforce_match_shape()
returns trigger
language plpgsql
set search_path = app
as $$
declare
  mid uuid;
  participant_count int;
  scored_count int;
  match_status text;
begin
  if tg_table_name = 'matches' then
    mid := coalesce(new.id, old.id);
  else
    mid := coalesce(new.match_id, old.match_id);
  end if;

  select status into match_status from matches where id = mid;
  if not found then
    return null;
  end if;

  select count(*), count(score)
    into participant_count, scored_count
  from match_participants
  where match_id = mid;

  if participant_count <> 2 then
    raise exception 'match % must have exactly two participants', mid;
  end if;

  if match_status = 'completed' and scored_count <> 2 then
    raise exception 'completed match % must have two scores', mid;
  end if;

  if match_status <> 'completed' and scored_count <> 0 then
    raise exception 'match % cannot have scores until it is completed', mid;
  end if;

  return null;
end;
$$;

create constraint trigger matches_shape
  after insert or update or delete on app.matches
  deferrable initially deferred
  for each row execute function app.enforce_match_shape();

create constraint trigger match_participants_shape
  after insert or update or delete on app.match_participants
  deferrable initially deferred
  for each row execute function app.enforce_match_shape();

-- ---------------------------------------------------------------------------
-- audit_log
-- ---------------------------------------------------------------------------

create table app.audit_log (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references app.tournaments (id) on delete cascade,
  actor_id uuid references app.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now(),
  constraint audit_log_action_not_blank check (char_length(btrim(action)) > 0),
  constraint audit_log_entity_type_not_blank
    check (char_length(btrim(entity_type)) > 0)
);

create index audit_log_tournament_created_idx
  on app.audit_log (tournament_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: enabled, no policies. Table owner still bypasses RLS unless FORCE.
-- anon/authenticated have no grants, so the Data API cannot reach these tables
-- even if this schema is later exposed by mistake.
-- ---------------------------------------------------------------------------

alter table app.profiles enable row level security;
alter table app.tournaments enable row level security;
alter table app.teams enable row level security;
alter table app.stages enable row level security;
alter table app.stage_groups enable row level security;
alter table app.stage_entries enable row level security;
alter table app.tie_orders enable row level security;
alter table app.matches enable row level security;
alter table app.match_participants enable row level security;
alter table app.audit_log enable row level security;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on schema app from public;
revoke all on all tables in schema app from public;
revoke all on all functions in schema app from public;

do $$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated']
  loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('revoke all on schema app from %I', role_name);
      execute format('revoke all on all tables in schema app from %I', role_name);
      execute format('revoke all on all functions in schema app from %I', role_name);
    end if;
  end loop;

  if not exists (select 1 from pg_roles where rolname = 'app_writer') then
    create role app_writer nologin bypassrls;
  end if;
end $$;

grant usage on schema app to app_writer;
grant select, insert, update, delete on all tables in schema app to app_writer;
revoke update, delete on app.audit_log from app_writer;

alter default privileges in schema app
  grant select, insert, update, delete on tables to app_writer;

-- supabase_auth_admin inserts into auth.users and must be allowed to fire the trigger.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema app to supabase_auth_admin;
    grant execute on function app.handle_new_user() to supabase_auth_admin;
  end if;
end $$;
