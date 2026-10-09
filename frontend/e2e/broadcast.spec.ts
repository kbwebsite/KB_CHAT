// PE-2K broadcast visibility: accepted-only recipients, truthful
// Sent/Delivered/Read labels from the persisted receipt contract, manual
// refresh, and empty/skipped-recipient cases. Delivery states are never
// fabricated: every label is resolved through the sender-only receipts
// endpoint, and `sent_to` is never treated as proof of delivery.
import { expect, test, type APIRequestContext } from '@playwright/test';
import {
  apiSignup,
  authHeader,
  BACKEND_URL,
  openChatWithJarredSession,
  uniqueName,
} from './fixtures';

async function searchMessageId(
  request: APIRequestContext,
  token: string,
  marker: string,
): Promise<number> {
  const res = await request.get(
    `${BACKEND_URL}/api/messages/search?q=${encodeURIComponent(marker)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(res.ok(), `message search failed: ${res.status()}`).toBeTruthy();
  const items = (await res.json()).data as Array<{ id: number; content: string }>;
  const hit = items.find((m) => (m.content ?? '').includes(marker));
  expect(hit, 'sent broadcast found in recipient inbox').toBeTruthy();
  return hit!.id;
}

test.describe('broadcast visibility', () => {
  // Broadcast lists open only from the sidebar overflow menu, which lives
  // in the mobile header (hidden on desktop): exercise the UI at a mobile
  // viewport. The API contract test below is viewport-independent.
  test.use({ viewport: { width: 390, height: 844 } });

  test('UI send shows truthful delivery progression with manual refresh', async ({
    page,
  }) => {
    const recipient = await apiSignup(page.request, 'e2ebr');
    const owner = await apiSignup(page.request, 'e2ebo');
    await openChatWithJarredSession(page, owner.userId);

    const listName = `e2e bc ${uniqueName('l')}`;
    const marker = `e2ebc${uniqueName('m')}`;
    let listId = 0;
    try {
      await page.getByRole('button', { name: 'More options' }).click();
      await page.getByRole('menuitem', { name: 'Broadcast lists' }).click();
      const dialog = page.getByRole('dialog', { name: 'Broadcast lists' });
      await expect(dialog).toBeVisible();

      await dialog.getByRole('button', { name: 'New broadcast list' }).click();
      await dialog.getByLabel('List name').fill(listName);
      await dialog.getByLabel('Member usernames').fill(`@${recipient.username}`);
      await dialog.getByRole('button', { name: 'Create list' }).click();
      await expect(dialog.getByText(listName, { exact: true })).toBeVisible();
      await expect(dialog.getByText('1 people')).toBeVisible();

      // Only the accepted recipient is visible — nothing invented.
      await dialog
        .getByRole('button', { name: `Show members of ${listName}` })
        .click();
      await expect(dialog.getByText(`@${recipient.username}`)).toBeVisible();

      await dialog.getByLabel(`Message to ${listName}`).fill(marker);
      await dialog.getByRole('button', { name: `Send broadcast to ${listName}` }).click();

      // Fresh send: acknowledged by the server, not yet on any device.
      await dialog
        .getByRole('button', { name: `Show delivery status for the last broadcast to ${listName}` })
        .click();
      await expect(dialog.getByLabel(`${recipient.username}: Sent`)).toBeVisible();

      // Recipient acks through supported APIs; manual refresh must show it.
      const messageId = await searchMessageId(page.request, recipient.accessToken, marker);
      const delivered = await page.request.post(
        `${BACKEND_URL}/api/messages/${messageId}/delivered`,
        { headers: authHeader(recipient.accessToken) },
      );
      expect(delivered.ok()).toBeTruthy();
      const read = await page.request.post(
        `${BACKEND_URL}/api/messages/${messageId}/read`,
        { headers: authHeader(recipient.accessToken) },
      );
      expect(read.ok()).toBeTruthy();

      await dialog.getByRole('button', { name: 'Refresh delivery status' }).click();
      await expect(dialog.getByLabel(`${recipient.username}: Read`)).toBeVisible();

      const lists = await page.request.get(`${BACKEND_URL}/api/broadcasts`, {
        headers: authHeader(owner.accessToken),
      });
      listId = ((await lists.json()).data as Array<{ id: number; name: string }>).find(
        (l) => l.name === listName,
      )!.id;
    } finally {
      if (listId) {
        await page.request.delete(`${BACKEND_URL}/api/broadcasts/${listId}`, {
          headers: authHeader(owner.accessToken),
        });
      }
    }
  });

  test('API: accepted-only recipients, receipts contract, empty cases', async ({
    page,
  }) => {
    const recipient = await apiSignup(page.request, 'e2ebr2');
    const owner = await apiSignup(page.request, 'e2ebo2');
    const O = authHeader(owner.accessToken);
    const R = authHeader(recipient.accessToken);
    const listIds: number[] = [];
    try {
      // Unknown usernames are skipped; unknown-only creation is rejected.
      const mixed = await page.request.post(`${BACKEND_URL}/api/broadcasts`, {
        headers: O,
        data: {
          name: `e2e mix ${uniqueName('x')}`,
          member_usernames: [recipient.username, 'ghost_nonexistent_xyz'],
        },
      });
      expect(mixed.status()).toBe(200);
      const listId = (await mixed.json()).data.id as number;
      listIds.push(listId);

      const members = await page.request.get(
        `${BACKEND_URL}/api/broadcasts/${listId}/members`,
        { headers: O },
      );
      const usernames = ((await members.json()).data.members as Array<{ username: string }>).map(
        (m) => m.username,
      );
      expect(usernames).toEqual([recipient.username]);

      const ghostOnly = await page.request.post(`${BACKEND_URL}/api/broadcasts`, {
        headers: O,
        data: { name: 'ghost list', member_usernames: ['ghost_nonexistent_xyz'] },
      });
      expect(ghostOnly.status()).toBe(400);

      const marker = `e2ebc${uniqueName('m')}`;
      const send = await page.request.post(
        `${BACKEND_URL}/api/broadcasts/${listId}/send`,
        { headers: O, data: { content: marker } },
      );
      expect(send.status()).toBe(200);
      const sent = await send.json();
      expect(sent.data.sent_to).toEqual([recipient.userId]);
      const messageId = sent.data.sent[0].message_id as number;

      // No fabrication: untouched message has no delivery/read entries.
      const receipts = await page.request.get(
        `${BACKEND_URL}/api/messages/${messageId}/receipts`,
        { headers: O },
      );
      expect(receipts.status()).toBe(200);
      const rd = await receipts.json();
      expect(rd.data.read ?? []).toEqual([]);
      expect(rd.data.delivered ?? []).toEqual([]);
      // Sender-only: the recipient cannot view them.
      const forbidden = await page.request.get(
        `${BACKEND_URL}/api/messages/${messageId}/receipts`,
        { headers: R },
      );
      expect(forbidden.status()).toBe(403);

      // Skipped recipient (removed member): success with an empty send.
      const removed = await page.request.delete(
        `${BACKEND_URL}/api/broadcasts/${listId}/members/${recipient.userId}`,
        { headers: O },
      );
      expect(removed.status()).toBe(200);
      const resend = await page.request.post(
        `${BACKEND_URL}/api/broadcasts/${listId}/send`,
        { headers: O, data: { content: marker } },
      );
      expect(resend.status()).toBe(200);
      const resent = await resend.json();
      expect(resent.data.sent_to).toEqual([]);
    } finally {
      for (const id of listIds) {
        await page.request.delete(`${BACKEND_URL}/api/broadcasts/${id}`, {
          headers: O,
        });
      }
    }
  });
});
