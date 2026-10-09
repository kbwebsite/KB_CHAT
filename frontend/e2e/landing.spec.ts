// PE-2K smoke: public landing page. No backend, no account needed.
import { expect, test } from '@playwright/test';
import { expectNoOverflow, FRONTEND_URL } from './fixtures';

test.describe('landing smoke', () => {
  test('loads with primary content', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Connect. Chat. Share.' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /Get Started/ }).first()).toBeVisible();
    expect(pageErrors, 'page errors').toEqual([]);
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    test(`no horizontal overflow at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(
        page.getByRole('heading', { name: 'Connect. Chat. Share.' }),
      ).toBeVisible();
      await expectNoOverflow(page);
    });
  }

  test('primary links navigate', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Get Started/ }).first().click();
    await expect(page).toHaveURL(/\/signup$/);
    await page.goBack();
    await page.getByRole('link', { name: 'Sign In' }).first().click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('no failed same-origin requests', async ({ page }) => {
    const bad: string[] = [];
    page.on('response', (res) => {
      if (res.status() >= 500 && res.url().startsWith(FRONTEND_URL)) {
        bad.push(`${res.status()} ${new URL(res.url()).pathname}`);
      }
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    expect(bad, 'failed same-origin requests').toEqual([]);
  });
});
