import { test, expect } from '@playwright/test';

function randomUser() {
  const suffix = Math.random().toString(36).slice(2, 10);
  return {
    username: `e2e_${suffix}`,
    email: `e2e_${suffix}@vitest.local`,
    password: 'password123',
  };
}

test('registers a new account and lands on the portfolio page', async ({ page }) => {
  const user = randomUser();

  await page.goto('/');
  await page.getByRole('button', { name: 'Login' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole('button', { name: 'Create one now' }).click();
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign Up' }).click();

  await expect(page).toHaveURL(/\/portfolio$/);
  await expect(page.getByText('No Artworks Yet')).toBeVisible();
});

test('rejects login with the wrong password and shows an error', async ({ page }) => {
  const user = randomUser();

  // Register first so there's a real account to fail against.
  await page.goto('/login');
  await page.getByRole('button', { name: 'Create one now' }).click();
  await page.getByLabel('Username').fill(user.username);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign Up' }).click();
  await expect(page).toHaveURL(/\/portfolio$/);

  // Clear the session and try logging back in with the wrong password.
  await page.evaluate(() => localStorage.removeItem('token'));
  await page.goto('/login');

  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill('totally-wrong-password');
  await page.getByRole('button', { name: 'Sign In' }).click();

  await expect(page.getByText(/invalid credentials/i)).toBeVisible();
});

test('shows the forgot-password flow without requiring a password field', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Forgot password?' }).click();

  await expect(page.getByText('Reset your password')).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);

  await page.getByLabel('Email').fill('nobody@vitest.local');
  await page.getByRole('button', { name: 'Send reset link' }).click();

  await expect(page.getByText(/reset link has been sent/i)).toBeVisible();
});

test('public profile for a nonexistent user shows an error state', async ({ page }) => {
  await page.goto('/u/definitely_not_a_real_user_12345');
  await expect(page.getByText("Couldn't load this profile")).toBeVisible();
});

test('home page renders and the layout adapts on a mobile viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.toolbar')).toBeVisible();

  // No horizontal overflow at this viewport - the classic sign of a broken
  // responsive layout.
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(hasOverflow).toBe(false);
});
