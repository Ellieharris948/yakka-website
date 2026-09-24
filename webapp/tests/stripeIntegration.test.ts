import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function read(file: string) {
  return fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
}

test('Checkout is Pay by Bank only and shows the required statement descriptor', () => {
  const checkout = read('supabase/functions/create-stripe-checkout/index.ts');
  assert.match(checkout, /payment_method_types:\s*\['pay_by_bank'\]/);
  assert.match(checkout, /payment_intent_data:\s*\{[\s\S]*?statement_descriptor:\s*'YAKKA'/);
  assert.doesNotMatch(checkout, /pay_by_bank:\s*\{\s*statement_descriptor/);
  assert.match(checkout, /clientFeeCents/);
  assert.doesNotMatch(checkout, /destination\s*:/);
});

test('production Stripe calls use the official SDK instead of raw HTTP', () => {
  const functionFiles = [
    'supabase/functions/create-stripe-checkout/index.ts',
    'supabase/functions/create-stripe-connect-account/index.ts',
    'supabase/functions/get-stripe-connect-status/index.ts',
    'supabase/functions/payout/index.ts',
    'supabase/functions/resolve-dispute/index.ts',
    'supabase/functions/reconcile-payments/index.ts',
    'supabase/functions/stripe-webhook/index.ts',
  ];
  for (const file of functionFiles) {
    assert.doesNotMatch(read(file), /https:\/\/api\.stripe\.com/);
  }
  assert.match(read('supabase/functions/_shared/stripe.ts'), /npm:stripe@22\.4\.0/);
});

test('webhooks use Stripe verification and an atomic database claim', () => {
  const webhook = read('supabase/functions/stripe-webhook/index.ts');
  assert.match(webhook, /constructStripeEvent/);
  assert.match(webhook, /rpc_claim_stripe_webhook/);
  assert.doesNotMatch(webhook, /JSON\.parse\(raw\)/);
  assert.match(webhook, /eventType === 'refund\.updated'/);
  assert.match(webhook, /recordRefundStatus/);
});

test('every transfer and refund path has a stable idempotency key', () => {
  const payout = read('supabase/functions/payout/index.ts');
  const dispute = read('supabase/functions/resolve-dispute/index.ts');
  assert.match(payout, /partial-release-\$\{request\.id\}/);
  assert.match(payout, /final-release-\$\{pay\.id\}/);
  assert.match(dispute, /dispute-\$\{dispute\.id\}-transfer-v1/);
  assert.match(dispute, /dispute-\$\{dispute\.id\}-refund-v1/);
  assert.doesNotMatch(payout, /source_transaction:\s*pay\.stripe_charge_id\s*\|\|\s*undefined/);
  assert.match(payout, /source_transaction:\s*sourceChargeId/);
});

test('the database migration installs the ledger, audit, ageing, and reconciliation records', () => {
  const migration = read('supabase/migrations/20260902120000_stripe_ledger_and_dispute_resolution.sql');
  for (const required of [
    'payment_ledgers',
    'payment_ledger_portions',
    'payment_admin_audit',
    'payment_portions_nearing_90_days',
    'payment_reconciliation_runs',
    'payment_reconciliation_issues',
    'refund_pending',
    'customer_refund_requested_cents',
  ]) {
    assert.match(migration, new RegExp(required));
  }
});

test('historical funded payments receive a ledger without resetting their holding clock', () => {
  const migration = read('supabase/migrations/20260904110000_backfill_funded_payment_ledgers.sql');
  assert.match(migration, /payment\.status::text = 'funded'/);
  assert.match(migration, /coalesce\(payment\.received_at, payment\.held_since, payment\.created_at\)/);
  assert.match(migration, /on conflict \(payment_id\) do nothing/);
  assert.match(migration, /on conflict \(ledger_id, portion_key\) do nothing/);
});

test('legacy database functions use a pinned trusted search path', () => {
  const migration = read('supabase/migrations/20260904120000_harden_legacy_function_search_paths.sql');
  assert.match(migration, /namespace\.nspname = 'public'/);
  assert.match(migration, /search_path = public, extensions, pg_temp/);
  assert.match(migration, /function_row\.oid::regprocedure/);
});

test('legacy definer functions and public media buckets cannot be enumerated anonymously', () => {
  const migration = read('supabase/migrations/20260904121500_harden_legacy_execute_and_storage_listing.sql');
  assert.match(migration, /revoke execute on function %s from public, anon/);
  assert.match(migration, /grant execute on function public\.rpc_phone_available\(text\) to anon, authenticated/);
  assert.match(migration, /drop policy if exists avatars_public_read/);
  assert.match(migration, /drop policy if exists job_images_public_read/);
});

test('admin access is backend-controlled and chat evidence is limited to disputed jobs', () => {
  const migration = read('supabase/migrations/20260902120000_stripe_ledger_and_dispute_resolution.sql');
  const dashboard = read('src/screens/AdminDashboard.tsx');
  const resolver = read('supabase/functions/resolve-dispute/index.ts');
  const reconciliation = read('supabase/functions/reconcile-payments/index.ts');
  const disputeRepair = read('supabase/migrations/20260904113000_repair_dispute_submission_fields.sql');
  assert.match(migration, /protect_yakka_admin_role/);
  assert.match(migration, /Only the YAKKA backend can manage admin access/);
  assert.match(migration, /yakka_admin_read_dispute_messages/);
  assert.match(migration, /where dispute\.job_id = messages\.job_id/);
  assert.match(migration, /alter table public\.webhook_events enable row level security/);
  assert.match(dashboard, /profile\?\.role === 'admin'/);
  assert.match(dashboard, /Conversation evidence/);
  assert.match(dashboard, /Confirm transfer and refund/);
  assert.match(dashboard, /from\('disputes'\)[\s\S]{0,160}order\('submitted_at'/);
  assert.match(resolver, /from\('disputes'\)[\s\S]{0,160}order\('submitted_at'/);
  assert.match(reconciliation, /from\('disputes'\)[\s\S]{0,220}order\('submitted_at'/);
  assert.match(disputeRepair, /add column if not exists submitted_at timestamptz/);
  assert.match(disputeRepair, /next_dispute_request_number/);
});
