import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as payments from '../supabase/functions/_shared/job_payments';

function setup(scopeStatus: string | null = null, jobStatus = 'seller_done') {
  const db: Record<string, any[]> = {
    jobs: [{ id: 'job', client_id: 'client', trader_id: 'trader', status: jobStatus, scope_change_status: scopeStatus }],
    payments: [{ id: 'original', job_id: 'job', status: 'funded', principal_cents: 10000, net_to_seller_cents: 9500, stripe_charge_id: 'ch_original' },
      { id: 'extra', job_id: 'job', scope_change_id: 'scope', status: 'funded', principal_cents: 5000, net_to_seller_cents: 4750, stripe_charge_id: 'ch_extra' }],
    stripe_connect_accounts: [{ user_id: 'trader', stripe_account_id: 'acct_trader' }], profiles: [{ id: 'trader', name: 'Sam' }],
    partial_payment_requests: [{ job_id: 'job', status: 'released', amount_cents: 2000, released_amount_cents: 1900 }],
  };
  const calls: any[] = [], ledgers: any[] = [];
  const admin = { auth: { getUser: async () => ({ data: { user: { id: 'client' } } }) }, from(table: string) {
    let single = false, payload: any; const filters: any[] = [];
    const q: any = { select: () => q, order: () => q, limit: () => q,
      eq(k: string, v: any) { filters.push((r: any) => r[k] === v); return q; },
      in(k: string, values: any[]) { filters.push((r: any) => values.includes(r[k])); return q; },
      maybeSingle() { single = true; return q; }, single() { single = true; return q; },
      update(p: any) { payload = p; return q; },
      then(resolve: any, reject: any) {
        const rows = (db[table] || []).filter(r => filters.every(f => f(r)));
        if (payload) rows.forEach(r => Object.assign(r, payload));
        return Promise.resolve({ data: structuredClone(single ? rows[0] : rows), error: null }).then(resolve, reject);
      },
    }; return q;
  } };
  let handler: any;
  const code = ts.transpileModule(fs.readFileSync('supabase/functions/payout/index.ts','utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    transformers: { before: [context => root => ts.visitNode(root, function visit(node): any {
      return ts.isImportDeclaration(node) ? undefined : ts.visitEachChild(node, visit, context);
    }) as ts.SourceFile] },
  }).outputText.replace(/export\s*\{\s*\};?/g, '');
  vm.runInNewContext(code, { console, Response, Date, ...payments, corsHeaders: {},
    Deno: { env: { get: () => 'secret' }, serve: (fn: any) => handler = fn }, createClient: () => admin,
    getStripeClient: () => ({ accounts: { retrieve: async () => ({ payouts_enabled: true }) }, transfers: {
      create: async (body: any, options: any) => { calls.push({ body, options }); return { id: `tr_${body.source_transaction}` }; },
    } }),
    jsonResponse: (body: any, status = 200) => new Response(JSON.stringify(body), { status }),
    raisePaymentAlert: async () => {}, recordPaymentOperation: async () => {}, recordPartialRelease: async () => {},
    recordFinalRelease: async (...args: any[]) => ledgers.push(args),
  });
  return { db, calls, ledgers, run: () => handler(new Request('http://local/payout', { method: 'POST', headers: { Authorization: 'Bearer client' }, body: JSON.stringify({ jobId: 'job' }) })) };
}
test('final release pays original and extra charges, subtracting partial releases only once', async () => {
  const s = setup(); assert.equal((await s.run()).status, 200);
  assert.deepEqual(s.calls.map(c => c.body.amount), [7600, 4750]);
  assert.deepEqual(s.calls.map(c => c.body.source_transaction), ['ch_original', 'ch_extra']);
  assert.equal(s.db.jobs[0].status, 'completed');
  assert.equal((await s.run()).status, 200); assert.equal(s.calls.length, 2);
});
test('pending approval, additional payment and disputed jobs cannot pay out', async () => {
  for (const state of ['proposed', 'approved']) {
    const s = setup(state); assert.equal((await s.run()).status, 409); assert.equal(s.calls.length, 0);
  }
  const s = setup(null,'disputed'); assert.equal((await s.run()).status, 400); assert.equal(s.calls.length, 0);
});

test('an unfunded or unreconciled addition blocks every transfer', async () => {
  for (const patch of [{ status: 'awaiting_funding' }, { stripe_charge_id: null }, { status: 'disputed' }]) {
    const s = setup();
    Object.assign(s.db.payments[1], patch);
    const response = await s.run();
    assert.equal((await response.json()).payoutPending, true);
    assert.equal(s.calls.length, 0);
    assert.notEqual(s.db.jobs[0].status, 'completed');
  }
});
