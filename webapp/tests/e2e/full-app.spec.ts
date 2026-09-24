import { remoteE2EEnabled } from './helpers/remoteSafety';
import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

type Json = Record<string, any>;

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
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const clientEmail = `yakka-test-e2e-client-${runId}@example.com`;
const onboardingEmail = `yakka-test-e2e-onboarding-${runId}@example.com`;
const traderEmail = `yakka-test-e2e-trader-${runId}@example.com`;
const onboardingPhone = `07700900${String(Date.now()).slice(-3)}`;
const password = 'YakkaTest!42';
const jobTitle = `E2E kitchen tap ${runId}`;
const initialMessage = `I have the replacement tap ready (${runId}).`;
const sentMessage = `Thanks, see you tomorrow (${runId}).`;

let clientId = '';
let onboardingUserId = '';
let traderId = '';
let jobId = '';
let webhookEventIds: string[] = [];

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

async function adminCreateUser(email: string, role: 'client' | 'trader', name: string) {
  const body = await requestJson(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { role, name, full_name: name },
    }),
  });
  return body.id as string;
}

async function signIn(email: string) {
  return requestJson(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
}

async function upsertProfile(id: string, email: string, role: 'client' | 'trader', name: string) {
  await requestJson(`${supabaseUrl}/rest/v1/profiles?on_conflict=id`, {
    method: 'POST',
    headers: serviceHeaders({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify({ id, email, role, name, country_code: 'GB' }),
  });
}

async function seedConversation() {
  traderId = await adminCreateUser(traderEmail, 'trader', 'E2E Tradie');
  await upsertProfile(traderId, traderEmail, 'trader', 'E2E Tradie');

  const jobs = await requestJson(`${supabaseUrl}/rest/v1/jobs`, {
    method: 'POST',
    headers: serviceHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({
      trader_id: traderId,
      client_id: clientId,
      title: jobTitle,
      description: 'Disposable automated test job. Safe to delete.',
      price_cents: 100,
      currency: 'GBP',
      duration_days: 1,
      planned_start_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
      flex_days: 1,
      country_code: 'GB',
      status: 'accepted',
    }),
  });
  jobId = jobs[0].id;

  await requestJson(`${supabaseUrl}/rest/v1/job_items`, {
    method: 'POST',
    headers: serviceHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({
      job_id: jobId,
      title: 'Replace tap',
      description: 'Automated payment test item',
      qty: 1,
      price_cents: 100,
    }),
  });

  await requestJson(`${supabaseUrl}/rest/v1/messages`, {
    method: 'POST',
    headers: serviceHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify({ job_id: jobId, sender_id: traderId, body: initialMessage }),
  });
}

async function deleteRows(table: string, query: string) {
  if (!query) return;
  await requestJson(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: serviceHeaders(),
  }, [200, 204]);
}

async function deleteUser(id: string) {
  if (!id) return;
  await requestJson(`${supabaseUrl}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: serviceHeaders(),
  }, [200, 204]);
}

async function clickMessagesTab(page: Page) {
  const tab = page.getByRole('tab', { name: /messages/i });
  if (await tab.count()) {
    await tab.click();
    return;
  }
  await page.locator('[role="tab"]').nth(1).click();
}

test.describe('YAKKA full app test', () => {
  test.beforeAll(async () => {
    clientId = await adminCreateUser(clientEmail, 'client', 'E2E Client');
    await upsertProfile(clientId, clientEmail, 'client', 'E2E Client');
    await seedConversation();
  });

  test.afterAll(async () => {
    for (const eventId of webhookEventIds) {
      await deleteRows('webhook_events', `id=eq.${eventId}`);
    }
    if (jobId) await deleteRows('jobs', `id=eq.${jobId}`);
    await deleteUser(traderId);
    await deleteUser(clientId);
    await deleteUser(onboardingUserId);
  });

  test('customer onboarding creates a usable signed-in account', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'CREATE AN ACCOUNT' })).toBeVisible();
    await page.getByRole('button', { name: 'CREATE AN ACCOUNT' }).click();
    await page.getByRole('button', { name: 'CUSTOMER' }).click();

    const inputs = page.locator('input:visible');
    await inputs.nth(0).fill('Alex');
    await inputs.nth(1).fill('E2E Client');
    await inputs.nth(2).fill(onboardingEmail);
    await inputs.nth(3).fill(onboardingPhone);
    await inputs.nth(4).fill(password);
    await inputs.nth(5).fill(password);
    await page.getByRole('checkbox').click();
    await expect(page.getByRole('button', { name: 'CREATE ACCOUNT' })).toBeEnabled();
    await page.getByRole('button', { name: 'CREATE ACCOUNT' }).click();

    await expect(page.getByText(/Welcome Alex/i)).toBeVisible();
    await page.getByRole('button', { name: /^skip$/i }).click();
    await expect(page.getByText(/Create (?:a )?job/i).first()).toBeVisible();

    const session = await signIn(onboardingEmail);
    onboardingUserId = session.user.id;
  });

  test('messages list and chat are polished and send real messages', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    await page.locator('input:visible').nth(0).fill(clientEmail);
    await page.locator('input:visible').nth(1).fill(password);
    await page.getByRole('button', { name: 'LOG IN' }).click();
    await expect(page.getByText(/Create (?:a )?job/i).first()).toBeVisible();

    await clickMessagesTab(page);
    await expect(page.getByText('Messages', { exact: true })).toBeVisible();
    await expect(page.getByText('Swipe down for past job messages')).toBeVisible();
    const conversation = page.getByRole('button', { name: /Open messages with E2E Tradie/i });
    await expect(conversation.getByText(jobTitle)).toBeVisible();
    await expect(conversation.getByText(initialMessage)).toBeVisible();
    await page.screenshot({ path: 'test-results/messages-page.png', fullPage: true });

    await conversation.evaluate(element => (element as HTMLElement).click());
    const composer = page.getByPlaceholder(/Message E2E Tradie/i);
    await expect(composer).toBeVisible();
    await page.screenshot({ path: 'test-results/chat-mobile-page.png', fullPage: true });
    await composer.fill(sentMessage);
    const send = page.getByRole('button', { name: 'Send message' });
    // Wait for persistence, not just the optimistic bubble, before reloading.
    const savedResponse = page.waitForResponse(response =>
      response.url().includes('/rest/v1/messages') && response.request().method() === 'POST');
    await send.click();
    expect((await savedResponse).ok()).toBe(true);
    await expect(page.getByText(sentMessage)).toBeVisible();

    await page.evaluate(() => window.localStorage.setItem('yakka.fontScale', '1.6'));
    await page.reload();
    await clickMessagesTab(page);
    const scaledConversation = page.getByRole('button', { name: /Open messages with E2E Tradie/i });
    await expect(scaledConversation).toBeVisible();
    await scaledConversation.evaluate(element => (element as HTMLElement).click());
    const timelineLabels = [
      page.getByText('Accepted', { exact: true }),
      page.getByText('In progress', { exact: true }),
    ];
    for (const label of timelineLabels) await expect(label).toBeVisible();
    for (const viewport of [{ width: 360, height: 800 }, { width: 430, height: 932 }]) {
      await page.setViewportSize(viewport);
      for (const label of timelineLabels) {
        const labelMetrics = await label.evaluate(element => {
          const target = element as HTMLElement;
          const lineHeight = Number.parseFloat(window.getComputedStyle(target).lineHeight);
          return {
            clientHeight: target.clientHeight,
            clientWidth: target.clientWidth,
            lineHeight,
            scrollHeight: target.scrollHeight,
            scrollWidth: target.scrollWidth,
          };
        });
        expect(labelMetrics.clientHeight).toBeLessThanOrEqual(labelMetrics.lineHeight + 1);
        expect(labelMetrics.scrollHeight).toBeLessThanOrEqual(labelMetrics.clientHeight + 1);
        expect(labelMetrics.scrollWidth).toBeLessThanOrEqual(labelMetrics.clientWidth + 1);
      }
    }

    await expect.poll(async () => {
      const rows = await requestJson(
        `${supabaseUrl}/rest/v1/messages?job_id=eq.${jobId}&body=eq.${encodeURIComponent(sentMessage)}&select=id`,
        { headers: serviceHeaders() },
      );
      return rows.length;
    }).toBe(1);
  });

  test('Stripe Pay by Bank checkout transfers £1 and the webhook funds the job', async ({ page, context }) => {
    await page.goto('/');
    await page.locator('input:visible').nth(0).fill(clientEmail);
    await page.locator('input:visible').nth(1).fill(password);
    await page.getByRole('button', { name: 'LOG IN' }).click();
    await expect(page.getByText(jobTitle, { exact: true }).last()).toBeVisible();
    await page.getByRole('button', { name: 'PAY NOW' }).click();

    await expect(page.getByText('CONFIRM & PAY').first()).toBeVisible();
    const checkboxes = page.getByRole('checkbox', { name: /^I (have reviewed|accept Yakka|understand)/ });
    for (let index = 0; index < await checkboxes.count(); index += 1) {
      await checkboxes.nth(index).click();
    }

    let paymentDialog = '';
    page.on('dialog', async dialog => {
      paymentDialog = dialog.message();
      await dialog.dismiss();
    });
    const checkoutResponsePromise = page.waitForResponse(
      response => response.url().includes('/functions/v1/create-stripe-checkout'),
      { timeout: 30_000 },
    );
    const popupPromise = context.waitForEvent('page', { timeout: 15_000 }).catch(() => null);
    const confirmPayment = page.locator('button:visible').filter({ hasText: 'CONFIRM & PAY' }).last();
    await expect(confirmPayment).toBeEnabled();
    await confirmPayment.evaluate(element => (element as HTMLElement).click());
    const checkoutResponse = await checkoutResponsePromise;
    const checkoutPayload = await checkoutResponse.json().catch(() => ({}));
    expect(
      checkoutResponse.ok(),
      `create-stripe-checkout returned ${checkoutResponse.status()}: ${checkoutPayload?.error || JSON.stringify(checkoutPayload)}`,
    ).toBeTruthy();
    expect(checkoutPayload?.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(checkoutPayload?.sessionId).toMatch(/^cs_test_/);
    expect(checkoutPayload?.paymentMethod).toBe('pay_by_bank');
    const popup = await popupPromise;
    const stripePage = popup || page;
    await Promise.race([
      stripePage.waitForURL(/checkout\.stripe\.com/, { timeout: 20_000 }),
      expect.poll(() => paymentDialog, { timeout: 20_000 }).not.toBe(''),
    ]);
    expect(paymentDialog, `The app reported: ${paymentDialog}`).toBe('');
    await expect(stripePage).toHaveURL(/checkout\.stripe\.com/);
    await expect(stripePage.getByText(/Pay by Bank/i).first()).toBeVisible();
    await expect(stripePage.getByPlaceholder('1234 1234 1234 1234')).toHaveCount(0);
    await stripePage.screenshot({ path: 'test-results/stripe-checkout.png', fullPage: true });

    await stripePage.getByRole('button', { name: 'Lloyds' }).click();
    const continueButton = stripePage.getByRole('button', { name: 'Continue' });
    await expect(continueButton).toBeEnabled();
    await continueButton.click({ noWaitAfter: true });
    await expect.poll(
      () => stripePage.frames().some(frame => frame.url().includes('pay-by-bank.stripe.com/payment')),
      { timeout: 30_000 },
    ).toBe(true);
    const bankHandoffFrame = stripePage.frames().find(frame => frame.url().includes('pay-by-bank.stripe.com/payment'))!;
    await bankHandoffFrame.getByRole('link', { name: /Continue on Web/i }).click({ noWaitAfter: true });
    const authorizeTestPayment = stripePage.getByRole('link', { name: /Authorize test payment/i });
    await expect(authorizeTestPayment).toBeVisible({ timeout: 30_000 });
    await authorizeTestPayment.click({ noWaitAfter: true });

    let fundedPayment: Json | null = null;
    await expect.poll(async () => {
      const rows = await requestJson(
        `${supabaseUrl}/rest/v1/payments?job_id=eq.${jobId}&select=id,status,provider,provider_status,stripe_checkout_session_id,stripe_payment_intent_id,stripe_charge_id&order=created_at.desc&limit=1`,
        { headers: serviceHeaders() },
      );
      fundedPayment = rows[0] || null;
      return {
        status: fundedPayment?.status || '',
        provider: fundedPayment?.provider || '',
        hasIntent: String(fundedPayment?.stripe_payment_intent_id || '').startsWith('pi_'),
        hasCharge: String(fundedPayment?.stripe_charge_id || '').length > 0,
      };
    }, { timeout: 45_000 }).toEqual({
      status: 'funded',
      provider: 'stripe',
      hasIntent: true,
      hasCharge: true,
    });
    expect(fundedPayment?.stripe_checkout_session_id).toBe(checkoutPayload.sessionId);

    await expect.poll(async () => {
      const rows = await requestJson(
        `${supabaseUrl}/rest/v1/payment_ledgers?payment_id=eq.${fundedPayment?.id}&select=status,gross_received_cents,customer_fee_cents,held_cents,transferred_cents,refunded_cents,commission_cents`,
        { headers: serviceHeaders() },
      );
      const ledger = rows[0] || {};
      return {
        status: ledger.status || '',
        gross: ledger.gross_received_cents ?? -1,
        customerFee: ledger.customer_fee_cents ?? -1,
        held: ledger.held_cents ?? -1,
        transferred: ledger.transferred_cents ?? -1,
        refunded: ledger.refunded_cents ?? -1,
        commission: ledger.commission_cents ?? -1,
      };
    }, { timeout: 30_000 }).toEqual({
      status: 'held',
      gross: 100,
      customerFee: 2,
      held: 100,
      transferred: 0,
      refunded: 0,
      commission: 0,
    });

    await expect.poll(async () => {
      const rows = await requestJson(
        `${supabaseUrl}/rest/v1/jobs?id=eq.${jobId}&select=status`,
        { headers: serviceHeaders() },
      );
      return rows[0]?.status || '';
    }, { timeout: 30_000 }).toBe('funded');

    let matchingEvents: Json[] = [];
    await expect.poll(async () => {
      const rows = await requestJson(
        `${supabaseUrl}/rest/v1/webhook_events?provider=eq.stripe&select=id,event_id,event_type,processed_at,payload&order=received_at.desc&limit=30`,
        { headers: serviceHeaders() },
      );
      matchingEvents = rows.filter((row: Json) => JSON.stringify(row.payload).includes(jobId));
      const processedTypes = matchingEvents
        .filter((row: Json) => !!row.processed_at)
        .map((row: Json) => row.event_type)
        .sort();
      return Array.from(new Set(processedTypes));
    }, { timeout: 45_000 }).toEqual([
      'checkout.session.completed',
      'payment_intent.succeeded',
    ]);
    webhookEventIds = matchingEvents.map(row => row.id).filter(Boolean);
    await stripePage.screenshot({ path: 'test-results/stripe-payment-complete.png', fullPage: true });
  });
});
