import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  shouldAttemptAutomaticRelease,
} from '../_shared/stripe_webhook.ts';
import { recordFundedPayment, raisePaymentAlert, recordRefundStatus } from '../_shared/payment_ledger.ts';
import { constructStripeEvent, getStripeClient, stripeObjectId } from '../_shared/stripe.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE'))!;
const supabase = createClient(
  supabaseUrl,
  serviceRoleKey,
);
const webhookSecrets = [
  Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
  Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET') ?? '',
]
  .map(value => value.trim())
  .filter(Boolean);
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const stripe = stripeSecretKey ? getStripeClient(stripeSecretKey) : null;

async function markFunded(
  paymentId: string | undefined,
  jobId: string | undefined,
  providerStatus: string,
  chargeId?: string | null,
  receivedAt?: string,
) {
  if (!paymentId && !jobId) return;
  const query = supabase.from('payments').select('*');
  const { data: payment, error: paymentError } = paymentId
    ? await query.eq('id', paymentId).maybeSingle()
    : await query.eq('job_id', jobId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (paymentError) throw paymentError;
  if (!payment) throw new Error('Stripe payment metadata did not match a YAKKA payment.');
  await recordFundedPayment(supabase, payment, { providerStatus, chargeId, receivedAt });

  if (jobId) {
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('status')
      .eq('id', jobId)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job || ['proposed', 'accepted'].includes(String(job.status))) {
      const { error } = await supabase.from('jobs').update({ status: 'funded' }).eq('id', jobId);
      if (error) throw error;
    }
  }
}

async function invokePayout(jobId: string) {
  const response = await fetch(new URL('/functions/v1/payout', supabaseUrl).toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ jobId }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Automatic payout failed (${response.status}): ${body.slice(0, 300)}`);
  }
}

async function maybeReleaseReadyPayment(paymentId?: string, jobId?: string) {
  let payment: any = null;
  if (paymentId) {
    const { data, error } = await supabase
      .from('payments')
      .select('id, job_id, status, stripe_transfer_id')
      .eq('id', paymentId)
      .maybeSingle();
    if (error) throw error;
    payment = data;
  } else if (jobId) {
    const { data, error } = await supabase
      .from('payments')
      .select('id, job_id, status, stripe_transfer_id')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    payment = data;
  }
  const resolvedJobId = String(jobId || payment?.job_id || '');
  if (!payment || !resolvedJobId) return;

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('status')
    .eq('id', resolvedJobId)
    .maybeSingle();
  if (jobError) throw jobError;

  if (shouldAttemptAutomaticRelease({
    jobStatus: job?.status,
    paymentStatus: payment.status,
    stripeTransferId: payment.stripe_transfer_id,
  })) {
    await invokePayout(resolvedJobId);
  }
}

async function releasePendingPaymentsForTrader(traderId: string) {
  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('id')
    .eq('trader_id', traderId)
    .in('status', ['client_done', 'completed']);
  if (jobsError) throw jobsError;

  for (const job of jobs || []) {
    await maybeReleaseReadyPayment(undefined, job.id);
  }
}

async function resolveConnectedAccountOwner(account: any) {
  const metadataOwner = String(account?.metadata?.yakka_user_id || '').trim();
  if (metadataOwner) return metadataOwner;

  const accountId = String(account?.id || '').trim();
  if (!accountId) return '';
  const { data, error } = await supabase
    .from('stripe_connect_accounts')
    .select('user_id')
    .eq('stripe_account_id', accountId)
    .maybeSingle();
  if (error) throw error;
  return String(data?.user_id || '');
}

async function markPaymentFailed(paymentId?: string, jobId?: string, providerStatus = 'failed') {
  if (!paymentId && !jobId) return;
  const query = supabase.from('payments').update({
    status: 'failed',
    provider_status: providerStatus,
    updated_at: new Date().toISOString(),
  });
  const { error } = paymentId
    ? await query.eq('id', paymentId).eq('status', 'awaiting_funding')
    : await query.eq('job_id', jobId).eq('status', 'awaiting_funding');
  if (error) throw error;
}

async function processEvent(event: any) {
  const eventType = String(event.type ?? 'unknown');
  const receivedAt = Number.isFinite(Number(event.created))
    ? new Date(Number(event.created) * 1000).toISOString()
    : new Date().toISOString();

  if (eventType === 'checkout.session.completed' || eventType === 'checkout.session.async_payment_succeeded') {
    const session = event.data?.object ?? {};
    const paymentId = session.metadata?.payment_id;
    const jobId = session.metadata?.job_id;
    if (paymentId) {
      const { error } = await supabase
        .from('payments')
        .update({
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: session.payment_intent,
          provider_status: session.payment_status ?? session.status,
        })
        .eq('id', paymentId);
      if (error) throw error;
    }
    if (session.payment_status === 'paid') {
      await markFunded(paymentId, jobId, session.payment_status, null, receivedAt);
      await maybeReleaseReadyPayment(paymentId, jobId);
    }
  }

  if (eventType === 'checkout.session.async_payment_failed' || eventType === 'checkout.session.expired') {
    const session = event.data?.object ?? {};
    await markPaymentFailed(session.metadata?.payment_id, session.metadata?.job_id, eventType);
  }

  if (eventType === 'payment_intent.succeeded') {
    const intent = event.data?.object ?? {};
    if (intent.metadata?.payment_id) {
      const { error } = await supabase.from('payments').update({
        stripe_payment_intent_id: intent.id,
        stripe_charge_id: intent.latest_charge ?? null,
        provider_status: intent.status,
      }).eq('id', intent.metadata.payment_id);
      if (error) throw error;
    }
    await markFunded(
      intent.metadata?.payment_id,
      intent.metadata?.job_id,
      intent.status ?? 'succeeded',
      stripeObjectId(intent.latest_charge),
      receivedAt,
    );
    await maybeReleaseReadyPayment(intent.metadata?.payment_id, intent.metadata?.job_id);
  }

  if (eventType === 'payment_intent.payment_failed' || eventType === 'payment_intent.canceled') {
    const intent = event.data?.object ?? {};
    await markPaymentFailed(intent.metadata?.payment_id, intent.metadata?.job_id, intent.status || eventType);
  }

  if (eventType === 'refund.updated' || eventType === 'refund.failed') {
    const refund = event.data?.object ?? {};
    const paymentIntentId = stripeObjectId(refund.payment_intent);
    const paymentQuery = supabase.from('payments').select('*');
    const { data: payment, error: paymentError } = paymentIntentId
      ? await paymentQuery.eq('stripe_payment_intent_id', paymentIntentId).maybeSingle()
      : await paymentQuery.eq('stripe_refund_id', refund.id).maybeSingle();
    if (paymentError) throw paymentError;
    if (payment) {
      const refundStatus = String(refund.status || (eventType === 'refund.failed' ? 'failed' : 'pending'));
      await recordRefundStatus(supabase, payment, {
        refundId: String(refund.id),
        refundStatus,
        refundCents: Number(refund.amount || payment.customer_refund_requested_cents || 0),
      });
      if (refundStatus === 'failed') {
        await raisePaymentAlert(supabase, {
          alertKey: `stripe-refund-failed:${refund.id}`,
          paymentId: payment.id,
          jobId: payment.job_id,
          severity: 'critical',
          category: 'refund_failed',
          message: 'Stripe could not complete a customer refund. Manual review is required.',
          details: { refundId: refund.id, failureReason: refund.failure_reason || null },
        });
      }
    }
  }

  if (eventType === 'account.updated') {
    const account = event.data?.object ?? {};
    const ownerUserId = await resolveConnectedAccountOwner(account);
    if (ownerUserId) {
      const requirementErrors = Array.isArray(account.requirements?.errors) ? account.requirements.errors : [];
      const pastDue = Array.isArray(account.requirements?.past_due) ? account.requirements.past_due : [];
      const payoutStatus = account.payouts_enabled
        ? 'ready'
        : account.requirements?.disabled_reason
          ? 'restricted'
          : 'pending';
      const verificationStatus = account.payouts_enabled
        ? 'approved'
        : pastDue.length || requirementErrors.length
          ? 'rejected'
          : account.details_submitted || (account.requirements?.pending_verification || []).length
            ? 'reviewing'
            : 'pending';

      const { error: connectError } = await supabase
        .from('stripe_connect_accounts')
        .update({
          details_submitted: !!account.details_submitted,
          payouts_enabled: !!account.payouts_enabled,
          charges_enabled: !!account.charges_enabled,
          disabled_reason: account.requirements?.disabled_reason || null,
          requirements: account.requirements || {},
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', ownerUserId);
      if (connectError) throw connectError;

      const { error: teamError } = await supabase
        .from('team_accounts')
        .update({
          payout_provider: 'stripe',
          payout_status: payoutStatus,
          verification_status: verificationStatus,
        })
        .eq('owner_user_id', ownerUserId);
      if (teamError) throw teamError;

      if (account.payouts_enabled) {
        await releasePendingPaymentsForTrader(ownerUserId);
      }
    }
  }
}

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!stripe || !webhookSecrets.length) {
    console.error('Stripe webhook secrets are not configured');
    return new Response('Stripe webhook is not configured', { status: 500 });
  }

  const raw = await req.text();
  const signature = req.headers.get('stripe-signature') ?? '';

  let event: any;
  try {
    event = await constructStripeEvent(stripe, raw, signature, webhookSecrets);
  } catch (error) {
    console.error('Stripe webhook signature verification failed');
    return new Response('Invalid Stripe signature', { status: 401 });
  }

  const eventId = String(event.id ?? '');
  const eventType = String(event.type ?? 'unknown');
  if (!eventId) return new Response('Missing event id', { status: 400 });

  try {
    const { data: claimed, error: claimError } = await supabase.rpc('rpc_claim_stripe_webhook', {
      p_event_id: eventId,
      p_event_type: eventType,
      p_payload: event,
    });
    if (claimError) throw claimError;
    if (!claimed) return new Response('already processing or processed', { status: 200 });

    await processEvent(event);

    const { error: processedError } = await supabase
      .from('webhook_events')
      .update({ processed_at: new Date().toISOString(), processing_started_at: null, last_error: null })
      .eq('provider', 'stripe')
      .eq('event_id', eventId);
    if (processedError) throw processedError;
    return new Response('ok', { status: 200 });
  } catch (error) {
    console.error(`Stripe webhook ${eventType} ${eventId} failed`, error);
    await supabase.from('webhook_events').update({
      processing_started_at: null,
      last_error: error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown webhook error',
    }).eq('provider', 'stripe').eq('event_id', eventId);
    return new Response('Webhook processing failed', { status: 500 });
  }
});
