-- Each additive change is deliberately a separate, rerunnable statement.
-- This also makes the migration safe if an earlier SQL-editor run stopped midway.
alter table public.profiles
  add column if not exists vat_registered boolean NOT NULL default false;

alter table public.profiles
  add column if not exists vat_registration_number text;

alter table public.jobs
  add column if not exists materials_cents integer NOT NULL default 0;

alter table public.jobs
  add column if not exists vat_registered boolean NOT NULL default false;

alter table public.jobs
  add column if not exists vat_registration_number text;

alter table public.jobs
  add column if not exists vat_rate_bps integer NOT NULL default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'jobs_materials_cents_nonnegative'
      and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs
      add constraint jobs_materials_cents_nonnegative check (materials_cents >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'jobs_vat_rate_bps_range'
      and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs
      add constraint jobs_vat_rate_bps_range check (vat_rate_bps between 0 and 10000);
  end if;
end
$$;

create table if not exists public.job_materials (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  title text not null,
  description text,
  price_cents integer not null check (price_cents >= 0),
  upfront_requested boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists job_materials_job_id_idx on public.job_materials(job_id);

alter table public.job_materials enable row level security;

drop policy if exists "Job participants can view materials" on public.job_materials;
create policy "Job participants can view materials"
on public.job_materials for select to authenticated
using (
  exists (
    select 1 from public.jobs j
    where j.id = job_id
      and (j.trader_id = auth.uid() or j.client_id = auth.uid())
  )
);

drop policy if exists "Tradies can create materials" on public.job_materials;
create policy "Tradies can create materials"
on public.job_materials for insert to authenticated
with check (
  exists (
    select 1 from public.jobs j
    where j.id = job_id and j.trader_id = auth.uid()
  )
);

drop policy if exists "Tradies can update materials" on public.job_materials;
create policy "Tradies can update materials"
on public.job_materials for update to authenticated
using (
  exists (
    select 1 from public.jobs j
    where j.id = job_id and j.trader_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.jobs j
    where j.id = job_id and j.trader_id = auth.uid()
  )
);

drop policy if exists "Tradies can delete materials" on public.job_materials;
create policy "Tradies can delete materials"
on public.job_materials for delete to authenticated
using (
  exists (
    select 1 from public.jobs j
    where j.id = job_id and j.trader_id = auth.uid()
  )
);
