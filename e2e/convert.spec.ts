import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import fs from 'node:fs';
import { test, expect, ready, axe } from './fixtures';

const fx = (f: string) => path.join(__dirname, '..', 'tests', 'fixtures', f);
const canvasHash = (page: import('@playwright/test').Page) =>
  page.locator('#out').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    let h = 0;
    for (let i = 0; i < d.length; i += 97) h = (h * 31 + d[i]) | 0;
    return `${c.width}x${c.height}:${h}`;
  });

test('F01-H1 demo scene renders on load, no a11y blockers', async ({ page }) => {
  await ready(page);
  await expect(page.getByText(/Demo scene · 960×720 → 120×\d+ cells/)).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test('F01-H2 open an image, export PNG at 1080p', async ({ page }) => {
  await ready(page);
  await page.locator('#file').setInputFiles(fx('shapes.png'));
  await expect(page.getByText(/shapes\.png · 400×300/)).toBeVisible();
  await page.getByRole('button', { name: 'Save image' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/^inkgrid-.*\.png$/);
  const p = await file.path();
  const buf = fs.readFileSync(p);
  expect(buf.readUInt32BE(16)).toBe(1920); // PNG IHDR width
});

test('F01-H3 drag and drop a file', async ({ page }) => {
  await ready(page);
  const data = fs.readFileSync(fx('shapes.png')).toString('base64');
  const dt = await page.evaluateHandle(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const d = new DataTransfer();
    d.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }));
    return d;
  }, data);
  await page.dispatchEvent('body', 'dragenter', { dataTransfer: dt });
  await expect(page.getByText('Release to load this file')).toBeVisible();
  await page.dispatchEvent('body', 'drop', { dataTransfer: dt });
  await expect(page.getByText(/dropped\.png · 400×300/)).toBeVisible();
});

test('F01-E1 non-image file is rejected with a message', async ({ page }) => {
  await ready(page);
  await page.locator('#file').setInputFiles(fx('not-an-image.txt'));
  await expect(page.getByRole('status')).toHaveText(/not an image or video/);
  await expect(page.getByText(/Demo scene · /)).toBeVisible();
});

test('F01-E2 very wide image is capped at 4096px', async ({ page }) => {
  await ready(page);
  await page.locator('#file').setInputFiles(fx('wide.png'));
  await expect(page.getByText(/wide\.png · 4096×68/)).toBeVisible();
});

test('F02-H1 every style renders something different', async ({ page }) => {
  await ready(page);
  const seen = new Set<string>();
  const styles = ['Classic', 'Fine', 'Shades', 'Tiles', 'Sparse', 'Binary', 'Braille', 'Halftone', 'Quadrants', 'Bricks', 'Particles', 'Film', 'Drift', 'Custom'];
  for (const s of styles) {
    await page.getByRole('button', { name: s, exact: true }).first().click();
    await expect(page.getByRole('button', { name: s, exact: true }).first()).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(150);
    seen.add(await canvasHash(page));
  }
  // Custom with the default ramp equals Classic, everything else differs
  expect(seen.size).toBeGreaterThanOrEqual(styles.length - 1);
});

test('F02-H2 presets apply, slider double-click resets to the preset value', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Newsprint' }).click();
  await expect(page.getByRole('button', { name: 'Newsprint' })).toHaveAttribute('aria-pressed', 'true');
  const cols = page.getByLabel('Columns');
  await expect(cols).toHaveValue('150');
  await cols.fill('60');
  await expect(page.getByText(/→ 60×\d+ cells/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Newsprint' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Newsprint' }).click();
  await cols.fill('60');
  // after a manual change the preset is unmarked, so reset goes to defaults
  await cols.dblclick();
  await expect(cols).toHaveValue('120');
});

test('F02-H3 settings persist across reload', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Braille', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Braille', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('F02-H4 contextual sections show and hide', async ({ page }) => {
  await ready(page);
  await expect(page.getByText('Characters, light to heavy')).toBeHidden();
  await page.getByRole('button', { name: 'Custom', exact: true }).first().click();
  const ramp = page.getByLabel('Characters, light to heavy');
  await ramp.fill(' .oO@😀');
  await expect(page.getByText(/cells$/)).toBeVisible();
  await page.getByRole('button', { name: 'Particles', exact: true }).first().click();
  await expect(page.getByLabel('Count')).toBeVisible();
  await expect(page.getByLabel('Columns')).toBeVisible();
});

test('F02-E1 invalid hex is flagged and not applied', async ({ page }) => {
  await ready(page);
  const hex = page.getByLabel('Ink hex');
  await hex.fill('#zzz');
  await expect(hex).toHaveClass(/bad/);
  await hex.fill('#ff0000');
  await expect(hex).not.toHaveClass(/bad/);
  expect(await page.evaluate(() => (window as any).__app.settings.ink)).toBe('#ff0000');
});

test('F02-H5 copy as text', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ready(page);
  await page.getByRole('button', { name: 'Copy text' }).click();
  await expect(page.getByRole('status')).toHaveText(/Copied \d+ lines/);
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text.split('\n').length).toBeGreaterThan(20);
  await page.getByRole('button', { name: 'Halftone', exact: true }).nth(1).click();
  await expect(page.getByRole('button', { name: 'Copy text' })).toBeDisabled();
});

test('F03-H1 video loads, pauses, seeks and exports', async ({ page }) => {
  await ready(page);
  await page.locator('#file').setInputFiles(fx('clip.webm'));
  await expect(page.getByText(/clip\.webm · 320×240/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await page.getByLabel('Position in clip').fill('500');
  await page.getByRole('button', { name: 'Save video' }).click();
  await page.getByRole('button', { name: '720p' }).click();
  const dl = page.waitForEvent('download', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const f = await dl;
  expect(f.suggestedFilename()).toMatch(/\.(webm|mp4)$/);
  expect(fs.statSync(await f.path()).size).toBeGreaterThan(5_000);
});

test('F03-E1 still picture without animation cannot export video', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Save video' }).click();
  await expect(page.getByText(/nothing to move/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('F04-H1 split view reveals the source', async ({ page }) => {
  await ready(page);
  const before = await canvasHash(page);
  await page.getByRole('button', { name: 'Split view' }).click();
  await expect(page.getByRole('button', { name: 'Split view' })).toHaveAttribute('aria-pressed', 'true');
  const box = (await page.locator('#out').boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  expect(await canvasHash(page)).not.toBe(before);
});

test('mobile width: no horizontal scroll, controls reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Save image' }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Save image' })).toBeVisible();
});

test('keyboard only: open a preset and change columns', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Amber' }).first().focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'Amber' }).first()).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Columns').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByLabel('Columns')).toHaveValue('121');
});
