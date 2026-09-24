-- Legacy helper retained for manual environments. Prefer running all migrations.
-- YAKKA stores only Stripe's connected-account reference, not raw bank details.

create table if not exists public.stripe_connect_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_account_id text not null unique,
  details_submitted boolean not null default false,
  payouts_enabled boolean not null default false,
  charges_enabled boolean not null default false,
  disabled_reason text null,
  requirements jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
