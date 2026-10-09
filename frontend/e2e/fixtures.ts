// KRYZEN PE-2K — shared E2E fixtures and API helpers.
//
// Safety rules (do not weaken):
// - All data is created through supported application APIs against the
//   managed temp backend (see playwright.config.ts). Never point these
//   helpers at a production or shared database.
// - Usernames are unique per run; passwords are synthetic and never logged.
// - Cleanup deletes ONLY records created by the calling test, via the same
//   APIs (unsave message, delete conversation, delete broadcast list).
// - Optional env override: KB_E2E_USERNAME / KB_E2E_PASSWORD reuse one
//   pre-seeded account (e.g. staging) instead of signing up.
import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';

export const FRONTEND_URL =
  process.env.KB_E2E_FRONTEND_URL ?? 'http://localhost:5173';
export const BACKEND_URL =
  process.env.KB_E2E_BACKEND_URL ?? 'http://127.0.0.1:8000';

const PASSWORD = 'E2eTest123';

export function uniqueName(prefix: string): string {
  const rand = Math.floor(Math.random() * 36 ** 4).toString(36);
  return `${prefix}${Date.now().toString(36)}${rand}`.toLowerCase();
}

export interface E2EUser {
  username: string;
  email: string;
  userId: number;
  accessToken: string;
}

/** Sign up through the public API. Returns ids only — never logs secrets. */
export async function apiSignup(
  request: APIRequestContext,
  tag: string,
): Promise<E2EUser> {
  const username = uniqueName(tag);
  const email = `${username}@example.com`;
  const res = await request.post(`${BACKEND_URL}/api/auth/signup`, {
    data: {
      username,
      email,
      display_name: username,
      password: PASSWORD,
      confirm_password: PASSWORD,
    },
  });
  expect(res.ok(), `signup failed for ${username}: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  return {
    username,
    email,
    userId: body.data.user.id as number,
    accessToken: body.data.access_token as string,
  };
}

export function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Authenticate the page's own context via signup (cookies are shared between
 * page.request and the page), then open the chat view.
 *
 * The signup cookie is host-bound to the backend; the SPA runs on the
 * frontend origin, so the test-owned refresh value is bridged across hosts
 * inside this same isolated context (never logged, never leaves the run).
 */
export async function signupAndOpenChat(
  page: Page,
  tag: string,
): Promise<E2EUser> {
  const user = await apiSignup(page.request, tag);
  await openChatWithJarredSession(page, user.userId);
  return user;
}

/**
 * Open /chat using whichever refresh cookie the context jar currently holds.
 * The caller must ensure the jar's kb_refresh belongs to the intended user
 * (sign that user up LAST in this context).
 *
 * When userId is given, the first-run onboarding tour is pre-marked done
 * (`kb_onboarded_<id>`) before navigation, so it can never cover the UI
 * mid-test. Otherwise the tour is dismissed if it appears.
 */
export async function openChatWithJarredSession(page: Page, userId?: number): Promise<void> {
  const context: BrowserContext = page.context();
  const jar = (await context.cookies()).find((c) => c.name === 'kb_refresh');
  expect(jar, 'refresh cookie present in jar').toBeTruthy();
  await context.addCookies([
    {
      name: 'kb_refresh',
      value: jar!.value,
      domain: new URL(FRONTEND_URL).hostname,
      path: '/api/auth',
      httpOnly: true,
      sameSite: 'Lax',
      secure: false,
    },
  ]);
  if (userId !== undefined) {
    await page.addInitScript((id: number) => {
      try {
        localStorage.setItem(`kb_onboarded_${id}`, '1');
      } catch {
        // Storage unavailable; fall back to dismissal below.
      }
    }, userId);
  }
  await page.goto('/chat');
  await dismissOnboarding(page);
  await expectChatReady(page);
}

/** Dismiss the first-run onboarding tour when it appears (fresh contexts). */
export async function dismissOnboarding(page: Page): Promise<void> {
  const skip = page.getByRole('button', { name: 'Skip tour' });
  try {
    if (await skip.isVisible({ timeout: 8000 })) await skip.click();
  } catch {
    // Tour did not appear; nothing to dismiss.
  }
}

/** Stable post-login assertion per form factor (no landmark assumptions). */
export async function expectChatReady(page: Page): Promise<void> {
  const width = page.viewportSize()?.width ?? 1280;
  if (width < 768) {
    await expect(page.getByRole('button', { name: 'Chats' })).toBeVisible();
  } else {
    await expect(page.getByRole('button', { name: 'New Chat' })).toBeVisible();
  }
}

/** POST a 1-1 conversation. Returns the conversation id. */
export async function apiCreateDM(
  request: APIRequestContext,
  token: string,
  peerUsername: string,
): Promise<number> {
  const res = await request.post(`${BACKEND_URL}/api/conversations`, {
    headers: authHeader(token),
    data: { participant_username: peerUsername },
  });
  expect(res.ok(), `create DM failed: ${res.status()}`).toBeTruthy();
  const body = await res.json();
  return body.data.id as number;
}

/** Send a text message. Returns the message id. */
export async function apiSendMessage(
  request: APIRequestContext,
  token: string,
  convId: number,
  content: string,
): Promise<number> {
  const res = await request.post(
    `${BACKEND_URL}/api/conversations/${convId}/messages`,
    { headers: authHeader(token), data: { content } },
  );
  expect(res.ok(), `send message failed: ${res.status()}`).toBeTruthy();
  return (await res.json()).data.id as number;
}

export async function apiSaveMessage(
  request: APIRequestContext,
  token: string,
  messageId: number,
): Promise<void> {
  const res = await request.post(
    `${BACKEND_URL}/api/saved-messages/${messageId}`,
    { headers: authHeader(token) },
  );
  expect(res.ok(), `save message failed: ${res.status()}`).toBeTruthy();
}

/** Assert the document has no horizontal overflow at the current viewport. */
export async function expectNoOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(1);
}
