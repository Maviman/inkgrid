import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Every test fails on console errors, page errors and 5xx responses.
export const test = base.extend<{ guard: void }>({
  guard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
      page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
      page.on('response', (r) => r.status() >= 500 && problems.push(`5xx: ${r.url()}`));
      await use();
      expect(problems, problems.join('\n')).toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export async function ready(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.getByText(/cells$/)).toBeVisible();
}

export async function axe(page: import('@playwright/test').Page) {
  const r = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  // contrast is checked from tokens by contrast.py; canvas art is exempt
  return r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
}
