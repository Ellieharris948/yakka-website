import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import { prepare } from './helpers/layoutFixture';

const env = fs.readFileSync('.env', 'utf8');
const api = new URL(env.match(/^EXPO_PUBLIC_SUPABASE_URL=['"]?([^'"\r\n]+)/m)![1]);
const adminId = '00000000-0000-4000-8000-000000000003';
const reason = 'Photo and conversation evidence support this settlement.';

async function prepareAdmin(page: Page, options: { released?: number; noPayment?: boolean; resolved?: boolean; failure?: boolean; locked?: boolean; missingSetup?: boolean } = {}) {
  const user = { id: adminId, aud: 'authenticated', role: 'authenticated', email: 'admin-test@example.com', user_metadata: {}, app_metadata: {} };
  const job = { id: 'job-admin-test', ref_code: 'YKADMIN', title: 'Disputed kitchen work', client_id: 'customer', trader_id: 'tradie',
    status: options.resolved ? 'completed' : 'disputed', created_at: '2026-09-01T10:00:00Z', price_cents: 10000 };
  const dispute: any = { id: 'dispute-admin-test', job_id: job.id, status: options.resolved ? 'resolved' : 'open',
    summary: 'Kitchen tap still leaks', submitted_at: '2026-09-02T10:00:00Z', request_number: 'DSP-ADMIN-TEST',
    resolution_reason: options.resolved ? reason : null, customer_refund_cents: 4080, tradie_transfer_cents: 5700,
    resolved_by: adminId, resolved_at: '2026-09-03T10:00:00Z', outcome: 'split', stripe_refund_status: 'pending' };
  const payment: any = { id: 'payment-admin-test', job_id: job.id, principal_cents: 10000, client_fee_cents: 200,
    total_cents: 10200, status: options.resolved || options.locked ? 'refund_pending' : 'disputed', stripe_payment_intent_id: 'pi_admin_test', stripe_charge_id: 'ch_admin_test' };
  const requests: any[] = [];
  await page.route(`${api.origin}/**`, async route => {
    const url = new URL(route.request().url());
    const table = url.pathname.split('/').pop();
    if (table === 'dispute_settlement_decisions' && options.missingSetup) return route.fulfill({ status: 404,
      contentType: 'application/json', body: JSON.stringify({ code: 'PGRST205', message: 'Missing settlement table' }) });
    let body: any = [];
    if (url.pathname === '/auth/v1/user') body = user;
    else if (url.pathname === '/auth/v1/logout') body = {};
    else if (url.pathname === '/functions/v1/resolve-dispute') {
      const request = route.request().postDataJSON(); requests.push(request);
      if (options.failure) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'The tradie’s Stripe payout account is not ready.' }) });
      dispute.status = 'resolved'; dispute.resolution_reason = request.reason; job.status = 'completed'; payment.status = 'refund_pending';
      const customerRefundCents = request.customerGrossCents + Math.round(request.customerGrossCents * 0.02);
      const tradieTransferCents = request.tradieGrossCents - Math.ceil(request.tradieGrossCents * 0.05);
      Object.assign(dispute, { customer_refund_cents: customerRefundCents, tradie_transfer_cents: tradieTransferCents });
      body = { ok: true, refundStatus: 'pending', breakdown: { customerRefundCents, tradieTransferCents } };
    } else if (table === 'profiles') body = url.searchParams.get('id')?.startsWith('in.')
      ? [{ id: 'customer', name: 'Case Customer', email: 'customer@example.com' }, { id: 'tradie', name: 'Case Tradie', email: 'tradie@example.com' }]
      : [{ id: adminId, role: 'admin', name: 'Case Admin' }];
    else if (table === 'jobs') body = [job];
    else if (table === 'disputes') body = [dispute];
    else if (table === 'payments') body = options.noPayment ? [] : [payment];
    else if (table === 'partial_payment_requests') body = options.released ? [{ amount_cents: options.released }] : [];
    else if (table === 'dispute_settlement_decisions') body = options.locked ? [{ customer_gross_cents: 4000, tradie_gross_cents: 6000, reason }] : [];
    else if (table === 'dispute_items') body = [{ id: 'claim', title: 'Tap fitting', details: 'The tap leaks at the base after installation.', amount_cents: 10000, evidence_photo_ids: ['photo'] }];
    else if (table === 'job_photos') body = [{ id: 'photo', stage: 'dispute', uploaded_by: 'customer', note: 'Leak at tap base',
      file_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6XAAAAABJRU5ErkJggg==', created_at: '2026-09-02T10:00:00Z' }];
    else if (table === 'messages') body = [{ id: 'message', sender_id: 'tradie', body: 'I can see the leak in your photo.', created_at: '2026-09-02T11:00:00Z' }];
    if (route.request().headers().accept?.includes('vnd.pgrst.object')) body = Array.isArray(body) ? body[0] ?? null : body;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.routeWebSocket(/supabase/, socket => socket.close());
  await page.addInitScript(({ user, key }) => {
    localStorage.setItem('yakka.colorMode', 'light');
    localStorage.setItem(key, JSON.stringify({ access_token: 'local-admin-token', refresh_token: 'local-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user }));
  }, { user, key: `sb-${api.hostname.split('.')[0]}-auth-token` });
  await page.goto('/');
  await expect(page.getByText('YAKKA operations', { exact: true })).toBeVisible();
  return requests;
}

async function openDispute(page: Page) {
  await page.getByRole('button', { name: 'Review dispute', exact: true }).click();
  await expect(page.getByText('Dispute claims', { exact: true })).toBeVisible();
}

test('admin gets dedicated navigation, full evidence and a custom settlement with confirmation', async ({ page }, info) => {
  const requests = await prepareAdmin(page);
  await expect(page.getByRole('tab')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('admin-queue.png') });
  await openDispute(page);
  await expect(page.getByText('The tap leaks at the base after installation.', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Evidence: Leak at tap base' })).toBeVisible();
  await expect(page.getByText('I can see the leak in your photo.', { exact: true })).toBeVisible();
  await page.getByLabel('Customer gross share (£)', { exact: true }).fill('40.00');
  await page.getByLabel('Tradie gross share (£)', { exact: true }).fill('60.00');
  await page.getByLabel('Decision and reason', { exact: true }).fill(reason);
  await page.getByRole('button', { name: 'Review settlement', exact: true }).click();
  await expect(page.getByText(/Customer refund: £40.80/)).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Keep reviewing', exact: true }).click();
  expect(requests).toHaveLength(0);
  await page.getByRole('button', { name: 'Review settlement', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm transfer and refund', exact: true }).click();
  await expect(page.getByText('Settlement recorded', { exact: true })).toBeVisible();
  expect(requests).toEqual([{ jobId: 'job-admin-test', disputeId: 'dispute-admin-test', customerGrossCents: 4000, tradieGrossCents: 6000, reason }]);
  await page.getByRole('button', { name: /^ok$/i }).click();
  await page.getByText('Resolved', { exact: true }).click();
  await page.getByRole('button', { name: 'View decision and evidence', exact: true }).click();
  await expect(page.getByText('Recorded decision', { exact: true })).toBeVisible();
  await expect(page.getByText(reason, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review settlement', exact: true })).toHaveCount(0);
});

for (const preset of ['Refund all', 'Pay tradie all']) {
  test(`${preset} only allocates unreleased funds`, async ({ page }) => {
    const requests = await prepareAdmin(page, { released: 3000 });
    await openDispute(page);
    await page.getByRole('button', { name: preset, exact: true }).click();
    await expect(page.getByLabel('Customer gross share (£)', { exact: true })).toHaveValue(preset === 'Refund all' ? '70.00' : '0.00');
    await expect(page.getByLabel('Tradie gross share (£)', { exact: true })).toHaveValue(preset === 'Pay tradie all' ? '70.00' : '0.00');
    await page.getByLabel('Decision and reason', { exact: true }).fill(reason);
    await page.getByRole('button', { name: 'Review settlement', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm transfer and refund', exact: true }).click();
    await expect(page.getByText('Settlement recorded', { exact: true })).toBeVisible();
    expect(requests[0].customerGrossCents + requests[0].tradieGrossCents).toBe(7000);
  });
}

test('invalid splits and short reasons cannot be submitted', async ({ page }) => {
  const requests = await prepareAdmin(page); await openDispute(page);
  const review = page.getByRole('button', { name: 'Review settlement', exact: true });
  await expect(review).toBeDisabled();
  await page.getByRole('button', { name: 'Refund all', exact: true }).click();
  await page.getByLabel('Decision and reason', { exact: true }).fill('Too short');
  await expect(review).toBeDisabled();
  await page.getByLabel('Decision and reason', { exact: true }).fill(reason);
  for (const amount of ['-1', '10.001', 'NaN', '101', '99']) {
    await page.getByLabel('Customer gross share (£)', { exact: true }).fill(amount);
    await expect(review).toBeDisabled();
  }
  expect(requests).toHaveLength(0);
});

test('unfunded dispute evidence can be reviewed without settlement controls', async ({ page }) => {
  await prepareAdmin(page, { noPayment: true }); await openDispute(page);
  await expect(page.getByText(/Settlement unavailable:/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review settlement', exact: true })).toHaveCount(0);
});

test('provider failure is visible and preserves the open review', async ({ page }) => {
  await prepareAdmin(page, { failure: true }); await openDispute(page);
  await page.getByRole('button', { name: 'Pay tradie all', exact: true }).click();
  await page.getByLabel('Decision and reason', { exact: true }).fill(reason);
  await page.getByRole('button', { name: 'Review settlement', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm transfer and refund', exact: true }).click();
  await expect(page.getByText('Settlement failed', { exact: true })).toBeVisible();
  await expect(page.getByText('The tradie’s Stripe payout account is not ready.', { exact: true })).toBeVisible();
});

test('admin review fits a narrow phone and can return to the queue', async ({ page }, info) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await prepareAdmin(page); await openDispute(page);
  await page.getByRole('button', { name: 'Refund all', exact: true }).click();
  await page.getByLabel('Decision and reason', { exact: true }).fill(reason);
  await page.getByRole('button', { name: 'Review settlement', exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('admin-settlement-phone.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await page.getByRole('button', { name: 'Close review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review dispute', exact: true })).toBeVisible();
});

test('ordinary accounts retain their normal interface and cannot deep-link into admin tools', async ({ page }) => {
  await prepare(page, 'client'); await page.goto('/');
  await expect(page.getByRole('tab', { name: /profile/i })).toBeVisible();
  await expect(page.getByText('YAKKA operations', { exact: true })).toHaveCount(0);
  await page.goto('/admin');
  await expect(page.getByText('Admin only', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review dispute', exact: true })).toHaveCount(0);
});

test('a partially processed settlement reloads as an immutable retry', async ({ page }) => {
  const requests = await prepareAdmin(page, { locked: true }); await openDispute(page);
  await expect(page.getByLabel('Customer gross share (£)', { exact: true })).toHaveValue('40.00');
  await expect(page.getByLabel('Customer gross share (£)', { exact: true })).not.toBeEditable();
  await expect(page.getByLabel('Decision and reason', { exact: true })).not.toBeEditable();
  await expect(page.getByRole('button', { name: 'Refund all', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Review settlement', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm transfer and refund', exact: true }).click();
  await expect(page.getByText('Settlement recorded', { exact: true })).toBeVisible();
  expect(requests[0]).toMatchObject({ customerGrossCents: 4000, tradieGrossCents: 6000, reason });
});

test('pending deployment allows evidence review while preventing unsafe settlements', async ({ page }) => {
  const requests = await prepareAdmin(page, { missingSetup: true }); await openDispute(page);
  await expect(page.getByText(/Payout decisions are temporarily unavailable/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review settlement', exact: true })).toHaveCount(0);
  expect(requests).toHaveLength(0);
});

test('customer outcome shows the recorded custom amounts and refund processing state', async ({ page }) => {
  await prepare(page, 'client');
  await page.route(`${api.origin}/rest/v1/disputes*`, route => route.fulfill({
    contentType: 'application/json', body: JSON.stringify([{ id: 'outcome-dispute', status: 'resolved', outcome: 'split',
      resolution_reason: reason, customer_refund_cents: 4080, tradie_transfer_cents: 5700, stripe_refund_status: 'pending' }]),
  }));
  await page.goto('/dispute/00000000-0000-4000-8000-000000000010/outcome');
  await expect(page.getByText(reason, { exact: true })).toBeVisible();
  await expect(page.getByText('Customer refund: £40.80', { exact: true })).toBeVisible();
  await expect(page.getByText('Tradie transfer after fees: £57.00', { exact: true })).toBeVisible();
  await expect(page.getByText('Refund status: pending', { exact: true })).toBeVisible();
});
