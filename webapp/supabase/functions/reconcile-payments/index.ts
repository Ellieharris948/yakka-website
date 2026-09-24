import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { raisePaymentAlert, recordPaymentOperation, recordRefundStatus } from '../_shared/payment_ledger.ts';
import { getStripeClient, stripeErrorMessage } from '../_shared/stripe.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE') ?? '';
const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
const reconciliationSecret = Deno.env.get('RECONCILIATION_SECRET') ?? '';
const admin = createClient(supabaseUrl, serviceRoleKey);
const stripe = stripeSecretKey ? getStripeClient(stripeSecretKey) : null;

function amount(value: unknown) {
  const number = Math.round(Number(value ?? 0));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!stripe || !reconciliationSecret) {
    return jsonResponse({ error: 'Stripe reconciliation secrets are not configured.' }, 500);
  }
  if (req.headers.get('x-reconciliation-secret') !== reconciliationSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const { data: run, error: runError } = await admin
    .from('payment_reconciliation_runs')
    .insert({ status: 'running' })
    .select('id')
    .single();
  if (runError || !run) return jsonResponse({ error: runError?.message || 'Could not start reconciliation.' }, 500);

  const issues: any[] = [];
  let checkedCount = 0;
  try {
    const { data: payments, error: paymentsError } = await admin
      .from('payments')
      .select('*')
      .in('status', ['funded', 'released', 'disputed', 'refund_pending', 'partially_refunded', 'refunded'])
      .order('updated_at', { ascending: true })
      .limit(500);
    if (paymentsError) throw paymentsError;

    for (const payment of payments || []) {
      checkedCount += 1;
      const paymentIssues: any[] = [];
      try {
        if (!payment.stripe_payment_intent_id) {
          paymentIssues.push({ issue_type: 'missing_payment_intent', expected: { present: true }, actual: { present: false } });
        } else {
          const intent = await stripe.paymentIntents.retrieve(payment.stripe_payment_intent_id);
          if (intent.status !== 'succeeded') {
            paymentIssues.push({ issue_type: 'payment_intent_status', expected: { status: 'succeeded' }, actual: { status: intent.status } });
          }
          if (amount(intent.amount_received) !== amount(payment.total_cents)) {
            paymentIssues.push({
              issue_type: 'amount_received_mismatch',
              expected: { amountReceived: amount(payment.total_cents) },
              actual: { amountReceived: amount(intent.amount_received) },
            });
          }

          const refunds = await stripe.refunds.list({ payment_intent: payment.stripe_payment_intent_id, limit: 100 });
          const successfulRefundCents = refunds.data
            .filter(refund => refund.status === 'succeeded')
            .reduce((sum, refund) => sum + amount(refund.amount), 0);
          const trackedRefund = refunds.data.find(refund => refund.id === payment.stripe_refund_id);
          if (trackedRefund && String(trackedRefund.status) !== String(payment.stripe_refund_status || '')) {
            await recordRefundStatus(admin, payment, {
              refundId: trackedRefund.id,
              refundStatus: String(trackedRefund.status || 'pending'),
              refundCents: amount(trackedRefund.amount),
            });
          }
          const recordedRefundCents = trackedRefund?.status === 'succeeded'
            ? successfulRefundCents
            : amount(payment.customer_refunded_cents);
          if (successfulRefundCents !== recordedRefundCents) {
            paymentIssues.push({
              issue_type: 'refund_total_mismatch',
              expected: { refundedCents: recordedRefundCents },
              actual: { refundedCents: successfulRefundCents },
            });
          }
        }

        const [{ data: partialRows, error: partialError }, { data: disputeRows, error: disputeError }, { data: ledger, error: ledgerError }] = await Promise.all([
          admin.from('partial_payment_requests').select('amount_cents,released_amount_cents,stripe_transfer_id').eq('job_id', payment.job_id).eq('status', 'released'),
          admin.from('disputes').select('tradie_transfer_cents,stripe_transfer_id').eq('job_id', payment.job_id).eq('status', 'resolved').order('submitted_at', { ascending: false }).limit(1),
          admin.from('payment_ledgers').select('*').eq('payment_id', payment.id).maybeSingle(),
        ]);
        if (partialError) throw partialError;
        if (disputeError) throw disputeError;
        if (ledgerError) throw ledgerError;
        const partialGross = (payment.scope_change_id ? [] : partialRows || []).reduce((sum: number, row: any) => sum + amount(row.amount_cents), 0);
        const partialTransferred = (payment.scope_change_id ? [] : partialRows || []).reduce((sum: number, row: any) => sum + amount(row.released_amount_cents), 0);
        const disputeTransferred = Math.max(0, amount(ledger?.transferred_cents) - partialTransferred);
        const expectedHeld = ['funded', 'disputed'].includes(String(payment.status))
          ? Math.max(0, amount(payment.principal_cents) - partialGross)
          : 0;
        if (!ledger) {
          paymentIssues.push({ issue_type: 'missing_ledger', expected: { present: true }, actual: { present: false } });
        } else if (amount(ledger.held_cents) !== expectedHeld) {
          paymentIssues.push({
            issue_type: 'ledger_held_mismatch',
            expected: { heldCents: expectedHeld },
            actual: { heldCents: amount(ledger.held_cents) },
          });
        }

        const transferIds = new Set<string>();
        for (const row of partialRows || []) if (row.stripe_transfer_id) transferIds.add(String(row.stripe_transfer_id));
        if (payment.stripe_transfer_id) transferIds.add(String(payment.stripe_transfer_id));
        let actualTransferred = 0;
        for (const transferId of transferIds) {
          const transfer = await stripe.transfers.retrieve(transferId);
          actualTransferred += Math.max(0, amount(transfer.amount) - amount(transfer.amount_reversed));
        }
        const expectedTransferred = ['released'].includes(String(payment.status)) && !disputeRows?.length
          ? amount(payment.net_to_seller_cents)
          : partialTransferred + disputeTransferred;
        if (actualTransferred !== expectedTransferred) {
          paymentIssues.push({
            issue_type: 'transfer_total_mismatch',
            expected: { transferredCents: expectedTransferred },
            actual: { transferredCents: actualTransferred },
          });
        }
      } catch (error) {
        paymentIssues.push({
          issue_type: 'stripe_reconciliation_error',
          expected: {},
          actual: { error: stripeErrorMessage(error, 'Unknown reconciliation error') },
        });
      }

      for (const issue of paymentIssues) {
        issues.push({ run_id: run.id, payment_id: payment.id, job_id: payment.job_id, ...issue });
      }
      await admin.from('payments').update({ last_reconciled_at: new Date().toISOString() }).eq('id', payment.id);
      await recordPaymentOperation(admin, {
        operationKey: `reconciliation:${run.id}:${payment.id}`,
        paymentId: payment.id,
        jobId: payment.job_id,
        operationType: 'reconciliation',
        status: paymentIssues.length ? 'failed' : 'succeeded',
        error: paymentIssues.length ? `${paymentIssues.length} issue(s) found` : undefined,
      });
      if (!paymentIssues.length) {
        const { error: resolveAlertError } = await admin.from('payment_alerts').update({
          resolved_at: new Date().toISOString(),
        }).eq('alert_key', `reconciliation:${payment.id}`).is('resolved_at', null);
        if (resolveAlertError) throw resolveAlertError;
      } else {
        await raisePaymentAlert(admin, {
          alertKey: `reconciliation:${payment.id}`,
          paymentId: payment.id,
          jobId: payment.job_id,
          severity: 'critical',
          category: 'reconciliation_mismatch',
          message: 'YAKKA’s payment ledger does not match Stripe and needs review.',
          details: { issueTypes: paymentIssues.map(issue => issue.issue_type), runId: run.id },
        });
      }
    }

    const { data: ageingRows, error: ageingError } = await admin
      .from('payment_portions_nearing_90_days')
      .select('*');
    if (ageingError) throw ageingError;
    for (const portion of ageingRows || []) {
      const overdue = Number(portion.held_days || 0) >= 90;
      await raisePaymentAlert(admin, {
        alertKey: `held-age:${portion.id}`,
        paymentId: portion.payment_id,
        jobId: portion.job_id,
        severity: overdue ? 'critical' : 'warning',
        category: overdue ? 'held_90_days' : 'held_80_day_warning',
        message: overdue
          ? 'A held payment portion has reached 90 days without release or refund.'
          : 'A held payment portion is approaching the 90-day review point.',
        details: { portionKey: portion.portion_key, heldDays: portion.held_days, grossCents: portion.gross_cents },
      });
    }

    if (issues.length) {
      const { error: issueInsertError } = await admin.from('payment_reconciliation_issues').insert(issues);
      if (issueInsertError) throw issueInsertError;
    }
    const { error: completeError } = await admin.from('payment_reconciliation_runs').update({
      completed_at: new Date().toISOString(),
      checked_count: checkedCount,
      issue_count: issues.length,
      status: 'completed',
    }).eq('id', run.id);
    if (completeError) throw completeError;
    return jsonResponse({ ok: true, runId: run.id, checkedCount, issueCount: issues.length });
  } catch (error) {
    const message = stripeErrorMessage(error, 'Reconciliation failed.');
    await admin.from('payment_reconciliation_runs').update({
      completed_at: new Date().toISOString(),
      checked_count: checkedCount,
      issue_count: issues.length,
      status: 'failed',
      error: message,
    }).eq('id', run.id);
    return jsonResponse({ error: message, runId: run.id }, 500);
  }
});
