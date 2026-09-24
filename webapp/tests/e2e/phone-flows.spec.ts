import { test, expect, type Page } from '@playwright/test';
import { prepare, withinViewport } from './helpers/layoutFixture';

async function noClippedControls(page: Page) {
  // Inspect actual labels, not only the document's width: clipped children
  // can be invisible even when the outer page never scrolls sideways.
  const clipped = await page.locator('button,[role="button"],[role="tab"]').evaluateAll(elements =>
    elements.flatMap(element => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight) return [];
      return [...element.querySelectorAll('div,span')].flatMap(child => {
        if (child.children.length || !child.textContent?.trim()) return [];
        const style = getComputedStyle(child);
        return style.textOverflow === 'ellipsis' && child.scrollWidth > child.clientWidth + 1
          ? [child.textContent] : [];
      });
    }));
  expect(clipped).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(page.viewportSize()!.width);
}

test('job dates reject completion before the start', async ({ page }) => {
  await prepare(page, 'trader');
  await page.goto('/');
  await page.getByRole('button', { name: 'Create a new job', exact: true }).click();
  await page.getByPlaceholder('e.g. Living-room refurbishment').fill('Kitchen renovation');
  const start = page.getByLabel('Proposed start date', { exact: true });
  const end = page.getByLabel('Expected completion date', { exact: true });
  const next = page.getByRole('button', { name: 'Add job breakdown', exact: true });
  await start.fill('04/10/2027');
  await end.fill('03/10/2027');
  await next.click();
  await expect(page.getByText('Add a job title and valid dates. Completion must be on or after the proposed start.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Ok', exact: true }).click();
  await end.fill('05/10/2027');
  await expect(next).toBeEnabled();
});

test('messages shows one simple start-job action before work begins', async ({ page }) => {
  await prepare(page, 'trader', 1, true, {
    status: 'funded',
    started_trader: false,
    started_client: false,
  });
  await page.goto('/');
  await page.getByRole('tab', { name: /messages/i }).click();
  await page.getByRole('button', { name: 'Open messages with Sam Taylor for Kitchen tap replacement 1', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start job', exact: true })).toHaveCount(1);
  await expect(page.getByText(/Ready to begin|client will need to confirm|Waiting for the trader/)).toHaveCount(0);
});

test('photo uploads infer before, progress and completion stages', async ({ page }) => {
  await prepare(page, 'trader', 1, true, {
    status: 'in_progress',
    start_date: '2026-09-18',
    end_date: '2026-09-20',
  });
  await page.goto('/');
  await page.getByRole('tab', { name: /messages/i }).click();
  await page.getByRole('button', { name: 'Open messages with Sam Taylor for Kitchen tap replacement 1', exact: true }).click();
  await page.getByRole('button', { name: 'Attach job photo', exact: true }).click();
  await expect(page.getByText('Progress photos', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Choose image stage')).toHaveCount(0);
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await page.getByRole('button', { name: 'Mark job complete', exact: true }).click();
  await expect(page.getByText('Upload at least one photo of the finished work before marking the job complete.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Upload completed photo', exact: true }).click();
  await expect(page.getByText('Completed-work photos', { exact: true })).toBeVisible();
});

for (const scale of [1, 1.25, 1.6]) {
  for (const role of ['client', 'trader'] as const) {
    test(`${role} ${scale}: job details and chat at narrow phone width`, async ({ page }, info) => {
      await page.setViewportSize({ width: 320, height: 568 });
      await prepare(page, role, scale);
      await page.goto('/');
      const details = page.getByRole('button', { name: 'View job', exact: true }).first();
      await details.click();
      await expect(page.getByText('Original quote', { exact: true })).toBeVisible();
      await page.getByText('Original quote', { exact: true }).scrollIntoViewIfNeeded();
      await noClippedControls(page);
      await page.screenshot({ path: info.outputPath('job-details.png') });
      await page.goto('/');
      await page.getByRole('tab', { name: /messages/i }).click();
      await page.getByRole('button', { name: 'Open messages with Sam Taylor for Kitchen tap replacement 1', exact: true }).click();
      const message = page.getByText('The replacement tap is ready. Please confirm the agreed date.', { exact: true });
      await expect(message.last()).toBeInViewport();
      await noClippedControls(page);
      const input = page.getByPlaceholder('Message Sam Taylor...');
      await input.fill('A locally drafted message');
      await withinViewport(input, page);
      await page.screenshot({ path: info.outputPath('chat.png') });
    });
  }

  test(`${scale}: tradie job form and breakdown remain usable`, async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await prepare(page, 'trader', scale);
    await page.goto('/');
    await page.getByRole('button', { name: 'Create a new job', exact: true }).click();
    await page.getByPlaceholder('e.g. Living-room refurbishment').fill('Kitchen renovation');
    await page.getByLabel('Proposed start date', { exact: true }).fill('01/10/2026');
    await page.getByLabel('Expected completion date', { exact: true }).fill('03/10/2026');
    const next = page.getByRole('button', { name: 'Add job breakdown', exact: true });
    await next.scrollIntoViewIfNeeded();
    await withinViewport(next, page);
    await noClippedControls(page);
    await page.screenshot({ path: info.outputPath('create-job.png') });
    await next.click();
    await noClippedControls(page);
    await page.screenshot({ path: info.outputPath('breakdown-help.png') });
  });

  test(`${scale}: checkout agreements and action remain readable`, async ({ page }, info) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await prepare(page, 'client', scale, true, {
      vat_registered: true,
      vat_registration_number: 'GB123456789',
      vat_rate_bps: 2_000,
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Pay now', exact: true }).first().click();
    await expect(page.getByText('VAT number: GB 123 4567 89', { exact: true })).toBeVisible();
    const vatCheck = page.getByRole('button', { name: 'Check VAT number on GOV.UK', exact: true });
    await expect(vatCheck).toBeVisible();
    await vatCheck.scrollIntoViewIfNeeded();
    await withinViewport(vatCheck, page);
    await noClippedControls(page);
    await page.screenshot({ path: info.outputPath('vat-check.png') });
    const pay = page.getByRole('button', { name: 'Confirm & pay', exact: true });
    await expect(pay).toBeDisabled();
    for (const box of await page.getByRole('checkbox', { name: /^I (have reviewed|accept Yakka|understand)/ }).all()) await box.click();
    await expect(pay).toBeEnabled();
    await pay.scrollIntoViewIfNeeded();
    await withinViewport(pay, page);
    await noClippedControls(page);
    await page.screenshot({ path: info.outputPath('checkout.png') });
  });
}
