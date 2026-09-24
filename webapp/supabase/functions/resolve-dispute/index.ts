import { buildSettlementPlan } from '../_shared/settlement_plan.ts';
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  buildDisputeResolutionBreakdown,
  buildStripeReference,
  buildStripeTransferGroup,
} from '../_shared/job_payments.ts';
import {
  raisePaymentAlert,
  recordDisputeResolution,
  recordPaymentOperation,
} from '../_shared/payment_ledger.ts';
import { getStripeClient } from '../_shared/stripe.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE') ?? '';
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const admin = createClient(supabaseUrl, serviceRoleKey);
const stripe = stripeSecretKey ? getStripeClient(stripeSecretKey) : null;

function integerCents(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : -1;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!stripe) return jsonResponse({ error: 'STRIPE_SECRET_KEY is missing in Supabase secrets.' }, 500);

  let activeOperation: any = null;
  let settlementContext: { jobId: string; paymentId: string; disputeId: string } | null = null;
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return jsonResponse({ error: 'Please sign in again.' }, 401);
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (profile?.role !== 'admin') return jsonResponse({ error: 'YAKKA admin access is required.' }, 403);

    const body = await req.json().catch(() => ({}));
    const jobId = String(body?.jobId || '').trim();
    const customerGrossCents = integerCents(body?.customerGrossCents);
    const tradieGrossCents = integerCents(body?.tradieGrossCents);
    const reason = String(body?.reason || '').trim();
    if (!jobId) return jsonResponse({ error: 'jobId is required.' }, 400);
    if (customerGrossCents < 0 || tradieGrossCents < 0) {
      return jsonResponse({ error: 'Settlement amounts must be whole, non-negative penny values.' }, 400);
    }
    if (reason.length < 20) return jsonResponse({ error: 'Record at least 20 characters explaining the decision.' }, 400);

    const [{ data: job, error: jobError }, { data: disputeRows, error: disputeError }, { data: paymentRows, error: paymentError }] = await Promise.all([
      admin.from('jobs').select('*').eq('id', jobId).maybeSingle(),
      admin.from('disputes').select('*').eq('job_id', jobId).order('submitted_at', { ascending: false }).limit(1),
      admin.from('payments').select('*').eq('job_id', jobId).order('created_at', { ascending: true }),
    ]);
    if (jobError || !job) return jsonResponse({ error: jobError?.message || 'Job not found.' }, 404);
    if (disputeError) throw disputeError;
    if (paymentError) throw paymentError;
    const dispute = disputeRows?.[0];
    const payments = (paymentRows || []).filter((p: any) => !['failed', 'cancelled'].includes(p.status));
    const payment = payments[0];
    if (!dispute) return jsonResponse({ error: 'No dispute was found for this job.' }, 404);
    if (!payment) return jsonResponse({ error: 'No payment was found for this job.' }, 404);
    if (body.disputeId && body.disputeId !== dispute.id) {
      return jsonResponse({ error: 'The dispute has changed. Refresh the review before deciding.' }, 409);
    }
    if (dispute.status === 'resolved') {
      return jsonResponse({
        ok: true,
        alreadyResolved: true,
        transferId: dispute.stripe_transfer_id,
        refundId: dispute.stripe_refund_id,
        refundStatus: dispute.stripe_refund_status,
      });
    }
    const { data: existingDecision, error: decisionReadError } = await admin
      .from('dispute_settlement_decisions').select('*').eq('dispute_id', dispute.id).maybeSingle();
    if (decisionReadError) throw decisionReadError;
    if (dispute.status !== 'open' || (job.status !== 'disputed' && !(existingDecision && job.status === 'completed'))) {
      return jsonResponse({ error: 'This dispute is not open for settlement.' }, 409);
    }
    if (payments.some((p: any) => !['disputed', 'funded'].includes(String(p.status))) && !existingDecision) {
      return jsonResponse({ error: 'This payment is not held for dispute settlement.' }, 409);
    }
    if (payments.some((p: any) => !p.stripe_payment_intent_id || !p.stripe_charge_id)) {
      return jsonResponse({ error: 'Stripe payment references are incomplete. Reconcile this payment first.' }, 409);
    }

    const { data: releasedRows, error: releasedError } = await admin
      .from('partial_payment_requests')
      .select('amount_cents,released_amount_cents')
      .eq('job_id', jobId)
      .eq('status', 'released');
    if (releasedError) throw releasedError;
    const previouslyReleasedGrossCents = (releasedRows || []).reduce(
      (sum: number, row: any) => sum + Math.max(0, Number(row.amount_cents || 0)),
      0,
    );
    const breakdown = buildSettlementPlan(payments, previouslyReleasedGrossCents, customerGrossCents, tradieGrossCents);
    if (!breakdown.isFullyAllocated) {
      return jsonResponse({
        error: breakdown.unallocatedCents > 0
          ? `Allocate the remaining ${breakdown.unallocatedCents} pence before settling.`
          : 'The settlement exceeds the remaining held job value.',
        remainingPrincipalCents: breakdown.remainingPrincipalCents,
      }, 400);
    }

    const reference = buildStripeReference(job.ref_code ?? job.id, 'dispute');
    const transferGroup = buildStripeTransferGroup(job.ref_code ?? job.id, 'dispute');
    let transferId: string | null = dispute.stripe_transfer_id || null;
    let refundId: string | null = dispute.stripe_refund_id || null;
    let refundStatus: string | null = dispute.stripe_refund_status || null;

    // Resolve the destination before committing a new decision. A missing payout
    // account must not prevent an admin choosing a customer-only refund instead.
    let accountRow: any = null;
    if (breakdown.tradieTransferCents > 0 && payments.some((p: any) => !p.stripe_transfer_id)) {
      const result = await admin.from('stripe_connect_accounts')
        .select('stripe_account_id,payouts_enabled').eq('user_id', job.trader_id).maybeSingle();
      if (result.error) throw result.error;
      accountRow = result.data;
      if (!accountRow?.stripe_account_id || !accountRow.payouts_enabled) {
        return jsonResponse({ error: 'The tradie’s Stripe payout account is not ready.' }, 409);
      }
    }

    const { error: claimError } = await admin.from('dispute_settlement_decisions').upsert({
      dispute_id: dispute.id, job_id: jobId, payment_id: payment.id,
      admin_user_id: authData.user.id, reason,
      customer_gross_cents: customerGrossCents, tradie_gross_cents: tradieGrossCents,
      breakdown, before_state: { jobStatus: job.status, paymentStatus: payment.status, disputeStatus: dispute.status },
    }, { onConflict: 'dispute_id', ignoreDuplicates: true });
    if (claimError) throw claimError;
    const { data: decision, error: claimReadError } = await admin.from('dispute_settlement_decisions')
      .select('*').eq('dispute_id', dispute.id).single();
    if (claimReadError) throw claimReadError;
    if (decision.payment_id !== payment.id || decision.customer_gross_cents !== customerGrossCents
      || decision.tradie_gross_cents !== tradieGrossCents || decision.reason !== reason
      || decision.breakdown.remainingPrincipalCents !== breakdown.remainingPrincipalCents
      || (decision.breakdown.allocations && (decision.breakdown.allocations.length !== breakdown.allocations.length
        || decision.breakdown.allocations.some((a: any, i: number) => Object.keys(a).some(key => a[key] !== (breakdown.allocations[i] as any)?.[key]))))) {
      return jsonResponse({ error: 'A settlement decision is already recorded. Reopen the dispute and retry the recorded amounts and reason.' }, 409);
    }
    settlementContext = { jobId, paymentId: payment.id, disputeId: dispute.id };
    const movements: any[] = [];
    for (const allocation of breakdown.allocations) {
      const payment = payments.find((p: any) => p.id === allocation.paymentId)!;
      const breakdown = allocation;
      let transferId = payment.stripe_transfer_id || (payments.length === 1 ? dispute.stripe_transfer_id : null);
      let refundId = payment.stripe_refund_id || (payments.length === 1 ? dispute.stripe_refund_id : null);
      let refundStatus = payment.stripe_refund_status || (payments.length === 1 ? dispute.stripe_refund_status : null);
    // Stripe can prune old idempotency keys. An ambiguous old attempt requires
    // reconciliation rather than risking a second transfer or refund.
    if (Date.now() - new Date(decision.created_at).getTime() > 23 * 60 * 60 * 1000
      && ((breakdown.tradieTransferCents > 0 && !transferId) || (breakdown.customerRefundCents > 0 && !refundId))) {
      throw new Error('This settlement attempt needs reconciliation before retrying: a provider reference is missing from an older decision.');
    }

    if (breakdown.tradieTransferCents > 0 && !transferId) {
      const idempotencyKey = payments.length === 1 ? `dispute-${dispute.id}-transfer-v1` : `dispute-${dispute.id}-${payment.id}-transfer-v1`;
      activeOperation = {
        operationKey: idempotencyKey,
        paymentId: payment.id,
        jobId,
        operationType: 'transfer' as const,
        idempotencyKey,
        requestedBy: authData.user.id,
      };
      if (payments.length === 1) {
        const { error } = await admin.from('disputes').update({ stripe_transfer_id: transferId, stripe_refund_id: refundId, stripe_refund_status: refundStatus }).eq('id', dispute.id);
        if (error) throw error;
      }
      await recordPaymentOperation(admin, { ...activeOperation, status: 'pending' });
      const transfer = await stripe.transfers.create({
        amount: breakdown.tradieTransferCents,
        currency: String(payment.currency || 'GBP').toLowerCase(),
        destination: accountRow.stripe_account_id,
        source_transaction: payment.stripe_charge_id,
        transfer_group: transferGroup,
        description: `${reference} dispute settlement`,
        metadata: {
          job_id: jobId,
          dispute_id: dispute.id,
          release_type: 'dispute',
          customer_gross_cents: String(breakdown.customerGrossCents),
          tradie_gross_cents: String(breakdown.tradieGrossCents),
        },
      }, { idempotencyKey });
      transferId = transfer.id;
      const { error: transferSaveError } = await admin.from('payments')
        .update({ stripe_transfer_id: transferId }).eq('id', payment.id);
      if (transferSaveError) throw transferSaveError;
      if (payments.length === 1) {
        const { error } = await admin.from('disputes').update({ stripe_transfer_id: transferId, stripe_refund_id: refundId, stripe_refund_status: refundStatus }).eq('id', dispute.id);
        if (error) throw error;
      }
      await recordPaymentOperation(admin, { ...activeOperation, status: 'succeeded', stripeObjectId: transfer.id });
      activeOperation = null;
    }

    if (breakdown.customerRefundCents > 0 && !refundId) {
      const idempotencyKey = payments.length === 1 ? `dispute-${dispute.id}-refund-v1` : `dispute-${dispute.id}-${payment.id}-refund-v1`;
      activeOperation = {
        operationKey: idempotencyKey,
        paymentId: payment.id,
        jobId,
        operationType: 'refund' as const,
        idempotencyKey,
        requestedBy: authData.user.id,
      };
      if (payments.length === 1) {
        const { error } = await admin.from('disputes').update({ stripe_transfer_id: transferId, stripe_refund_id: refundId, stripe_refund_status: refundStatus }).eq('id', dispute.id);
        if (error) throw error;
      }
      await recordPaymentOperation(admin, { ...activeOperation, status: 'pending' });
      const refund = await stripe.refunds.create({
        payment_intent: payment.stripe_payment_intent_id,
        amount: breakdown.customerRefundCents,
        reason: 'requested_by_customer',
        metadata: {
          job_id: jobId,
          dispute_id: dispute.id,
          customer_gross_cents: String(breakdown.customerGrossCents),
          client_fee_refund_cents: String(breakdown.clientFeeRefundCents),
        },
      }, { idempotencyKey });
      refundId = refund.id;
      refundStatus = refund.status || 'pending';
      const { error: refundSaveError } = await admin.from('payments')
        .update({ stripe_refund_id: refundId, stripe_refund_status: refundStatus }).eq('id', payment.id);
      if (refundSaveError) throw refundSaveError;
      if (payments.length === 1) {
        const { error } = await admin.from('disputes').update({ stripe_transfer_id: transferId, stripe_refund_id: refundId, stripe_refund_status: refundStatus }).eq('id', dispute.id);
        if (error) throw error;
      }
      await recordPaymentOperation(admin, { ...activeOperation, status: 'succeeded', stripeObjectId: refund.id });
      activeOperation = null;
    }

    if (refundId && refundStatus !== 'succeeded') {
      const latestRefund = await stripe.refunds.retrieve(refundId);
      refundStatus = latestRefund.status || refundStatus;
    }

    const now = new Date().toISOString();
    const refundSucceeded = breakdown.customerRefundCents === 0 || refundStatus === 'succeeded';
    const paymentStatus = !refundSucceeded
      ? 'refund_pending'
      : breakdown.customerGrossCents > 0
        ? breakdown.tradieGrossCents > 0 || previouslyReleasedGrossCents > 0
          ? 'partially_refunded'
          : 'refunded'
        : 'released';
    const { error: paymentUpdateError } = await admin.from('payments').update({
      status: paymentStatus,
      provider_status: refundSucceeded ? 'dispute_resolved' : 'dispute_refund_pending',
      stripe_transfer_id: transferId || payment.stripe_transfer_id || null,
      stripe_refund_id: refundId,
      stripe_refund_status: refundStatus,
      customer_refund_requested_cents: breakdown.customerRefundCents,
      customer_refunded_cents: refundSucceeded ? breakdown.customerRefundCents : 0,
      released_at: breakdown.tradieGrossCents > 0 ? now : payment.released_at,
      refunded_at: breakdown.customerGrossCents > 0 && refundSucceeded ? now : null,
      updated_at: now,
    }).eq('id', payment.id);
    if (paymentUpdateError) throw paymentUpdateError;

    await recordDisputeResolution(admin, { ...payment, tradie_id: payment.tradie_id || job.trader_id }, dispute.id, {
      ...breakdown,
      stripeTransferId: transferId,
      stripeRefundId: refundId,
      refundStatus,
    });
    movements.push({ paymentId: payment.id, transferId, refundId, refundStatus });
    }
    transferId = movements[0]?.transferId || null;
    refundId = movements[0]?.refundId || null;
    refundStatus = movements.some(m => m.refundId && m.refundStatus !== 'succeeded') ? 'pending'
      : movements.some(m => m.refundId) ? 'succeeded' : null;
    const now = new Date().toISOString();
    const operationKey = `resolve-dispute:${dispute.id}`;
    const beforeState = decision.before_state;
    const afterState = { ...breakdown, movements, transferId, refundId, refundStatus, jobStatus: 'completed' };
    const { error: auditError } = await admin.from('payment_admin_audit').upsert({
      operation_key: operationKey,
      admin_user_id: decision.admin_user_id,
      job_id: jobId,
      payment_id: payment.id,
      dispute_id: dispute.id,
      action: 'resolve_dispute_split',
      reason,
      before_state: beforeState,
      after_state: afterState,
    }, { onConflict: 'operation_key', ignoreDuplicates: true });
    if (auditError) throw auditError;

    const outcome = breakdown.customerGrossCents > 0 && breakdown.tradieGrossCents > 0
      ? 'split'
      : breakdown.customerGrossCents > 0 ? 'refunded' : 'released';
    const { error: itemUpdateError } = await admin.from('dispute_items').update({ outcome }).eq('dispute_id', dispute.id);
    if (itemUpdateError) throw itemUpdateError;
    const { error: jobUpdateError } = await admin.from('jobs').update({ status: 'completed' }).eq('id', jobId);
    if (jobUpdateError) throw jobUpdateError;
    // Mark resolved last so failed database/ledger writes can be resumed.
    const { error: disputeUpdateError } = await admin.from('disputes').update({
      status: 'resolved',
      outcome,
      resolved_by: decision.admin_user_id,
      resolution_reason: reason,
      customer_gross_cents: breakdown.customerGrossCents,
      customer_refund_cents: breakdown.customerRefundCents,
      tradie_gross_cents: breakdown.tradieGrossCents,
      tradie_transfer_cents: breakdown.tradieTransferCents,
      commission_cents: breakdown.tradieFeeCents,
      stripe_transfer_id: transferId,
      stripe_refund_id: refundId,
      stripe_refund_status: refundStatus,
      resolved_at: now,
    }).eq('id', dispute.id).eq('status', 'open');
    if (disputeUpdateError) throw disputeUpdateError;

    return jsonResponse({ ok: true, transferId, refundId, refundStatus, breakdown });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not resolve this dispute.';
    if (activeOperation) {
      try {
        await recordPaymentOperation(admin, { ...activeOperation, status: 'failed', error: message });
        await raisePaymentAlert(admin, {
          alertKey: `payment-operation:${activeOperation.operationKey}`,
          paymentId: activeOperation.paymentId,
          jobId: activeOperation.jobId,
          severity: 'critical',
          category: `${activeOperation.operationType}_failed`,
          message: 'A dispute settlement money movement failed and needs review.',
          details: { operationKey: activeOperation.operationKey, error: message },
        });
      } catch {}
    }
    if (settlementContext) {
      try {
        await raisePaymentAlert(admin, {
          alertKey: `dispute-settlement:${settlementContext.disputeId}`,
          paymentId: settlementContext.paymentId, jobId: settlementContext.jobId,
          severity: 'critical', category: 'dispute_settlement_incomplete',
          message: 'A confirmed settlement needs review. Some money movements may already have succeeded.',
          details: { error: message, disputeId: settlementContext.disputeId },
        });
      } catch {}
    }
    return jsonResponse({ error: message }, 500);
  }
});
