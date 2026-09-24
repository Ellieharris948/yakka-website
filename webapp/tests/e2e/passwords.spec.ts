import { remoteE2EEnabled } from './helpers/remoteSafety';
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function envFile(file: string) {
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*([^#][^=]*)=(.*)$/);
    return match ? [[match[1].trim(), match[2].trim().replace(/^(['"])(.*)\1$/, '$2')]] : [];
  }));
}
const env = envFile('.env');
const serviceEnv = envFile('supabase/.env');
const url = env.EXPO_PUBLIC_SUPABASE_URL;
test.skip(!remoteE2EEnabled(url), 'Remote fixtures require an explicitly selected staging project.');
const anon = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, serviceEnv.SUPABASE_SERVICE_ROLE, options);
const initial = 'YakkaInitial!Password42';
const changed = 'YakkaChanged!Password43';

// Recovery URLs contain credentials: never retain browser traces or screenshots.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.describe('Password security', () => {
  let userId = '';
  let email = '';
  test.beforeEach(async () => {
    email = `yakka-test-password-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: initial, email_confirm: true, user_metadata: { role: 'client', name: 'Password test' } });
    if (error || !data.user) throw new Error(`Unable to create disposable password test user: ${error?.code}`);
    userId = data.user.id;
  });
  test.afterEach(async () => {
    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new Error(`Unable to remove disposable password test user: ${error.code}`);
      userId = '';
    }
  });

  test('changing a password requires the current password and replaces login credentials', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(initial);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.getByRole('tab', { name: /profile/i }).click();
    await page.getByRole('button', { name: 'Open app settings', exact: true }).click();
    await page.getByRole('button', { name: 'Change password', exact: true }).click();
    await page.getByLabel('Current password', { exact: true }).fill('incorrect-password');
    await page.getByLabel('New password', { exact: true }).fill(changed);
    await page.getByLabel('Confirm new password', { exact: true }).fill(changed);
    await page.getByRole('button', { name: 'Save new password', exact: true }).click();
    await expect(page.getByText('Your current password is incorrect. Please try again.', { exact: true })).toBeVisible();
    await page.getByLabel('Current password', { exact: true }).fill(initial);
    await page.getByRole('button', { name: 'Save new password', exact: true }).click();
    await page.getByRole('button', { name: 'Ok', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
    const client = createClient(url, anon, options);
    expect((await client.auth.signInWithPassword({ email, password: initial })).error).not.toBeNull();
    expect((await client.auth.signInWithPassword({ email, password: changed })).error).toBeNull();
    await client.auth.signOut();
  });

  test('a real Supabase recovery link keeps the reset screen and updates the password', async ({ page }) => {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: 'yakka://reset-password' } });
    if (error) throw new Error(`Unable to generate test recovery link: ${error.code}`);
    expect(data.properties.redirect_to).toBe('yakka://reset-password');
    const recoveryClient = createClient(url, anon, options);
    const verified = await recoveryClient.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'recovery' });
    if (verified.error || !verified.data.session) throw new Error('Unable to verify disposable recovery token');
    const session = verified.data.session;
    const fragment = new URLSearchParams({ type: 'recovery', access_token: session.access_token, refresh_token: session.refresh_token });
    await page.goto(`/reset-password#${fragment}`);
    await expect(page.getByLabel('New password', { exact: true })).toBeEnabled();
    await page.getByLabel('New password', { exact: true }).fill(changed);
    await page.getByLabel('Confirm new password', { exact: true }).fill(changed);
    await page.getByRole('button', { name: 'Update password', exact: true }).click();
    await page.getByRole('button', { name: 'Ok', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
    expect(new URL(page.url()).hash).toBe('');
    const client = createClient(url, anon, options);
    expect((await client.auth.signInWithPassword({ email, password: initial })).error).not.toBeNull();
    expect((await client.auth.signInWithPassword({ email, password: changed })).error).toBeNull();
    await client.auth.signOut();
  });

  test('forgotten passwords use the correct redirect and expired links cannot save', async ({ page }) => {
    let requested = false;
    await page.route('**/auth/v1/recover**', async route => {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      expect(route.request().postDataJSON().email).toBe(email);
      expect(new URL(route.request().url()).searchParams.get('redirect_to')).toBe('http://127.0.0.1:19006/reset-password');
      requested = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
    await page.getByLabel('Reset email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Send email', exact: true }).click();
    await expect(page.getByText('Check your email', { exact: true })).toBeVisible();
    expect(requested).toBe(true);
    await page.goto('/reset-password#error=access_denied&error_code=otp_expired');
    await expect(page.getByText(/This reset link has expired/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Update password', exact: true })).toBeDisabled();
  });
});
