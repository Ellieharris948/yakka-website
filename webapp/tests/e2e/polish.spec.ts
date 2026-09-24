import { remoteE2EEnabled } from './helpers/remoteSafety';
import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

function envFile(path: string) {
  return Object.fromEntries(fs.readFileSync(path, 'utf8').split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*([^#][^=]*)=(.*)$/);
    return match ? [[match[1].trim(), match[2].trim().replace(/^(['"])(.*)\1$/, '$2')]] : [];
  }));
}
const config = envFile('.env');
test.skip(!remoteE2EEnabled(config.EXPO_PUBLIC_SUPABASE_URL), 'Remote fixtures require an explicitly selected staging project.');
const service = envFile('supabase/.env');
const admin = createClient(config.EXPO_PUBLIC_SUPABASE_URL, service.SUPABASE_SERVICE_ROLE,
  { auth: { persistSession: false, autoRefreshToken: false } });
const run = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const password = 'YakkaPolish!Passphrase44';
const emails = { client: `polish-client-${run}@example.com`, trader: `polish-trader-${run}@example.com` };
const ids: string[] = [];
let jobId = '';
const title = `Tap replacement ${run}`;
const incoming = 'The replacement tap is ready. Please confirm our agreed date.';

test.use({ trace: 'off', video: 'off', screenshot: 'only-on-failure' });
test.beforeAll(async () => {
  for (const role of ['client', 'trader'] as const) {
    const { data, error } = await admin.auth.admin.createUser({ email: emails[role], password, email_confirm: true,
      user_metadata: { role, name: role === 'trader' ? 'Polish Tradie' : 'Polish Customer', trader_mode: 'solo' } });
    if (error || !data.user) throw new Error(`Test user setup failed: ${error?.code}`);
    ids.push(data.user.id);
    const profile = await admin.from('profiles').upsert({ id: data.user.id, email: emails[role], role,
      name: role === 'trader' ? 'Polish Tradie' : 'Polish Customer', country_code: 'GB' });
    if (profile.error) throw new Error('Test profile setup failed');
  }
  const result = await admin.from('jobs').insert({ client_id: ids[0], trader_id: ids[1], title,
    description: 'Disposable visual and payment-status test fixture.', price_cents: 12000, currency: 'GBP',
    duration_days: 1, country_code: 'GB', status: 'accepted' }).select('id').single();
  if (result.error) throw new Error(`Test job setup failed: ${result.error.code}`);
  jobId = result.data.id;
  const item = await admin.from('job_items').insert({ job_id: jobId, title: 'Replace kitchen tap', qty: 1, price_cents: 12000 });
  if (item.error) throw new Error('Test job item setup failed');
  const message = await admin.from('messages').insert({ job_id: jobId, sender_id: ids[1], body: incoming });
  if (message.error) throw new Error('Test message setup failed');
});
test.afterAll(async () => {
  if (jobId) {
    const { error } = await admin.from('jobs').delete().eq('id', jobId);
    if (error) throw new Error('Test job cleanup failed');
  }
  for (const id of ids) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error('Test user cleanup failed');
  }
});

async function login(page: Page, role: 'client' | 'trader', mode = 'dark', scale = '1') {
  await page.addInitScript(({ mode, scale }) => {
    localStorage.setItem('yakka.colorMode', mode);
    localStorage.setItem('yakka.fontScale', scale);
  }, { mode, scale });
  await page.goto('/');
  await page.getByLabel('Email', { exact: true }).fill(emails[role]);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('tab', { name: /profile/i })).toBeVisible();
}

async function checkNoHorizontalOverflow(page: Page) {
  const size = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
}

for (const mode of ['light', 'dark']) {
  test(`customer mobile ${mode}: readable chat, complete checkout and saved appearance`, async ({ page }, info) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await login(page, 'client', mode, mode === 'dark' ? '1.6' : '1');
    await expect(page.getByText(title, { exact: true }).last()).toBeVisible();
    await page.screenshot({ path: info.outputPath(`home-${mode}.png`) });
    await page.getByRole('button', { name: 'Pay now', exact: true }).click();
    await expect(page.getByText('£122.40').first()).toBeVisible();
    const pay = page.getByRole('button', { name: 'Confirm & pay', exact: true });
    await expect(pay).toBeDisabled();
    for (const box of await page.getByRole('checkbox', { name: /^I (have reviewed|accept Yakka|understand)/ }).all()) await box.click();
    await expect(pay).toBeEnabled();
    await pay.scrollIntoViewIfNeeded();
    await checkNoHorizontalOverflow(page);
    await page.screenshot({ path: info.outputPath(`checkout-${mode}.png`), fullPage: true });
    // No checkout is submitted by this visual test.
    await page.goto('/');
    await page.getByRole('tab', { name: /messages/i }).click();
    await page.getByRole('button', { name: /Open messages with Polish Tradie/i }).click();
    const message = page.getByText(incoming, { exact: true }).last();
    await expect(message).toBeVisible();
    const colors = await message.evaluate(element => ({
      text: getComputedStyle(element).color,
      background: getComputedStyle(element.parentElement!).backgroundColor,
      font: getComputedStyle(element).fontFamily,
    }));
    expect(colors.font).toContain('Satoshi');
    expect(colors.text).toBe(mode === 'dark' ? 'rgb(247, 241, 235)' : 'rgb(90, 25, 31)');
    if (mode === 'dark') expect(colors.background).toBe('rgb(48, 35, 38)');
    await checkNoHorizontalOverflow(page);
    await page.screenshot({ path: info.outputPath(`chat-${mode}.png`) });
    await page.goto('/');
    await page.getByRole('tab', { name: /profile/i }).click();
    await page.getByRole('button', { name: 'Open app settings', exact: true }).click();
    await expect(page.getByText('Appearance', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: mode === 'dark' ? 'Light' : 'Dark', exact: true }).click();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('yakka.colorMode'))).toBe(mode === 'dark' ? 'light' : 'dark');
    await page.screenshot({ path: info.outputPath(`settings-switched-${mode}.png`) });
  });
}

test('tradie mobile dark: job details and payout setup stay usable', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'trader', 'dark', '1.3');
  await page.getByRole('tab', { name: /messages/i }).click();
  await page.getByRole('button', { name: /Open messages with Polish Customer/i }).click();
  await page.getByRole('button', { name: 'View job', exact: true }).click();
  await expect(page.getByText('Original quote', { exact: true })).toBeVisible();
  await checkNoHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath('tradie-job-dark.png') });
  await page.goto('/BankDetails');
  await expect(page.getByRole('button', { name: 'Set up payouts', exact: true })).toBeVisible();
  await checkNoHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath('tradie-payout-dark.png') });
});

test('bank return waits for confirmed state and cancel returns to usable checkout', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, 'client');
  let status = 'awaiting_funding';
  await page.route('**/rest/v1/payments?**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status, total_cents: 12240 }) });
  });
  await page.goto(`/payment/success?jobId=${jobId}`);
  await expect(page.getByText('Waiting for bank confirmation', { exact: true })).toBeVisible();
  await expect(page.getByText('Payment received', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Return to payment', exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('payment-pending.png') });
  status = 'funded';
  await page.getByRole('button', { name: 'Check payment status', exact: true }).click();
  await expect(page.getByText('Payment received', { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath('payment-confirmed.png') });
  await page.unroute('**/rest/v1/payments?**');
  await page.goto(`/payment/cancel?jobId=${jobId}`);
  await expect(page.getByText('You returned from checkout', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm & pay', exact: true })).toBeDisabled();
});
