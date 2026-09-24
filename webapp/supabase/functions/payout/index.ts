import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildPartialReleaseBreakdown,
  buildStripeReference,
  buildStripeTransferGroup,
} from '../_shared/job_payments.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getStripeClient } from '../_shared/stripe.ts';
import {
  raisePaymentAlert,
  recordFinalRelease,
  recordPartialRelease,
  recordPaymentOperation,
} from '../_shared/payment_ledger.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE'))!,
);

const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE') ?? '';
const stripe = STRIPE_SECRET_KEY ? getStripeClient(STRIPE_SECRET_KEY) : null;

function resolveTraderReferenceName(profile: any, fallbackEmail?: string | null) {
  const username = String(profile?.username || '').trim();
  if (username) return username;

  const fullName = String(profile?.name || '').trim();
  if (fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : parts[0];
  }

  const emailUser = String(profile?.email || fallbackEmail || '')
    .trim()
    .split('@')[0];
  return emailUser || 'tradie';
}

async function markClientConfirmed(jobId: string, jobStatus: string) {
  if (jobStatus === 'seller_done') {
    const { error } = await supabase.from('jobs').update({ status: 'client_done' }).eq('id', jobId);
    if (error) throw error;
    return 'client_done';
  }
  return jobStatus;
}

async function markPayoutPending(paymentId: string | undefined, reason: string) {
  if (!paymentId) return;

  const { error } = await supabase
    .from('payments')
    .update({
      provider: 'stripe',
      provider_status: `payout_pending: ${reason}`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', paymentId);
  if (error) throw error;
}

function pendingPayoutResponse(message: string, status = 200) {
  return jsonResponse({ ok: true, payoutPending: true, message }, status);
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!STRIPE_SECRET_KEY) return jsonResponse({ error: 'STRIPE_SECRET_KEY is missing in Supabase secrets.' }, 500);

  let operationContext: {
    operationKey: string;
    paymentId: string;
    jobId: string;
    operationType: 'transfer';
    idempotencyKey: string;
    requestedBy: string | null;
  } | null = null;

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const isServiceCall = !!SERVICE_ROLE_KEY && token === SERVICE_ROLE_KEY;
    let callerId: string | null = null;
    if (!isServiceCall) {
      const { data: authData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authData.user) return jsonResponse({ error: 'Please sign in again.' }, 401);
      callerId = authData.user.id;
    }

    const { jobId, partialRequestId } = await req.json();
    if (!jobId) return jsonResponse({ error: 'jobId is required' }, 400);

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    if (jobError || !job) return jsonResponse({ error: jobError?.message ?? 'Job not found' }, 404);
    if (!isServiceCall && job.client_id !== callerId) {
      return jsonResponse({ error: 'Only this job’s customer can release payment.' }, 403);
    }

    const finalRelease = !partialRequestId;
    if (finalRelease && !isServiceCall && !['seller_done', 'client_done', 'completed'].includes(String(job.status))) {
      return jsonResponse({ error: 'The tradie must mark the job complete before final release.' }, 400);
    }

    if (job.scope_change_status) return jsonResponse({ error: 'Extra work is awaiting approval or payment.' }, 409);
    if (!['funded', 'in_progress', 'seller_done', 'client_done', 'completed'].includes(String(job.status))) {
      return jsonResponse({ error: 'Payment cannot be released in this job status.' }, 409);
    }
    if (finalRelease && !['seller_done', 'client_done', 'completed'].includes(String(job.status))) {
      return jsonResponse({ error: 'Completion must be confirmed before final release.' }, 409);
    }
    const confirmedJobStatus = finalRelease
      ? await markClientConfirmed(jobId, String(job.status))
      : String(job.status);

    const { data: paymentRows, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('job_id', jobId)
      .in('status', ['funded', 'released', 'disputed', 'awaiting_funding', 'refund_pending'])
      .order('created_at', { ascending: true });
    if (paymentError) return jsonResponse({ error: paymentError.message }, 500);
    if (!paymentRows?.length) {
      const message = 'Completion confirmed. Payment was not found, so YAKKA support needs to review the release.';
      return finalRelease ? pendingPayoutResponse(message) : jsonResponse({ error: message }, 404);
    }

    const payments = partialRequestId ? paymentRows.filter((row: any) => !row.scope_change_id).slice(0, 1) : paymentRows;
    if (!payments.length) return jsonResponse({ error: 'The original funded payment was not found.' }, 409);
    // Validate the whole job before making the first transfer.
    const blockedPayment = payments.find((pay: any) =>
      !['funded', 'released'].includes(String(pay.status)) || !String(pay.stripe_charge_id || '').trim());
    if (blockedPayment) {
      const reason = !['funded', 'released'].includes(String(blockedPayment.status))
        ? `payment status ${blockedPayment.status}` : 'stripe source charge missing';
      await markPayoutPending(blockedPayment.id, reason);
      const message = 'Payment release is pending. All job payments must be funded and reconciled before funds can be released.';
      return finalRelease ? pendingPayoutResponse(message) : jsonResponse({ error: message }, 409);
    }
    const results: any[] = [];
    for (const pay of payments) {
    if (!['funded', 'released'].includes(String(pay.status))) {
      const message = 'Completion confirmed. Payment is not funded yet, so payout will stay pending until payment is ready.';
      if (finalRelease) {
        await markPayoutPending(pay.id, `payment status ${pay.status}`);
        return pendingPayoutResponse(message);
      }
      return jsonResponse({ error: 'This job is not ready for payout.' }, 400);
    }

    const sourceChargeId = String(pay.stripe_charge_id || '').trim();
    if (!sourceChargeId) {
      const message = 'Payment is funded, but its Stripe charge reference is not available yet. YAKKA will retry after reconciliation.';
      await markPayoutPending(pay.id, 'stripe source charge missing');
      await raisePaymentAlert(supabase, {
        alertKey: `missing-source-charge:${pay.id}`,
        paymentId: pay.id,
        jobId,
        severity: 'critical',
        category: 'missing_source_charge',
        message: 'A funded payment cannot be released until its Stripe charge reference is reconciled.',
        details: { paymentIntentId: pay.stripe_payment_intent_id || null },
      });
      return finalRelease
        ? pendingPayoutResponse(message)
        : jsonResponse({ error: message }, 409);
    }

    const { data: connectedAccountRow, error: connectedAccountError } = await supabase
      .from('stripe_connect_accounts')
      .select('stripe_account_id')
      .eq('user_id', job.trader_id)
      .maybeSingle();
    if (connectedAccountError) return jsonResponse({ error: connectedAccountError.message }, 500);

    const connectedAccountId = String(connectedAccountRow?.stripe_account_id || '').trim();
    if (!connectedAccountId) {
      const message = 'Completion confirmed. The tradie must complete Stripe payout setup before funds can be released.';
      if (finalRelease) {
        await markPayoutPending(pay.id, 'stripe payout setup missing');
        return pendingPayoutResponse(message);
      }
      return jsonResponse({ error: 'The tradie must complete Stripe payout setup before funds can be released.' }, 400);
    }
    const connectedAccount = await stripe!.accounts.retrieve(connectedAccountId);
    if (!connectedAccount?.payouts_enabled) {
      const message = 'Completion confirmed. The tradie must finish Stripe identity verification before funds can be released.';
      if (finalRelease) {
        await markPayoutPending(pay.id, 'stripe payouts not enabled');
        return pendingPayoutResponse(message);
      }
      return jsonResponse({
        error: 'The tradie must finish Stripe identity verification before funds can be released.',
      }, 400);
    }

    const { data: traderProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', job.trader_id)
      .maybeSingle();

    const traderReferenceName = resolveTraderReferenceName(traderProfile, traderProfile?.email ?? null);
    const currency = String(pay.currency || job.currency || 'GBP').toLowerCase();
    const stripeReference = buildStripeReference(job.ref_code ?? job.id, traderReferenceName);
    const transferGroup = buildStripeTransferGroup(job.ref_code ?? job.id, traderReferenceName);
    const description = stripeReference;

    if (partialRequestId) {
      const { data: request, error: requestError } = await supabase
        .from('partial_payment_requests')
        .select('*')
        .eq('id', partialRequestId)
        .eq('job_id', jobId)
        .maybeSingle();
      if (requestError) return jsonResponse({ error: requestError.message }, 500);
      if (!request) return jsonResponse({ error: 'Partial payment request not found.' }, 404);
      if (request.status === 'released') {
        const existingTransferAmount = Math.max(0, Number(request.released_amount_cents ?? 0));
        await recordPartialRelease(supabase, pay, request, {
          transferId: String(request.stripe_transfer_id || ''),
          transferCents: existingTransferAmount,
          feeCents: Math.max(0, Number(request.amount_cents || 0) - existingTransferAmount),
        });
        return jsonResponse({ ok: true, alreadyReleased: true });
      }
      if (request.status === 'declined' || request.status === 'cancelled') {
        return jsonResponse({ error: 'This partial payment request can no longer be released.' }, 400);
      }
      if (request.status !== 'requested') return jsonResponse({ error: 'This partial request is not awaiting approval.' }, 400);

      const eligible = Number(job.duration_days || 0) > 28 || Number(job.upfront_materials_cents || 0) > 0;
      if (!eligible) return jsonResponse({ error: 'This job is not eligible for partial payment.' }, 400);

      const amount = Math.max(0, Number(request.amount_cents ?? 0));
      if (!amount) return jsonResponse({ error: 'No partial release amount was found.' }, 400);
      const { data: committedRequests, error: committedError } = await supabase.from('partial_payment_requests')
        .select('amount_cents').eq('job_id', jobId).in('status', ['requested', 'approved', 'released']);
      if (committedError) throw committedError;
      const committed = (committedRequests || []).reduce((sum: number, row: any) => sum + Math.max(0, Number(row.amount_cents || 0)), 0);
      if (committed > Math.floor(Number(pay.principal_cents || job.price_cents || 0) * 0.5)) {
        return jsonResponse({ error: 'Partial releases cannot exceed 50% of the total job value.' }, 400);
      }
      const { transferCents: transferAmount } = buildPartialReleaseBreakdown({
        requestedCents: amount,
      });
      const operationKey = `partial-release-${request.id}`;
      operationContext = {
        operationKey,
        paymentId: pay.id,
        jobId,
        operationType: 'transfer',
        idempotencyKey: operationKey,
        requestedBy: callerId,
      };
      await recordPaymentOperation(supabase, { ...operationContext, status: 'pending' });

      const transfer = await stripe!.transfers.create({
        amount: transferAmount,
        currency,
        destination: connectedAccountId,
        source_transaction: sourceChargeId,
        transfer_group: transferGroup,
        description: `${description} partial release`,
        metadata: {
          job_id: String(job.id),
          job_ref: String(job.ref_code ?? job.id),
          stripe_reference: stripeReference,
          trader_reference_name: traderReferenceName,
          release_type: 'partial',
          partial_request_id: String(request.id),
        },
      }, { idempotencyKey: operationKey });

      const { error: requestUpdateError } = await supabase
        .from('partial_payment_requests')
        .update({
          status: 'released',
          released_amount_cents: transferAmount,
          stripe_transfer_id: transfer.id,
          released_at: new Date().toISOString(),
        })
        .eq('id', request.id);
      if (requestUpdateError) throw requestUpdateError;

      const { error: paymentUpdateError } = await supabase
        .from('payments')
        .update({
          provider: 'stripe',
          provider_status: 'partial_release_sent',
          updated_at: new Date().toISOString(),
        })
        .eq('id', pay.id);
      if (paymentUpdateError) throw paymentUpdateError;
      await recordPartialRelease(supabase, pay, request, {
        transferId: transfer.id,
        transferCents: transferAmount,
        feeCents: Math.max(0, amount - transferAmount),
      });
      await recordPaymentOperation(supabase, {
        ...operationContext,
        status: 'succeeded',
        stripeObjectId: transfer.id,
      });

      return jsonResponse({ ok: true, transferId: transfer.id, amount: transferAmount });
    }

    if (String(pay.stripe_transfer_id || '').trim()) {
      await recordFinalRelease(supabase, pay, {
        transferId: pay.stripe_transfer_id,
      });
      const { error: releasedPaymentError } = await supabase
        .from('payments')
        .update({
          status: 'released',
          provider: 'stripe',
          provider_status: 'final_release_sent',
          updated_at: new Date().toISOString(),
        })
        .eq('id', pay.id);
      if (releasedPaymentError) throw releasedPaymentError;
      results.push({ paymentId: pay.id, transferId: pay.stripe_transfer_id, alreadyReleased: true });
      continue;
    }

    if (String(pay.status) === 'released' && String(job.status) === 'completed') {
      results.push({ paymentId: pay.id, alreadyReleased: true });
      continue;
    }

    if (!isServiceCall && !['client_done', 'completed'].includes(confirmedJobStatus)) {
      return jsonResponse({ error: 'The tradie must mark the job complete before final release.' }, 400);
    }

    const { data: releasedRequests, error: releasedRequestsError } = await supabase
      .from('partial_payment_requests')
      .select('released_amount_cents')
      .eq('job_id', jobId)
      .eq('status', 'released');

    if (releasedRequestsError) throw releasedRequestsError;
    const releasedSoFar = (pay.scope_change_id ? [] : releasedRequests || []).reduce(
      (sum, request: any) => sum + Math.max(0, Number(request.released_amount_cents ?? 0)),
      0,
    );
    const finalAmount = Math.max(0, Number(pay.net_to_seller_cents ?? 0) - releasedSoFar);

    let transferId: string | null = null;
    if (finalAmount > 0) {
      const operationKey = `final-release-${pay.id}`;
      operationContext = {
        operationKey,
        paymentId: pay.id,
        jobId,
        operationType: 'transfer',
        idempotencyKey: operationKey,
        requestedBy: callerId,
      };
      await recordPaymentOperation(supabase, { ...operationContext, status: 'pending' });
      const transfer = await stripe!.transfers.create({
        amount: finalAmount,
        currency,
        destination: connectedAccountId,
        source_transaction: sourceChargeId,
        transfer_group: transferGroup,
        description: `${description} final release`,
        metadata: {
          job_id: String(job.id),
          job_ref: String(job.ref_code ?? job.id),
          stripe_reference: stripeReference,
          trader_reference_name: traderReferenceName,
          release_type: 'final',
        },
      }, { idempotencyKey: operationKey });
      transferId = String(transfer.id);
    }

    const { error: finalPaymentError } = await supabase
      .from('payments')
      .update({
        status: 'released',
        provider: 'stripe',
        provider_status: transferId ? 'final_release_sent' : 'completed_no_balance',
        stripe_transfer_id: transferId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pay.id);
    if (finalPaymentError) throw finalPaymentError;
    await recordFinalRelease(supabase, pay, { transferId, transferCents: finalAmount });
    if (operationContext) {
      await recordPaymentOperation(supabase, {
        ...operationContext,
        status: 'succeeded',
        stripeObjectId: transferId,
      });
    }

    results.push({ paymentId: pay.id, transferId, amount: finalAmount });
    }
    const { error: finalJobError } = await supabase.from('jobs').update({ status: 'completed' }).eq('id', jobId);
    if (finalJobError) throw finalJobError;
    return jsonResponse({ ok: true, payments: results });
  } catch (error) {
    if (operationContext) {
      const message = error instanceof Error ? error.message : 'Unexpected transfer error';
      try {
        await recordPaymentOperation(supabase, { ...operationContext, status: 'failed', error: message });
        await raisePaymentAlert(supabase, {
          alertKey: `payment-operation:${operationContext.operationKey}`,
          paymentId: operationContext.paymentId,
          jobId: operationContext.jobId,
          severity: 'critical',
          category: 'transfer_failed',
          message: 'A Stripe transfer or its follow-up ledger update failed and needs review.',
          details: { operationKey: operationContext.operationKey, error: message },
        });
      } catch {}
    }
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});
