-- Pin legacy function resolution to trusted schemas. This removes mutable
-- search-path behaviour without changing the functions' business logic.

do $$
declare
  function_row record;
begin
  for function_row in
    select procedure.oid
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and not exists (
        select 1
        from unnest(coalesce(procedure.proconfig, array[]::text[])) setting
        where setting like 'search_path=%'
      )
  loop
    execute format(
      'alter function %s set search_path = public, extensions, pg_temp',
      function_row.oid::regprocedure
    );
  end loop;
end;
$$;
