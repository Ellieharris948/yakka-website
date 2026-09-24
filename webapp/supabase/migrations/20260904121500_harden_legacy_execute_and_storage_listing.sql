-- SECURITY DEFINER routines must not inherit PostgreSQL's default PUBLIC
-- execute grant. Keep only the deliberately anonymous phone-availability check.

do $$
declare
  function_row record;
begin
  for function_row in
    select procedure.oid
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prosecdef
  loop
    execute format(
      'revoke execute on function %s from public, anon',
      function_row.oid::regprocedure
    );
    execute format(
      'grant execute on function %s to service_role',
      function_row.oid::regprocedure
    );
  end loop;
end;
$$;

revoke execute on function public.auto_complete_jobs() from authenticated;
revoke execute on function public.enforce_unique_profile_phone() from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.handle_new_user_profile() from authenticated;

grant execute on function public.rpc_phone_available(text) to anon, authenticated;

-- Public object URLs remain usable, but anonymous users cannot enumerate every
-- avatar or job-evidence filename through the Storage API.
drop policy if exists avatars_public_read on storage.objects;
drop policy if exists job_images_public_read on storage.objects;
