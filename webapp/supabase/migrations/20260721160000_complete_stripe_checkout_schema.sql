-- Complete the additive Stripe Checkout schema expected by the deployed edge
-- functions. Existing rows remain valid and no payment state is rewritten.

alter table if exists public.jobs
  add column if not exists upfront_materials_cents integer not null default 0,
  add column if not exists allows_partial_payments boolean not null default false,
  add column if not exists payment_protection_fee_bps integer not null default 250;

alter table if exists public.bank_accounts
  add column if not exists stripe_connected_account_id text;

alter table if exists public.payments
  add column if not exists provider text,
  add column if not exists provider_status text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists stripe_charge_id text,
  add column if not exists stripe_transfer_id text,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table if exists public.webhook_events
  add column if not exists processed_at timestamptz;

create unique index if not exists payments_stripe_checkout_session_key
  on public.payments(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists payments_stripe_payment_intent_idx
  on public.payments(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create unique index if not exists webhook_events_provider_event_key
  on public.webhook_events(provider, event_id);

create index if not exists webhook_events_unprocessed_idx
  on public.webhook_events(provider, received_at)
  where processed_at is null;
