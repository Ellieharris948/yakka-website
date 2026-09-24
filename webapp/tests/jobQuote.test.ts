import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureQuoteRows } from '../src/api/jobQuote';

function fixture(existing: any[] = [], fail = false) {
  let inserts = 0;
  return {
    count: () => inserts,
    client: { from: () => ({
      select: () => ({ eq: async () => ({ data: existing, error: null }) }),
      insert: async () => { inserts++; return { error: fail ? new Error('Save failed') : null }; },
    }) },
  };
}
const row = { job_id: 'job', title: 'Paint stairs', price_cents: 10000, qty: 1 };
test('a failed quote-line save is surfaced instead of reporting a complete job', async () => {
  const f = fixture([], true);
  await assert.rejects(ensureQuoteRows(f.client, 'job_items', 'job', [row]), /Save failed/);
});
test('retry after a lost successful response does not insert duplicate lines', async () => {
  const f = fixture([{ ...row, id: 'server-generated', created_at: 'now' }]);
  await ensureQuoteRows(f.client, 'job_items', 'job', [row]);
  assert.equal(f.count(), 0);
});
test('a retry cannot silently accept a different or incomplete saved breakdown', async () => {
  const f = fixture([{ ...row, price_cents: 5000 }]);
  await assert.rejects(ensureQuoteRows(f.client, 'job_items', 'job', [row]), /differs/);
  assert.equal(f.count(), 0);
});
