import { test, expect, type Page } from '@playwright/test';
import { prepare, userId } from './helpers/layoutFixture';
const jobId = '00000000-0000-4000-8000-000000000010';
async function open(page: Page, role: 'trader' | 'client', proposed = false, capture?: (state: { job: any; changes: any[] }) => void) {
  await prepare(page, role);
  const job: any = { id: jobId, title: 'Kitchen repaint', trader_id: role === 'trader' ? userId : 'partner',
    client_id: role === 'client' ? userId : 'partner', status: 'in_progress', start_date: '2026-09-01',
    duration_days: 5, price_cents: 12000, currency: 'GBP', scope_change_status: proposed ? 'proposed' : null };
  const changes: any[] = proposed ? [{ id: 'scope-test', status: 'proposed', reason: 'Customer requested painting the stairs',
    items: [{ title: 'Paint stairs', qty: 1, price_cents: 10000 }], extra_days: 2, labor_cents: 10000,
    vat_cents: 0, client_fee_cents: 200, total_cents: 10200, created_at: '2026-09-16T10:00:00Z' }] : [];
  const calls: any[] = [];
  capture?.({ job, changes });
  await page.route('**/rest/v1/jobs?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(route.request().headers().accept?.includes('vnd.pgrst.object') ? job : [job]) }));
  await page.route('**/rest/v1/job_scope_changes?**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(changes) }));
  await page.route('**/rest/v1/rpc/rpc_propose_scope_change', route => {
    const body = route.request().postDataJSON(); calls.push(body);
    changes.push({ id: 'new-scope', status: 'proposed', reason: body.p_reason, items: body.p_items, extra_days: body.p_extra_days,
      labor_cents: 15000, vat_cents: 0, client_fee_cents: 300, total_cents: 15300, created_at: '2026-09-16T10:00:00Z' });
    job.scope_change_status = 'proposed';
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(changes[0]) });
  });
  await page.route('**/rest/v1/rpc/rpc_review_scope_change', route => {
    const body = route.request().postDataJSON(); calls.push(body); changes[0].status = body.p_action;
    job.scope_change_status = body.p_action === 'approved' ? 'approved' : null;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(changes[0]) });
  });
  await page.route('**/functions/v1/create-stripe-checkout', route => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Stripe is confirming this payment. YAKKA will update automatically.' }) });
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const viewJob = page.getByRole('button', { name: 'View job', exact: true }).first();
  await viewJob.scrollIntoViewIfNeeded();
  await expect(page.getByTestId('brand-screen-body')).toHaveCSS('top', '0px');
  await viewJob.click();
  await expect(page.getByText('Extra work on this job', { exact: true })).toBeVisible();
  return calls;
}
test('tradie adds priced lines and extra days to the same funded job', async ({ page }) => {
  const calls = await open(page, 'trader');
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Propose extra work', exact: true }).click();
  await page.getByLabel('Reason for extra work', { exact: true }).fill('Customer requested painting the stairs');
  await page.getByLabel('Extra work line 1', { exact: true }).fill('Paint stairs');
  await page.getByLabel('Unit price ex VAT (£) 1', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Add another line', exact: true }).click();
  await page.getByLabel('Extra work line 2', { exact: true }).fill('Extra preparation');
  await page.getByLabel('Unit price ex VAT (£) 2', { exact: true }).fill('50');
  await page.getByLabel('Additional days', { exact: true }).fill('2');
  await expect(page.getByText('Additional customer total: £153.00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Send for customer approval', exact: true }).click();
  await expect(page.getByText('Awaiting customer approval', { exact: true })).toBeVisible();
  expect(calls[0].p_job_id).toBe(jobId); expect(calls[0].p_items).toHaveLength(2);
  await expect(page.getByRole('button', { name: 'Propose extra work', exact: true })).toHaveCount(0);
});
test('customer reviews, approves and pays only the addition', async ({ page }) => {
  const calls = await open(page, 'client', true);
  await expect(page.getByText('Additional payment: £102.00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Approve extra work', exact: true }).click();
  await page.getByRole('button', { name: 'Approve extra work', exact: true }).last().click();
  await expect(page.getByText('Awaiting additional payment', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pay additional £102.00', exact: true }).click();
  await expect(page.getByText('Stripe is confirming this payment. YAKKA will update automatically.', { exact: true })).toBeVisible();
  expect(calls).toEqual([{ p_scope_change_id: 'scope-test', p_action: 'approved' }, { jobId, scopeChangeId: 'scope-test' }]);
});
test('customer can decline without a payment request', async ({ page }) => {
  const calls = await open(page, 'client', true);
  await page.getByRole('button', { name: 'Decline extra work', exact: true }).click();
  await expect(page.getByText('declined', { exact: true })).toBeVisible();
  expect(calls).toEqual([{ p_scope_change_id: 'scope-test', p_action: 'declined' }]);
});

test('a failed proposal preserves the tradie draft and can be retried', async ({ page }) => {
  await open(page, 'trader');
  await page.route('**/rest/v1/rpc/rpc_propose_scope_change', route => route.fulfill({ status: 503,
    contentType: 'application/json', body: JSON.stringify({ message: 'Unable to save this proposal. Please retry.' }) }));
  await page.getByRole('button', { name: 'Propose extra work', exact: true }).click();
  await page.getByLabel('Reason for extra work', { exact: true }).fill('Customer requested painting the stairs');
  await page.getByLabel('Extra work line 1', { exact: true }).fill('Paint stairs');
  await page.getByLabel('Unit price ex VAT (£) 1', { exact: true }).fill('100');
  await page.getByRole('button', { name: 'Send for customer approval', exact: true }).click();
  await expect(page.getByText('Unable to save this proposal. Please retry.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ok', exact: true }).click();
  await expect(page.getByLabel('Extra work line 1', { exact: true })).toHaveValue('Paint stairs');
  await expect(page.getByRole('button', { name: 'Send for customer approval', exact: true })).toBeEnabled();
});

test('a started job stays paused until verified extra funding arrives', async ({ page }) => {
  let state!: { job: any; changes: any[] };
  await open(page, 'trader', true, value => { state = value; });
  await expect(page.getByRole('button', { name: 'Mark job complete', exact: true })).toHaveCount(0);
  state.changes[0].status = 'funded';
  state.changes[0].funded_at = '2026-09-17T12:00:00Z';
  state.job.scope_change_status = null;
  state.job.duration_days = 7;
  await expect(page.getByText('Paid — included in this job', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Propose extra work', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark job complete', exact: true })).toBeVisible();
});
