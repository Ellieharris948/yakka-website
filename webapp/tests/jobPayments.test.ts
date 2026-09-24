import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildJobPaymentBreakdown,
  buildDisputeResolutionBreakdown,
  buildPartialReleaseBreakdown,
  buildPaymentBreakdown,
  resolveUpfrontMaterialsCents,
  sumJobItemsCents,
  YAKKA_CUSTOMER_FEE_BPS,
  YAKKA_TRADIE_FEE_BPS,
} from '../src/utils/jobPayments';

test('adds the transparent 2% customer fee at charge time', () => {
  const result = buildPaymentBreakdown({ laborCents: 100_00 });
  assert.equal(YAKKA_CUSTOMER_FEE_BPS, 200);
  assert.equal(result.clientFeeCents, 2_00);
  assert.equal(result.totalDueCents, 102_00);
  assert.equal(result.tradieGrossCents, 100_00);
});

test('deducts the 5% YAKKA fee from the full agreed job value', () => {
  const result = buildPaymentBreakdown({ laborCents: 200_00, upfrontMaterialsCents: 50_00 });
  assert.equal(YAKKA_TRADIE_FEE_BPS, 500);
  assert.equal(result.sellerFeeCents, 12_50);
  assert.equal(result.netToSellerCents, 237_50);
  assert.equal(result.clientFeeCents, 5_00);
  assert.equal(result.totalDueCents, 255_00);
});

test('rounds the percentage fee up to the nearest penny', () => {
  const result = buildPaymentBreakdown({ laborCents: 101 });
  assert.equal(result.sellerFeeCents, 6);
});

test('prefers the explicit upfront-materials database value', () => {
  assert.equal(resolveUpfrontMaterialsCents({
    upfront_materials_cents: 12_345,
    description: 'Upfront materials requested: £1.00.',
  }), 12_345);
});

test('recovers upfront materials from legacy job descriptions', () => {
  assert.equal(resolveUpfrontMaterialsCents({
    description: 'Upfront materials requested: £1,234.56. Customer will approve delivery.',
  }), 123_456);
});

test('returns zero when no upfront materials were agreed', () => {
  assert.equal(resolveUpfrontMaterialsCents({ description: 'Standard labour-only job.' }), 0);
});

test('totals line items using quantity and unit price', () => {
  assert.equal(sumJobItemsCents([
    { qty: 2, price_cents: 12_50 },
    { qty: 1, price_cents: 30_00 },
  ]), 55_00);
});

test('uses line-item totals ahead of the legacy aggregate job price', () => {
  const result = buildJobPaymentBreakdown(
    { price_cents: 999_00 },
    [{ qty: 2, price_cents: 40_00 }],
  );
  assert.equal(result.laborCents, 80_00);
  assert.equal(result.totalDueCents, 81_60);
});

test('falls back to the aggregate job price when no line items exist', () => {
  const result = buildJobPaymentBreakdown({ price_cents: 75_00 }, []);
  assert.equal(result.laborCents, 75_00);
  assert.equal(result.totalDueCents, 76_50);
});

test('sanitises invalid and negative amounts instead of overcharging', () => {
  const result = buildPaymentBreakdown({ laborCents: -100, upfrontMaterialsCents: Number.NaN });
  assert.deepEqual(result, {
    laborCents: 0,
    materialsCents: 0,
    upfrontMaterialsCents: 0,
    subtotalExVatCents: 0,
    vatCents: 0,
    vatRateBps: 0,
    tradieGrossCents: 0,
    sellerFeeCents: 0,
    netToSellerCents: 0,
    clientFeeCents: 0,
    totalDueCents: 0,
  });
});

test('adds 20% VAT to labour and materials for a VAT-registered quote', () => {
  const result = buildPaymentBreakdown({
    laborCents: 1_000_00,
    materialsCents: 250_00,
    upfrontMaterialsCents: 100_00,
    vatRegistered: true,
  });

  assert.equal(result.subtotalExVatCents, 1_250_00);
  assert.equal(result.vatCents, 250_00);
  assert.equal(result.totalDueCents, 1_530_00);
  assert.equal(result.upfrontMaterialsCents, 100_00);
});

test('uses the VAT snapshot stored on the job', () => {
  const result = buildJobPaymentBreakdown({
    price_cents: 500_00,
    materials_cents: 100_00,
    vat_registered: true,
    vat_rate_bps: 2_000,
  });

  assert.equal(result.vatCents, 120_00);
  assert.equal(result.totalDueCents, 734_40);
});

test('withholds the 5% tradie fee proportionally from a partial labour release', () => {
  const result = buildPartialReleaseBreakdown({
    requestedCents: 50_00,
  });
  assert.deepEqual(result, {
    requestedCents: 50_00,
    transferCents: 47_50,
    feeWithheldCents: 2_50,
  });
});

test('partial and final releases add up to the exact net payout', () => {
  const payment = buildPaymentBreakdown({ laborCents: 100_00, upfrontMaterialsCents: 20_00 });
  const partial = buildPartialReleaseBreakdown({
    requestedCents: 50_00,
  });
  const finalReleaseCents = payment.netToSellerCents - partial.transferCents;

  assert.equal(payment.sellerFeeCents, 6_00);
  assert.equal(payment.netToSellerCents, 114_00);
  assert.equal(partial.transferCents, 47_50);
  assert.equal(partial.transferCents + finalReleaseCents, 114_00);
});

test('calculates an exact disputed split with proportional customer fee refund', () => {
  assert.deepEqual(buildDisputeResolutionBreakdown({
    principalCents: 100_00,
    clientFeeCents: 2_00,
    customerGrossCents: 40_00,
    tradieGrossCents: 60_00,
  }), {
    remainingPrincipalCents: 100_00,
    customerGrossCents: 40_00,
    clientFeeRefundCents: 80,
    customerRefundCents: 40_80,
    tradieGrossCents: 60_00,
    tradieFeeCents: 3_00,
    tradieTransferCents: 57_00,
    unallocatedCents: 0,
    isFullyAllocated: true,
  });
});

test('excludes gross milestone portions that were already released from a dispute split', () => {
  const result = buildDisputeResolutionBreakdown({
    principalCents: 100_00,
    clientFeeCents: 2_00,
    previouslyReleasedGrossCents: 30_00,
    customerGrossCents: 20_00,
    tradieGrossCents: 50_00,
  });
  assert.equal(result.remainingPrincipalCents, 70_00);
  assert.equal(result.isFullyAllocated, true);
});

test('allows an explicit zero-fee partial release when policy requires it', () => {
  assert.deepEqual(buildPartialReleaseBreakdown({
    requestedCents: 50_00,
    feeBps: 0,
  }), {
    requestedCents: 50_00,
    transferCents: 50_00,
    feeWithheldCents: 0,
  });
});
