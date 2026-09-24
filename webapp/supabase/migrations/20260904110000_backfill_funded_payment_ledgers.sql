-- Preserve the original holding clock for payments funded before the first-party
-- ledger was introduced. New payments are written by stripe-webhook.

update public.payments payment
set tradie_id = coalesce(payment.tradie_id, job.trader_id),
    received_at = coalesce(payment.received_at, payment.held_since, payment.created_at),
    held_since = coalesce(payment.held_since, payment.received_at, payment.created_at),
    updated_at = now()
from public.jobs job
where job.id = payment.job_id
  and payment.status::text = 'funded'
  and (payment.tradie_id is null or payment.received_at is null or payment.held_since is null);

insert into public.payment_ledgers (
  payment_id,
  job_id,
  tradie_id,
  status,
  gross_received_cents,
  customer_fee_cents,
  held_cents,
  transferred_cents,
  refunded_cents,
  commission_cents,
  received_at,
  updated_at
)
select
  payment.id,
  payment.job_id,
  payment.tradie_id,
  'held',
  greatest(0, coalesce(payment.principal_cents, 0)),
  greatest(0, coalesce(payment.client_fee_cents, 0)),
  greatest(0, coalesce(payment.principal_cents, 0) - coalesce(released.gross_cents, 0)),
  greatest(0, coalesce(released.transfer_cents, 0)),
  greatest(0, coalesce(payment.customer_refunded_cents, 0)),
  greatest(0, coalesce(released.gross_cents, 0) - coalesce(released.transfer_cents, 0)),
  coalesce(payment.received_at, payment.held_since, payment.created_at),
  now()
from public.payments payment
left join lateral (
  select
    sum(greatest(0, coalesce(request.amount_cents, 0)))::integer as gross_cents,
    sum(greatest(0, coalesce(request.released_amount_cents, 0)))::integer as transfer_cents
  from public.partial_payment_requests request
  where request.job_id = payment.job_id
    and request.status::text = 'released'
) released on true
where payment.status::text = 'funded'
  and payment.tradie_id is not null
on conflict (payment_id) do nothing;

insert into public.payment_ledger_portions (
  ledger_id,
  portion_key,
  status,
  gross_cents,
  transfer_cents,
  refund_cents,
  commission_cents,
  held_since,
  updated_at
)
select
  ledger.id,
  'job-balance',
  'held',
  ledger.held_cents,
  0,
  0,
  0,
  ledger.received_at,
  now()
from public.payment_ledgers ledger
join public.payments payment on payment.id = ledger.payment_id
where payment.status::text = 'funded'
on conflict (ledger_id, portion_key) do nothing;
