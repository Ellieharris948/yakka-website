type SupabaseAdmin = any;

function positiveInt(value: unknown) {
  const amount = Math.round(Number(value ?? 0));
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

async function getLedger(admin: SupabaseAdmin, payment: any, receivedAt?: string) {
  const { data: existing, error: existingError } = await admin
    .from('payment_ledgers')
    .select('*')
    .eq('payment_id', payment.id)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const timestamp = receivedAt || payment.received_at || payment.held_since || new Date().toISOString();
  const payload = {
    payment_id: payment.id,
    job_id: payment.job_id,
    tradie_id: payment.tradie_id,
    status: 'held',
    gross_received_cents: positiveInt(payment.principal_cents),
    customer_fee_cents: positiveInt(payment.client_fee_cents),
    held_cents: positiveInt(payment.principal_cents),
    transferred_cents: 0,
    refunded_cents: positiveInt(payment.customer_refunded_cents),
    commission_cents: 0,
    received_at: timestamp,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await admin
    .from('payment_ledgers')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function recordFundedPayment(
  admin: SupabaseAdmin,
  payment: any,
  args: { providerStatus: string; chargeId?: string | null; receivedAt?: string },
) {
  // The first successful funding event starts the holding clock. Later Stripe
  // events can arrive out of order, so never move that timestamp forward.
  const receivedAt = payment.received_at || payment.held_since || args.receivedAt || new Date().toISOString();
  const terminalStatus = ['released', 'disputed', 'refund_pending', 'partially_refunded', 'refunded'].includes(String(payment.status));
  const { error: paymentError } = await admin
    .from('payments')
    .update({
      ...(terminalStatus ? {} : { status: 'funded' }),
      provider_status: args.providerStatus,
      stripe_charge_id: args.chargeId || payment.stripe_charge_id || null,
      received_at: receivedAt,
      held_since: receivedAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', payment.id);
  if (paymentError) throw paymentError;

  const ledger = await getLedger(admin, { ...payment, received_at: receivedAt }, receivedAt);
  if (terminalStatus) return ledger;
  const { error: portionError } = await admin.from('payment_ledger_portions').upsert({
    ledger_id: ledger.id,
    portion_key: 'job-balance',
    status: 'held',
    gross_cents: positiveInt(payment.principal_cents),
    transfer_cents: 0,
    refund_cents: 0,
    commission_cents: 0,
    held_since: receivedAt,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'ledger_id,portion_key' });
  if (portionError) throw portionError;
  return ledger;
}

export async function recordPartialRelease(
  admin: SupabaseAdmin,
  payment: any,
  request: any,
  args: { transferId: string; transferCents: number; feeCents: number },
) {
  const ledger = await getLedger(admin, payment);
  const { data: releasedRows, error: releasedError } = await admin
    .from('partial_payment_requests')
    .select('id,amount_cents,released_amount_cents')
    .eq('job_id', payment.job_id)
    .eq('status', 'released');
  if (releasedError) throw releasedError;

  const releasedGrossCents = (payment.scope_change_id ? [] : releasedRows || []).reduce(
    (sum: number, row: any) => sum + positiveInt(row.amount_cents),
    0,
  );
  const transferredCents = (payment.scope_change_id ? [] : releasedRows || []).reduce(
    (sum: number, row: any) => sum + positiveInt(row.released_amount_cents),
    0,
  );
  const heldCents = Math.max(0, positiveInt(payment.principal_cents) - releasedGrossCents);
  const commissionCents = Math.max(0, releasedGrossCents - transferredCents);
  const now = new Date().toISOString();

  const { error: partialError } = await admin.from('payment_ledger_portions').upsert({
    ledger_id: ledger.id,
    portion_key: `partial:${request.id}`,
    partial_request_id: request.id,
    status: 'released',
    gross_cents: positiveInt(request.amount_cents),
    transfer_cents: positiveInt(args.transferCents),
    commission_cents: positiveInt(args.feeCents),
    held_since: payment.received_at || payment.held_since || now,
    resolved_at: now,
    stripe_transfer_id: args.transferId,
    updated_at: now,
  }, { onConflict: 'ledger_id,portion_key' });
  if (partialError) throw partialError;

  const { error: balanceError } = await admin.from('payment_ledger_portions').upsert({
    ledger_id: ledger.id,
    portion_key: 'job-balance',
    status: heldCents > 0 ? 'held' : 'released',
    gross_cents: heldCents,
    transfer_cents: 0,
    refund_cents: 0,
    commission_cents: 0,
    held_since: payment.received_at || payment.held_since || now,
    resolved_at: heldCents > 0 ? null : now,
    updated_at: now,
  }, { onConflict: 'ledger_id,portion_key' });
  if (balanceError) throw balanceError;

  const { error: ledgerError } = await admin.from('payment_ledgers').update({
    status: heldCents > 0 ? 'held' : 'released',
    held_cents: heldCents,
    transferred_cents: transferredCents,
    commission_cents: commissionCents,
    updated_at: now,
  }).eq('id', ledger.id);
  if (ledgerError) throw ledgerError;
}

export async function recordFinalRelease(
  admin: SupabaseAdmin,
  payment: any,
  args: { transferId: string | null; transferCents?: number },
) {
  const ledger = await getLedger(admin, payment);
  const { data: releasedRows, error: releasedError } = await admin
    .from('partial_payment_requests')
    .select('amount_cents,released_amount_cents')
    .eq('job_id', payment.job_id)
    .eq('status', 'released');
  if (releasedError) throw releasedError;
  const partialGross = (payment.scope_change_id ? [] : releasedRows || []).reduce((sum: number, row: any) => sum + positiveInt(row.amount_cents), 0);
  const partialTransferred = (payment.scope_change_id ? [] : releasedRows || []).reduce((sum: number, row: any) => sum + positiveInt(row.released_amount_cents), 0);
  const finalGross = Math.max(0, positiveInt(payment.principal_cents) - partialGross);
  const finalTransferCents = args.transferCents === undefined
    ? Math.max(0, positiveInt(payment.net_to_seller_cents) - partialTransferred)
    : positiveInt(args.transferCents);
  const finalFee = Math.max(0, finalGross - finalTransferCents);
  const now = new Date().toISOString();

  const { error: portionError } = await admin.from('payment_ledger_portions').upsert({
    ledger_id: ledger.id,
    portion_key: 'job-balance',
    status: 'released',
    gross_cents: finalGross,
    transfer_cents: finalTransferCents,
    refund_cents: 0,
    commission_cents: finalFee,
    held_since: payment.received_at || payment.held_since || now,
    resolved_at: now,
    stripe_transfer_id: args.transferId,
    updated_at: now,
  }, { onConflict: 'ledger_id,portion_key' });
  if (portionError) throw portionError;

  const { error: ledgerError } = await admin.from('payment_ledgers').update({
    status: 'released',
    held_cents: 0,
    transferred_cents: partialTransferred + finalTransferCents,
    commission_cents: positiveInt(payment.seller_fee_cents),
    updated_at: now,
  }).eq('id', ledger.id);
  if (ledgerError) throw ledgerError;
}

export async function markPaymentDisputed(admin: SupabaseAdmin, payment: any, disputeId: string) {
  const ledger = await getLedger(admin, payment);
  const now = new Date().toISOString();
  const { error: paymentError } = await admin.from('payments').update({
    status: 'disputed',
    disputed_at: now,
    provider_status: 'dispute_open',
    updated_at: now,
  }).eq('id', payment.id);
  if (paymentError) throw paymentError;
  const { error: ledgerError } = await admin.from('payment_ledgers').update({
    status: 'disputed',
    updated_at: now,
  }).eq('id', ledger.id);
  if (ledgerError) throw ledgerError;
  const { error: portionError } = await admin.from('payment_ledger_portions').update({
    status: 'disputed',
    dispute_id: disputeId,
    updated_at: now,
  }).eq('ledger_id', ledger.id).eq('portion_key', 'job-balance').eq('status', 'held');
  if (portionError) throw portionError;
}

export async function recordDisputeResolution(
  admin: SupabaseAdmin,
  payment: any,
  disputeId: string,
  args: {
    customerGrossCents: number;
    customerRefundCents: number;
    tradieGrossCents: number;
    tradieTransferCents: number;
    tradieFeeCents: number;
    stripeTransferId: string | null;
    stripeRefundId: string | null;
    refundStatus: string | null;
  },
) {
  const ledger = await getLedger(admin, payment);
  const { data: releasedRows, error: releasedError } = await admin
    .from('partial_payment_requests')
    .select('amount_cents,released_amount_cents')
    .eq('job_id', payment.job_id)
    .eq('status', 'released');
  if (releasedError) throw releasedError;
  const partialGross = (payment.scope_change_id ? [] : releasedRows || []).reduce((sum: number, row: any) => sum + positiveInt(row.amount_cents), 0);
  const partialTransferred = (payment.scope_change_id ? [] : releasedRows || []).reduce((sum: number, row: any) => sum + positiveInt(row.released_amount_cents), 0);
  const partialCommission = Math.max(0, partialGross - partialTransferred);
  const now = new Date().toISOString();
  const heldSince = payment.received_at || payment.held_since || now;
  const refundSucceeded = !positiveInt(args.customerRefundCents) || args.refundStatus === 'succeeded';

  if (positiveInt(args.customerGrossCents) > 0) {
    const { error } = await admin.from('payment_ledger_portions').upsert({
      ledger_id: ledger.id,
      portion_key: 'job-balance',
      dispute_id: disputeId,
      status: refundSucceeded ? 'refunded' : 'refund_pending',
      gross_cents: positiveInt(args.customerGrossCents),
      transfer_cents: 0,
      refund_cents: refundSucceeded ? positiveInt(args.customerRefundCents) : 0,
      commission_cents: 0,
      held_since: heldSince,
      resolved_at: now,
      stripe_refund_id: args.stripeRefundId,
      updated_at: now,
    }, { onConflict: 'ledger_id,portion_key' });
    if (error) throw error;
  } else {
    const { error } = await admin.from('payment_ledger_portions').upsert({
      ledger_id: ledger.id,
      portion_key: 'job-balance',
      dispute_id: disputeId,
      status: 'released',
      gross_cents: positiveInt(args.tradieGrossCents),
      transfer_cents: positiveInt(args.tradieTransferCents),
      refund_cents: 0,
      commission_cents: positiveInt(args.tradieFeeCents),
      held_since: heldSince,
      resolved_at: now,
      stripe_transfer_id: args.stripeTransferId,
      updated_at: now,
    }, { onConflict: 'ledger_id,portion_key' });
    if (error) throw error;
  }

  if (positiveInt(args.customerGrossCents) > 0 && positiveInt(args.tradieGrossCents) > 0) {
    const { error } = await admin.from('payment_ledger_portions').upsert({
      ledger_id: ledger.id,
      portion_key: `dispute-transfer:${disputeId}`,
      dispute_id: disputeId,
      status: 'released',
      gross_cents: positiveInt(args.tradieGrossCents),
      transfer_cents: positiveInt(args.tradieTransferCents),
      refund_cents: 0,
      commission_cents: positiveInt(args.tradieFeeCents),
      held_since: heldSince,
      resolved_at: now,
      stripe_transfer_id: args.stripeTransferId,
      updated_at: now,
    }, { onConflict: 'ledger_id,portion_key' });
    if (error) throw error;
  }

  const ledgerStatus = !refundSucceeded
    ? 'refund_pending'
    : positiveInt(args.customerGrossCents) > 0 && positiveInt(args.tradieGrossCents) > 0
      ? 'resolved'
      : positiveInt(args.customerGrossCents) > 0
        ? 'refunded'
        : 'released';
  const { error: ledgerError } = await admin.from('payment_ledgers').update({
    status: ledgerStatus,
    held_cents: 0,
    transferred_cents: partialTransferred + positiveInt(args.tradieTransferCents),
    refunded_cents: refundSucceeded ? positiveInt(args.customerRefundCents) : 0,
    commission_cents: partialCommission + positiveInt(args.tradieFeeCents),
    updated_at: now,
  }).eq('id', ledger.id);
  if (ledgerError) throw ledgerError;
}

export async function recordRefundStatus(
  admin: SupabaseAdmin,
  payment: any,
  args: { refundId: string; refundStatus: string; refundCents: number },
) {
  const now = new Date().toISOString();
  const ledger = await getLedger(admin, payment);
  const succeeded = args.refundStatus === 'succeeded';

  const { error: paymentError } = await admin.from('payments').update({
    stripe_refund_id: args.refundId,
    stripe_refund_status: args.refundStatus,
    ...(succeeded ? {
      status: positiveInt(ledger.transferred_cents) > 0 ? 'partially_refunded' : 'refunded',
      customer_refunded_cents: positiveInt(args.refundCents),
      refunded_at: now,
      provider_status: 'refund_succeeded',
    } : {
      status: 'refund_pending',
      provider_status: args.refundStatus === 'failed' ? 'refund_failed' : 'refund_pending',
    }),
    updated_at: now,
  }).eq('id', payment.id);
  if (paymentError) throw paymentError;

  const { error: portionError } = await admin.from('payment_ledger_portions').update({
    status: succeeded ? 'refunded' : 'refund_pending',
    refund_cents: succeeded ? positiveInt(args.refundCents) : 0,
    resolved_at: succeeded ? now : null,
    updated_at: now,
  }).eq('ledger_id', ledger.id).eq('stripe_refund_id', args.refundId);
  if (portionError) throw portionError;

  const { error: ledgerError } = await admin.from('payment_ledgers').update({
    status: succeeded
      ? positiveInt(ledger.transferred_cents) > 0 ? 'resolved' : 'refunded'
      : 'refund_pending',
    refunded_cents: succeeded ? positiveInt(args.refundCents) : 0,
    updated_at: now,
  }).eq('id', ledger.id);
  if (ledgerError) throw ledgerError;
  const { data: refundPayments, error: refundPaymentsError } = await admin.from('payments')
    .select('customer_refund_requested_cents,stripe_refund_status').eq('job_id', payment.job_id);
  if (refundPaymentsError) throw refundPaymentsError;
  const refunds = (refundPayments || []).filter((p: any) => positiveInt(p.customer_refund_requested_cents) > 0);
  if (refunds.length) {
    const status = refunds.some((p: any) => p.stripe_refund_status === 'failed') ? 'failed'
      : refunds.every((p: any) => p.stripe_refund_status === 'succeeded') ? 'succeeded' : 'pending';
    const { error } = await admin.from('disputes').update({ stripe_refund_status: status })
      .eq('job_id', payment.job_id).eq('status', 'resolved');
    if (error) throw error;
  }

}

export async function recordPaymentOperation(
  admin: SupabaseAdmin,
  input: {
    operationKey: string;
    paymentId?: string;
    jobId?: string;
    operationType: 'checkout' | 'transfer' | 'refund' | 'reconciliation';
    status: 'pending' | 'succeeded' | 'failed';
    idempotencyKey?: string;
    stripeObjectId?: string | null;
    error?: string;
    requestedBy?: string | null;
  },
) {
  const { data: existing } = await admin
    .from('payment_operations')
    .select('attempt_count')
    .eq('operation_key', input.operationKey)
    .maybeSingle();
  const { error } = await admin.from('payment_operations').upsert({
    operation_key: input.operationKey,
    payment_id: input.paymentId || null,
    job_id: input.jobId || null,
    operation_type: input.operationType,
    status: input.status,
    attempt_count: positiveInt(existing?.attempt_count) + (input.status === 'pending' ? 1 : 0),
    idempotency_key: input.idempotencyKey || null,
    stripe_object_id: input.stripeObjectId || null,
    last_error: input.error || null,
    requested_by: input.requestedBy || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'operation_key' });
  if (error) throw error;
}

export async function raisePaymentAlert(
  admin: SupabaseAdmin,
  input: {
    alertKey: string;
    paymentId?: string;
    jobId?: string;
    severity: 'warning' | 'critical';
    category: string;
    message: string;
    details?: Record<string, unknown>;
  },
) {
  const { data: existing } = await admin
    .from('payment_alerts')
    .select('occurrence_count')
    .eq('alert_key', input.alertKey)
    .maybeSingle();
  const { error } = await admin.from('payment_alerts').upsert({
    alert_key: input.alertKey,
    payment_id: input.paymentId || null,
    job_id: input.jobId || null,
    severity: input.severity,
    category: input.category,
    message: input.message,
    details: input.details || {},
    last_seen_at: new Date().toISOString(),
    occurrence_count: positiveInt(existing?.occurrence_count) + 1,
    resolved_at: null,
    resolved_by: null,
  }, { onConflict: 'alert_key' });
  if (error) throw error;
}
