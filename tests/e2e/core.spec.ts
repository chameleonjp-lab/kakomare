import { expect, test, type Page } from '@playwright/test';

async function enterHome(page: Page): Promise<void> {
  await page.goto('./?test=1');
  const name = page.locator('.name-input');
  if (await name.count()) {
    await name.fill('テスト守');
    await page.getByRole('button', { name: 'この名前で始める' }).click();
  }
  await expect(page.getByText('カコマレ', { exact: true }).first()).toBeVisible();
}

async function enterBattle(page: Page, query = '?test=1'): Promise<void> {
  await page.goto(`.${query}`);
  const name = page.locator('.name-input');
  if (await name.count()) {
    await name.fill('戦闘確認');
    await page.getByRole('button', { name: 'この名前で始める' }).click();
  }
  await page.getByTestId('start-game').click();
  await page.getByTestId('select-stage-1').click();
  await expect(page.getByTestId('countdown-screen')).toBeVisible();
  await expect(page.getByTestId('countdown-number')).toHaveText('3');
  await expect(page.getByTestId('battle-screen')).toBeVisible({ timeout: 8000 });
}

test('初回の名前入力からホームへ進み、再読込で名前を保つ', async ({ page }) => {
  await page.goto('./?test=1');
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
  await expect(page.getByRole('button', { name: '次のステージへ' })).toBeVisible();
  await page.getByRole('button', { name: 'もう一度' }).click();
  await expect(page.getByTestId('countdown-screen')).toBeVisible();
});

test('ホームから研究と記録、段階解放されたステージ選択へ進める', async ({ page }) => {
  await enterHome(page);
  await expect(page.getByRole('button', { name: '研究と記録' })).toBeVisible();
  await page.getByRole('button', { name: '研究と記録' }).click();
  await expect(page.getByRole('heading', { name: '研究と記録' })).toBeVisible();
  await expect(page.getByTestId('research-buy-core-health')).toBeVisible();
  await page.getByRole('button', { name: 'ホームへ戻る' }).click();
  await page.getByRole('button', { name: 'ステージ選択' }).click();
  await expect(page.getByTestId('select-stage-1')).toBeEnabled();
  await expect(page.getByTestId('select-stage-2')).toBeDisabled();
  await expect(page.getByTestId('select-stage-3')).toBeDisabled();
});

test('320px幅でも横スクロールを発生させない', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await enterHome(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('縦横とデスクトップの戦闘画面が表示領域に収まる', async ({ page }) => {
  const viewports = [
    { width: 320, height: 480, portrait: true },
    { width: 320, height: 568, portrait: true },
    { width: 390, height: 844, portrait: true },
    { width: 844, height: 390, portrait: false },
    { width: 1280, height: 720, portrait: false },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await enterBattle(page);
    const metrics = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLElement>('.battle-canvas-shell')?.getBoundingClientRect();
      const status = document.querySelector<HTMLElement>('.battle-status')?.getBoundingClientRect();
      const panel = document.querySelector<HTMLElement>('.battle-panel')?.getBoundingClientRect();
      return {
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        canvasWidth: canvas?.width ?? 0,
        canvasHeight: canvas?.height ?? 0,
        canvasBottom: canvas?.bottom ?? 0,
        statusBottom: status?.bottom ?? 0,
        panelTop: panel?.top ?? 0,
        panelBottom: panel?.bottom ?? 0,
      };
    });
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewportHeight + 1);
    expect(Math.abs(metrics.canvasWidth - metrics.canvasHeight)).toBeLessThanOrEqual(2);
    expect(metrics.statusBottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
    if (viewport.portrait) {
      expect(metrics.panelTop).toBeGreaterThanOrEqual(metrics.canvasBottom - 1);
      expect(metrics.panelBottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
    }
  }
});

test('タップ、二重タップ、長押しでは照準を勝手に切り替えない', async ({ page }) => {
  await enterBattle(page);
  const canvas = page.locator('canvas');
  await canvas.dblclick({ position: { x: 180, y: 180 } });
  await canvas.click({ position: { x: 180, y: 180 } });
  await canvas.dispatchEvent('pointerdown', { pointerId: 1, clientX: 180, clientY: 180 });
  await page.waitForTimeout(350);
  await canvas.dispatchEvent('pointerup', { pointerId: 1, clientX: 180, clientY: 180 });
  await expect(page.getByTestId('aim-state')).toHaveText('自動照準');
});

test('画面回転と非表示からの復帰で戦闘を一時停止する', async ({ page }) => {
  await enterBattle(page);
  await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
  await expect(page.getByRole('heading', { name: '画面の向きが変わったため停止中' })).toBeVisible();
  await page.getByTestId('resume-button').click();
  await page.waitForTimeout(1_700);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('heading', { name: '画面を離れたため停止中' })).toBeVisible();
  await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }));
  await page.getByTestId('resume-button').click();
  await page.waitForTimeout(1_700);
  await expect(page.getByTestId('pause-button')).toBeVisible();
});

test('共有できない環境では画面内のコピー欄へ切り替える', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', { configurable: true, value: undefined });
    Object.defineProperty(Navigator.prototype, 'clipboard', { configurable: true, value: undefined });
  });
  await enterHome(page);
  await page.getByTestId('share-home').click();
  await expect(page.getByTestId('manual-share-copy')).toBeVisible();
  await expect(page.locator('.share-text')).toContainText('全方位防衛ゲーム「カコマレ」');
  await expect(page.locator('.share-text')).toContainText('/kakomare/');
});

test('ホーム共有と結果共有で異なる文章を生成する', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'share', { configurable: true, value: undefined });
    Object.defineProperty(Navigator.prototype, 'clipboard', { configurable: true, value: undefined });
  });
  await enterHome(page);
  await page.getByTestId('share-home').click();
  const homeText = await page.locator('.share-text').inputValue();
  await page.getByRole('button', { name: '閉じる' }).click();
  await enterBattle(page, '?test=1&outcome=defeat');
  await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 4000 });
  await page.getByTestId('share-result').click();
  const resultText = await page.locator('.share-text').inputValue();
  expect(resultText).not.toBe(homeText);
  expect(resultText).toContain('点');
});

test('破損保存を白画面にせず、退避データを画面からコピーできる', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('kakomare-save-v2', '{broken');
    Object.defineProperty(Navigator.prototype, 'clipboard', { configurable: true, value: undefined });
  });
  await page.goto('./?test=1');
  await expect(page.locator('.name-input')).toBeVisible();
  await expect(page.locator('.notice')).toContainText('保存データを読み込めなかった');
  await page.locator('.name-input').fill('復旧確認');
  await page.getByRole('button', { name: 'この名前で始める' }).click();
  await page.getByRole('button', { name: '設定' }).click();
  await page.getByTestId('copy-damaged-save').click();
  await expect(page.getByTestId('copy-damaged-modal')).toBeVisible();
  await expect(page.locator('.share-text')).toHaveValue('{broken');
});
