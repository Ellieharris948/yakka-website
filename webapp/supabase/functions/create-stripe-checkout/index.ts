import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  buildJobPaymentBreakdown,
  buildStripeReference,
  buildStripeTransferGroup,
} from '../_shared/job_payments.ts';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { getStripeClient, stripeObjectId } from '../_shared/stripe.ts';
import { raisePaymentAlert, recordPaymentOperation } from '../_shared/payment_ledger.ts';

type JobItem = {
  qty: number | null;
  price_cents: number | null;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE'))!;
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const successUrl = Deno.env.get('STRIPE_SUCCESS_URL') ?? 'yakka://payment/success';
const cancelUrl = Deno.env.get('STRIPE_CANCEL_URL') ?? 'yakka://payment/cancel';

const supabase = createClient(supabaseUrl, serviceRoleKey);
const stripe = stripeSecretKey ? getStripeClient(stripeSecretKey) : null;

function approvedWebReturnBase(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = new URL(value);
    const allowedProductionHost = parsed.protocol === 'https:'
      && ['yakka.app', 'www.yakka.app'].includes(parsed.hostname);
    const allowedLocalHost = parsed.protocol === 'http:'
      && ['127.0.0.1', 'localhost'].includes(parsed.hostname);
    if ((!allowedProductionHost && !allowedLocalHost) || parsed.pathname !== '/app/') return null;
    return `${parsed.origin}/app/`;
  } catch {
    return null;
  }
}

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

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!stripeSecretKey) return jsonResponse({ error: 'STRIPE_SECRET_KEY is missing in Supabase secrets.' }, 500);

  let operationContext: any = null;
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !userData.user) return jsonResponse({ error: 'Not signed in' }, 401);

    const { jobId, scopeChangeId, webReturnBase } = await req.json();
    if (!jobId) return jsonResponse({ error: 'jobId is required' }, 400);
    const approvedWebBase = approvedWebReturnBase(webReturnBase);
    if (webReturnBase && !approvedWebBase) {
      return jsonResponse({ error: 'The web payment return URL is not allowed.' }, 400);
    }

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      // Missing additive payment columns are treated as zero by the shared
      // breakdown, so checkout also works during a staged schema rollout.
      .select('*')
      .eq('id', jobId)
      .single();
    if (jobError || !job) return jsonResponse({ error: jobError?.message ?? 'Job not found' }, 404);
    if (job.client_id !== userData.user.id) return jsonResponse({ error: 'Only the customer can pay for this job.' }, 403);
    if (!(scopeChangeId ? ['funded', 'in_progress'] : ['proposed', 'accepted']).includes(job.status)) {
      return jsonResponse({ error: 'This job is not ready for payment.' }, 400);
    }

    const { data: items, error: itemsError } = await supabase.from('job_items').select('qty, price_cents').eq('job_id', jobId);
    if (itemsError) throw itemsError;
    let breakdown = buildJobPaymentBreakdown(
      job as any,
      (items || []) as JobItem[],
    );
    if (scopeChangeId) {
      const { data: change, error } = await supabase.from('job_scope_changes').select('*').eq('id', scopeChangeId).eq('job_id', jobId).single();
      if (error || change?.status !== 'approved') return jsonResponse({ error: 'The customer must approve this extra work before payment.' }, 409);
      breakdown = { laborCents: change.labor_cents, materialsCents: 0, upfrontMaterialsCents: 0,
        subtotalExVatCents: change.labor_cents, vatCents: change.vat_cents, vatRateBps: change.vat_rate_bps,
        tradieGrossCents: change.principal_cents, sellerFeeCents: change.seller_fee_cents,
        netToSellerCents: change.principal_cents - change.seller_fee_cents, clientFeeCents: change.client_fee_cents, totalDueCents: change.total_cents };
    }
    const currency = String(job.currency ?? 'GBP').toLowerCase();
    if (currency !== 'gbp') {
      return jsonResponse({ error: 'YAKKA Pay by Bank checkout currently supports GBP jobs only.' }, 400);
    }
    if (breakdown.totalDueCents < 50) {
      return jsonResponse({ error: 'Stripe Pay by Bank requires a minimum payment of £0.50.' }, 400);
    }
    if (breakdown.totalDueCents > 1_000_000) {
      return jsonResponse({ error: 'Stripe Pay by Bank supports payments up to £10,000.' }, 400);
    }
    const { data: traderProfile, error: traderProfileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', job.trader_id)
      .maybeSingle();
    if (traderProfileError) throw traderProfileError;
    const traderReferenceName = resolveTraderReferenceName(traderProfile, null);
    const stripeReference = buildStripeReference(job.ref_code ?? job.id, traderReferenceName);
    const transferGroup = buildStripeTransferGroup(job.ref_code ?? job.id, traderReferenceName);

    let existingQuery = supabase
      .from('payments')
      .select('id,status,provider_status,stripe_checkout_session_id')
      .eq('job_id', job.id)
      .order('created_at', { ascending: false })
      .limit(1);
    existingQuery = scopeChangeId ? existingQuery.eq('scope_change_id', scopeChangeId) : existingQuery.is('scope_change_id', null);
    const { data: existingRows, error: existingError } = await existingQuery;
    if (existingError) throw existingError;
    const existing = existingRows?.[0] ?? null;

    if (existing && ['funded', 'released', 'disputed', 'refund_pending', 'partially_refunded', 'refunded'].includes(String(existing.status))) {
      return jsonResponse({ error: 'This job already has a funded payment.' }, 409);
    }

    if (existing?.stripe_checkout_session_id) {
      const previousSession = await stripe!.checkout.sessions.retrieve(existing.stripe_checkout_session_id);
      if (previousSession.status === 'open' && previousSession.url) {
        return jsonResponse({
          url: previousSession.url,
          sessionId: previousSession.id,
          paymentId: existing.id,
          paymentMethod: 'pay_by_bank',
          reused: true,
        });
      }
      if (previousSession.payment_status === 'paid') {
        return jsonResponse({ error: 'Stripe is confirming this payment. YAKKA will update automatically.' }, 409);
      }
      if (previousSession.status === 'complete') {
        const intentId = stripeObjectId(previousSession.payment_intent);
        if (!intentId) return jsonResponse({ error: 'This bank payment needs reconciliation before another attempt.' }, 409);
        const intent = await stripe!.paymentIntents.retrieve(intentId);
        const confirmedFailure = intent.status === 'requires_payment_method' && existing.provider_status === 'checkout.session.async_payment_failed';
        if (!confirmedFailure && intent.status !== 'canceled') {
          return jsonResponse({ error: 'Stripe is still confirming this bank payment. Please do not pay again.' }, 409);
        }
      }
      const { error: cancelError } = await supabase.from('payments').update({
        status: 'cancelled',
        provider_status: previousSession.status || 'expired',
        updated_at: new Date().toISOString(),
      }).eq('id', existing.id).in('status', ['awaiting_funding', 'failed', 'cancelled']);
      if (cancelError) throw cancelError;
    }

    const { data: paymentResult, error: paymentError } = await (scopeChangeId ? supabase.rpc('rpc_prepare_scope_payment', { p_scope_change_id: scopeChangeId, p_client_id: userData.user.id }) : supabase.rpc('rpc_prepare_stripe_payment', {
      p_job_id: job.id,
      p_client_id: userData.user.id,
      p_tradie_id: job.trader_id,
      p_total_cents: breakdown.totalDueCents,
      p_principal_cents: breakdown.tradieGrossCents,
      p_client_fee_cents: breakdown.clientFeeCents,
      p_seller_fee_cents: breakdown.sellerFeeCents,
      p_net_to_seller_cents: breakdown.netToSellerCents,
      p_currency: currency,
    }));
    const payment = Array.isArray(paymentResult) ? paymentResult[0] : paymentResult;
    if (paymentError || !payment) return jsonResponse({ error: paymentError?.message ?? 'Could not create payment' }, 500);
    if (String(payment.status) !== 'awaiting_funding') {
      return jsonResponse({ error: 'This job already has a funded payment.' }, 409);
    }

    const lineItems: any[] = [];
    if (breakdown.laborCents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency,
          unit_amount: breakdown.laborCents,
          product_data: { name: stripeReference, description: 'Tradie labour and agreed work breakdown.' },
        },
      });
    }

    if (breakdown.materialsCents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency,
          unit_amount: breakdown.materialsCents,
          product_data: {
            name: 'Agreed materials',
            description: breakdown.upfrontMaterialsCents > 0
              ? 'Includes materials requested upfront and held securely by YAKKA.'
              : 'Materials included in the agreed job breakdown.',
          },
        },
      });
    }

    if (breakdown.vatCents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency,
          unit_amount: breakdown.vatCents,
          product_data: {
            name: `VAT (${breakdown.vatRateBps / 100}%)`,
            description: 'VAT charged by the VAT-registered tradie on the ex-VAT subtotal.',
          },
        },
      });
    }

    if (breakdown.clientFeeCents > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency,
          unit_amount: breakdown.clientFeeCents,
          product_data: {
            name: 'YAKKA customer service fee (2%)',
            description: 'Shown separately for a clear total before bank authorisation.',
          },
        },
      });
    }

    const metadata = {
      job_id: String(job.id),
      payment_id: String(payment.id),
      scope_change_id: String(scopeChangeId || ''),
      job_ref: String(job.ref_code ?? job.id),
      stripe_reference: stripeReference,
      trader_reference_name: traderReferenceName,
      labor_cents: String(breakdown.laborCents),
      materials_cents: String(breakdown.materialsCents),
      upfront_materials_cents: String(breakdown.upfrontMaterialsCents),
      vat_cents: String(breakdown.vatCents),
      client_fee_cents: String(breakdown.clientFeeCents),
      seller_fee_cents: String(breakdown.sellerFeeCents),
    };
    const checkoutIdempotencyKey = `yakka-checkout-${payment.id}-v2`;
    operationContext = {
      operationKey: checkoutIdempotencyKey,
      paymentId: payment.id,
      jobId: job.id,
      operationType: 'checkout' as const,
      idempotencyKey: checkoutIdempotencyKey,
      requestedBy: userData.user.id,
    };
    await recordPaymentOperation(supabase, { ...operationContext, status: 'pending' });
    const paymentSuccessUrl = approvedWebBase
      ? `${approvedWebBase}?payment=success`
      : successUrl;
    const paymentCancelUrl = approvedWebBase
      ? `${approvedWebBase}?payment=cancel`
      : cancelUrl;
    const successSeparator = paymentSuccessUrl.includes('?') ? '&' : '?';
    const cancelSeparator = paymentCancelUrl.includes('?') ? '&' : '?';
    const stripeSession = await stripe!.checkout.sessions.create({
      mode: 'payment',
      success_url: `${paymentSuccessUrl}${successSeparator}jobId=${job.id}&scopeChangeId=${scopeChangeId || ''}&mode=stripe&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${paymentCancelUrl}${cancelSeparator}jobId=${job.id}&scopeChangeId=${scopeChangeId || ''}`,
      client_reference_id: stripeReference,
      customer_email: userData.user.email ?? undefined,
      payment_method_types: ['pay_by_bank'],
      payment_intent_data: {
        description: stripeReference,
        // Pay by Bank is a non-card charge, so this supported PaymentIntent
        // field keeps YAKKA on the customer's bank statement.
        statement_descriptor: 'YAKKA',
        transfer_group: transferGroup,
        metadata,
      },
      metadata,
      line_items: lineItems,
    }, { idempotencyKey: checkoutIdempotencyKey });

    const { error: sessionUpdateError } = await supabase
      .from('payments')
      .update({
        stripe_checkout_session_id: stripeSession.id,
        stripe_payment_intent_id: stripeObjectId(stripeSession.payment_intent),
        stripe_checkout_idempotency_key: checkoutIdempotencyKey,
        provider_status: stripeSession.status ?? 'open',
      })
      .eq('id', payment.id);
    if (sessionUpdateError) throw sessionUpdateError;
    await recordPaymentOperation(supabase, {
      ...operationContext,
      status: 'succeeded',
      stripeObjectId: stripeSession.id,
    });
    operationContext = null;

    return jsonResponse({
      url: stripeSession.url,
      sessionId: stripeSession.id,
      paymentId: payment.id,
      paymentMethod: 'pay_by_bank',
    });
  } catch (error) {
    if (operationContext) {
      const message = error instanceof Error ? error.message : 'Stripe Checkout failed';
      try {
        await recordPaymentOperation(supabase, { ...operationContext, status: 'failed', error: message });
        await raisePaymentAlert(supabase, {
          alertKey: `payment-operation:${operationContext.operationKey}`,
          paymentId: operationContext.paymentId,
          jobId: operationContext.jobId,
          severity: 'warning',
          category: 'checkout_failed',
          message: 'Stripe Checkout did not complete after a server attempt.',
          details: { operationKey: operationContext.operationKey, error: message },
        });
      } catch (alertError) {
        console.error('Could not save Checkout failure details', alertError);
      }
    }
    return jsonResponse({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});
