-- YAKKA profile role fix
-- Run this in the Supabase SQL editor.
--
-- To fix your current account too, replace REPLACE_WITH_YOUR_EMAIL below with
-- your real signup email before running the whole file.

do $$
declare
  target_email text := 'REPLACE_WITH_YOUR_EMAIL';
begin
  if target_email <> 'REPLACE_WITH_YOUR_EMAIL' then
    update public.profiles
    set
      role = 'trader'::public.user_role,
      updated_at = now()
    where lower(email) = lower(target_email);
  end if;
end $$;

-- Make future signups respect the role selected during onboarding.
-- Important: this only allows public signup as client/trader, never admin.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role public.user_role := 'client'::public.user_role;
  raw_role text := lower(coalesce(new.raw_user_meta_data->>'role', 'client'));
begin
  if raw_role = 'trader' then
    requested_role := 'trader'::public.user_role;
  end if;

  insert into public.profiles (
    id,
    role,
    name,
    email,
    phone,
    country_code,
    created_at,
    updated_at
  )
  values (
    new.id,
    requested_role,
    coalesce(
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(new.raw_user_meta_data->>'full_name', ''),
      split_part(coalesce(new.email, 'user@yakka.app'), '@', 1)
    ),
    coalesce(new.email, new.id::text || '@yakka.app'),
    nullif(new.raw_user_meta_data->>'phone', ''),
    'GB',
    now(),
    now()
  )
  on conflict (id) do update
  set
    role = case
      when public.profiles.role = 'admin'::public.user_role then public.profiles.role
      else excluded.role
    end,
    name = coalesce(nullif(excluded.name, ''), public.profiles.name),
    email = coalesce(excluded.email, public.profiles.email),
    phone = coalesce(excluded.phone, public.profiles.phone),
    country_code = coalesce(public.profiles.country_code, 'GB'),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
