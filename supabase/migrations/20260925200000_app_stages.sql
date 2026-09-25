-- Stage types are group, league, and knockout. Group and league stages can
-- reference existing setup groups. Setup groups stay the source of membership.

alter table app.stages drop constraint stages_type_known;

alter table app.stages
  add constraint stages_type_known
  check (stage_type in ('group', 'league', 'knockout'));

create unique index stages_tournament_name_lower_key
  on app.stages (tournament_id, lower(name));

alter table app.stages drop constraint stages_tournament_id_position_key;

alter table app.stages
  add constraint stages_tournament_id_position_key
  unique (tournament_id, position) deferrable initially deferred;

alter table app.stage_groups
  add column source_group_id uuid;

alter table app.stage_groups
  add constraint stage_groups_source_group_fk
  foreign key (source_group_id, tournament_id)
  references app.groups (id, tournament_id);

create unique index stage_groups_source_group_key
  on app.stage_groups (source_group_id)
  where source_group_id is not null;

create or replace function app.enforce_group_stage_type()
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

  if stype is distinct from 'group' and stype is distinct from 'league' then
    raise exception 'groups belong only to group or league stages';
  end if;

  return new;
end;
$$;

create or replace function app.enforce_entry_sources()
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

  if entry_stage_type in ('group', 'league') then
    if new.group_id is null then
      raise exception 'group or league entry requires a group';
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

create or replace function app.enforce_match_group()
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

  if stype in ('group', 'league') then
    if new.group_id is null then
      raise exception 'group or league match requires a group';
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
