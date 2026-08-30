import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener('unhandledrejection', (event) => console.error(`[unhandledrejection] ${String(event.reason)}`));
    window.addEventListener('error', (event) => console.error(`[window-error] ${event.message}`));
  });
  page.on('pageerror', (error) => console.log(`[pageerror] ${error.stack ?? error.message}`));
  page.on('console', (message) => console.log(`[console-${message.type()}] ${message.text()}`));
});

async function enterHome(page: Page): Promise<void> {
  await page.goto('./?test=1');
  const name = page.locator('.name-input');
  if (await name.count()) {
    await name.fill('テスト守');
    await page.getByTestId('start-game').click();
  }
  await expect(page.getByText('カコマレ', { exact: true }).first()).toBeVisible();
}

async function enterBattle(page: Page, query = '?test=1'): Promise<void> {
  await page.goto(`.${query}`);
  await page.locator('.name-input').fill('戦闘確認');
  await page.getByRole('button', { name: 'この名前で始める' }).click();
  await page.getByTestId('start-game').click();
  await page.getByTestId('select-stage-1').click();
  await expect(page.getByTestId('countdown-screen')).toBeVisible();
  await expect(page.getByTestId('countdown-number')).toHaveText('3');
  await expect(page.getByTestId('battle-screen')).toBeVisible({ timeout: 5000 });
}

test('初回の名前入力からホームへ進み、再読込で名前を保つ', async ({ page }) => {
  await page.goto('./?test=1');
  console.log(`[initial-dom] ${await page.locator('#app').innerHTML()}`);
  await page.waitForTimeout(250);
  console.log(`[after-250ms-dom] ${await page.locator('#app').innerHTML()}`);
  await expect(page.locator('.name-input')).toBeVisible();
  await page.getByRole('button', { name: 'この名前で始める' }).click();
  await expect(page.locator('.form-error')).toContainText('1〜12文字');
  await page.locator('.name-input').fill('ひかり');
  await page.getByRole('button', { name: 'この名前で始める' }).click();
  await expect(page.getByText('ひかりさん、コアを守りましょう。')).toBeVisible();
  await page.reload();
  await expect(page.getByText('ひかりさん、コアを守りましょう。')).toBeVisible();
});

test('3秒カウントダウン後に戦闘が始まり、ドラッグ照準と強化を使える', async ({ page }) => {
  await page.goto('./?test=1&upgrade=1');
  await page.locator('.name-input').fill('照準確認');
  await page.getByRole('button', { name: 'この名前で始める' }).click();
  await page.getByTestId('start-game').click();
  await page.getByTestId('select-stage-1').click();
  await expect(page.getByTestId('countdown-number')).toHaveText('3');
  await expect(page.getByTestId('countdown-number')).toHaveText('2', { timeout: 2500 });
  await expect(page.getByTestId('battle-screen')).toBeVisible({ timeout: 5000 });
  const canvas = page.locator('canvas');
  await canvas.hover({ position: { x: 180, y: 180 } });
  await page.mouse.down();
  await page.mouse.move(250, 180);
  await page.mouse.up();
  await expect(page.getByTestId('aim-state')).toContainText('手動照準');
  await expect(page.getByTestId('upgrade-candidate').first()).toBeVisible({ timeout: 3000 });
  await page.getByTestId('upgrade-candidate').first().click();
  await expect(page.getByTestId('upgrade-candidate').first()).toBeHidden();
});

test('一時停止と再開が二重開始なしで動く', async ({ page }) => {
  await enterBattle(page);
  await page.getByTestId('pause-button').click();
  await expect(page.getByTestId('resume-button')).toBeVisible();
  await page.getByTestId('resume-button').click();
  await expect(page.getByTestId('resume-button')).toBeHidden();
});

test('敗北結果へ進み、結果画面の共有導線と実験場リンクを表示する', async ({ page }) => {
  await enterBattle(page, '?test=1&outcome=defeat');
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 4000 });
  await expect(page.getByRole('heading', { name: '防衛失敗' })).toBeVisible();
  await expect(page.getByRole('button', { name: '結果を共有' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'カメレオンJPの実験場' })).toHaveAttribute('href', 'https://chameleonjp-lab.github.io/chameleonjp_lab/');
});

test('勝利結果へ進み、もう一度でカウントダウンを開始できる', async ({ page }) => {
  await enterBattle(page, '?test=1&outcome=victory');
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('heading', { name: '防衛成功' })).toBeVisible();
  await page.getByRole('button', { name: 'もう一度' }).click();
  await expect(page.getByTestId('countdown-screen')).toBeVisible();
});

test('320px幅でも横スクロールを発生させない', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await enterHome(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
