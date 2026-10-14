import { test, expect, type Page, type FileChooser } from '@playwright/test';
import path from 'node:path';

const dirname = import.meta.dirname;

function randomUser() {
  const suffix = Math.random().toString(36).slice(2, 10);
  return {
    username: `e2e_${suffix}`,
    email: `e2e_${suffix}@vitest.local`,
    password: 'password123',
  };
}

// Rotates the carousel (via the on-screen buttons) until the given artwork
// title is front-and-center. Which artwork loads first isn't guaranteed
// (same-second uploads only have second-level timestamp precision to order
// by), so callers that need a specific one visible use this instead of
// assuming a default.
async function bringToFront(page: Page, title: string, maxSteps = 3) {
  for (let i = 0; i < maxSteps; i++) {
    if (await page.getByRole('heading', { level: 2, name: title }).isVisible()) return;
    await page.locator('.rotateButtons button').first().click();
    await page.waitForTimeout(300);
  }
  await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
}

async function register(page: Page) {
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

// Uploads a model via the 3D scene's click-to-add flow (native file chooser,
// then the upload dialog: title, publish once processed), waits for
// server-side processing, and returns the artwork id.
async function uploadArtwork(page: Page, fixture: string, title: string): Promise<string> {
  const isEdit = await page.getByRole('switch').getAttribute('aria-checked');
  if (isEdit !== 'true') {
    await page.getByRole('switch').click();
    // The add-artwork sphere is added to the THREE.Scene from a useEffect
    // keyed on `editable`, which commits a moment after the click - give it
    // a beat before raycasting against it.
    await page.waitForTimeout(500);
  }

  const uploadResponsePromise = page.waitForResponse(
    (res) => res.url().endsWith('/api/portfolio/artworks') && res.request().method() === 'POST'
  );

  // Headless Chromium occasionally drops the chooser for a programmatic
  // input.click() - retry the canvas click a few times.
  let fileChooser: FileChooser | null = null;
  for (let attempt = 0; attempt < 4 && !fileChooser; attempt++) {
    const waiting = page.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null);
    await page.locator('.scene canvas').click();
    fileChooser = await waiting;
  }
  expect(fileChooser).not.toBeNull();
  await fileChooser!.setFiles(path.join(dirname, 'fixtures', fixture));

  const dialog = page.getByRole('dialog', { name: 'Upload a model' });
  await dialog.getByLabel('Title').fill(title);
  await dialog.getByRole('button', { name: 'Upload' }).click();

  const uploadResponse = await uploadResponsePromise;
  const body = await uploadResponse.json();

  // The model appears once the server has processed it.
  await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible({ timeout: 30_000 });
  return body.id as string;
}

test.describe('cross-user social features on a public profile', () => {
  // Uploading requires clicking precisely on the 3D add-artwork sphere, which
  // the mobile viewport's stacked single-column layout overlaps with other
  // fixed UI (search bar, sidebar fields) - a layout/interaction concern
  // that's separate from what this suite is testing. Desktop only.
  test.skip(({ isMobile }) => isMobile, 'Uploading via canvas click is desktop-only in this suite');
  // Two accounts, two uploads waiting on server-side processing and several
  // reloads: far more than the default per-test time.
  test.slow();

  test('like/save/comment on another user\'s artwork, and it shows up correctly everywhere', async ({ browser }) => {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    const ownerErrors: string[] = [];
    ownerPage.on('pageerror', (e) => ownerErrors.push(e.message));
    const owner = await register(ownerPage);

    const redId = await uploadArtwork(ownerPage, 'red-triangle.gltf', 'Alpha Artwork');
    const blueId = await uploadArtwork(ownerPage, 'blue-triangle.gltf', 'Beta Artwork');
    expect(redId).not.toBe(blueId);
    expect(ownerErrors).toEqual([]);

    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    const viewerErrors: string[] = [];
    viewerPage.on('pageerror', (e) => viewerErrors.push(e.message));
    const viewer = await register(viewerPage);

    // --- Visit the owner's public profile as a different, logged-in user ---
    // Deep-link straight to Beta so the assertions below don't depend on
    // which artwork the scene happens to land on by default.
    await viewerPage.goto(`/u/${owner.username}?artwork=${blueId}`);
    await expect(viewerPage.locator('.scene canvas')).toBeVisible();

    // Read-only: no edit-mode toggle should be rendered on someone else's profile.
    await expect(viewerPage.getByRole('switch')).toHaveCount(0);

    // Both GLTF models load sequentially (not in parallel) after the profile
    // fetch resolves, so this can take a bit longer than the default timeout.
    await expect(viewerPage.getByRole('heading', { level: 2, name: 'Beta Artwork' })).toBeVisible({ timeout: 30000 });
    await expect(viewerPage.getByRole('button', { name: /^Like/ })).toContainText('0');

    // --- Like it ---
    await viewerPage.getByRole('button', { name: /^Like/ }).click();
    await expect(viewerPage.getByRole('button', { name: /^Liked/ })).toContainText('1');

    // Persists across reload (backend-synced, not just local state). A full
    // reload re-fetches the profile and re-loads both GLTF models in
    // sequence, so give it more room than the default assertion timeout.
    await viewerPage.reload();
    await expect(viewerPage.getByRole('heading', { level: 2, name: 'Beta Artwork' })).toBeVisible({ timeout: 30000 });
    await expect(viewerPage.getByRole('button', { name: /^Liked/ })).toContainText('1');

    // --- Save it into a new collection ---
    // Creating a collection from the panel only creates it (empty) - the
    // current artwork still has to be toggled into it separately.
    await viewerPage.getByRole('button', { name: /^Save/ }).click();
    await viewerPage.getByRole('button', { name: 'New collection' }).click();
    await viewerPage.getByPlaceholder('Collection name').fill('Favorites');
    await viewerPage.locator('.save-panel-new-confirm').click();
    await viewerPage.locator('.save-panel-item', { hasText: 'Favorites' }).click();
    await expect(viewerPage.getByRole('button', { name: /^Saved/ })).toBeVisible();

    // --- Comment on it ---
    await viewerPage.getByPlaceholder('Add a comment...').fill('Great work!');
    await viewerPage.locator('.comment-submit-btn').click();
    await expect(viewerPage.getByText('Great work!')).toBeVisible();
    await expect(viewerPage.getByText(viewer.username, { exact: true })).toBeVisible();

    // --- The owner sees the like count and the comment too ---
    await ownerPage.reload();
    await expect(ownerPage.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 30000 });
    await bringToFront(ownerPage, 'Beta Artwork');
    await expect(ownerPage.getByRole('button', { name: /^Like/ })).toContainText('1');
    await expect(ownerPage.getByText('Great work!')).toBeVisible();

    // --- Liked Posts page shows the liked artwork with real data (not empty) ---
    await viewerPage.goto('/liked-posts');
    await expect(viewerPage.getByText('No liked posts yet')).toHaveCount(0);
    const likedCard = viewerPage.locator('.liked-card', { hasText: 'Beta Artwork' });
    await expect(likedCard).toBeVisible();
    await expect(likedCard).toContainText('1');

    // Opens the artwork on the owner's profile (/@username).
    await likedCard.click();
    await expect(viewerPage).toHaveURL(new RegExp(`/@${owner.username}\\?artwork=${blueId}`));
    await expect(viewerPage.getByRole('heading', { level: 2, name: 'Beta Artwork' })).toBeVisible({ timeout: 30000 });

    // --- Saved page shows the saved artwork with real data ---
    await viewerPage.goto('/saved');
    await viewerPage.getByText('Favorites').click();
    const savedCard = viewerPage.locator('.liked-card', { hasText: 'Beta Artwork' });
    await expect(savedCard).toBeVisible();
    await expect(savedCard).toContainText('1');

    await savedCard.click();
    await expect(viewerPage).toHaveURL(new RegExp(`/@${owner.username}\\?artwork=${blueId}`));

    // --- The owner's own Liked/Saved pages remain empty (they liked nothing) ---
    await ownerPage.goto('/liked-posts');
    await expect(ownerPage.getByText('No liked posts yet')).toBeVisible();
    await ownerPage.goto('/saved');
    await expect(ownerPage.getByText('No collections yet')).toBeVisible();

    expect(viewerErrors).toEqual([]);

    await ownerContext.close();
    await viewerContext.close();
  });

  test('an anonymous (logged-out) visitor sees the read-only scene without crashing', async ({ browser }) => {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    const owner = await register(ownerPage);
    await uploadArtwork(ownerPage, 'red-triangle.gltf', 'Solo Artwork');

    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    const consoleErrors: string[] = [];
    anonPage.on('pageerror', (err) => consoleErrors.push(err.message));

    await anonPage.goto(`/u/${owner.username}`);
    await expect(anonPage.locator('.scene canvas')).toBeVisible();
    await expect(anonPage.getByRole('heading', { level: 2, name: 'Solo Artwork' })).toBeVisible();
    await expect(anonPage.getByRole('switch')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);

    await ownerContext.close();
    await anonContext.close();
  });
});
