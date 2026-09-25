-- Optional logo URL and a unique short name when one is set.
-- Does not change public World Cup tables.

alter table app.teams
  add column logo_url text;

alter table app.teams
  add constraint teams_logo_url_length
  check (logo_url is null or char_length(logo_url) between 1 and 2000);

create unique index teams_tournament_short_name_key
  on app.teams (tournament_id, lower(short_name))
  where btrim(short_name) <> '';
