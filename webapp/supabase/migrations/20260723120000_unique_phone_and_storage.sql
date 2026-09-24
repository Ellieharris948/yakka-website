-- Canonical phone enforcement and complete image-storage policies. Existing
-- duplicate phone rows are preserved for manual review; all new inserts and
-- phone changes are protected immediately.

create or replace function public.normalize_uk_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
begin
  if digits like '0044%' then digits := substring(digits from 5); end if;
  if digits like '44%' then digits := substring(digits from 3); end if;
  if digits like '0%' then digits := substring(digits from 2); end if;
  if digits = '' then return null; end if;
  return '+44' || digits;
end;
$$;

create or replace function public.enforce_unique_profile_phone()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  canonical text;
begin
  canonical := public.normalize_uk_phone(new.phone);
  if canonical is null or canonical !~ '^\+447[0-9]{9}$' then
    raise exception using
      errcode = '22023',
      message = 'Enter a valid UK mobile number.';
  end if;

  if exists (
    select 1 from public.profiles p
    where p.id <> new.id
      and public.normalize_uk_phone(p.phone) = canonical
  ) then
    raise exception using
      errcode = '23505',
      message = 'This mobile number is already linked to another account.';
  end if;

  new.phone := canonical;
  return new;
end;
$$;

drop trigger if exists enforce_unique_profile_phone on public.profiles;
create trigger enforce_unique_profile_phone
before insert or update of phone on public.profiles
for each row
when (new.phone is not null)
execute function public.enforce_unique_profile_phone();

create or replace function public.rpc_phone_available(p_phone text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.normalize_uk_phone(p_phone) ~ '^\+447[0-9]{9}$'
    and not exists (
      select 1 from public.profiles
      where public.normalize_uk_phone(phone) = public.normalize_uk_phone(p_phone)
        and (auth.uid() is null or id <> auth.uid())
    );
$$;

revoke all on function public.rpc_phone_available(text) from public;
grant execute on function public.rpc_phone_available(text) to anon, authenticated;

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('job-images', 'job-images', true),
  ('profile-documents', 'profile-documents', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "job_images_insert_participant" on storage.objects;
create policy "job_images_insert_participant" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'job-images'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (
    select 1 from public.jobs
    where id::text = (storage.foldername(name))[1]
      and auth.uid() in (client_id, trader_id)
  )
);

drop policy if exists "job_images_update_own" on storage.objects;
create policy "job_images_update_own" on storage.objects
for update to authenticated
using (bucket_id = 'job-images' and (storage.foldername(name))[2] = auth.uid()::text)
with check (bucket_id = 'job-images' and (storage.foldername(name))[2] = auth.uid()::text);

drop policy if exists "job_images_delete_own" on storage.objects;
create policy "job_images_delete_own" on storage.objects
for delete to authenticated
using (bucket_id = 'job-images' and (storage.foldername(name))[2] = auth.uid()::text);

drop policy if exists "profile_documents_insert_own" on storage.objects;
create policy "profile_documents_insert_own" on storage.objects
for insert to authenticated
with check (bucket_id = 'profile-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "profile_documents_select_own" on storage.objects;
create policy "profile_documents_select_own" on storage.objects
for select to authenticated
using (bucket_id = 'profile-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "profile_documents_delete_own" on storage.objects;
create policy "profile_documents_delete_own" on storage.objects
for delete to authenticated
using (bucket_id = 'profile-documents' and (storage.foldername(name))[1] = auth.uid()::text);
