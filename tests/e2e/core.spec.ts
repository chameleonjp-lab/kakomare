import { expect, test, type Page } from '@playwright/test';

const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.stack ?? error.message}`);
  });
  await page.exposeFunction('__kakomareRecordUnhandledRejection', (message: string) => {
    errors.push(`unhandledrejection: ${message}`);
  });
  await page.addInitScript(() => {
    window.addEventListener('unhandledrejection', (event) => {
      const reason: unknown = event.reason;
      let message: string;
      if (reason instanceof Error) message = reason.stack ?? reason.message;
      else if (typeof reason === 'string') message = reason;
      else {
        try { message = JSON.stringify(reason) ?? String(reason); }
        catch { message = String(reason); }
      }
      const record = (window as Window & {
        __kakomareRecordUnhandledRejection: (value: string) => Promise<void>;
      }).__kakomareRecordUnhandledRejection;
      void record(message).catch(() => undefined);
    });
  });
});

test.afterEach(async ({ page }) => {
  if (!page.isClosed()) await page.waitForTimeout(20);
  const errors = browserErrors.get(page) ?? [];
  expect(errors.length, `ブラウザ例外が発生しました:\n${errors.join('\n\n')}`).toBe(0);
});

async function enterHome(page: Page): Promise<void> {
  await page.goto('./?test=1');
  const name = page.locator('.name-input');
  await expect(page.locator('.name-input, [data-testid="start-game"]').first()).toBeVisible({ timeout: 10_000 });
  if (await name.isVisible()) {
    await name.fill('テスト守');
    await page.getByRole('button', { name: 'この名前で始める' }).click();
  }
  await expect(page.getByText('カコマレ', { exact: true }).first()).toBeVisible();
}

async function enterBattle(page: Page, query = '?test=1'): Promise<void> {
  await page.goto(`.${query}`);
  const name = page.locator('.name-input');
  await expect(page.locator('.name-input, [data-testid="start-game"]').first()).toBeVisible();
  if (await name.isVisible()) {
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

test('ステージ開始を連打しても1プレイだけ開始して回数を1だけ増やす', async ({ page }) => {
  await enterHome(page);
  await page.getByTestId('start-game').click();
  const stage = page.getByTestId('select-stage-1');
  await stage.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByTestId('countdown-screen')).toHaveCount(1);
  const playCount = await page.evaluate(() => JSON.parse(localStorage.getItem('kakomare-save-v2') ?? '{}').statistics?.playCount);
  expect(playCount).toBe(1);
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
  const upgradeControls = await page.locator('.modal-dialog button').evaluateAll((controls) => controls.map((control) => {
    const box = control.getBoundingClientRect();
    return { label: control.textContent ?? '', width: box.width, height: box.height };
  }));
  expect(upgradeControls.length).toBeGreaterThan(0);
  for (const control of upgradeControls) {
    expect(control.width, `${control.label} の幅`).toBeGreaterThanOrEqual(48);
    expect(control.height, `${control.label} の高さ`).toBeGreaterThanOrEqual(48);
  }
  await page.getByTestId('upgrade-candidate').first().click();
  await expect(page.getByTestId('upgrade-candidate').first()).toBeHidden();
});

test('強化中は背景操作を遮断し、フォーカス中の候補だけをEnterで選べる', async ({ page }) => {
  await enterBattle(page, '?test=1&upgrade=1');
  const candidates = page.getByTestId('upgrade-candidate');
  await expect(candidates.first()).toBeVisible({ timeout: 3000 });
  await expect(candidates.first()).toBeEnabled();
  await expect(page.locator('.battle-layout')).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(candidates.first()).toBeVisible();
  await expect(page.getByTestId('resume-button')).toHaveCount(0);

  const second = candidates.nth(1);
  const secondTitle = await second.textContent();
  await second.focus();
  await page.keyboard.press('Enter');
  await expect(candidates.first()).toBeHidden();
  await expect(page.getByTestId('battle-status')).toContainText(secondTitle ?? '');
  await expect(page.locator('.battle-layout')).not.toHaveAttribute('inert', '');
  await expect(page.getByTestId('pause-button')).toBeFocused();
});

test('候補を3つ保てない除外操作でも強化画面をロックしない', async ({ page }) => {
  await enterBattle(page, '?test=1&upgrade=1');
  const candidates = page.getByTestId('upgrade-candidate');
  await expect(candidates.first()).toBeEnabled({ timeout: 3000 });
  const ban = page.locator('.upgrade-card .button-small').first();
  await expect(ban).toBeEnabled();
  await ban.click();
  await expect(page.getByTestId('battle-status')).toContainText('除外できません');
  await expect(candidates).toHaveCount(3);
  await expect(candidates.first()).toBeEnabled();
});

test('一時停止と再開が二重開始なしで動く', async ({ page }) => {
  await enterBattle(page);
  await page.getByTestId('pause-button').click();
  await expect(page.getByTestId('resume-button')).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('heading', { name: '画面を離れたため停止中' })).toBeVisible();
  await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }));
  await page.getByTestId('resume-button').evaluate((resume) => { resume.click(); resume.click(); });
  await expect(page.getByTestId('resume-button')).toBeHidden();
  await expect(page.locator('.resume-countdown')).toBeVisible();
  await expect(page.locator('.resume-layer')).toHaveCount(1);
});

test('再開カウントダウン中のEscapeで裏側の戦闘を再開しない', async ({ page }) => {
  await enterBattle(page);
  await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
  await expect(page.getByRole('heading', { name: '画面の向きが変わったため停止中' })).toBeVisible();
  await page.getByTestId('resume-button').click();
  await expect(page.locator('.resume-countdown')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: '戦闘を停止しました' })).toBeVisible();
  await expect(page.locator('.resume-layer')).toHaveCount(0);
  const pausedTime = await page.getByTestId('hud-time').textContent();
  await page.waitForTimeout(1_700);
  await expect(page.getByTestId('battle-status')).toHaveText('一時停止中');
  await expect(page.getByTestId('hud-time')).toHaveText(pausedTime ?? '');
  await page.getByTestId('resume-button').click();
  await expect(page.locator('.resume-countdown')).toBeVisible();
});

test('手動一時停止中の画面回転でも再開カウントダウンを要求する', async ({ page }) => {
  await enterBattle(page);
  await page.getByTestId('pause-button').click();
  await expect(page.getByRole('heading', { name: '戦闘を停止しました' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
  await expect(page.getByRole('heading', { name: '画面の向きが変わったため停止中' })).toBeVisible();
  await page.getByTestId('resume-button').click();
  await expect(page.locator('.resume-countdown')).toBeVisible();
});

test('リタイアでは未確定記録を保存せず共有も表示しない', async ({ page }) => {
  await enterBattle(page);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('kakomare-save-v2') ?? 'null'));
  page.once('dialog', (dialog) => { void dialog.accept(); });
  await page.getByTestId('pause-button').click();
  await page.getByRole('button', { name: 'リタイア' }).click();
  await expect(page.getByTestId('result-screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'プレイ終了' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '記録は未確定です' })).toBeVisible();
  await expect(page.getByTestId('share-result')).toHaveCount(0);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('kakomare-save-v2') ?? 'null'));
  expect(after.records).toEqual(before.records);
  expect(after.progress.parts).toBe(before.progress.parts);
  expect(after.statistics).toEqual(before.statistics);
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
  const settled = await page.evaluate(() => JSON.parse(localStorage.getItem('kakomare-save-v2') ?? '{}'));
  await page.waitForTimeout(1_200);
  const afterWait = await page.evaluate(() => JSON.parse(localStorage.getItem('kakomare-save-v2') ?? '{}'));
  expect(afterWait.statistics.clearCount).toBe(1);
  expect(afterWait.statistics.clearCount).toBe(settled.statistics.clearCount);
  expect(afterWait.progress.parts).toBe(settled.progress.parts);
  await page.getByRole('button', { name: 'もう一度' }).click();
  await expect(page.getByTestId('countdown-screen')).toBeVisible();
});

test('ステージ1から連勝してステージ3と無限モードを順に解放する', async ({ page }) => {
  test.setTimeout(35_000);
  await enterBattle(page, '?test=1&outcome=victory');
  for (const stageName of ['包囲開始', '断続波', '閉鎖環']) {
    await expect(page.getByTestId('result-screen')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('result-screen')).toContainText(stageName);
    const nextLabel = stageName === '閉鎖環' ? '無限モードへ' : '次のステージへ';
    await expect(page.getByRole('button', { name: nextLabel })).toBeVisible();
    if (stageName !== '閉鎖環') await page.getByRole('button', { name: nextLabel }).click();
  }
  const unlocked = await page.evaluate(() => {
    const raw = localStorage.getItem('kakomare-save-v2');
    if (!raw) throw new Error('保存データがありません。');
    return (JSON.parse(raw) as { progress: { unlockedStages: string[] } }).progress.unlockedStages;
  });
  expect(unlocked).toEqual(['stage-1', 'stage-2', 'stage-3', 'endless']);
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

test('縦横とデスクトップの戦闘画面が表示領域に収まり、主要表示の寸法を守る', async ({ page }) => {
  test.setTimeout(90_000);
  const viewports = [
    { width: 320, height: 568, portrait: true },
    { width: 375, height: 667, portrait: true },
    { width: 390, height: 844, portrait: true },
    { width: 402, height: 874, portrait: true },
    { width: 430, height: 932, portrait: true },
    { width: 844, height: 390, portrait: false },
    { width: 932, height: 430, portrait: false },
    { width: 1280, height: 720, portrait: false },
    { width: 1920, height: 1080, portrait: false },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await enterBattle(page);
    const requiredSelectors = [
      '.app-root-battle',
      '.battle-shell',
      '.battle-header',
      '.pause-button',
      '.battle-layout',
      '.arena-column',
      '.battle-canvas-shell',
      '.aim-state',
      '.battle-status',
      '.battle-panel',
      '.battle-hud',
      '.build-panel',
      '.build-list',
    ];
    for (const selector of requiredSelectors) {
      await expect(page.locator(selector), `${viewport.width}x${viewport.height}: ${selector} が1件存在する`).toHaveCount(1);
      await expect(page.locator(selector), `${viewport.width}x${viewport.height}: ${selector} が見える`).toBeVisible();
    }
    const metrics = await page.evaluate(() => {
      const measure = (selector: string): DOMRect => {
        const node = document.querySelector<HTMLElement>(selector);
        if (!node) throw new Error(`${selector} が見つかりません。`);
        return node.getBoundingClientRect();
      };
      const rect = (selector: string): { top: number; right: number; bottom: number; left: number; width: number; height: number } => {
        const value = measure(selector);
        return { top: value.top, right: value.right, bottom: value.bottom, left: value.left, width: value.width, height: value.height };
      };
      const fontSize = (selector: string): number => {
        const node = document.querySelector<HTMLElement>(selector);
        if (!node) throw new Error(`${selector} が見つかりません。`);
        return Number.parseFloat(window.getComputedStyle(node).fontSize);
      };
      const visibleButtons = [...document.querySelectorAll<HTMLButtonElement>('.battle-shell button')]
        .filter((node) => {
          const box = node.getBoundingClientRect();
          return box.width > 0 && box.height > 0;
        })
        .map((node) => ({ label: node.textContent ?? '', width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height }));
      return {
        documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        root: rect('.app-root-battle'),
        shell: rect('.battle-shell'),
        header: rect('.battle-header'),
        pause: rect('.pause-button'),
        layout: rect('.battle-layout'),
        arena: rect('.arena-column'),
        canvas: rect('.battle-canvas-shell'),
        aim: rect('.aim-state'),
        status: rect('.battle-status'),
        panel: rect('.battle-panel'),
        normalFontSizes: [
          fontSize('.battle-header .eyebrow'),
          fontSize('.aim-state'),
          fontSize('.battle-status'),
          fontSize('.hud-label'),
          fontSize('.build-panel h2'),
          fontSize('.build-list'),
        ],
        importantFontSizes: [fontSize('.hud-value')],
        visibleButtons,
      };
    });
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewportHeight + 1);
    expect(metrics.shell.top).toBeGreaterThanOrEqual(metrics.root.top - 1);
    expect(metrics.shell.right).toBeLessThanOrEqual(metrics.root.right + 1);
    expect(metrics.shell.bottom).toBeLessThanOrEqual(metrics.root.bottom + 1);
    expect(metrics.shell.left).toBeGreaterThanOrEqual(metrics.root.left - 1);
    expect(metrics.pause.top).toBeGreaterThanOrEqual(metrics.header.top - 1);
    expect(metrics.pause.bottom).toBeLessThanOrEqual(metrics.header.bottom + 1);
    expect(metrics.pause.bottom).toBeLessThanOrEqual(metrics.canvas.top + 1);
    expect(metrics.layout.top).toBeGreaterThanOrEqual(metrics.header.bottom - 1);
    expect(metrics.layout.bottom).toBeLessThanOrEqual(metrics.shell.bottom + 1);
    expect(metrics.arena.top).toBeGreaterThanOrEqual(metrics.layout.top - 1);
    expect(metrics.arena.bottom).toBeLessThanOrEqual(metrics.layout.bottom + 1);
    expect(metrics.canvas.top).toBeGreaterThanOrEqual(metrics.arena.top - 1);
    expect(metrics.canvas.right).toBeLessThanOrEqual(metrics.arena.right + 1);
    expect(metrics.canvas.bottom).toBeLessThanOrEqual(metrics.arena.bottom + 1);
    expect(metrics.canvas.left).toBeGreaterThanOrEqual(metrics.arena.left - 1);
    expect(Math.abs(metrics.canvas.width - metrics.canvas.height)).toBeLessThanOrEqual(2);
    expect(metrics.aim.bottom).toBeLessThanOrEqual(metrics.arena.bottom + 1);
    expect(metrics.status.bottom).toBeLessThanOrEqual(metrics.arena.bottom + 1);
    expect(metrics.panel.top).toBeGreaterThanOrEqual(metrics.layout.top - 1);
    expect(metrics.panel.right).toBeLessThanOrEqual(metrics.layout.right + 1);
    expect(metrics.panel.bottom).toBeLessThanOrEqual(metrics.layout.bottom + 1);
    expect(metrics.panel.left).toBeGreaterThanOrEqual(metrics.layout.left - 1);
    expect(metrics.visibleButtons.length).toBeGreaterThan(0);
    for (const control of metrics.visibleButtons) {
      expect(control.width, `${viewport.width}x${viewport.height}: ${control.label} の幅`).toBeGreaterThanOrEqual(48);
      expect(control.height, `${viewport.width}x${viewport.height}: ${control.label} の高さ`).toBeGreaterThanOrEqual(48);
    }
    for (const size of metrics.normalFontSizes) expect(size).toBeGreaterThanOrEqual(14);
    for (const size of metrics.importantFontSizes) expect(size).toBeGreaterThanOrEqual(16);
    if (viewport.portrait) {
      expect(metrics.panel.top).toBeGreaterThanOrEqual(metrics.arena.bottom - 1);
    } else {
      expect(metrics.panel.left).toBeGreaterThanOrEqual(metrics.arena.right - 1);
    }
  }
});

test('320x480で装置が6件になっても戦闘パネルを画面外へ出さない', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await enterBattle(page);
  const build = page.locator('.build-list');
  await expect(build).toBeVisible();
  await build.evaluate((node) => {
    node.textContent = '遠隔重力点 Lv5 / 残響円盤 Lv5 / 連鎖導体 Lv5 / 出力環 Lv3 / 観測環 Lv3 / 制動環 Lv3';
  });
  await expect(build).toContainText('制動環 Lv3');
  const metrics = await page.evaluate(() => {
    const measure = (selector: string): { top: number; bottom: number; height: number } => {
      const node = document.querySelector<HTMLElement>(selector);
      if (!node) throw new Error(`${selector} が見つかりません。`);
      const box = node.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, height: box.height };
    };
    const panel = document.querySelector<HTMLElement>('.battle-panel');
    if (!panel) throw new Error('.battle-panel が見つかりません。');
    return {
      shell: measure('.battle-shell'),
      layout: measure('.battle-layout'),
      arena: measure('.arena-column'),
      panel: measure('.battle-panel'),
      build: measure('.build-list'),
      panelScrollHeight: panel.scrollHeight,
      panelClientHeight: panel.clientHeight,
    };
  });
  expect(metrics.arena.bottom).toBeLessThanOrEqual(metrics.layout.bottom + 1);
  expect(metrics.panel.top).toBeGreaterThanOrEqual(metrics.arena.bottom - 1);
  expect(metrics.panel.bottom).toBeLessThanOrEqual(metrics.layout.bottom + 1);
  expect(metrics.panel.bottom).toBeLessThanOrEqual(metrics.shell.bottom + 1);
  expect(metrics.build.bottom).toBeLessThanOrEqual(metrics.panel.bottom + 1);
  expect(metrics.panelScrollHeight).toBeLessThanOrEqual(metrics.panelClientHeight + 1);
});

test('320x568で文字を200%相当に拡大しても戦闘操作を画面内に保つ', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await enterBattle(page);
  await page.addStyleTag({ content: ':root { font-size: 32px !important; }' });
  const metrics = await page.evaluate(() => {
    const rect = (selector: string): DOMRect => {
      const node = document.querySelector<HTMLElement>(selector);
      if (!node) throw new Error(`${selector} が見つかりません。`);
      return node.getBoundingClientRect();
    };
    const panel = document.querySelector<HTMLElement>('.battle-panel');
    if (!panel) throw new Error('.battle-panel が見つかりません。');
    const canvasShell = document.querySelector<HTMLElement>('.battle-canvas-shell');
    if (!canvasShell) throw new Error('.battle-canvas-shell が見つかりません。');
    return {
      viewportHeight: window.innerHeight,
      documentHeight: document.documentElement.scrollHeight,
      header: rect('.battle-header').toJSON(),
      pause: rect('.pause-button').toJSON(),
      canvas: rect('.battle-canvas-shell').toJSON(),
      innerCanvas: rect('.game-mount canvas').toJSON(),
      canvasShellClientWidth: canvasShell.clientWidth,
      canvasShellClientHeight: canvasShell.clientHeight,
      canvasShellScrollWidth: canvasShell.scrollWidth,
      canvasShellScrollHeight: canvasShell.scrollHeight,
      panel: rect('.battle-panel').toJSON(),
      panelClientHeight: panel.clientHeight,
      buildText: panel.querySelector('.build-list')?.textContent ?? '',
    };
  });
  expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  expect(metrics.pause.top).toBeGreaterThanOrEqual(metrics.header.top - 1);
  expect(metrics.pause.bottom).toBeLessThanOrEqual(metrics.header.bottom + 1);
  expect(metrics.pause.bottom).toBeLessThanOrEqual(metrics.canvas.top + 1);
  expect(metrics.canvas.width).toBeGreaterThanOrEqual(120);
  expect(metrics.innerCanvas.top).toBeGreaterThanOrEqual(metrics.canvas.top - 1);
  expect(metrics.innerCanvas.right).toBeLessThanOrEqual(metrics.canvas.right + 1);
  expect(metrics.innerCanvas.bottom).toBeLessThanOrEqual(metrics.canvas.bottom + 1);
  expect(metrics.innerCanvas.left).toBeGreaterThanOrEqual(metrics.canvas.left - 1);
  expect(metrics.canvasShellScrollWidth).toBeLessThanOrEqual(metrics.canvasShellClientWidth + 1);
  expect(metrics.canvasShellScrollHeight).toBeLessThanOrEqual(metrics.canvasShellClientHeight + 1);
  expect(metrics.panel.bottom).toBeLessThanOrEqual(metrics.viewportHeight + 1);
  expect(metrics.panelClientHeight).toBeGreaterThan(0);
  expect(metrics.buildText).toContain('連針砲');
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
  await page.waitForTimeout(250);
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
  await expect(page.locator('.share-text')).toBeFocused();
  await expect(page.locator('.page-shell')).toHaveAttribute('inert', '');
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: '閉じる' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.share-text')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.share-modal')).toHaveCount(0);
  await expect(page.locator('.page-shell')).not.toHaveAttribute('inert', '');
  await expect(page.getByTestId('share-home')).toBeFocused();
});

test('ネイティブ共有をキャンセルしてもクリップボードへコピーしない', async ({ page }) => {
  await page.addInitScript(() => {
    (window as Window & { copyAttempts?: number }).copyAttempts = 0;
    Object.defineProperty(Navigator.prototype, 'share', {
      configurable: true,
      value: () => Promise.reject(new DOMException('cancelled', 'AbortError')),
    });
    Object.defineProperty(Navigator.prototype, 'clipboard', {
      configurable: true,
      value: { writeText: () => { (window as Window & { copyAttempts?: number }).copyAttempts = ((window as Window & { copyAttempts?: number }).copyAttempts ?? 0) + 1; return Promise.resolve(); } },
    });
  });
  await enterHome(page);
  await page.getByTestId('share-home').click();
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => (window as Window & { copyAttempts?: number }).copyAttempts)).toBe(0);
  await expect(page.locator('.share-modal')).toHaveCount(0);
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

test('保存領域への書き込み失敗を画面遷移後も表示する', async ({ page }) => {
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function persistOrFail(key: string, value: string): void {
      if (key === 'kakomare-save-v2') throw new DOMException('容量不足', 'QuotaExceededError');
      setItem.call(this, key, value);
    };
  });
  await page.goto('./?test=1');
  await page.locator('.name-input').fill('保存失敗確認');
  await page.getByRole('button', { name: 'この名前で始める' }).click();
  await expect(page.locator('.notice')).toContainText('端末へ保存できませんでした');
  await page.getByTestId('start-game').click();
  await page.getByTestId('select-stage-1').click();
  await expect(page.getByTestId('countdown-screen')).toBeVisible();
  await expect(page.locator('.notice')).toContainText('端末へ保存できませんでした');
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
