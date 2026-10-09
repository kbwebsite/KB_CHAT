// PE-2K follow-up: PWA installability surface (public, no backend needed).
import { expect, test } from '@playwright/test';
import { FRONTEND_URL } from './fixtures';

test.describe('pwa surface', () => {
  test('manifest is served with app identity', async ({ request }) => {
    const res = await request.get(`${FRONTEND_URL}/manifest.webmanifest`);
    expect(res.ok()).toBeTruthy();
    const manifest = await res.json();
    expect(manifest.short_name).toBe('Kryzen');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons?.length).toBeGreaterThanOrEqual(2);
  });

  test('icons are served', async ({ request }) => {
    for (const icon of ['/icon-192.png', '/icon-512.png', '/icon-maskable-512.png']) {
      const res = await request.get(`${FRONTEND_URL}${icon}`);
      expect(res.ok(), icon).toBeTruthy();
      expect(res.headers()['content-type']).toContain('image/png');
    }
  });

  test('landing links the manifest and apple touch icon', async ({ page }) => {
    await page.goto('/');
    const manifest = page.locator('link[rel="manifest"]');
    await expect(manifest).toHaveAttribute('href', '/manifest.webmanifest');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      'href',
      '/icon-192.png',
    );
  });
});
