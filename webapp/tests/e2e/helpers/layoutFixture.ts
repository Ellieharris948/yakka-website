import { expect, type Page, type Locator } from '@playwright/test';
import fs from 'node:fs';

// All account data is intercepted locally. These checks never create users,
// send messages, or change records in the connected backend.
const env = fs.readFileSync('.env', 'utf8');
const apiUrl = new URL(env.match(/^EXPO_PUBLIC_SUPABASE_URL=['"]?([^'"\r\n]+)/m)![1]);
export const userId = '00000000-0000-4000-8000-000000000001';
const partnerId = '00000000-0000-4000-8000-000000000002';

export async function prepare(
  page: Page,
  role: 'client' | 'trader',
  scale = 1,
  signedIn = true,
  jobPatch: Record<string, unknown> = {},
) {
  const user = { id: userId, aud: 'authenticated', role: 'authenticated',
    email: 'layout@example.com', user_metadata: { name: 'Alex Morgan', role }, app_metadata: {} };
  const profile = { ...user, name: 'Alex Morgan', role, country_code: 'GB', trader_mode: 'solo',
    phone: '+447700900000', location: 'London', bio: '', tags: [], vat_registered: false };
  const partner = { ...profile, id: partnerId, name: 'Sam Taylor', role: role === 'trader' ? 'client' : 'trader' };
  const jobs = Array.from({ length: 6 }, (_, i) => ({
    id: `00000000-0000-4000-8000-00000000001${i}`, ref_code: `YK000${i}`,
    title: `Kitchen tap replacement ${i + 1}`, description: 'Replace the kitchen tap and check pipework.',
    trader_id: role === 'trader' ? userId : partnerId, client_id: role === 'client' ? userId : partnerId,
    price_cents: 12000, currency: 'GBP', duration_days: 1, status: 'accepted',
    created_at: '2026-09-01T09:00:00Z', planned_start_date: '2026-10-01', start_date: null,
    ...jobPatch,
  }));
  await page.route(`${apiUrl.origin}/**`, async route => {
    const url = new URL(route.request().url());
    let body: unknown = [];
    if (url.pathname === '/auth/v1/user') body = user;
    else if (url.pathname === '/rest/v1/profiles') {
      body = url.searchParams.get('id')?.includes(partnerId) ? [partner] : [profile];
    } else if (url.pathname === '/rest/v1/jobs') {
      body = url.searchParams.has('id') ? jobs.filter(job => url.searchParams.get('id') === `eq.${job.id}`) : jobs;
    } else if (url.pathname === '/rest/v1/messages') {
      body = [{ id: 'layout-message', job_id: jobs[0].id, sender_id: partnerId,
        body: 'The replacement tap is ready. Please confirm the agreed date.', created_at: '2026-09-01T10:00:00Z' }];
    } else if (url.pathname === '/rest/v1/job_items') {
      body = [{ id: 'layout-item', job_id: jobs[0].id, title: 'Replace the kitchen tap',
        description: 'Remove old fittings, install tap and test for leaks.', qty: 1, price_cents: 12000 }];
    }
    if (route.request().headers().accept?.includes('vnd.pgrst.object')) {
      body = Array.isArray(body) ? body[0] ?? null : body;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.routeWebSocket(/supabase/, socket => socket.close());
  await page.addInitScript(({ key, user, scale, signedIn }) => {
    localStorage.setItem('yakka.fontScale', String(scale));
    localStorage.setItem('yakka.colorMode', scale > 1 ? 'dark' : 'light');
    if (signedIn) localStorage.setItem(key, JSON.stringify({
      access_token: 'layout-test-token', refresh_token: 'layout-test-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user,
    }));
  }, { key: `sb-${apiUrl.hostname.split('.')[0]}-auth-token`, user, scale, signedIn });
}

export async function withinViewport(locator: Locator, page: Page) {
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds!.y).toBeGreaterThanOrEqual(-1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
}
