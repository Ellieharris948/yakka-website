import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { buildSettlementPlan } from '../supabase/functions/_shared/settlement_plan';
import * as payments from '../supabase/functions/_shared/job_payments';

// Execute the actual Edge Function handler with in-memory Supabase and Stripe.
// Only its external adapters are replaced; validation and orchestration are real.
const source = fs.readFileSync('supabase/functions/resolve-dispute/index.ts', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  transformers: { before: [context => root => ts.visitNode(root, function visit(node): any {
    if (ts.isImportDeclaration(node)) return undefined;
    return ts.visitEachChild(node, visit, context);
  }) as ts.SourceFile] },
}).outputText.replace(/export\s*\{\s*\};?/g, '');

function setup(role = 'admin', released = 0) {
  const db: Record<string, any[]> = {
    profiles: [{ id: 'admin', role }],
    jobs: [{ id: 'job', status: 'disputed', ref_code: 'YK123', trader_id: 'tradie' }],
    disputes: [{ id: 'dispute', job_id: 'job', status: 'open' }],
    payments: [{ id: 'payment', job_id: 'job', status: 'disputed', principal_cents: 10000,
      client_fee_cents: 200, stripe_payment_intent_id: 'pi_test', stripe_charge_id: 'ch_test' }],
    partial_payment_requests: released ? [{ job_id: 'job', status: 'released', amount_cents: released }] : [],
    stripe_connect_accounts: [{ user_id: 'tradie', stripe_account_id: 'acct_test', payouts_enabled: true }],
    dispute_settlement_decisions: [], payment_admin_audit: [], dispute_items: [{ dispute_id: 'dispute' }],
  };
  const calls = { transfers: [] as any[], refunds: [] as any[], ledgers: [] as any[], alerts: [] as any[] };
  const failures = { refund: false, ledger: false, table: '' };
  const admin = {
    auth: { getUser: async (token: string) => ({ data: { user: token ? { id: 'admin' } : null }, error: null }) },
    from(table: string) {
      let mode = 'read', payload: any, options: any, single = false;
      const filters: Array<(row: any) => boolean> = [];
      const q: any = {
        select() { return q; }, order() { return q; }, limit() { return q; },
        eq(key: string, value: any) { filters.push(row => row[key] === value); return q; },
        maybeSingle() { single = true; return q; }, single() { single = true; return q; },
        update(value: any) { mode = 'update'; payload = value; return q; },
        upsert(value: any, opts: any) { mode = 'upsert'; payload = value; options = opts; return q; },
        then(resolve: any, reject: any) {
          if (failures.table === table && mode !== 'read') return Promise.resolve({ data: null, error: new Error('Database write failed') }).then(resolve, reject);
          let rows = db[table].filter(row => filters.every(filter => filter(row)));
          if (mode === 'update') rows.forEach(row => Object.assign(row, payload));
          if (mode === 'upsert') {
            const existing = db[table].find(row => row[options.onConflict] === payload[options.onConflict]);
            if (!existing) db[table].push({ created_at: new Date().toISOString(), ...payload });
            else if (!options.ignoreDuplicates) Object.assign(existing, payload);
          }
          return Promise.resolve({ data: structuredClone(single ? rows[0] || null : rows), error: null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
  let handler: (req: Request) => Promise<Response>;
  const stripe = {
    transfers: { create: async (body: any, options: any) => { calls.transfers.push({ body, options }); return { id: 'tr_test' }; } },
    refunds: {
      create: async (body: any, options: any) => {
        calls.refunds.push({ body, options });
        if (failures.refund) throw new Error('Provider refund failed');
        return { id: 're_test', status: 'pending' };
      },
      retrieve: async () => ({ id: 're_test', status: 'pending' }),
    },
  };
  vm.runInNewContext(compiled, {
    exports: {}, console, Response, Date, ...payments, buildSettlementPlan,
    Deno: { env: { get: () => 'test-only' }, serve: (fn: typeof handler) => { handler = fn; } },
    createClient: () => admin, getStripeClient: () => stripe, corsHeaders: {},
    jsonResponse: (body: any, status = 200) => new Response(JSON.stringify(body), { status }),
    recordPaymentOperation: async () => {},
    recordDisputeResolution: async (...args: any[]) => { if (failures.ledger) throw new Error('Ledger unavailable'); calls.ledgers.push(args); },
    raisePaymentAlert: async (_admin: any, alert: any) => { calls.alerts.push(alert); },
  });
  return { db, calls, failures, async run(overrides: Record<string, any> = {}, token = 'test-admin') {
    const response = await handler!(new Request('http://local/resolve-dispute', {
      method: 'POST', headers: { Authorization: token ? `Bearer ${token}` : '' },
      body: JSON.stringify({ jobId: 'job', disputeId: 'dispute', customerGrossCents: 4000,
        tradieGrossCents: 6000 - released, reason: 'Evidence supports a partial customer refund.', ...overrides }),
    }));
    return { status: response.status, body: await response.json() };
  } };
}

test('custom split transfers net proceeds, refunds proportional fee and records decision', async () => {
  const s = setup();
  const result = await s.run();
  assert.equal(result.status, 200);
  assert.equal(s.calls.transfers[0].body.amount, 5700);
  assert.equal(s.calls.refunds[0].body.amount, 4080);
  assert.equal(s.db.disputes[0].outcome, 'split');
  assert.equal(s.db.payments[0].status, 'refund_pending');
  assert.equal(s.db.payment_admin_audit[0].admin_user_id, 'admin');
  assert.equal(s.db.jobs[0].status, 'completed');
});

test('full customer refund works without a tradie payout account', async () => {
  const s = setup(); s.db.stripe_connect_accounts = [];
  assert.equal((await s.run({ customerGrossCents: 10000, tradieGrossCents: 0 })).status, 200);
  assert.equal(s.calls.transfers.length, 0);
  assert.equal(s.calls.refunds[0].body.amount, 10200);
});

test('full tradie payout charges the existing 5 percent and issues no refund', async () => {
  const s = setup();
  assert.equal((await s.run({ customerGrossCents: 0, tradieGrossCents: 10000 })).status, 200);
  assert.equal(s.calls.transfers[0].body.amount, 9500);
  assert.equal(s.calls.refunds.length, 0);
  assert.equal(s.db.payments[0].status, 'released');
});

test('previous partial releases reduce the available settlement principal', async () => {
  const s = setup('admin', 3000);
  assert.equal((await s.run()).status, 200);
  assert.equal(s.calls.transfers[0].body.amount, 2850);
  assert.equal(s.calls.refunds[0].body.amount, 4080);
});

test('unauthenticated and non-admin accounts cannot move money', async () => {
  for (const role of ['client', 'trader']) {
    const s = setup(role);
    assert.equal((await s.run()).status, 403);
    assert.equal(s.calls.transfers.length + s.calls.refunds.length, 0);
  }
  assert.equal((await setup().run({}, '')).status, 401);
});

test('invalid, missing, overallocated and underallocated amounts are rejected', async () => {
  for (const value of [null, true, '', '4000', -1, 1.2, 9999, 3000, Number.MAX_SAFE_INTEGER + 1]) {
    const s = setup();
    assert.equal((await s.run({ customerGrossCents: value })).status, 400, String(value));
    assert.equal(s.calls.transfers.length + s.calls.refunds.length, 0);
  }
  assert.equal((await setup().run({ reason: 'Short' })).status, 400);
});

test('stale dispute and unready payout account are rejected before committing a decision', async () => {
  const s = setup();
  assert.equal((await s.run({ disputeId: 'different-dispute' })).status, 409);
  s.db.stripe_connect_accounts[0].payouts_enabled = false;
  assert.equal((await s.run()).status, 409);
  assert.equal(s.db.dispute_settlement_decisions.length, 0);
});

test('a failed refund locks the decision and retry does not repeat the completed transfer', async () => {
  const s = setup(); s.failures.refund = true;
  assert.equal((await s.run()).status, 500);
  assert.equal(s.calls.transfers.length, 1);
  assert.equal(s.db.disputes[0].status, 'open');
  assert.equal((await s.run({ customerGrossCents: 10000, tradieGrossCents: 0 })).status, 409);
  assert.equal(s.calls.refunds.length, 1);
  s.failures.refund = false;
  assert.equal((await s.run()).status, 200);
  assert.equal(s.calls.transfers.length, 1);
  assert.equal(s.db.disputes[0].status, 'resolved');
  assert.ok(s.calls.alerts.length);
});

test('failed ledger finalization stays retryable after the payment is updated', async () => {
  const s = setup(); s.failures.ledger = true;
  assert.equal((await s.run()).status, 500);
  assert.equal(s.db.disputes[0].status, 'open');
  s.failures.ledger = false;
  assert.equal((await s.run()).status, 200);
  assert.equal(s.calls.transfers.length, 1);
  assert.equal(s.calls.refunds.length, 1);
});

test('failed dispute-item write does not prematurely mark the case resolved', async () => {
  const s = setup(); s.failures.table = 'dispute_items';
  assert.equal((await s.run()).status, 500);
  assert.equal(s.db.disputes[0].status, 'open');
  s.failures.table = '';
  assert.equal((await s.run()).status, 200);
  assert.equal(s.calls.transfers.length, 1);
});

test('old ambiguous attempts require reconciliation and resolved retries move nothing', async () => {
  const s = setup(); s.failures.refund = true;
  await s.run();
  s.db.dispute_settlement_decisions[0].created_at = '2020-01-01T00:00:00Z';
  s.failures.refund = false;
  assert.equal((await s.run()).status, 500);
  assert.equal(s.calls.refunds.length, 1);
  const done = setup(); await done.run();
  assert.equal((await done.run()).body.alreadyResolved, true);
  assert.equal(done.calls.transfers.length, 1);
});

test('competing admins cannot commit different splits for one dispute', async () => {
  const s = setup();
  const results = await Promise.all([s.run(), s.run({ customerGrossCents: 2000, tradieGrossCents: 8000 })]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  assert.equal(s.db.dispute_settlement_decisions.length, 1);
  assert.equal(s.calls.transfers.length, 1);
  assert.equal(s.calls.refunds.length, 1);
});


test('scope change and original charge settle together, retrying only unfinished movements', async () => {
  const s = setup('admin', 2000);
  s.db.payments.push({ id: 'addition', scope_change_id: 'scope', job_id: 'job', status: 'disputed', principal_cents: 5000,
    client_fee_cents: 100, stripe_payment_intent_id: 'pi_extra', stripe_charge_id: 'ch_extra' });
  s.failures.ledger = true;
  assert.equal((await s.run({ customerGrossCents: 6500, tradieGrossCents: 6500 })).status, 500);
  s.failures.ledger = false;
  const result = await s.run({ customerGrossCents: 6500, tradieGrossCents: 6500 });
  assert.equal(result.status, 200);
  assert.equal(s.calls.transfers.length, 2);
  assert.equal(s.calls.refunds.length, 2);
  assert.equal(s.calls.transfers.reduce((a, c) => a + c.body.amount, 0), 6175);
  assert.equal(s.calls.refunds.reduce((a, c) => a + c.body.amount, 0), 6630);
  assert.deepEqual(s.calls.transfers.map(c => c.body.source_transaction), ['ch_test', 'ch_extra']);
  assert.deepEqual(s.calls.refunds.map(c => c.body.payment_intent), ['pi_test', 'pi_extra']);
});

test('an additional payment still processing blocks dispute money movements', async () => {
  const s = setup();
  s.db.payments.push({ id: 'addition', job_id: 'job', status: 'awaiting_funding', principal_cents: 5000 });
  assert.equal((await s.run()).status, 409);
  assert.equal(s.calls.transfers.length + s.calls.refunds.length, 0);
});
