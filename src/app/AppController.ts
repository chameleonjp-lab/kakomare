import { createAppState, type AppState } from './AppState';
import type { AppView } from './routes';
import { SaveService } from '../services/SaveService';
import { AudioService } from '../services/AudioService';
import { ShareService } from '../services/ShareService';
import { LifecycleService } from '../services/LifecycleService';
import { GameHost } from '../game/GameHost';
import type { BattleResult, BattleSnapshot, UpgradePayload } from '../types/game';
import { createDefaultSave, type SaveData } from '../types/save';
import { button, element, isValidPlayerName } from '../ui/viewUtils';
import { createNameView } from '../ui/NameView';
import { createHomeView } from '../ui/HomeView';
import { createStageSelectView } from '../ui/StageSelectView';
import { createRulesView } from '../ui/RulesView';
import { createSettingsView } from '../ui/SettingsView';
import { createResultView } from '../ui/ResultView';
import { createResearchView } from '../ui/ResearchView';
import { getResearchEffects, purchaseResearch } from '../data/research';
import { STAGES, stageIsUnlocked } from '../data/stages';
import { SUPPORTS } from '../data/supports';
import { WEAPONS } from '../data/weapons';
import type { StageId } from '../types/content';
import { isLocalTestHost } from './testMode';
import { RunLifecycleGuard } from './RunLifecycleGuard';

function stageLabel(stageId: StageId): string {
  return stageId === 'endless' ? 'ENDLESS' : stageId.replace('stage-', 'STAGE ');
}

const FIRST_CLEAR_PART_BONUS = 25;

export class AppController {
  private readonly saveService = new SaveService();
  private readonly audio = new AudioService();
  private readonly shareService = new ShareService();
  private readonly gameHost = new GameHost();
  private state: AppState = createAppState(createDefaultSave());
  private lastResult: BattleResult | null = null;
  private countdownTimer: number | null = null;
  private resumeCountdownTimer: number | null = null;
  private readonly runLifecycle = new RunLifecycleGuard();
  private lifecycleCleanup: (() => void) | null = null;
  private started = false;
  private battleUpgradeOpen = false;

  public constructor(private readonly root: HTMLElement) {}

  public start(): void {
    if (this.started) return;
    this.started = true;
    this.render('boot');
    window.setTimeout(() => this.finishStartup(), 0);
  }

  private finishStartup(): void {
    try {
      const loaded = this.saveService.load();
      this.state = createAppState(loaded.data);
      this.state.notice = loaded.message;
      this.audio.setVolume(loaded.data.settings.audio);
      this.audio.setMusicVolume(loaded.data.settings.music);
      this.lifecycleCleanup = new LifecycleService(
        () => this.handleHidden(),
        () => this.saveService.persist(this.state.save),
        () => this.handleViewportChange(),
        () => this.handleOrientationChange(),
      ).start();
      this.render(this.state.view);
    } catch {
      this.renderBootError();
    }
  }

  private render(view: AppView): void {
    this.clearCountdown();
    this.clearResumeCountdown();
    if (view !== 'battle' && view !== 'countdown') this.gameHost.stop();
    if (view !== 'battle') this.battleUpgradeOpen = false;
    this.state.view = view;
    this.root.className = view === 'battle' ? 'app-root app-root-battle' : 'app-root';
    this.root.replaceChildren();
    if (view === 'boot') { this.renderBoot(); return; }
    if (view === 'name-entry') {
      const nameView = createNameView((name) => this.setName(name));
      this.addNotice(nameView);
      this.root.append(nameView);
      return;
    }
    if (view === 'home') { this.root.append(this.homeView()); return; }
    if (view === 'stage-select') { this.root.append(createStageSelectView(this.state.save, (id) => this.startStage(id), () => this.render('home'))); return; }
    if (view === 'research') { this.root.append(this.researchView()); return; }
    if (view === 'rules') { this.root.append(createRulesView(() => this.render('home'))); return; }
    if (view === 'settings') { this.root.append(this.settingsView()); return; }
    if (view === 'countdown') { this.renderCountdown(); return; }
    if (view === 'battle') { this.renderBattle(); return; }
    if (view === 'result' && this.lastResult) {
      this.root.append(this.resultView(this.lastResult));
      this.scrollToTop();
      return;
    }
    this.render('home');
  }

  private renderBoot(): void {
    const shell = element('section', 'boot-screen');
    shell.dataset.testid = 'boot-screen';
    shell.append(element('p', 'eyebrow', 'CODE-GENERATED DEFENSE')); 
    shell.append(element('h1', '', 'カコマレ'));
    shell.append(element('p', 'boot-status', '準備しています…'));
    this.root.append(shell);
  }

  private renderBootError(): void {
    this.root.className = 'app-root';
    this.root.replaceChildren();
    const shell = element('section', 'boot-screen');
    shell.dataset.testid = 'boot-error';
    shell.append(element('p', 'eyebrow', 'カコマレ'));
    shell.append(element('h1', '', '読み込みに失敗しました'));
    shell.append(element('p', 'boot-status', '保存データまたは画面の準備に失敗しました。もう一度試してください。'));
    const retry = button('もう一度試す', 'button button-primary button-large');
    retry.dataset.testid = 'boot-retry';
    retry.addEventListener('click', () => {
      this.started = false;
      this.start();
    });
    shell.append(retry);
    this.root.append(shell);
  }

  private setName(name: string): void {
    const next: SaveData = { ...this.state.save, profile: { name } };
    this.commitSave(next);
    void this.audio.start();
    this.render('home');
  }

  private homeView(): HTMLElement {
    const view = createHomeView(this.state.save, {
      start: () => this.render('stage-select'),
      stages: () => this.render('stage-select'),
      settings: () => this.render('settings'),
      rules: () => this.render('rules'),
      research: () => this.render('research'),
      share: () => { void this.shareHome(); },
    });
    this.addNotice(view);
    return view;
  }

  private settingsView(): HTMLElement {
    return createSettingsView(this.state.save, {
      change: (patch) => {
        const next = { ...this.state.save, settings: { ...this.state.save.settings, ...patch } };
        this.commitSave(next);
        this.audio.setVolume(next.settings.audio);
        this.audio.setMusicVolume(next.settings.music);
      },
      changeName: (name) => {
        const next = { ...this.state.save, profile: { name } };
        if (this.commitSave(next)) this.announce('名前を変更しました');
      },
      exportSave: () => { void this.exportSave(); },
      copyDamaged: () => { void this.copyDamagedSave(); },
      hasDamagedSave: this.saveService.damagedJson() !== null,
      importSave: (raw) => this.importSave(raw),
      reset: () => this.resetSave(),
      back: () => this.render('home'),
    });
  }

  private startStage(stageId: StageId): void {
    if (this.runLifecycle.active || !stageIsUnlocked(stageId, this.state.save.progress.unlockedStages)) return;
    if (!isValidPlayerName(this.state.save.profile.name)) {
      this.state.notice = 'プレイを始める前に、1〜12文字の名前を入力してください。';
      this.render('name-entry');
      return;
    }
    if (!this.runLifecycle.start()) return;
    const next: SaveData = {
      ...this.state.save,
      statistics: { ...this.state.save.statistics, playCount: this.state.save.statistics.playCount + 1 },
    };
    this.commitSave(next);
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
    this.addNotice(shell);
    this.root.append(shell);
    let remaining = 3;
    this.countdownTimer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
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
    header.append(element('p', 'eyebrow', `カコマレ / ${stageLabel(this.state.selectedStage)}`));
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
    const aimState = element('p', 'aim-state', '自動照準'); aimState.dataset.testid = 'aim-state'; aimState.setAttribute('role', 'status');
    arenaColumn.append(aimState);
    const status = element('p', 'battle-status', '戦闘準備中'); status.dataset.testid = 'battle-status'; status.setAttribute('role', 'status');
    arenaColumn.append(status);

    const panel = element('aside', 'battle-panel');
    const hud = element('div', 'battle-hud');
    const maxCore = getResearchEffects(this.state.save).maxCore;
    const health = this.hudItem('耐久力', `${maxCore} / ${maxCore}`, 'hud-health');
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
    const testMode = isLocalTestHost(window.location.hostname) && query.get('test') === '1';
    const outcome = query.get('outcome');
    this.gameHost.startBattle(gameMount, {
      stageId: this.state.selectedStage,
      effectsLevel: this.state.save.settings.effects,
      reducedMotion: this.state.save.settings.reducedMotion,
      screenShake: this.state.save.settings.screenShake,
      aimAssist: this.state.save.settings.aimAssist,
      researchEffects: getResearchEffects(this.state.save),
      testMode,
      testOutcome: testMode && (outcome === 'victory' || outcome === 'defeat') ? outcome : undefined,
      testUpgrade: testMode && query.get('upgrade') === '1',
      callbacks: {
        onSnapshot: (snapshot) => this.updateBattleHud(snapshot, health, time, xp, score, aimState, buildList),
        onUpgrade: (payload) => this.showUpgrade(payload, shell),
        onFinish: (result) => { window.setTimeout(() => this.finishBattle(result), 0); },
        onStatus: (message) => { status.textContent = message; this.announce(message); this.audio.tone(message.includes('ダメージ') ? 'danger' : 'game', message.includes('ダメージ') ? 120 : 440); },
        onPauseRequest: () => this.openPause(false),
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
    this.removeModal(shell, '.upgrade-layer');
    if (payload.candidates.length === 0) {
      this.battleUpgradeOpen = false;
      if (shell.querySelector('.pause-layer, .resume-layer')) this.setBattleContentInert(shell, true);
      else this.restoreBattleFocus(shell);
      return;
    }
    this.battleUpgradeOpen = true;
    this.setBattleContentInert(shell, true);
    const layer = element('div', 'modal-layer upgrade-layer');
    const dialog = element('div', 'modal-dialog');
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'upgrade-title'); dialog.tabIndex = -1;
    dialog.append(element('p', 'eyebrow', '装置を更新')); const title = element('h2', '', '強化候補を1つ選ぶ'); title.id = 'upgrade-title'; dialog.append(title);
    dialog.append(element('p', 'modal-copy', '戦闘速度を落としています。変更前と変更後を確認してください。'));
    if (getResearchEffects(this.state.save).candidateDetails) dialog.append(element('p', 'modal-copy', '詳細解析: 数値の変化と得意な敵を表示しています。'));
    const list = element('div', 'upgrade-list');
    let locked = true;
    const choiceButtons: HTMLButtonElement[] = [];
    let selectedIndex = 0;
    for (const candidate of payload.candidates) {
      const card = element('article', 'upgrade-card');
      const choose = button(candidate.title, 'upgrade-choice');
      choose.dataset.testid = 'upgrade-candidate';
      choose.disabled = true;
      choiceButtons.push(choose);
      choose.addEventListener('focus', () => { selectedIndex = choiceButtons.indexOf(choose); });
      choose.addEventListener('click', () => { if (locked) return; locked = true; this.gameHost.chooseUpgrade(candidate); });
      card.append(choose, element('p', 'upgrade-description', candidate.description), element('p', 'upgrade-change', `${candidate.before} → ${candidate.after}`), element('p', 'upgrade-role', `得意: ${candidate.role}`));
      if (candidate.requiresNewItemFirst) card.append(element('p', 'upgrade-details', '候補を3つ保つため、新しい装置を先に取得すると選べます。'));
      if (getResearchEffects(this.state.save).candidateDetails && candidate.details) card.append(element('p', 'upgrade-details', candidate.details));
      const ban = button('この候補を除外', 'button button-small');
      ban.disabled = true;
      ban.addEventListener('click', () => {
        if (locked || ban.disabled) return;
        locked = true;
        ban.disabled = true;
        this.gameHost.banUpgrade(candidate.id);
      });
      card.append(ban);
      card.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('button')) return;
        choose.click();
      });
      list.append(card);
    }
    window.setTimeout(() => {
      if (!layer.isConnected) return;
      locked = false;
      choiceButtons.forEach((choice, index) => { choice.disabled = payload.candidates[index]?.requiresNewItemFirst === true; });
      list.querySelectorAll<HTMLButtonElement>('.button-small').forEach((ban) => { ban.disabled = payload.bansLeft <= 0; });
    }, 150);
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        // Escape belongs to the upgrade dialog. Consume it here so a
        // delayed browser key event cannot reach Phaser after selection.
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); selectedIndex = (selectedIndex + 1) % choiceButtons.length; choiceButtons[selectedIndex]?.focus(); }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); selectedIndex = (selectedIndex + choiceButtons.length - 1) % choiceButtons.length; choiceButtons[selectedIndex]?.focus(); }
    });
    dialog.append(list);
    const footer = element('div', 'modal-footer');
    const reroll = button(`引き直す（残り${payload.rerollsLeft}回）`, 'button button-secondary');
    reroll.disabled = payload.rerollsLeft <= 0 || locked;
    reroll.addEventListener('click', () => {
      if (locked || reroll.disabled) return;
      locked = true;
      reroll.disabled = true;
      this.gameHost.rerollUpgrade();
    });
    footer.append(reroll);
    dialog.append(footer); layer.append(dialog); shell.append(layer);
    this.trapFocus(dialog);
    window.setTimeout(() => { if (layer.isConnected) reroll.disabled = payload.rerollsLeft <= 0; }, 150);
    window.setTimeout(() => choiceButtons.find((choice) => !choice.disabled)?.focus(), 160);
  }

  private openPause(fromVisibility: boolean, reason = ''): void {
    if (!this.runLifecycle.active || this.state.view !== 'battle') return;
    // The upgrade dialog already owns the pause boundary.  Ignore every
    // pause entry (including visibility recovery) while it is open so a
    // browser Escape/visibility event cannot leave a hidden pause state.
    if (this.battleUpgradeOpen || this.gameHost.isUpgrading()) return;
    const shell = this.root.querySelector<HTMLElement>('.battle-shell');
    if (!shell) return;
    const interruptedResume = this.resumeCountdownTimer !== null;
    if (interruptedResume) {
      this.clearResumeCountdown();
      shell.querySelector('.resume-layer')?.remove();
    }
    const resumeWithCountdown = fromVisibility || interruptedResume;
    this.gameHost.pause();
    if (shell.querySelector('.pause-layer')) return;
    shell.querySelector<HTMLElement>('.upgrade-layer')?.setAttribute('inert', '');
    this.setBattleContentInert(shell, true);
    const layer = element('div', 'modal-layer pause-layer');
    layer.dataset.visibilityPause = resumeWithCountdown ? 'true' : 'false';
    const dialog = element('div', 'modal-dialog pause-dialog'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.tabIndex = -1;
    const title = reason || (fromVisibility ? '画面を離れたため停止中' : '戦闘を停止しました');
    const titleNode = element('h2', '', title); titleNode.id = 'pause-title';
    const copy = element('p', 'modal-copy', '再開するまでゲーム時間と敵の動きを止めています。'); copy.id = 'pause-copy';
    dialog.setAttribute('aria-labelledby', titleNode.id); dialog.setAttribute('aria-describedby', copy.id);
    dialog.append(element('p', 'eyebrow', '一時停止'), titleNode, copy);
    const resume = button('再開', 'button button-primary button-large'); resume.dataset.testid = 'resume-button';
    resume.addEventListener('click', () => {
      if (resume.disabled) return;
      resume.disabled = true;
      layer.remove();
      if (resumeWithCountdown) this.shortResume();
      else {
        this.gameHost.resume();
        this.restoreBattleFocus(shell);
      }
    });
    const rules = button('遊び方'); rules.addEventListener('click', () => this.showPauseRules(dialog));
    const settings = button('音量と演出'); settings.addEventListener('click', () => this.showPauseSettings(dialog));
    const retire = button('リタイア', 'button button-danger'); retire.addEventListener('click', () => { if (window.confirm('このプレイを終了しますか？得点は確定しません。')) this.gameHost.retire(); });
    const home = button('ホームへ戻る'); home.addEventListener('click', () => { if (window.confirm('プレイを終了してホームへ戻りますか？')) { this.gameHost.stop(); this.runLifecycle.cancel(); this.render('home'); } });
    dialog.append(resume, rules, settings, retire, home); layer.append(dialog); shell.append(layer);
    this.trapFocus(dialog);
    window.setTimeout(() => resume.focus(), 0);
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
    input.id = 'pause-audio'; input.type = 'range'; input.min = '0'; input.max = '100'; input.value = String(this.state.save.settings.audio); input.setAttribute('aria-label', '効果音の音量');
    input.addEventListener('input', () => {
      const next = { ...this.state.save, settings: { ...this.state.save.settings, audio: Number(input.value) } };
      this.commitSave(next);
      this.audio.setVolume(next.settings.audio);
    });
    label.append(input); box.append(label); dialog.append(box);
  }

  private shortResume(): void {
    const shell = this.root.querySelector<HTMLElement>('.battle-shell'); if (!shell) return;
    if (this.resumeCountdownTimer !== null) return;
    const layer = element('div', 'modal-layer resume-layer'); const message = element('div', 'resume-countdown', '3'); layer.append(message); shell.append(layer);
    let remaining = 3;
    this.resumeCountdownTimer = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      remaining -= 1;
      if (remaining <= 0) {
        this.clearResumeCountdown();
        layer.remove();
        this.gameHost.resume();
        this.restoreBattleFocus(shell);
      } else message.textContent = String(remaining);
    }, 500);
  }

  private handleHidden(): void {
    if (this.state.view !== 'battle') return;
    if (this.resumeCountdownTimer !== null) {
      this.clearResumeCountdown();
      this.root.querySelector('.battle-shell .resume-layer')?.remove();
    }
    const pauseLayer = this.root.querySelector<HTMLElement>('.battle-shell .pause-layer');
    if (pauseLayer?.dataset.visibilityPause === 'true') return;
    pauseLayer?.remove();
    this.openPause(true);
  }

  private handleOrientationChange(): void {
    if (this.state.view !== 'battle' || !this.runLifecycle.active) return;
    const reason = '画面の向きが変わったため停止中';
    if (this.resumeCountdownTimer !== null) {
      this.clearResumeCountdown();
      this.root.querySelector('.battle-shell .resume-layer')?.remove();
      this.openPause(true, reason);
      return;
    }
    const pauseLayer = this.root.querySelector<HTMLElement>('.battle-shell .pause-layer');
    if (this.gameHost.isPaused()) {
      if (pauseLayer?.dataset.visibilityPause === 'true') return;
      pauseLayer?.remove();
      this.openPause(true, reason);
      return;
    }
    if (!pauseLayer) this.openPause(true, reason);
  }

  private handleViewportChange(): void {
    const viewport = window.visualViewport;
    const height = viewport?.height ?? window.innerHeight;
    const width = viewport?.width ?? window.innerWidth;
    document.documentElement.style.setProperty('--visual-viewport-height', `${height}px`);
    document.documentElement.style.setProperty('--visual-viewport-width', `${width}px`);
  }

  private finishBattle(result: BattleResult): void {
    if (!this.runLifecycle.finish()) return;
    const previous = result.stageId === 'endless' ? null : this.state.save.records.stageBest[result.stageId];
    const firstClear = !result.retired && result.outcome === 'victory' && result.newUnlock !== null && !this.state.save.progress.unlockedStages.includes(result.newUnlock);
    const finalResult = firstClear ? { ...result, partsEarned: result.partsEarned + FIRST_CLEAR_PART_BONUS } : result;
    this.lastResult = finalResult;
    this.gameHost.stop();
    const nextBest = !result.retired && (result.stageId === 'endless' ? result.score > this.state.save.records.endlessBest : !previous || result.score > previous.bestScore);
    const settledKills = result.retired ? 0 : result.kills;
    const settledParts = finalResult.retired ? 0 : finalResult.partsEarned;
    const weaponUsage = { ...this.state.save.statistics.weaponUsage };
    if (!result.retired) for (const [id, amount] of Object.entries(result.weaponDamage)) weaponUsage[id as keyof typeof weaponUsage] = (weaponUsage[id as keyof typeof weaponUsage] ?? 0) + Math.round(amount ?? 0);
    const supportUsage = { ...this.state.save.statistics.supportUsage };
    if (!result.retired) for (const [id, amount] of Object.entries(result.supportUsage)) supportUsage[id as keyof typeof supportUsage] = (supportUsage[id as keyof typeof supportUsage] ?? 0) + Math.round(amount ?? 0);
    const weaponBestDamage = { ...this.state.save.records.weaponBestDamage };
    if (!result.retired) for (const [id, amount] of Object.entries(result.weaponDamage)) weaponBestDamage[id as keyof typeof weaponBestDamage] = Math.max(weaponBestDamage[id as keyof typeof weaponBestDamage] ?? 0, Math.round(amount ?? 0));
    const enemyKills = { ...this.state.save.records.enemyKills };
    if (!result.retired) {
      for (const [id, amount] of Object.entries(result.enemyKills)) enemyKills[id as keyof typeof enemyKills] = (enemyKills[id as keyof typeof enemyKills] ?? 0) + Math.round(amount ?? 0);
      if (result.bossesDefeated > 0) enemyKills[result.bossId] = (enemyKills[result.bossId] ?? 0) + result.bossesDefeated;
    }
    const previousSector = this.state.save.records.sectorDamage[result.stageId] ?? [0, 0, 0, 0, 0, 0];
    const sectorDamage = result.retired ? previousSector : previousSector.map((value, index) => value + (result.sectorDamage[index] ?? 0));
    const unlockedStages = [...this.state.save.progress.unlockedStages];
    if (!result.retired && result.outcome === 'victory' && result.newUnlock && !unlockedStages.includes(result.newUnlock)) unlockedStages.push(result.newUnlock);
    const next: SaveData = {
      ...this.state.save,
      progress: { ...this.state.save.progress, parts: this.state.save.progress.parts + settledParts, unlockedStages },
      records: {
        ...this.state.save.records,
        stageBest: result.stageId === 'endless' || result.retired ? this.state.save.records.stageBest : {
          ...this.state.save.records.stageBest,
          [result.stageId]: {
            bestScore: Math.max(previous?.bestScore ?? 0, result.retired ? 0 : result.score),
            bestCore: Math.max(previous?.bestCore ?? 0, result.retired ? 0 : Math.round(result.coreRemaining)),
            bestTime: Math.max(previous?.bestTime ?? 0, result.retired ? 0 : result.survivalTime),
          },
        },
        endlessBest: result.stageId === 'endless' && !result.retired ? Math.max(this.state.save.records.endlessBest, result.score) : this.state.save.records.endlessBest,
        enemyKills,
        weaponBestDamage,
        sectorDamage: result.retired ? this.state.save.records.sectorDamage : { ...this.state.save.records.sectorDamage, [result.stageId]: sectorDamage },
      },
      statistics: {
        ...this.state.save.statistics,
        clearCount: this.state.save.statistics.clearCount + (!result.retired && result.outcome === 'victory' ? 1 : 0),
        totalKills: this.state.save.statistics.totalKills + settledKills,
        weaponUsage,
        supportUsage,
        controlSeconds: {
          slowed: this.state.save.statistics.controlSeconds.slowed + (result.retired ? 0 : result.controlSeconds.slowed),
          pushed: this.state.save.statistics.controlSeconds.pushed + (result.retired ? 0 : result.controlSeconds.pushed),
          pulled: this.state.save.statistics.controlSeconds.pulled + (result.retired ? 0 : result.controlSeconds.pulled),
        },
      },
    };
    if (this.commitSave(next)) this.state.notice = nextBest ? '自己最高記録を更新しました。' : '';
    this.render('result');
    this.announce(result.retired ? 'プレイを終了しました' : result.outcome === 'victory' ? '防衛成功' : '防衛失敗');
  }

  private resultView(result: BattleResult): HTMLElement {
    const view = createResultView(result, {
      again: () => this.startStage(result.stageId),
      next: () => { if (result.newUnlock) this.startStage(result.newUnlock); },
      home: () => this.render('home'),
      share: () => { void this.shareResult(result); },
    });
    this.addNotice(view); return view;
  }

  private researchView(): HTMLElement {
    const view = createResearchView(this.state.save, {
      purchase: (id) => {
        const next = purchaseResearch(this.state.save, id);
        if (!next) { this.announce('部品が足りないか、すでに取得済みです'); return; }
        if (this.commitSave(next)) this.state.notice = '研究を取得しました。';
        this.render('research');
      },
      back: () => this.render('home'),
    });
    this.addNotice(view);
    return view;
  }

  private async shareHome(): Promise<void> {
    const result = await this.shareService.share('カコマレ', '全方位防衛ゲーム「カコマレ」\n六方向から迫る敵を防ぎ、装置を組み上げよう。');
    if (result.method === 'cancelled') return;
    if (!result.success) this.showManualShare('全方位防衛ゲーム「カコマレ」\n六方向から迫る敵を防ぎ、装置を組み上げよう。');
    else this.showVisibleNotice(result.method === 'native' ? '共有を完了しました。' : '共有文とURLをコピーしました。');
  }

  private async shareResult(result: BattleResult): Promise<void> {
    const text = `カコマレで ${STAGES[result.stageId].name}を${result.outcome === 'victory' ? '突破し' : '戦い'}、${result.score.toLocaleString('ja-JP')}点、${Math.floor(result.survivalTime)}秒でした。`;
    const shared = await this.shareService.share('カコマレの結果', text);
    if (shared.method === 'cancelled') return;
    if (!shared.success) this.showManualShare(text);
    else this.showVisibleNotice(shared.method === 'native' ? '共有を完了しました。' : '結果とURLをコピーしました。');
  }

  private showManualShare(text: string): void {
    this.showCopyDialog(
      '共有文をコピー',
      '共有機能が使えないため、下の文章をコピーして共有してください。',
      `${text}\n${this.shareService.getShareUrl()}`,
      '共有文をコピー',
      'manual-share-copy',
      'share-modal',
    );
  }

  private async exportSave(): Promise<void> {
    const raw = this.saveService.exportJson(this.state.save);
    try { await navigator.clipboard.writeText(raw); this.announce('保存データをコピーしました'); }
    catch { this.showCopyDialog('保存データをコピー', 'クリップボードが使えないため、下のJSONをコピーしてください。', raw, '保存データをコピー', 'manual-save-copy'); }
  }

  private async copyDamagedSave(): Promise<void> {
    const raw = this.saveService.damagedJson();
    if (!raw) {
      this.announce('退避した破損データはありません');
      return;
    }
    try {
      if (!navigator.clipboard) throw new Error('クリップボードが使えません。');
      await navigator.clipboard.writeText(raw);
      this.announce('退避した破損データをコピーしました');
    } catch {
      this.showCopyDialog('退避データをコピー', '保存データを復旧する場合に使える退避データです。', raw, '退避データをコピー', 'copy-damaged-modal');
    }
  }

  private showCopyDialog(titleText: string, copyText: string, value: string, actionLabel: string, testid: string, className = 'copy-modal'): void {
    if (this.root.querySelector('.copy-modal, .share-modal')) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = [...this.root.children]
      .filter((node): node is HTMLElement => node instanceof HTMLElement)
      .map((node) => ({ node, wasInert: node.hasAttribute('inert') }));
    for (const { node } of background) node.setAttribute('inert', '');
    const layer = element('div', `modal-layer ${className}`);
    const dialog = element('div', 'modal-dialog share-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'copy-dialog-title');
    dialog.setAttribute('aria-describedby', 'copy-dialog-copy');
    dialog.tabIndex = -1;
    const title = element('h2', '', titleText); title.id = 'copy-dialog-title';
    const copy = element('p', 'modal-copy', copyText); copy.id = 'copy-dialog-copy';
    const field = element('textarea', 'share-text', value) as HTMLTextAreaElement;
    field.readOnly = true;
    field.rows = 6;
    field.setAttribute('aria-label', 'コピーする文章');
    const status = element('p', 'share-status', '');
    status.setAttribute('role', 'status');
    const actions = element('div', 'modal-footer');
    const closeDialog = (): void => {
      layer.remove();
      for (const { node, wasInert } of background) {
        if (node.isConnected && !wasInert) node.removeAttribute('inert');
      }
      if (previousFocus?.isConnected) window.setTimeout(() => previousFocus.focus(), 0);
    };
    const copyButton = button(actionLabel, 'button button-primary');
    copyButton.dataset.testid = testid;
    const selectFallback = (): void => {
      field.focus();
      field.select();
      status.textContent = '文章を選択しました。コピーしてください。';
    };
    copyButton.addEventListener('click', () => {
      if (!navigator.clipboard) {
        selectFallback();
        return;
      }
      void navigator.clipboard.writeText(value).then(() => {
        status.textContent = 'コピーしました。';
        this.announce(`${actionLabel}しました`);
      }).catch(selectFallback);
    });
    const closeButton = button('閉じる', 'button button-secondary');
    closeButton.addEventListener('click', closeDialog);
    dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeDialog();
    });
    actions.append(copyButton, closeButton);
    dialog.append(title, copy, field, status, actions);
    layer.append(dialog);
    this.root.append(layer);
    this.trapFocus(dialog);
    window.setTimeout(() => { field.focus(); field.select(); }, 0);
  }

  private importSave(raw: string): void {
    const data = this.saveService.validateImport(raw);
    if (!data) { window.alert('読み込める保存データではありません。'); return; }
    const summary = `${data.profile.name} / プレイ回数 ${data.statistics.playCount}`;
    if (!window.confirm(`この保存データを読み込みますか？\n${summary}`)) return;
    const imported = this.saveService.importJson(raw);
    if (!imported.persisted) {
      window.alert('保存領域へ書き込めなかったため、読み込みを中止しました。');
      return;
    }
    this.state.save = imported.data;
    this.state.notice = '保存データを読み込みました。';
    this.render('settings');
  }

  private resetSave(): void {
    if (!window.confirm('進行、記録、設定を初期化しますか？')) return;
    if (window.prompt('確認のため「初期化」と入力してください。') !== '初期化') return;
    const reset = this.saveService.reset();
    if (!reset.persisted) {
      window.alert('保存領域へ書き込めなかったため、初期化できませんでした。');
      return;
    }
    this.state.save = reset.data; this.state.notice = '保存データを初期化しました。'; this.render('name-entry');
  }

  private addNotice(view: HTMLElement): void {
    if (!this.state.notice) return;
    const notice = element('p', 'notice', this.state.notice); notice.setAttribute('role', 'status'); view.prepend(notice); this.state.notice = '';
  }

  private removeModal(shell: HTMLElement, selector = '.modal-layer'): void {
    shell.querySelector(selector)?.remove();
  }

  private setBattleContentInert(shell: HTMLElement, inert: boolean): void {
    for (const child of shell.querySelectorAll<HTMLElement>('.battle-header, .battle-layout')) {
      if (inert) child.setAttribute('inert', '');
      else child.removeAttribute('inert');
    }
  }

  private restoreBattleFocus(shell: HTMLElement): void {
    const upgrade = shell.querySelector<HTMLElement>('.upgrade-layer');
    if (upgrade) {
      upgrade.removeAttribute('inert');
      this.setBattleContentInert(shell, true);
      window.setTimeout(() => upgrade.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(), 0);
      return;
    }
    this.setBattleContentInert(shell, false);
    window.setTimeout(() => shell.querySelector<HTMLButtonElement>('[data-testid="pause-button"]')?.focus(), 0);
  }

  private trapFocus(dialog: HTMLElement): void {
    dialog.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')]
        .filter((node) => !node.hasAttribute('hidden'));
      if (focusable.length === 0) { event.preventDefault(); dialog.focus(); return; }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }

  private commitSave(next: SaveData): boolean {
    this.state.save = next;
    if (this.saveService.persist(next)) return true;
    const message = '端末へ保存できませんでした。空き容量やプライベートブラウズ設定を確認してください。';
    this.state.notice = message;
    this.showVisibleNotice(message, true);
    return false;
  }

  private showVisibleNotice(message: string, alert = false): void {
    this.announce(message);
    const container = this.root.firstElementChild;
    if (!container) return;
    container.querySelector('[data-action-notice]')?.remove();
    const notice = element('p', 'notice', message);
    notice.dataset.actionNotice = 'true';
    notice.setAttribute('role', alert ? 'alert' : 'status');
    container.prepend(notice);
  }

  private announce(message: string): void { const live = document.querySelector<HTMLElement>('#live-region'); if (live) live.textContent = message; }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  }

  private weaponName(id: string): string { return WEAPONS[id as keyof typeof WEAPONS]?.name ?? id; }
  private supportName(id: string): string { return SUPPORTS[id as keyof typeof SUPPORTS]?.name ?? id; }
  private clearCountdown(): void { if (this.countdownTimer !== null) { window.clearInterval(this.countdownTimer); this.countdownTimer = null; } }
  private clearResumeCountdown(): void { if (this.resumeCountdownTimer !== null) { window.clearInterval(this.resumeCountdownTimer); this.resumeCountdownTimer = null; } }

  public destroy(): void {
    this.clearCountdown();
    this.clearResumeCountdown();
    this.gameHost.stop();
    this.lifecycleCleanup?.();
    this.lifecycleCleanup = null;
    this.audio.stop();
    this.started = false;
  }
}
