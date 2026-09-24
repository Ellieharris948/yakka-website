-- Record the moment each party accepts Yakka's dispute-decision terms.
-- The UI requires this confirmation before a creator can save a job and
-- before the other party can fund it.

alter table public.jobs
  add column if not exists trader_dispute_terms_accepted_at timestamptz,
  add column if not exists client_dispute_terms_accepted_at timestamptz;

comment on column public.jobs.trader_dispute_terms_accepted_at is
  'When the tradie accepted Yakka final-decision terms for this job.';
comment on column public.jobs.client_dispute_terms_accepted_at is
  'When the client accepted Yakka final-decision terms for this job.';

notify pgrst, 'reload schema';
