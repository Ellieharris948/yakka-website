-- Extra work is an immutable proposal on the original job, funded separately.
create table public.job_scope_changes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id),
  proposed_by uuid not null references auth.users(id),
  reason text not null check(length(trim(reason)) >= 10),
  items jsonb not null,
  extra_days integer not null default 0 check(extra_days between 0 and 365),
  labor_cents integer not null check(labor_cents > 0),
  vat_rate_bps integer not null,
  vat_cents integer not null,
  principal_cents integer not null,
  client_fee_cents integer not null,
  seller_fee_cents integer not null,
  total_cents integer not null,
  status text not null default 'proposed' check(status in ('proposed','approved','funded','declined','withdrawn')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  funded_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index one_pending_scope_change on public.job_scope_changes(job_id)
  where status in ('proposed','approved');
alter table public.payments add column scope_change_id uuid references public.job_scope_changes(id);
alter table public.dispute_items add column scope_change_id uuid references public.job_scope_changes(id), add column scope_line_index integer;
create index payments_scope_change on public.payments(scope_change_id);
alter table public.jobs add column scope_change_status text;
alter table public.job_scope_changes enable row level security;
revoke all on public.job_scope_changes from anon, authenticated;
grant select on public.job_scope_changes to authenticated;
grant all on public.job_scope_changes to service_role;
create policy scope_change_read on public.job_scope_changes for select to authenticated using (
  public.is_yakka_admin() or exists(select 1 from public.jobs j where j.id=job_id and auth.uid() in (j.client_id,j.trader_id))
);

create function public.rpc_propose_scope_change(p_job_id uuid, p_reason text, p_items jsonb, p_extra_days integer default 0)
returns public.job_scope_changes language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.jobs; r public.job_scope_changes; line jsonb; labor bigint := 0; rate integer; vat integer; principal integer;
begin
  select * into j from public.jobs where id=p_job_id for update;
  if not found or auth.uid() is distinct from j.trader_id then raise exception 'Only the job tradie can propose extra work.'; end if;
  if j.status::text not in ('funded','in_progress') then raise exception 'Extra work can only be proposed on a funded, active job.'; end if;
  if exists(select 1 from public.partial_payment_requests where job_id=j.id and status::text in ('requested','approved')) then raise exception 'Finish the pending partial release before adding work.'; end if;
  if length(trim(p_reason)) < 10 or p_extra_days not between 0 and 365 then raise exception 'Explain the change and provide valid extra days.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 50 then raise exception 'Add between 1 and 50 lines.'; end if;
  for line in select value from jsonb_array_elements(p_items) loop
    if length(trim(line->>'title')) not between 1 and 200
      or (line->>'qty') !~ '^[1-9][0-9]{0,3}$'
      or (line->>'price_cents') !~ '^[1-9][0-9]{0,6}$'
      or line->>'title' is null or line->>'qty' is null or line->>'price_cents' is null
    then raise exception 'Each line needs a title, whole quantity and positive price in pennies.'; end if;
    labor := labor + (line->>'qty')::bigint * (line->>'price_cents')::bigint;
  end loop;
  if labor > 1000000 then raise exception 'Extra work exceeds the payment limit.'; end if;
  rate := case when j.vat_registered then coalesce(j.vat_rate_bps,2000) else 0 end;
  vat := round(labor * rate / 10000.0); principal := labor + vat;
  if principal + ceil(principal * 0.02) not between 50 and 1000000 then raise exception 'The total must be between £0.50 and £10,000.'; end if;
  insert into public.job_scope_changes(job_id,proposed_by,reason,items,extra_days,labor_cents,vat_rate_bps,vat_cents,principal_cents,client_fee_cents,seller_fee_cents,total_cents)
  values(j.id,auth.uid(),trim(p_reason),p_items,p_extra_days,labor,rate,vat,principal,ceil(principal*0.02),ceil(principal*0.05),principal+ceil(principal*0.02)) returning * into r;
  update public.jobs set scope_change_status='proposed' where id=j.id;
  insert into public.messages(job_id,sender_id,body) values(j.id,auth.uid(),'Extra work proposed. Review the added lines and payment in Job details.');
  return r;
end $$;

create function public.rpc_review_scope_change(p_scope_change_id uuid, p_action text)
returns public.job_scope_changes language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.jobs; r public.job_scope_changes;
begin
  select * into r from public.job_scope_changes where id=p_scope_change_id;
  select * into j from public.jobs where id=r.job_id for update;
  select * into r from public.job_scope_changes where id=p_scope_change_id for update;
  if not found or j.status::text not in ('funded','in_progress') then raise exception 'This proposal cannot be changed now.'; end if;
  if r.status <> 'proposed' then raise exception 'This proposal has already been reviewed.'; end if;
  if p_action='withdrawn' then
    if auth.uid() is distinct from j.trader_id then raise exception 'Only the tradie can withdraw.'; end if;
  elsif p_action in ('approved','declined') then
    if auth.uid() is distinct from j.client_id then raise exception 'Only the customer can review extra work.'; end if;
  else raise exception 'Invalid review action.'; end if;
  update public.job_scope_changes set status=p_action, reviewed_by=auth.uid(),reviewed_at=now() where id=r.id returning * into r;
  update public.jobs set scope_change_status=case when p_action='approved' then 'approved' else null end where id=j.id;
  insert into public.messages(job_id,sender_id,body) values(j.id,auth.uid(),case when p_action='approved' then 'Extra work approved; awaiting additional payment. Work resumes once payment is confirmed.' else 'Extra work '||p_action||'. The existing paid scope remains unchanged.' end);
  return r;
end $$;

create function public.rpc_prepare_scope_payment(p_scope_change_id uuid, p_client_id uuid)
returns public.payments language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.jobs; r public.job_scope_changes; p public.payments;
begin
  select * into r from public.job_scope_changes where id=p_scope_change_id;
  select * into j from public.jobs where id=r.job_id for update;
  select * into r from public.job_scope_changes where id=p_scope_change_id for update;
  if r.status <> 'approved' or j.status::text not in ('funded','in_progress') or j.client_id is distinct from p_client_id then raise exception 'This extra work is not approved for payment.'; end if;
  select * into p from public.payments where scope_change_id=r.id order by created_at desc limit 1 for update;
  if found and p.status::text not in ('failed','cancelled') then return p; end if;
  insert into public.payments(job_id,client_id,tradie_id,scope_change_id,total_cents,principal_cents,client_fee_cents,seller_fee_cents,net_to_seller_cents,currency,status,payment_method,provider,provider_status)
  values(j.id,j.client_id,j.trader_id,r.id,r.total_cents,r.principal_cents,r.client_fee_cents,r.seller_fee_cents,r.principal_cents-r.seller_fee_cents,'GBP','awaiting_funding','stripe_pay_by_bank','stripe','checkout_created') returning * into p;
  return p;
end $$;

-- Funding is driven by verified Stripe webhooks/reconciliation, never by a client redirect.
create function public.fund_scope_change() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.job_scope_changes;
begin
  if new.scope_change_id is not null and new.status::text='funded' and old.status::text is distinct from 'funded' then
    perform 1 from public.jobs where id=new.job_id for update;
    update public.job_scope_changes set status='funded',funded_at=now() where id=new.scope_change_id and status='approved' returning * into r;
    if found then
      update public.jobs set scope_change_status=null, duration_days=duration_days+r.extra_days,
        end_date=case when end_date is null then null else end_date+r.extra_days end where id=new.job_id;
    end if;
  end if;
  return new;
end $$;
create trigger payment_funds_scope after update of status on public.payments for each row execute function public.fund_scope_change();

-- Enforce the pause even when an older app calls a completion RPC directly.
create function public.guard_pending_scope() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if new.status::text in ('in_progress','seller_done','client_done','completed') and new.status is distinct from old.status and old.status::text <> 'disputed'
    and exists(select 1 from public.job_scope_changes where job_id=new.id and status in ('proposed','approved')) then
    raise exception 'Extra work is awaiting customer approval or payment.';
  end if;
  return new;
end $$;
create trigger guard_pending_scope before update of status on public.jobs for each row execute function public.guard_pending_scope();

-- Paid/checkout quotes cannot be rewritten. Extra work always has its own approval.
create function public.guard_funded_job_items() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare jid uuid;
begin
  jid := case when tg_op='DELETE' then old.job_id else new.job_id end;
  perform 1 from public.jobs where id=jid for update;
  if exists(select 1 from public.payments where job_id=jid and status::text not in ('failed','cancelled')) then raise exception 'The original quote is locked. Propose extra work instead.'; end if;
  if tg_op='UPDATE' and old.job_id <> new.job_id then raise exception 'An item cannot be moved to another job.'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger lock_paid_job_items before insert or update or delete on public.job_items for each row execute function public.guard_funded_job_items();
create trigger lock_paid_job_materials before insert or update or delete on public.job_materials for each row execute function public.guard_funded_job_items();
create policy yakka_admin_read_job_materials on public.job_materials for select to authenticated using(public.is_yakka_admin());
grant select on public.job_materials to authenticated;
create policy yakka_admin_read_payment_operations on public.payment_operations for select to authenticated using(public.is_yakka_admin());
grant select on public.payment_operations to authenticated;

create function public.guard_paid_quote() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if current_user not in ('postgres','service_role','supabase_admin') and new.scope_change_status is distinct from old.scope_change_status then
    raise exception 'Scope status is managed by approvals and verified payment.';
  end if;
  if row(new.price_cents,new.materials_cents,new.upfront_materials_cents,new.vat_registered,new.vat_rate_bps,new.title,new.description,new.client_id,new.trader_id)
    is distinct from row(old.price_cents,old.materials_cents,old.upfront_materials_cents,old.vat_registered,old.vat_rate_bps,old.title,old.description,old.client_id,old.trader_id)
    and exists(select 1 from public.payments where job_id=old.id and status::text not in ('failed','cancelled')) then
    raise exception 'The funded quote is locked. Propose extra work instead.';
  end if;
  return new;
end $$;
create trigger lock_paid_quote before update on public.jobs for each row execute function public.guard_paid_quote();

create function public.close_unpaid_scope() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status::text in ('disputed','completed','cancelled') then
    update public.job_scope_changes c set status='withdrawn'
      where c.job_id=new.id and c.status in ('proposed','approved')
      and not exists(select 1 from public.payments p where p.scope_change_id=c.id and p.status::text not in ('failed','cancelled'));
    if not exists(select 1 from public.job_scope_changes where job_id=new.id and status in ('proposed','approved')) then
      update public.jobs set scope_change_status=null where id=new.id and scope_change_status is not null;
    end if;
  end if;
  return new;
end $$;
create trigger close_unpaid_scope after update of status on public.jobs for each row execute function public.close_unpaid_scope();

revoke all on function public.rpc_propose_scope_change(uuid,text,jsonb,integer), public.rpc_review_scope_change(uuid,text) from public,anon;
grant execute on function public.rpc_propose_scope_change(uuid,text,jsonb,integer), public.rpc_review_scope_change(uuid,text) to authenticated;
revoke all on function public.rpc_prepare_scope_payment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.rpc_prepare_scope_payment(uuid,uuid) to service_role;
