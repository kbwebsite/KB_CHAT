// PE-2K mobile search: open, Escape-close, empty state, no overflow.
// Hardware Back is not emulated in desktop Chromium; Escape is the
// documented equivalent (GlobalSearch wires useEscapeKey).
import { expect, test } from '@playwright/test';
import { expectNoOverflow, signupAndOpenChat, uniqueName } from './fixtures';

test.use({ viewport: { width: 390, height: 844 } });

test.describe('mobile global search', () => {
  test('opens, closes on Escape, shows empty state', async ({ page }) => {
    await signupAndOpenChat(page, 'e2esearch');
    const searchButton = page.getByRole('button', { name: 'Global search' }).first();
    await expect(searchButton).toBeVisible();
    await searchButton.click();

    const dialog = page.getByRole('dialog', { name: 'Global search' });
    await expect(dialog).toBeVisible();
    await expect(
      page.getByPlaceholder('Search people, messages, chats…'),
    ).toBeVisible();

    // Empty state for a query that cannot match anything.
    const gibberish = `zzqx${uniqueName('q')}`;
    await page.getByPlaceholder('Search people, messages, chats…').fill(gibberish);
    await expect(page.getByText('No results found')).toBeVisible();
    await expectNoOverflow(page);

    // Escape closes the top-most search UI without navigating away.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/chat$/);
    await expectNoOverflow(page);
  });
});
