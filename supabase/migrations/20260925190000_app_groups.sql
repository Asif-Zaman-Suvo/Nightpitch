-- Setup groups belong to a tournament. Competition groups still live on stages
-- once stages exist. A team can be in at most one setup group.

create table app.groups (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references app.tournaments (id) on delete cascade,
  position smallint not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint groups_position_positive check (position >= 1),
  constraint groups_name_not_blank check (char_length(btrim(name)) > 0),
  unique (id, tournament_id),
  unique (tournament_id, position)
);

create unique index groups_tournament_name_lower_key
  on app.groups (tournament_id, lower(name));

create index groups_tournament_id_idx on app.groups (tournament_id);

create trigger groups_set_updated_at
  before update on app.groups
  for each row execute function app.set_updated_at();

create table app.group_teams (
  tournament_id uuid not null,
  group_id uuid not null,
  team_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (group_id, team_id),
  unique (tournament_id, team_id),
  foreign key (group_id, tournament_id)
    references app.groups (id, tournament_id) on delete cascade,
  foreign key (team_id, tournament_id)
    references app.teams (id, tournament_id) on delete cascade
);

create index group_teams_group_id_idx on app.group_teams (group_id);

alter table app.groups enable row level security;
alter table app.group_teams enable row level security;

grant select, insert, update, delete on app.groups to app_writer;
grant select, insert, update, delete on app.group_teams to app_writer;

revoke all on app.groups from public;
revoke all on app.group_teams from public;
