import { createAppState, type AppState } from './AppState';
import type { AppView } from './routes';
import { SaveService } from '../services/SaveService';
import { AudioService } from '../services/AudioService';
import { ShareService } from '../services/ShareService';
import { LifecycleService } from '../services/LifecycleService';
import { GameHost } from '../game/GameHost';
import type { BattleResult, BattleSnapshot, UpgradePayload } from '../types/game';
import type { SaveData } from '../types/save';
import { button, element } from '../ui/viewUtils';
import { createNameView } from '../ui/NameView';
import { createHomeView } from '../ui/HomeView';
import { createStageSelectView } from '../ui/StageSelectView';
import { createRulesView } from '../ui/RulesView';
import { createSettingsView } from '../ui/SettingsView';
import { createResultView } from '../ui/ResultView';

export class AppController {
  private readonly saveService = new SaveService();
  private readonly audio = new AudioService();
  private readonly shareService = new ShareService();
  private readonly gameHost = new GameHost();
  private state: AppState = createAppState(this.saveService.load().data);
  private lastResult: BattleResult | null = null;
  private countdownTimer: number | null = null;
  private battleStarted = false;
  private lifecycleCleanup: (() => void) | null = null;

  public constructor(private readonly root: HTMLElement) {}

  public async start(): Promise<void> {
    const loaded = this.saveService.load();
    this.state = createAppState(loaded.data);
    this.state.notice = loaded.message;
    this.audio.setVolume(loaded.data.settings.audio);
    this.lifecycleCleanup = new LifecycleService(() => this.handleHidden(), () => this.saveService.persist(this.state.save)).start();
    this.render('boot');
    await Promise.resolve();
    this.render(this.state.view);
  }

  private render(view: AppView): void {
    this.clearCountdown();
    if (view !== 'battle' && view !== 'countdown') this.gameHost.stop();
    this.state.view = view;
    this.root.className = view === 'battle' ? 'app-root app-root-battle' : 'app-root';
    this.root.replaceChildren();
    if (view === 'boot') { this.renderBoot(); return; }
    if (view === 'name-entry') { this.root.append(createNameView((name) => this.setName(name))); return; }
    if (view === 'home') { this.root.append(this.homeView()); return; }
    if (view === 'stage-select') { this.root.append(createStageSelectView(this.state.save, (id) => this.startStage(id), () => this.render('home'))); return; }
    if (view === 'rules') { this.root.append(createRulesView(() => this.render('home'))); return; }
    if (view === 'settings') { this.root.append(this.settingsView()); return; }
    if (view === 'countdown') { this.renderCountdown(); return; }
    if (view === 'battle') { this.renderBattle(); return; }
    if (view === 'result' && this.lastResult) { this.root.append(this.resultView(this.lastResult)); return; }
    this.render('home');
  }

  private renderBoot(): void {
    const shell = element('section', 'boot-screen');
    shell.append(element('p', 'eyebrow', 'CODE-GENERATED DEFENSE')); 
    shell.append(element('h1', '', 'カコマレ'));
    shell.append(element('p', 'boot-status', '準備しています…'));
    this.root.append(shell);
  }

  private setName(name: string): void {
    const next: SaveData = { ...this.state.save, profile: { name } };
    this.state.save = next;
    this.saveService.persist(next);
    void this.audio.start();
    this.render('home');
  }

  private homeView(): HTMLElement {
    const view = createHomeView(this.state.save, {
      start: () => this.render('stage-select'),
      stages: () => this.render('stage-select'),
      settings: () => this.render('settings'),
      rules: () => this.render('rules'),
      share: () => { void this.shareHome(); },
    });
    this.addNotice(view);
    return view;
  }

  private settingsView(): HTMLElement {
    return createSettingsView(this.state.save, {
      change: (next) => { this.state.save = next; this.saveService.persist(next); this.audio.setVolume(next.settings.audio); },
      changeName: (name) => { const next = { ...this.state.save, profile: { name } }; this.state.save = next; this.saveService.persist(next); this.announce('名前を変更しました'); },
      exportSave: () => { void this.exportSave(); },
      importSave: (raw) => this.importSave(raw),
      reset: () => this.resetSave(),
      back: () => this.render('home'),
    });
  }

  private startStage(stageId: 'stage-1'): void {
    if (this.battleStarted) return;
    this.battleStarted = true;
    const next: SaveData = {
      ...this.state.save,
      statistics: { ...this.state.save.statistics, playCount: this.state.save.statistics.playCount + 1 },
    };
    this.state.save = next;
    this.saveService.persist(next);
    this.state.selectedStage = stageId;
    void this.audio.start();
    this.render('countdown');
  }

  private renderCountdown(): void {
    const shell = element('section', 'countdown-screen');
    shell.dataset.testid = 'countdown-screen';
    shell.append(element('p', 'eyebrow', '防衛準備'));
    const number = element('p', 'countdown-number', '3');
    number.dataset.testid = 'countdown-number';
    shell.append(number, element('p', 'countdown-copy', '戦場と装置を読み込んでいます'));
    this.root.append(shell);
    let remaining = 3;
    this.countdownTimer = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        this.clearCountdown();
        this.render('battle');
        return;
      }
      number.textContent = String(remaining);
    }, 1000);
  }

  private renderBattle(): void {
    const shell = element('section', 'battle-shell');
    shell.dataset.testid = 'battle-screen';
    const header = element('header', 'battle-header');
    header.append(element('p', 'eyebrow', 'カコマレ / STAGE 1'));
    const pause = button('一時停止', 'button button-secondary pause-button');
    pause.dataset.testid = 'pause-button';
    pause.addEventListener('click', () => this.openPause(false));
    header.append(pause);
    shell.append(header);

    const layout = element('div', 'battle-layout');
    const arenaColumn = element('div', 'arena-column');
    const mount = element('div', 'battle-canvas-shell');
    const gameMount = element('div', 'game-mount');
    gameMount.id = 'game-mount';
    mount.append(gameMount);
    arenaColumn.append(mount);
    const aimState = element('p', 'aim-state', '自動照準'); aimState.dataset.testid = 'aim-state';
    arenaColumn.append(aimState);
    const status = element('p', 'battle-status', '戦闘準備中'); status.dataset.testid = 'battle-status';
    arenaColumn.append(status);

    const panel = element('aside', 'battle-panel');
    const hud = element('div', 'battle-hud');
    const health = this.hudItem('耐久力', '100 / 100', 'hud-health');
    const time = this.hudItem('経過時間', '0秒', 'hud-time');
    const xp = this.hudItem('経験値', '0 / 25', 'hud-xp');
    const score = this.hudItem('得点', '0', 'hud-score');
    hud.append(health, time, xp, score);
    panel.append(hud);
    const build = element('div', 'build-panel'); build.dataset.testid = 'build-panel';
    build.append(element('h2', '', '六角装置'));
    const buildList = element('p', 'build-list', '連針砲 Lv1'); buildList.dataset.testid = 'build-list'; build.append(buildList);
    const limits = element('p', 'battle-help', 'ドラッグ: 方向を0.8秒優先 / タップ: 候補を選択'); panel.append(build, limits);
    const controls = element('div', 'battle-controls');
    const rerollInfo = element('p', 'battle-help', '強化候補が出たら1回タップで選べます'); rerollInfo.dataset.testid = 'upgrade-help';
    controls.append(rerollInfo); panel.append(controls);
    layout.append(arenaColumn, panel);
    shell.append(layout);
    this.root.append(shell);

    const query = new URLSearchParams(window.location.search);
    const testMode = query.get('test') === '1';
    const outcome = query.get('outcome');
    this.gameHost.startBattle(gameMount, {
      stageId: this.state.selectedStage,
      effectsLevel: this.state.save.settings.effects,
      reducedMotion: this.state.save.settings.reducedMotion,
      aimAssist: this.state.save.settings.aimAssist,
      testMode,
      testOutcome: outcome === 'victory' || outcome === 'defeat' ? outcome : undefined,
      testUpgrade: query.get('upgrade') === '1',
      callbacks: {
        onSnapshot: (snapshot) => this.updateBattleHud(snapshot, health, time, xp, score, aimState, buildList),
        onUpgrade: (payload) => this.showUpgrade(payload, shell),
        onFinish: (result) => { window.setTimeout(() => this.finishBattle(result), 0); },
        onStatus: (message) => { status.textContent = message; this.announce(message); this.audio.tone(message.includes('ダメージ') ? 'danger' : 'game', message.includes('ダメージ') ? 120 : 440); },
      },
    });
  }

  private hudItem(label: string, value: string, testid: string): HTMLElement {
    const item = element('div', 'hud-item');
    item.append(element('span', 'hud-label', label));
    const valueNode = element('strong', 'hud-value', value); valueNode.dataset.testid = testid; item.append(valueNode);
    return item;
  }

  private updateBattleHud(snapshot: BattleSnapshot, health: HTMLElement, time: HTMLElement, xp: HTMLElement, score: HTMLElement, aimState: HTMLElement, buildList: HTMLElement): void {
    const healthValue = health.querySelector<HTMLElement>('[data-testid="hud-health"]');
    const timeValue = time.querySelector<HTMLElement>('[data-testid="hud-time"]');
    const xpValue = xp.querySelector<HTMLElement>('[data-testid="hud-xp"]');
    const scoreValue = score.querySelector<HTMLElement>('[data-testid="hud-score"]');
    if (healthValue) healthValue.textContent = `${Math.max(0, Math.round(snapshot.core))} / ${snapshot.maxCore}`;
    if (timeValue) timeValue.textContent = `${Math.floor(snapshot.elapsed)}秒`;
    if (xpValue) xpValue.textContent = `${Math.floor(snapshot.experience)} / ${snapshot.nextExperience}`;
    if (scoreValue) scoreValue.textContent = snapshot.score.toLocaleString('ja-JP');
    aimState.textContent = snapshot.manualAim ? '手動照準中' : '自動照準';
    buildList.textContent = [...snapshot.weapons.map((weapon) => `${this.weaponName(weapon.id)} Lv${weapon.level}`), ...snapshot.supports.map((support) => `${this.supportName(support.id)} Lv${support.level}`)].join(' / ');
  }

  private showUpgrade(payload: UpgradePayload, shell: HTMLElement): void {
    this.removeModal(shell);
    if (payload.candidates.length === 0) return;
    const layer = element('div', 'modal-layer');
    const dialog = element('div', 'modal-dialog');
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'upgrade-title');
    dialog.append(element('p', 'eyebrow', '装置を更新')); const title = element('h2', '', '強化候補を1つ選ぶ'); title.id = 'upgrade-title'; dialog.append(title);
    dialog.append(element('p', 'modal-copy', '戦闘速度を落としています。変更前と変更後を確認してください。'));
    const list = element('div', 'upgrade-list');
    let locked = true;
    const choiceButtons: HTMLButtonElement[] = [];
    let selectedIndex = 0;
    window.setTimeout(() => { locked = false; }, 150);
    for (const candidate of payload.candidates) {
      const card = element('article', 'upgrade-card');
      const choose = button(candidate.title, 'upgrade-choice');
      choose.dataset.testid = 'upgrade-candidate';
      choose.disabled = true;
      choiceButtons.push(choose);
      choose.addEventListener('click', () => { if (locked) return; locked = true; this.gameHost.chooseUpgrade(candidate); });
      card.append(choose, element('p', 'upgrade-description', candidate.description), element('p', 'upgrade-change', `${candidate.before} → ${candidate.after}`), element('p', 'upgrade-role', `得意: ${candidate.role}`));
      const ban = button('この候補を除外', 'button button-small');
      ban.disabled = payload.bansLeft <= 0;
      ban.addEventListener('click', () => this.gameHost.banUpgrade(candidate.id));
      card.append(ban); list.append(card);
      window.setTimeout(() => { choose.disabled = false; }, 150);
    }
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); selectedIndex = (selectedIndex + 1) % choiceButtons.length; choiceButtons[selectedIndex]?.focus(); }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); selectedIndex = (selectedIndex + choiceButtons.length - 1) % choiceButtons.length; choiceButtons[selectedIndex]?.focus(); }
      if (event.key === 'Enter') { event.preventDefault(); choiceButtons[selectedIndex]?.click(); }
    });
    dialog.append(list);
    const footer = element('div', 'modal-footer');
    const reroll = button(`引き直す（残り${payload.rerollsLeft}回）`, 'button button-secondary');
    reroll.disabled = payload.rerollsLeft <= 0; reroll.addEventListener('click', () => this.gameHost.rerollUpgrade()); footer.append(reroll);
    dialog.append(footer); layer.append(dialog); shell.append(layer);
    window.setTimeout(() => choiceButtons[0]?.focus(), 160);
  }

  private openPause(fromVisibility: boolean): void {
    if (!this.battleStarted || this.state.view !== 'battle') return;
    this.gameHost.pause();
    const shell = this.root.querySelector<HTMLElement>('.battle-shell');
    if (!shell) return;
    this.removeModal(shell);
    const layer = element('div', 'modal-layer');
    const dialog = element('div', 'modal-dialog pause-dialog'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    dialog.append(element('p', 'eyebrow', '一時停止'), element('h2', '', fromVisibility ? '画面を離れたため停止中' : '戦闘を停止しました'), element('p', 'modal-copy', '再開するまでゲーム時間と敵の動きを止めています。'));
    const resume = button('再開', 'button button-primary button-large'); resume.dataset.testid = 'resume-button';
    resume.addEventListener('click', () => { this.removeModal(shell); if (fromVisibility) this.shortResume(); else this.gameHost.resume(); });
    const rules = button('遊び方'); rules.addEventListener('click', () => this.showPauseRules(dialog));
    const settings = button('音量と演出'); settings.addEventListener('click', () => this.showPauseSettings(dialog));
    const retire = button('リタイア', 'button button-danger'); retire.addEventListener('click', () => { if (window.confirm('このプレイを終了しますか？得点は確定しません。')) this.gameHost.retire(); });
    const home = button('ホームへ戻る'); home.addEventListener('click', () => { if (window.confirm('プレイを終了してホームへ戻りますか？')) { this.gameHost.stop(); this.battleStarted = false; this.render('home'); } });
    dialog.append(resume, rules, settings, retire, home); layer.append(dialog); shell.append(layer);
  }

  private showPauseRules(dialog: HTMLElement): void {
    const copy = element('div', 'pause-rules'); copy.append(element('h3', '', '操作'), element('p', '', '戦場を1本指でドラッグすると、その方向を短時間優先します。強化候補は1回タップで選びます。'));
    const close = button('一時停止へ戻る'); close.addEventListener('click', () => copy.remove()); copy.append(close); dialog.append(copy);
  }

  private showPauseSettings(dialog: HTMLElement): void {
    if (dialog.querySelector('.pause-settings')) return;
    const box = element('div', 'pause-settings');
    box.append(element('h3', '', '音量と演出'));
    const label = element('label', 'setting-row', '効果音');
    const input = element('input') as HTMLInputElement;
    input.type = 'range'; input.min = '0'; input.max = '100'; input.value = String(this.state.save.settings.audio);
    input.addEventListener('input', () => { const next = { ...this.state.save, settings: { ...this.state.save.settings, audio: Number(input.value) } }; this.state.save = next; this.saveService.persist(next); this.audio.setVolume(next.settings.audio); });
    label.append(input); box.append(label); dialog.append(box);
  }

  private shortResume(): void {
    const shell = this.root.querySelector<HTMLElement>('.battle-shell'); if (!shell) return;
    const layer = element('div', 'modal-layer'); const message = element('div', 'resume-countdown', '3'); layer.append(message); shell.append(layer);
    let remaining = 3;
    const timer = window.setInterval(() => { remaining -= 1; if (remaining <= 0) { window.clearInterval(timer); layer.remove(); this.gameHost.resume(); } else message.textContent = String(remaining); }, 500);
  }

  private handleHidden(): void {
    if (this.state.view === 'battle' && !this.gameHost.isPaused() && !this.root.querySelector('.battle-shell .modal-layer')) this.openPause(true);
  }

  private finishBattle(result: BattleResult): void {
    if (!this.battleStarted) return;
    this.lastResult = result;
    this.gameHost.stop();
    this.battleStarted = false;
    const previous = this.state.save.records.stageBest['stage-1'];
    const nextBest = !result.retired && (!previous || result.score > previous.bestScore);
    const settledKills = result.retired ? 0 : result.kills;
    const settledParts = result.retired ? 0 : result.partsEarned;
    const weaponUsage = { ...this.state.save.statistics.weaponUsage };
    if (!result.retired) for (const [id, amount] of Object.entries(result.weaponDamage)) weaponUsage[id as keyof typeof weaponUsage] = (weaponUsage[id as keyof typeof weaponUsage] ?? 0) + Math.round(amount ?? 0);
    const next: SaveData = {
      ...this.state.save,
      progress: { ...this.state.save.progress, parts: this.state.save.progress.parts + settledParts },
      records: {
        ...this.state.save.records,
        stageBest: {
          ...this.state.save.records.stageBest,
          'stage-1': {
            bestScore: Math.max(previous?.bestScore ?? 0, result.retired ? 0 : result.score),
            bestCore: Math.max(previous?.bestCore ?? 0, result.retired ? 0 : Math.round(result.coreRemaining)),
            bestTime: Math.max(previous?.bestTime ?? 0, result.retired ? 0 : result.survivalTime),
          },
        },
      },
      statistics: {
        ...this.state.save.statistics,
        clearCount: this.state.save.statistics.clearCount + (!result.retired && result.outcome === 'victory' ? 1 : 0),
        totalKills: this.state.save.statistics.totalKills + settledKills,
        weaponUsage,
      },
    };
    this.state.save = next; this.saveService.persist(next); this.state.notice = nextBest ? '自己最高記録を更新しました。' : '';
    this.render('result');
  }

  private resultView(result: BattleResult): HTMLElement {
    const view = createResultView(result, { again: () => this.startStage(result.stageId), home: () => this.render('home'), share: () => { void this.shareResult(result); } });
    this.addNotice(view); return view;
  }

  private async shareHome(): Promise<void> {
    const result = await this.shareService.share('カコマレ', '全方位防衛ゲーム「カコマレ」\n六方向から迫る敵を防ぎ、装置を組み上げよう。');
    if (!result.success) this.showManualShare('全方位防衛ゲーム「カコマレ」\n六方向から迫る敵を防ぎ、装置を組み上げよう。'); else this.announce(result.method === 'native' ? '共有画面を開きました' : '共有文とURLをコピーしました');
  }

  private async shareResult(result: BattleResult): Promise<void> {
    const text = `カコマレで ${result.score.toLocaleString('ja-JP')} 点、${Math.floor(result.survivalTime)}秒生存しました。`;
    const shared = await this.shareService.share('カコマレの結果', text);
    if (!shared.success) this.showManualShare(text); else this.announce(shared.method === 'native' ? '共有画面を開きました' : '結果とURLをコピーしました');
  }

  private showManualShare(text: string): void {
    const value = `${text}\n${window.location.href}`;
    window.prompt('次の内容をコピーしてください。', value);
  }

  private async exportSave(): Promise<void> {
    const raw = this.saveService.exportJson(this.state.save);
    try { await navigator.clipboard.writeText(raw); this.announce('保存データをコピーしました'); }
    catch { window.prompt('保存データをコピーしてください。', raw); }
  }

  private importSave(raw: string): void {
    const data = this.saveService.validateImport(raw);
    if (!data) { window.alert('読み込める保存データではありません。'); return; }
    const summary = `${data.profile.name} / プレイ回数 ${data.statistics.playCount}`;
    if (!window.confirm(`この保存データを読み込みますか？\n${summary}`)) return;
    this.state.save = this.saveService.importJson(raw);
    this.state.notice = '保存データを読み込みました。';
    this.render('settings');
  }

  private resetSave(): void {
    if (!window.confirm('進行、記録、設定を初期化しますか？')) return;
    if (window.prompt('確認のため「初期化」と入力してください。') !== '初期化') return;
    this.state.save = this.saveService.reset(); this.state.notice = '保存データを初期化しました。'; this.render('name-entry');
  }

  private addNotice(view: HTMLElement): void {
    if (!this.state.notice) return;
    const notice = element('p', 'notice', this.state.notice); notice.setAttribute('role', 'status'); view.prepend(notice); this.state.notice = '';
  }

  private removeModal(shell: HTMLElement): void { shell.querySelector('.modal-layer')?.remove(); }

  private announce(message: string): void { const live = document.querySelector<HTMLElement>('#live-region'); if (live) live.textContent = message; }

  private weaponName(id: string): string { return ({ needle: '連針砲', ray: '光路刃', cluster: '群集弾', repulse: '反発輪' } as Record<string, string>)[id] ?? id; }
  private supportName(id: string): string { return ({ output: '出力環', rhythm: '律動環', brake: '制動環' } as Record<string, string>)[id] ?? id; }
  private clearCountdown(): void { if (this.countdownTimer !== null) { window.clearInterval(this.countdownTimer); this.countdownTimer = null; } }

  public destroy(): void { this.clearCountdown(); this.gameHost.stop(); this.lifecycleCleanup?.(); }
}
