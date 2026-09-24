import { test, expect } from '@playwright/test';

function randomUser() {
  const suffix = Math.random().toString(36).slice(2, 10);
  return {
    username: `e2e_${suffix}`,
    email: `e2e_${suffix}@vitest.local`,
    password: 'password123',
  };
}

async function registerAndLand(page: import('@playwright/test').Page) {
  const user = randomUser();
  await page.goto('/login');
  await page.getByRole('button', { name: 'Create one now' }).click();
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign Up' }).click();
  await expect(page).toHaveURL(/\/portfolio$/);
  return user;
}

test('the 3D scene mounts a WebGL canvas without a console error, and edit mode reveals the add-artwork hint', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await registerAndLand(page);

  // Scene3D appends its own <canvas> to the .scene container on mount.
  await expect(page.locator('.scene canvas')).toBeVisible();

  await page.getByRole('switch').click();
  await expect(page.getByText(/click the yellow sphere/i)).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('settings page updates the username end to end', async ({ page }) => {
  const user = await registerAndLand(page);

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  const newUsername = `${user.username}_renamed`;
  const usernameInput = page.locator('.settings-section', { hasText: 'Username' }).locator('input');
  await usernameInput.fill(newUsername);
  await page.locator('.settings-section', { hasText: 'Username' }).getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Saved')).toBeVisible();
});

test('settings page rejects deleting the account with the wrong password', async ({ page }) => {
  await registerAndLand(page);
  await page.goto('/settings');

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('.settings-section-danger input').fill('definitely-wrong');
  await page.getByRole('button', { name: 'Delete account' }).click();

  await expect(page.getByText(/incorrect|failed to delete/i)).toBeVisible();
  // Still logged in - a failed deletion must not log the user out.
  await expect(page).toHaveURL(/\/settings$/);
});
