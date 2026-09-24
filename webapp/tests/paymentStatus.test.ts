import assert from 'node:assert/strict';
import test from 'node:test';
import { getPaymentStatusView } from '../src/utils/paymentStatus';

test('bank return never confirms missing, unknown or pending payments', () => {
  for (const status of [undefined, null, '', 'awaiting_funding', 'pending', 'unexpected']) {
    const view = getPaymentStatusView(status);
    assert.equal(view.confirmed, false);
    assert.equal(view.pending, true);
    assert.equal(view.canRetry, false);
  }
});

test('only failed attempts offer retry and settled states prevent a second payment', () => {
  for (const status of ['failed', 'cancelled']) {
    assert.equal(getPaymentStatusView(status).canRetry, true);
    assert.equal(getPaymentStatusView(status).confirmed, false);
  }
  for (const status of ['funded', 'released', 'disputed', 'refund_pending', 'partially_refunded', 'refunded']) {
    assert.equal(getPaymentStatusView(status).confirmed, true);
    assert.equal(getPaymentStatusView(status).canRetry, false);
  }
  assert.match(getPaymentStatusView('released').description, /Stripe.*payout schedule/);
});
