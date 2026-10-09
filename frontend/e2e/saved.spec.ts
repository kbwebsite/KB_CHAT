// PE-2K saved messages: save via API, open through the panel, land on the
// exact conversation and message. Cleanup removes only this test's rows.
import { expect, test } from '@playwright/test';
import {
  apiCreateDM,
  apiSaveMessage,
  apiSendMessage,
  apiSignup,
  authHeader,
  BACKEND_URL,
  openChatWithJarredSession,
  uniqueName,
} from './fixtures';

test.describe('saved-message navigation', () => {
  test('saved item jumps to its conversation and message', async ({ page }) => {
    // Recipient first: the context cookie jar keeps the LAST signup's
    // refresh cookie, and the UI below must act as the owner.
    const friend = await apiSignup(page.request, 'e2esavef');
    const owner = await apiSignup(page.request, 'e2esaveo');
    const convId = await apiCreateDM(page.request, owner.accessToken, friend.username);
    const marker = `e2e-saved-${uniqueName('m')}`;
    const messageId = await apiSendMessage(page.request, owner.accessToken, convId, marker);
    await apiSaveMessage(page.request, owner.accessToken, messageId);

    // Same context now acts as the owner (its refresh cookie is jarred).
    await openChatWithJarredSession(page, owner.userId);
    try {
      // Desktop form factor: the main-pane header exposes Saved directly
      // (the sidebar overflow menu is a mobile-only header).
      await page.getByRole('button', { name: 'Saved messages' }).click();
      const dialog = page.getByRole('dialog', { name: 'Saved messages' });
      await expect(dialog).toBeVisible();
      await dialog
        .getByRole('button', { name: /Open saved message/ })
        .filter({ hasText: marker })
        .click();
      await expect(page.getByText(marker).first()).toBeVisible();
      await expect(page).toHaveURL(/\/chat$/);
    } finally {
      // Only this test's records, through supported APIs.
      await page.request.delete(`${BACKEND_URL}/api/saved-messages/${messageId}`, {
        headers: authHeader(owner.accessToken),
      });
      await page.request.delete(`${BACKEND_URL}/api/conversations/${convId}`, {
        headers: authHeader(owner.accessToken),
      });
    }
  });
});
