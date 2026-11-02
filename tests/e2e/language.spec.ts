import { expect, test } from './isolatedTest';

test.use({ locale: 'en-US', viewport: { width: 320, height: 568 } });

test('supported languages preserve name, muted sound and game progress across home/settings/rules', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  // Isolation is enforced independently of the application's local test-mode gate.
  await page.route('https://**/*', route => route.abort());
  await page.goto('./?test=1');
  await expect(page.getByTestId('start-game')).toHaveText('Play');
  await page.locator('#player-name').fill('Name stays unchanged');
  for (const language of ['ja','en','es','pt-BR','zh-Hans','fr','de','ko','ru','it','zh-Hant','id','tr','vi','th']) {
    await page.getByTestId('language-select').selectOption(language);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await expect(page.locator('#player-name')).toHaveValue('Name stays unchanged');
    await expect(page.getByTestId('start-game')).toBeVisible();
    await page.locator('.action-grid button').nth(1).click();
    await expect(page.locator('#settings-audio')).toBeVisible();
    await page.locator('#settings-audio').evaluate(node => { (node as HTMLInputElement).value = '0'; node.dispatchEvent(new Event('input', { bubbles: true })); });
    await expect(page.locator('#settings-audio')).toHaveValue('0');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.locator('.page-shell > button').last().click();
    await page.locator('.action-grid button').first().click();
    const rules = await page.locator('.page-shell').textContent();
    expect(rules).toContain('0.8'); expect(rules).toContain('30'); expect(rules).toContain('Lv3');
    expect(rules).not.toContain('rules.');
    if (language !== 'ja') expect(rules).not.toMatch(/[ぁ-んァ-ヶ]/u);
    await page.locator('.page-shell > button').last().click();
  }
  await page.reload();
  await expect(page.getByTestId('language-select')).toHaveValue('th');
  await expect(page.locator('#player-name')).toHaveValue('Name stays unchanged');
  await page.locator('.action-grid button').nth(1).click();
  await expect(page.locator('#settings-audio')).toHaveValue('0');
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('kakomare-save-v3') ?? '{}'));
  expect(save.statistics.playCount).toBe(0);
  expect(errors).toEqual([]);
});

test('an invalid name remains blocked after a language switch instead of restoring an old public name', async ({ page }) => {
  await page.route('https://**/*', route => route.abort());
  await page.goto('./?test=1');
  await page.locator('#player-name').fill('Previous name');
  await page.locator('#player-name').fill('X'.repeat(21));
  await expect(page.getByTestId('start-game')).toBeDisabled();
  await page.getByTestId('language-select').selectOption('fr');
  await expect(page.locator('#player-name')).toHaveValue('X'.repeat(21));
  await expect(page.getByTestId('language-select')).toHaveValue('en');
  await expect(page.getByTestId('start-game')).toBeDisabled();
});

for (const language of ['ja','en','es','pt-BR','zh-Hans','fr','de','ko','ru','it','zh-Hant','id','tr','vi','th']) {
  test(`upgrade choices remain accessible in ${language} on a narrow viewport`, async ({ page }) => {
    await page.route('https://**/*', route => route.abort());
    await page.goto('./?test=1&upgrade=1&seed=1');
    await page.getByTestId('language-select').selectOption(language);
    // Anonymous isolated play: no score submission is requested.
    await page.getByTestId('start-game').click();
    await expect(page.getByTestId('battle-screen')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('upgrade-card')).toHaveCount(3);
    const title = await page.locator('#upgrade-title').textContent();
    expect(title).not.toContain('upgrade.');
    if (language !== 'ja') expect(title).not.toMatch(/[ぁ-んァ-ヶ]/u);
    await expect(page.getByTestId('language-select')).toHaveCount(0);
    const metrics = await page.getByTestId('upgrade-card').evaluateAll(cards => cards.map(card => {
      const box = card.getBoundingClientRect();
      return { left: box.left, right: box.right, overflow: card.scrollWidth > card.clientWidth + 1 };
    }));
    for (const box of metrics) {
      expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(321); expect(box.overflow).toBe(false);
    }
    const time = await page.getByTestId('hud-time').textContent();
    const detail = page.locator('.upgrade-help-details summary').first();
    if (await detail.count()) await detail.click();
    await expect(page.getByTestId('hud-time')).toHaveText(time ?? '');
    await expect(page.getByTestId('upgrade-card')).toHaveCount(3);
  });
}
