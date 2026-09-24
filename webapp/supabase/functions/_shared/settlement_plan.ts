import { buildDisputeResolutionBreakdown } from './job_payments.ts';

// Allocate across the original charge and paid additions. Cumulative rounding
// preserves every penny; each charge refunds its own customer fee.
export function buildSettlementPlan(payments: any[], releasedGross: number, customer: number, tradie: number) {
  const available = payments.map(p => Math.max(0, Number(p.principal_cents) - (p.scope_change_id ? 0 : releasedGross)));
  const remaining = available.reduce((a, b) => a + b, 0);
  let cumulative = 0, allocatedCustomer = 0;
  const allocations = payments.map((payment, i) => {
    cumulative += available[i];
    const customerTotal = remaining ? Math.floor(customer * cumulative / remaining) : 0;
    const share = customerTotal - allocatedCustomer;
    allocatedCustomer = customerTotal;
    return { paymentId: payment.id, ...buildDisputeResolutionBreakdown({
      principalCents: payment.principal_cents, clientFeeCents: payment.client_fee_cents,
      previouslyReleasedGrossCents: payment.scope_change_id ? 0 : releasedGross,
      customerGrossCents: share, tradieGrossCents: available[i] - share,
    }) };
  });
  return {
    remainingPrincipalCents: remaining, customerGrossCents: customer, tradieGrossCents: tradie,
    isFullyAllocated: customer >= 0 && tradie >= 0 && customer + tradie === remaining,
    unallocatedCents: remaining - customer - tradie,
    customerRefundCents: allocations.reduce((s, a) => s + a.customerRefundCents, 0),
    tradieTransferCents: allocations.reduce((s, a) => s + a.tradieTransferCents, 0),
    tradieFeeCents: allocations.reduce((s, a) => s + a.tradieFeeCents, 0),
    allocations,
  };
}
