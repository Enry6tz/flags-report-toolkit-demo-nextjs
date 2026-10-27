import { expect, test } from '@playwright/test';

test('Reports and Flags use real SDK flows and persist after reload', async ({ page }) => {
  await page.goto('/reports');
  await page.getByRole('button', { name: 'New report', exact: true }).click();
  await page.getByLabel('Your message', { exact: true }).fill('The checkout confirmation is missing after a successful order.');
  await page.getByRole('button', { name: 'Save to local inbox', exact: true }).click();
  await expect(page.locator('.alert[role="status"]')).toContainText('REP-1 saved in this browser');
  await page.reload();
  await page.getByRole('button', { name: /REP-1/ }).click();
  await expect(page.getByRole('heading', { name: 'Report message', exact: true })).toBeVisible();
  await expect(page.locator('.report-message')).toContainText('The checkout confirmation is missing');

  await page.getByRole('link', { name: 'Flags', exact: true }).click();
  await page.getByRole('button', { name: 'New flag', exact: true }).click();
  await page.getByLabel('Flag key', { exact: true }).fill('new-checkout');
  await page.getByLabel('Description', { exact: true }).fill('Checkout reference');
  await page.getByLabel('Start enabled', { exact: true }).check();
  await page.getByRole('button', { name: 'Create flag', exact: true }).click();
  await expect(page.getByText('NOT_READY', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Load provider', exact: true }).click();
  await expect(page.locator('.evaluation-result strong')).toHaveText('true');
  await page.getByRole('switch', { name: 'Enable new-checkout' }).click();
  await expect(page.locator('.evaluation-result strong')).toHaveText('true');
  await page.getByRole('button', { name: 'Refresh provider', exact: true }).click();
  await expect(page.locator('.evaluation-result strong')).toHaveText('false');
  await page.reload();
  await expect(page.getByRole('switch', { name: 'Enable new-checkout' })).not.toBeChecked();
});

test('actual Toolkit recording can be copied, validated into the library and reopened', async ({ page }) => {
  await page.goto('/recordings');
  await page.getByRole('button', { name: 'Start recording', exact: true }).click();
  await page.getByRole('button', { name: 'Save recording JSON', exact: true }).click();
  await page.getByLabel('Library title', { exact: false }).fill('Recorded walkthrough');
  await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
  await page.getByRole('button', { name: 'Copy JSON', exact: true }).click();
  const recording = await page.evaluate(() => navigator.clipboard.readText());
  expect(JSON.parse(recording).schemaVersion).toBe('1.1');
  await page.getByRole('button', { name: 'Close panel', exact: true }).click();
  await page.getByLabel('Toolkit recording JSON', { exact: true }).fill(recording);
  await page.getByRole('button', { name: 'Validate and save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recorded walkthrough', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Markdown', exact: true })).toBeEnabled();
  await page.reload();
  await page.getByRole('button', { name: /Recorded walkthrough/ }).click();
  await expect(page.getByRole('button', { name: 'JSON', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Markdown', exact: true })).toBeEnabled();
});

test('mobile fits and corrupt stored data is not silently replaced', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/reports', '/flags', '/recordings', '/integration']) {
    await page.goto(route);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(245, 240, 229)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.evaluate(() => localStorage.setItem('e6tz.workspace.v1', '{broken'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your saved workspace needs attention' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('e6tz.workspace.v1'))).toBe('{broken');
});
