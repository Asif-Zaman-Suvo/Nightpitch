-- A league round-robin can pair participants from different stage groups.
-- Group matches still require a stage group. Knockout matches still cannot have one.

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

  if stype = 'group' then
    if new.group_id is null then
      raise exception 'group match requires a group';
    end if;
    if not exists (
      select 1 from stage_groups
      where id = new.group_id
        and stage_id = new.stage_id
        and tournament_id = new.tournament_id
    ) then
      raise exception 'match group must belong to the match stage';
    end if;
  elsif stype = 'league' then
    if new.group_id is not null and not exists (
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
