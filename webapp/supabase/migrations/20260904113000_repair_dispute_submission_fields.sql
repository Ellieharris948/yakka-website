-- Some early YAKKA environments predate numbered, timestamped dispute
-- submissions. Restore the additive fields required by the current workflow.

create sequence if not exists public.dispute_request_number_seq start with 1000;

create or replace function public.next_dispute_request_number()
returns text
language sql
volatile
set search_path = public
as $$
  select 'DSP-' || to_char(current_date, 'YYYYMMDD') || '-' ||
    lpad(nextval('public.dispute_request_number_seq')::text, 6, '0');
$$;

alter table public.disputes
  add column if not exists request_number text,
  add column if not exists submitted_at timestamptz;

update public.disputes
set submitted_at = coalesce(submitted_at, updated_at, now()),
    request_number = coalesce(request_number, public.next_dispute_request_number())
where submitted_at is null or request_number is null;

alter table public.disputes
  alter column request_number set default public.next_dispute_request_number(),
  alter column submitted_at set default now();

create unique index if not exists disputes_request_number_key
  on public.disputes(request_number)
  where request_number is not null;
