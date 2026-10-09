// PE-2K follow-up: moderation console end to end. The managed backend
// allowlists ADMIN_EMAIL (config) so one fixed signup yields an admin with
// no manual DB edits. Retries are off: a retry would collide on that fixed
// signup email within the same temp database.
import { expect, test } from '@playwright/test';
import {
  ADMIN_EMAIL,
  apiSignup,
  authHeader,
  BACKEND_URL,
  openChatWithJarredSession,
  uniqueName,
} from './fixtures';

test.describe.configure({ retries: 0 });

test.describe('moderation console', () => {
  test('non-admins bounce off /admin', async ({ page }) => {
    await openChatWithJarredSession(page, (await apiSignup(page.request, 'e2emod')).userId);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/chat$/);
  });

  test('report lands in the queue and resolves from the console', async ({
    page,
  }) => {
    const sender = await apiSignup(page.request, 'e2emods');
    const reporter = await apiSignup(page.request, 'e2emodr');
    const admin = await apiSignup(page.request, 'e2emoda', ADMIN_EMAIL);

    const conv = await (
      await page.request.post(`${BACKEND_URL}/api/conversations`, {
        headers: authHeader(sender.accessToken),
        data: { participant_username: reporter.username },
      })
    ).json();
    const marker = `e2emod${uniqueName('m')}`;
    const sent = await page.request.post(
      `${BACKEND_URL}/api/conversations/${conv.data.id}/messages`,
      { headers: authHeader(sender.accessToken), data: { content: marker } },
    );
    expect(sent.ok()).toBeTruthy();
    const messageId = (await sent.json()).data.id as number;

    const rep = await page.request.post(`${BACKEND_URL}/api/moderation/reports`, {
      headers: authHeader(reporter.accessToken),
      data: { target_type: 'message', target_id: messageId, reason: 'spam' },
    });
    expect(rep.ok()).toBeTruthy();
    const reportId = (await rep.json()).data.id as number;

    // Same context now acts as the admin (signed up last: jar holds admin).
    await openChatWithJarredSession(page, admin.userId);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'Moderation' })).toBeVisible();
    await expect(page.getByText(marker)).toBeVisible();

    await page
      .getByRole('button', { name: `Delete message report ${reportId}` })
      .click();
    await expect(page.getByText(marker)).toBeHidden();

    // Server truth: message soft-deleted, report resolved.
    const queue = await page.request.get(`${BACKEND_URL}/api/moderation/reports?status=all`, {
      headers: authHeader(admin.accessToken),
    });
    const row = ((await queue.json()).data as Array<any>).find((r) => r.id === reportId);
    expect(row?.status).toBe('resolved');
    expect(row?.action_taken).toBe('message_deleted');
  });
});
