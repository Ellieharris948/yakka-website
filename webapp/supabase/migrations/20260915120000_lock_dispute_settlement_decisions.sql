-- Preserve the first confirmed settlement before any provider money movement.
-- A unique dispute ID arbitrates simultaneous admins and makes retries immutable.
create table if not exists public.dispute_settlement_decisions (
  dispute_id uuid primary key references public.disputes(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  payment_id uuid not null references public.payments(id),
  admin_user_id uuid not null references auth.users(id),
  reason text not null check (length(trim(reason)) >= 20),
  customer_gross_cents integer not null check (customer_gross_cents >= 0),
  tradie_gross_cents integer not null check (tradie_gross_cents >= 0),
  breakdown jsonb not null,
  before_state jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.dispute_settlement_decisions enable row level security;
revoke all on public.dispute_settlement_decisions from anon, authenticated;
grant select on public.dispute_settlement_decisions to authenticated;
grant select, insert on public.dispute_settlement_decisions to service_role;
create policy yakka_admin_read_settlement_decisions on public.dispute_settlement_decisions
  for select to authenticated using (public.is_yakka_admin());
