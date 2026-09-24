import { remoteE2EEnabled } from './helpers/remoteSafety';
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

function readEnvFile(file: string) {
  const values: Record<string, string> = {};
  const contents = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#][^=]*)=(.*)$/);
    if (!match) continue;
    values[match[1].trim()] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

const appEnv = readEnvFile('.env');
const edgeEnv = readEnvFile('supabase/.env');
const supabaseUrl = appEnv.EXPO_PUBLIC_SUPABASE_URL;
test.skip(!remoteE2EEnabled(supabaseUrl), 'Remote fixtures require an explicitly selected staging project.');
const anonKey = appEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const serviceRole = edgeEnv.SUPABASE_SERVICE_ROLE;
const stripeSecretKey = edgeEnv.STRIPE_SECRET_KEY;
const stripeTestMode = stripeSecretKey?.startsWith('sk_test_') === true;
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `yakka-test-connect-${runId}@example.com`;
const password = 'YakkaTest!42';

let userId = '';
let connectedAccountId = '';

async function requestJson(url: string, init: RequestInit, expected = [200, 201]) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!expected.includes(response.status)) {
    throw new Error(`${init.method || 'GET'} ${url} returned ${response.status}: ${text}`);
  }
  return body;
}

function serviceHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

test.describe.serial('Stripe Connect verification', () => {
  test.skip(
    !stripeTestMode,
    'Stripe Connect E2E requires STRIPE_SECRET_KEY=sk_test_... so accounts can be verified and removed safely.',
  );

  test.afterAll(async () => {
    if (connectedAccountId && stripeSecretKey?.startsWith('sk_test_')) {
      await fetch(`https://api.stripe.com/v1/accounts/${connectedAccountId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${stripeSecretKey}` },
      });
    }
    if (userId) {
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: serviceHeaders(),
      });
    }
  });

  test('creates a hosted Stripe identity and payout onboarding session', async ({ page }) => {
    const created = await requestJson(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { role: 'trader', name: 'Test Connect Tradie', full_name: 'Test Connect Tradie' },
      }),
    });
    userId = created.id;

    await requestJson(`${supabaseUrl}/rest/v1/profiles?on_conflict=id`, {
      method: 'POST',
      headers: serviceHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify({
        id: userId,
        email,
        role: 'trader',
        name: 'Test Connect Tradie',
        country_code: 'GB',
      }),
    });
    const session = await requestJson(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const authHeaders = {
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };

    const connect = await requestJson(`${supabaseUrl}/functions/v1/create-stripe-connect-account`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        returnUrl: 'https://example.com/connect/return',
        refreshUrl: 'https://example.com/connect/refresh',
      }),
    });
    connectedAccountId = String(connect.accountId || '');
    expect(connectedAccountId).toMatch(/^acct_/);
    expect(connect.url).toMatch(/^https:\/\/connect\.stripe\.com\//);

    const storedAccounts = await requestJson(
      `${supabaseUrl}/rest/v1/stripe_connect_accounts?user_id=eq.${userId}&select=stripe_account_id`,
      { headers: serviceHeaders() },
    );
    expect(storedAccounts).toEqual([{ stripe_account_id: connectedAccountId }]);

    const rawBankDetails = await requestJson(
      `${supabaseUrl}/rest/v1/bank_accounts?user_id=eq.${userId}&select=id`,
      { headers: serviceHeaders() },
    );
    expect(rawBankDetails).toEqual([]);

    const statusResult = await requestJson(`${supabaseUrl}/functions/v1/get-stripe-connect-status`, {
      method: 'POST',
      headers: authHeaders,
      body: '{}',
    });
    expect(statusResult.status.accountId).toBe(connectedAccountId);
    expect(statusResult.status.payoutsEnabled).toBe(false);
    expect(statusResult.status.currentlyDue.length).toBeGreaterThan(0);

    await page.goto(connect.url);
    await expect(page).toHaveURL(/connect\.stripe\.com/);
    await expect(page.locator('body')).toContainText(/Stripe|business|personal|verification/i);
    await page.screenshot({ path: 'test-results/stripe-connect-verification.png', fullPage: true });
  });
});
