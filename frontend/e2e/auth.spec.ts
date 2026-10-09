// PE-2K auth: login form, authenticated navigation, refresh contract.
import { expect, test } from '@playwright/test';
import {
  apiSignup,
  BACKEND_URL,
  FRONTEND_URL,
  signupAndOpenChat,
} from './fixtures';

test.describe('authentication', () => {
  test('invalid login shows an error and stays put', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('you@example.com').fill('nosuchuser@e2e.local');
    await page.getByPlaceholder('••••••••').fill('WrongPass123');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('signup reaches the chat view authenticated', async ({ page }) => {
    const user = await signupAndOpenChat(page, 'e2eauth');
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByRole('button', { name: 'New Chat' })).toBeVisible();
    // Auth state is usable: the session list answers for this account.
    const me = await page.request.get(`${BACKEND_URL}/api/auth/sessions`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    expect(me.ok()).toBeTruthy();
  });

  test('refresh without a cookie is 401, never a proxy 500', async ({
    browser,
  }) => {
    const backend = await (
      await browser.newContext()
    ).request.post(`${BACKEND_URL}/api/auth/refresh`);
    expect(backend.status(), 'backend-direct refresh').toBe(401);
    expect(await backend.json()).toHaveProperty('detail');

    // Same request through the Vite proxy must be forwarded, not masked.
    const proxied = await (
      await browser.newContext()
    ).request.post(`${FRONTEND_URL}/api/auth/refresh`);
    if (proxied.status() === 500) {
      const health = await (
        await browser.newContext()
      ).request.get(`${BACKEND_URL}/api/health`);
      throw new Error(
        `proxy returned 500 (backend health: ${health.status()}) — ` +
          'request did not reach FastAPI; check backend connectivity, ' +
          'not the auth logic',
      );
    }
    expect(proxied.status(), 'proxied refresh').toBe(401);
  });

  test('refresh with a valid session rotates', async ({ page }) => {
    await apiSignup(page.request, 'e2eref');
    // Backend origin: the signup cookie is host-bound here, so this is the
    // same cookie the browser would send through the proxy.
    const res = await page.request.post(`${BACKEND_URL}/api/auth/refresh`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.data.access_token).toBe('string');
    const setCookie = res.headers()['set-cookie'] ?? '';
    expect(setCookie).toContain('kb_refresh=');
  });
});
