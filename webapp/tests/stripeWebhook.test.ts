import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldAttemptAutomaticRelease } from '../supabase/functions/_shared/stripe_webhook';

test('releases only after both payment and customer completion are ready', () => {
  assert.equal(shouldAttemptAutomaticRelease({
    jobStatus: 'client_done',
    paymentStatus: 'funded',
  }), true);
  assert.equal(shouldAttemptAutomaticRelease({
    jobStatus: 'funded',
    paymentStatus: 'funded',
  }), false);
  assert.equal(shouldAttemptAutomaticRelease({
    jobStatus: 'client_done',
    paymentStatus: 'awaiting_funding',
  }), false);
});

test('does not release the same Stripe transfer twice', () => {
  assert.equal(shouldAttemptAutomaticRelease({
    jobStatus: 'client_done',
    paymentStatus: 'funded',
    stripeTransferId: 'tr_123',
  }), false);
});
