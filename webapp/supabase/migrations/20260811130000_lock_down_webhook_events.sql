-- Stripe webhook payloads are internal server data. The stripe-webhook Edge
-- Function uses the service role, so no anonymous or authenticated client
-- should have direct access to this table through PostgREST.

alter table public.webhook_events enable row level security;

revoke all privileges on table public.webhook_events from anon, authenticated;
