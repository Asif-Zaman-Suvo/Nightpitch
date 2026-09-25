-- Remove the old World Cup predictor objects. The maker uses schema app only.

drop table if exists public.knockout_predictions cascade;
drop table if exists public.predictions cascade;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.update_updated_at_column() cascade;

drop table if exists public.users cascade;
