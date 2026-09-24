import { test, expect } from '@playwright/test';
import { prepare, withinViewport } from './helpers/layoutFixture';

const phones = [
  { width: 320, height: 568 }, { width: 360, height: 800 },
  { width: 390, height: 844 }, { width: 430, height: 932 },
];
for (const role of ['client', 'trader'] as const) {
  for (const viewport of phones) {
    test(`${role}: home and settings at ${viewport.width}`, async ({ page }, info) => {
      await page.setViewportSize(viewport);
      await prepare(page, role);
      await page.goto('/');
      const profileTab = page.getByRole('tab', { name: /profile/i });
      await expect(profileTab).toBeVisible();
      await expect(page.getByText('Kitchen tap replacement 1', { exact: true })).toBeVisible();
      await expect.poll(async () => {
        const hero = (await page.getByTestId('home-actions').boundingBox())!;
        const sheet = (await page.getByTestId('brand-screen-body').boundingBox())!;
        return Math.abs(sheet.y - hero.y - hero.height);
      }).toBeLessThan(1);
      // Navigation renders both active/inactive copies during transitions.
      await expect(profileTab.locator('svg').first()).toHaveAttribute('viewBox', '0 0 24 24');
      const list = page.getByTestId('home-jobs-list');
      // The resting sheet must size the list to the visible space above tabs.
      await expect.poll(async () => {
        const bounds = (await list.boundingBox())!;
        return bounds.y + bounds.height;
      }).toBeLessThanOrEqual(viewport.height - 79);
      await page.screenshot({ path: info.outputPath('home.png') });
      await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
      await expect(page.getByRole('button', { name: 'View job', exact: true }).last()).toBeInViewport();
      const lastJob = page.getByText('Kitchen tap replacement 6', { exact: true });
      await lastJob.scrollIntoViewIfNeeded();
      await expect(lastJob).toBeInViewport();
      await profileTab.click();
      const settings = page.getByRole('button', { name: 'Open app settings', exact: true });
      await expect(settings).toBeVisible();
      await expect(settings.locator('svg')).toHaveCount(1);
      await settings.click();
      await expect(page.getByText('Appearance', { exact: true })).toBeVisible();
      await expect.poll(async () => (await page.getByTestId('brand-screen-body').last().boundingBox())!.height).toBeLessThanOrEqual(59);
      await page.screenshot({ path: info.outputPath('settings.png') });
      const scroll = page.getByTestId('settings-content');
      await scroll.evaluate(element => { element.scrollTop = element.scrollHeight; });
      const logout = page.getByRole('button', { name: 'Log out', exact: true });
      await expect(logout).toBeInViewport();
      await withinViewport(logout, page);
      await withinViewport(scroll, page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    });
  }
}

test('large text, rotation and tablet width keep the same shell and reachable settings', async ({ page }, info) => {
  await prepare(page, 'trader', 1.6);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Create a new job' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enter a job code', exact: true })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: info.outputPath('large-text-home.png') });
  await page.getByRole('tab', { name: /profile/i }).click();
  await page.getByRole('button', { name: 'Open app settings', exact: true }).click();
  await expect.poll(async () => (await page.getByTestId('brand-screen-body').last().boundingBox())!.height).toBeLessThanOrEqual(59);
  for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    const scroll = page.getByTestId('settings-content');
    await scroll.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeInViewport();
    await withinViewport(scroll, page);
    const tabs = page.getByRole('tablist').last();
    await withinViewport(tabs, page);
    expect((await tabs.boundingBox())!.width).toBe(Math.min(520, viewport.width));
    for (const label of ['Home', 'Messages', 'Profile']) {
      const text = tabs.getByText(label, { exact: true });
      expect(await text.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    }
    await page.screenshot({ path: info.outputPath(`large-text-${viewport.width}.png`) });
  }
});

test('short phone with large text can scroll a reset popup to its actions', async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await prepare(page, 'client', 1.6, false);
  await page.goto('/');
  await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  const reset = page.getByRole('button', { name: 'Send email', exact: true });
  await reset.scrollIntoViewIfNeeded();
  await withinViewport(reset, page);
  await page.screenshot({ path: info.outputPath('reset-popup.png') });
});
