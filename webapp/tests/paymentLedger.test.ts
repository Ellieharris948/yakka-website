import assert from 'node:assert/strict';
import test from 'node:test';

import { getHeldAgeDays, getHoldAgeState } from '../src/utils/paymentLedger';

test('calculates held age with an injected clock', () => {
  assert.equal(getHeldAgeDays('2026-01-01T00:00:00Z', '2026-03-22T00:00:00Z'), 80);
});

test('warns at 80 days and marks a portion overdue at 90 days', () => {
  assert.deepEqual(getHoldAgeState('2026-01-01T00:00:00Z', '2026-03-22T00:00:00Z'), {
    ageDays: 80,
    warning: true,
    overdue: false,
    daysRemaining: 10,
  });
  assert.equal(
    getHoldAgeState('2026-01-01T00:00:00Z', '2026-04-01T00:00:00Z').overdue,
    true,
  );
});
