-- A knockout slot keeps its source match so the bracket side stays stable.
-- source_entry_id on that same row is the winner once the source match is
-- completed. Unresolved slots leave it null.

alter table app.match_participants
  drop constraint match_participants_source_shape;

alter table app.match_participants
  add constraint match_participants_source_shape check (
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
    )
  );
