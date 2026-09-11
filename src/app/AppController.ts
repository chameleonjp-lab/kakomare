import { createAppState, type AppState } from './AppState';
import type { AppView } from './routes';
import { SaveService } from '../services/SaveService';
import { RunSaveService } from '../services/RunSaveService';
import { ResultLedger } from '../services/ResultLedger';
import { RankingClient } from '../services/RankingClient';
import { AudioService, audioCueForStatus } from '../services/AudioService';
import { ShareService } from '../services/ShareService';
import { LifecycleService } from '../services/LifecycleService';
import { GameHost } from '../game/GameHost';
import type { BattleResult, BattleSnapshot, UpgradeCandidate, UpgradePayload } from '../types/game';
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
import type { RankingSnapshot } from '../types/ranking';
import type { RunSaveEnvelope } from '../types/runSave';
import { isLocalTestHost } from './testMode';
import { RunLifecycleGuard } from './RunLifecycleGuard';
import { MAX_DEVICE_SLOT_COUNT, DEVICE_SLOT_COUNT, itemAtExpandedSlot } from '../game/deviceLayout';
import { COMPETITIVE_RULES } from '../data/competitiveRules';

function stageLabel(stageId: StageId): string {
  return stageId === 'endless' ? 'ENDLESS' : stageId.replace('stage-', 'STAGE ');
}

const FIRST_CLEAR_PART_BONUS = 25;

function runStageIsCompatible(checkpoint: RunSaveEnvelope, save: SaveData): boolean {
  const endless = checkpoint.stageId === 'endless';
  const expectedRuleVersion = endless ? COMPETITIVE_RULES.version : 'runtime-v0';
  return stageIsUnlocked(checkpoint.stageId, save.progress.unlockedStages)
    && checkpoint.contentVersion === 'catalog-v5'
    && checkpoint.ruleVersion === expectedRuleVersion
    && checkpoint.competitive === endless
    && checkpoint.snapshot.isEndless === endless;
}

export class AppController {
  private readonly saveService = new SaveService();
  private readonly runSaveService = new RunSaveService();
  private readonly resultLedger = new ResultLedger();
  private readonly rankingClient = new RankingClient({ onChange: () => this.refreshRankingResult() });
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
  private battleRunSequence = 0;
  private upgradeInterrupted = false;
  private latestBattleSnapshot: BattleSnapshot | null = null;
  private pendingResumeCheckpoint: RunSaveEnvelope | null = null;
  private rankingStartPromise: Promise<RankingSnapshot> | null = null;

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
      resume: this.runSaveService.hasSavedRun() ? () => this.resumeSavedRun() : undefined,
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
      this.state.notice = 'プレイを始める前に、1〜20文字の名前を入力してください。';
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
    this.pendingResumeCheckpoint = null;
    this.rankingStartPromise = stageId === 'endless'
      ? this.rankingClient.begin(this.state.save.profile.name)
      : null;
    void this.audio.start();
    this.render('countdown');
  }

  private resumeSavedRun(): void {
    if (this.runLifecycle.active) return;
    const loaded = this.runSaveService.load();
    if (!loaded.data) {
      this.state.notice = loaded.message || '再開できる途中状態がありません。';
      this.render('home');
      return;
    }
    if (!isValidPlayerName(this.state.save.profile.name)) {
      this.state.notice = 'プレイを再開する前に、1〜20文字の名前を入力してください。';
      this.render('name-entry');
      return;
    }
    if (!runStageIsCompatible(loaded.data, this.state.save)) {
      this.state.notice = 'この途中状態は現在の保存内容と互換性がありません。';
      this.render('home');
      return;
    }
    if (!this.runLifecycle.start()) return;
    this.pendingResumeCheckpoint = loaded.data;
    this.rankingStartPromise = loaded.data.stageId === 'endless'
      ? loaded.data.rankingSession
        ? Promise.resolve(this.rankingClient.restoreSession(loaded.data.rankingSession, this.state.save.profile.name))
        : this.rankingClient.start(this.state.save.profile.name)
      : null;
    this.state.selectedStage = loaded.data.stageId;
    this.state.notice = loaded.message;
    void this.audio.start();
    this.render('battle');
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
        this.audio.cue('start');
        this.render('battle');
        return;
      }
      this.audio.cue('countdown');
      number.textContent = String(remaining);
    }, 1000);
  }

  private renderBattle(): void {
    const runId = ++this.battleRunSequence;
    const resumeCheckpoint = this.pendingResumeCheckpoint;
    this.pendingResumeCheckpoint = null;
    this.upgradeInterrupted = false;
    this.latestBattleSnapshot = null;
    const shell = element('section', 'battle-shell');
    shell.dataset.testid = 'battle-screen';
    const header = element('header', 'battle-header');
    header.append(element('p', 'eyebrow', `カコマレ / ${stageLabel(this.state.selectedStage)}`));
    const pause = button('一時停止', 'button button-secondary pause-button');
    pause.dataset.testid = 'pause-button';
    pause.addEventListener('click', () => this.openPause(false, '', runId));
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
    const time = this.hudItem(STAGES[this.state.selectedStage].isEndless ? '経過時間' : '残り時間', STAGES[this.state.selectedStage].isEndless ? '0秒' : `${Math.ceil(STAGES[this.state.selectedStage].timeLimit)}秒`, 'hud-time');
    const level = this.hudItem('現在Lv', 'Lv1', 'hud-level');
    const xp = this.hudItem('経験値', '0 / 25', 'hud-xp');
    const pending = button('', 'hud-item pending-upgrade-button');
    pending.dataset.testid = 'pending-upgrade-button';
    pending.disabled = true;
    pending.setAttribute('aria-label', '強化を選ぶ（0回）');
    pending.append(element('span', 'hud-label', '強化を選ぶ'));
    const pendingCount = element('strong', 'hud-value', '0回');
    pendingCount.dataset.testid = 'hud-pending';
    pending.append(pendingCount);
    pending.addEventListener('click', () => {
      if (!pending.isConnected || pending.disabled) return;
      const selectionId = this.latestBattleSnapshot?.pendingUpgradeSelectionId;
      if (selectionId !== null && selectionId !== undefined) this.gameHost.requestPendingUpgrade(selectionId, runId);
    });
    const score = this.hudItem('得点', '0', 'hud-score');
    hud.append(health, time, level, xp, pending, score);
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
    const rawSeed = query.get('seed');
    const requestedSeed = rawSeed === null ? undefined : Number(rawSeed);
    const requestedTestExperience = Number(query.get('testXp'));
    this.gameHost.startBattle(gameMount, {
      runId,
      stageId: this.state.selectedStage,
      effectsLevel: this.state.save.settings.effects,
      reducedMotion: this.state.save.settings.reducedMotion,
      screenShake: this.state.save.settings.screenShake,
      aimAssist: this.state.save.settings.aimAssist,
      researchEffects: getResearchEffects(this.state.save),
      testMode,
      testOutcome: testMode && (outcome === 'victory' || outcome === 'defeat') ? outcome : undefined,
      testUpgrade: testMode && query.get('upgrade') === '1',
      testUpgradeExperience: testMode && Number.isInteger(requestedTestExperience) && requestedTestExperience > 0 && requestedTestExperience <= 10000 ? requestedTestExperience : undefined,
      seed: testMode && requestedSeed !== undefined && Number.isFinite(requestedSeed) ? requestedSeed : undefined,
      competitive: this.state.selectedStage === 'endless',
      resumeCheckpoint: resumeCheckpoint ?? undefined,
      callbacks: {
        onSnapshot: (snapshot) => {
          if (runId !== this.battleRunSequence || !shell.isConnected) return;
          this.latestBattleSnapshot = snapshot;
          this.updateBattleHud(snapshot, health, time, level, xp, pending, score, aimState, buildList);
        },
        onUpgrade: (payload) => { if (runId === this.battleRunSequence && shell.isConnected) this.showUpgrade(payload, shell, runId); },
        onFinish: (result) => { window.setTimeout(() => { if (runId === this.battleRunSequence && shell.isConnected) this.finishBattle(result); }, 0); },
        onStatus: (message) => { if (runId !== this.battleRunSequence || !shell.isConnected) return; status.textContent = message; this.announce(message); this.audio.cue(audioCueForStatus(message)); },
        onAudioCue: (cue) => { if (runId === this.battleRunSequence && shell.isConnected) this.audio.cue(cue); },
        onPauseRequest: () => this.openPause(false, '', runId),
        onCheckpoint: (checkpoint) => {
          if (runId !== this.battleRunSequence || !this.runLifecycle.active) return;
          // A server-issued play belongs only to the competitive endless run
          // that started it. Do not copy a completed/stale session into a
          // normal-stage checkpoint.
          const rankingSession = checkpoint.competitive ? this.rankingClient.snapshot().session : null;
          const checkpointWithRanking = rankingSession ? { ...checkpoint, rankingSession } : checkpoint;
          if (!this.runSaveService.persist(checkpointWithRanking)) this.state.notice = '途中状態を保存できませんでした。現在のプレイは端末内で続けられます。';
        },
      },
    });
    if (resumeCheckpoint) window.setTimeout(() => {
      if (runId === this.battleRunSequence && this.state.view === 'battle') this.openPause(false, '途中状態を復元しました', runId);
    }, 0);
  }

  private hudItem(label: string, value: string, testid: string): HTMLElement {
    const item = element('div', 'hud-item');
    item.append(element('span', 'hud-label', label));
    const valueNode = element('strong', 'hud-value', value); valueNode.dataset.testid = testid; item.append(valueNode);
    return item;
  }

  private updateBattleHud(snapshot: BattleSnapshot, health: HTMLElement, time: HTMLElement, level: HTMLElement, xp: HTMLElement, pending: HTMLButtonElement, score: HTMLElement, aimState: HTMLElement, buildList: HTMLElement): void {
    const healthValue = health.querySelector<HTMLElement>('[data-testid="hud-health"]');
    const timeValue = time.querySelector<HTMLElement>('[data-testid="hud-time"]');
    const levelValue = level.querySelector<HTMLElement>('[data-testid="hud-level"]');
    const xpValue = xp.querySelector<HTMLElement>('[data-testid="hud-xp"]');
    const pendingValue = pending.querySelector<HTMLElement>('[data-testid="hud-pending"]');
    const scoreValue = score.querySelector<HTMLElement>('[data-testid="hud-score"]');
    if (healthValue) healthValue.textContent = `${Math.max(0, Math.round(snapshot.core))} / ${snapshot.maxCore}`;
    if (timeValue) timeValue.textContent = snapshot.isEndless ? `${Math.floor(snapshot.elapsed)}秒` : `${Math.max(0, Math.ceil(snapshot.timeLimit - snapshot.elapsed))}秒`;
    if (levelValue) levelValue.textContent = `Lv${snapshot.level}`;
    if (xpValue) xpValue.textContent = `${Math.floor(snapshot.experience)} / ${snapshot.nextExperience}`;
    if (pendingValue) pendingValue.textContent = `${snapshot.pendingUpgrades}回`;
    pending.setAttribute('aria-label', `強化を選ぶ（${snapshot.pendingUpgrades}回）`);
    pending.disabled = snapshot.pendingUpgrades <= 0 || snapshot.pendingUpgradeSelectionId === null;
    if (scoreValue) scoreValue.textContent = snapshot.score.toLocaleString('ja-JP');
    aimState.textContent = snapshot.manualAim ? '手動照準中' : '自動照準';
    const loadout: string[] = [];
    const visibleSlots = Math.min(MAX_DEVICE_SLOT_COUNT, (snapshot.build?.unlockedLayer ?? 1) * DEVICE_SLOT_COUNT);
    for (let slot = 0; slot < visibleSlots; slot += 1) {
      const weapon = itemAtExpandedSlot(snapshot.weapons, slot);
      const support = itemAtExpandedSlot(snapshot.supports, slot);
      if (weapon) loadout.push(`武器面${slot + 1}: ${this.weaponName(weapon.id)} Lv${weapon.level}`);
      if (support) loadout.push(`補助面${slot + 1}: ${this.supportName(support.id)} Lv${support.level}`);
    }
    if (snapshot.build) loadout.push(`稼働容量 ${snapshot.build.capacity.used}/${snapshot.build.capacity.maximum}`);
    buildList.textContent = loadout.join(' / ');
  }

  private showUpgrade(payload: UpgradePayload, shell: HTMLElement, runId: number): void {
    this.removeModal(shell, '.upgrade-layer');
    if (payload.phase === 'break') {
      this.showUpgradeBreak(payload, shell, runId);
      return;
    }
    if (payload.candidates.length === 0) {
      this.battleUpgradeOpen = false;
      if (this.upgradeInterrupted) {
        this.upgradeInterrupted = false;
        this.gameHost.pause(runId);
        this.openPause(true, '画面を離れたため停止中', runId);
        return;
      }
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
    dialog.append(element('p', 'modal-copy', '戦闘を完全に停止しています。変更前と変更後を確認してください。'));
    dialog.append(element('p', 'upgrade-pending', `未選択の強化 ${payload.pendingCount}回`));
    if (getResearchEffects(this.state.save).candidateDetails) dialog.append(element('p', 'modal-copy', '詳細解析: 数値の変化と得意な敵を表示しています。'));
    const list = element('div', 'upgrade-list');
    let locked = true;
    const selectionId = payload.selectionId;
    const candidateButtons: Array<{ button: HTMLButtonElement; candidate: UpgradeCandidate }> = [];
    const selectionButtons: HTMLButtonElement[] = [];
    let selectedIndex = 0;
    for (const [candidateIndex, candidate] of payload.candidates.entries()) {
      const card = element('article', 'upgrade-card');
      card.dataset.testid = 'upgrade-card';
      card.dataset.candidateId = candidate.id;
      const choose = button(candidate.title, 'upgrade-choice');
      choose.dataset.testid = 'upgrade-candidate';
      choose.setAttribute('aria-label', `${candidate.title}。${candidate.description}`);
      choose.setAttribute('aria-describedby', `upgrade-description-${candidateIndex} upgrade-change-${candidateIndex}`);
      choose.disabled = true;
      candidateButtons.push({ button: choose, candidate });
      const description = element('p', 'upgrade-description', candidate.description);
      description.id = `upgrade-description-${candidateIndex}`;
      const change = element('p', 'upgrade-change', `${candidate.before} → ${candidate.after}`);
      change.id = `upgrade-change-${candidateIndex}`;
      card.append(choose, description, change, element('p', 'upgrade-role', `得意: ${candidate.role}`));
      if (candidate.isExisting) {
        selectionButtons.push(choose);
        choose.addEventListener('focus', () => { selectedIndex = selectionButtons.indexOf(choose); });
        choose.addEventListener('click', () => { if (locked) return; locked = true; this.gameHost.chooseUpgrade(candidate, selectionId, runId); });
      } else {
        choose.setAttribute('aria-disabled', 'true');
        choose.title = '装着する面を下から選んでください';
        card.append(element('p', 'upgrade-details upgrade-slot-hint', '空いている面を1回タップして装着します。'));
        const placementList = element('div', 'upgrade-placement-list');
        for (const slot of candidate.placementSlots ?? [0, 1, 2]) {
          const placement = button(`面${slot + 1}`, 'button button-small upgrade-placement');
          placement.dataset.testid = 'upgrade-placement';
          placement.setAttribute('aria-label', `${candidate.title}を面${slot + 1}へ装着`);
          placement.disabled = true;
          placement.addEventListener('focus', () => { selectedIndex = selectionButtons.indexOf(placement); });
          placement.addEventListener('click', () => {
            if (locked) return;
            locked = true;
            this.gameHost.chooseUpgrade({ ...candidate, placementSlot: slot }, selectionId, runId);
          });
          selectionButtons.push(placement);
          placementList.append(placement);
        }
        card.append(placementList);
      }
      if (candidate.requiresNewItemFirst) card.append(element('p', 'upgrade-details', '候補を3つ保つため、新しい装置を先に取得すると選べます。'));
      if (getResearchEffects(this.state.save).candidateDetails && candidate.details) card.append(element('p', 'upgrade-details', candidate.details));
      const ban = button('この候補を除外', 'button button-small upgrade-ban');
      ban.disabled = true;
      if (candidate.canBan === false) ban.title = '成長を止めないため除外できません';
      ban.addEventListener('click', () => {
        if (locked || ban.disabled) return;
        locked = true;
        ban.disabled = true;
        this.gameHost.banUpgrade(candidate.id, selectionId, runId);
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
      candidateButtons.forEach(({ button, candidate }) => { button.disabled = !candidate.isExisting || candidate.requiresNewItemFirst === true; });
      selectionButtons.forEach((selection) => { if (selection.classList.contains('upgrade-placement')) selection.disabled = false; });
      list.querySelectorAll<HTMLButtonElement>('.upgrade-ban').forEach((ban, index) => { ban.disabled = payload.bansLeft <= 0 || payload.candidates[index]?.canBan === false; });
    }, 150);
    const moveSelection = (direction: 1 | -1): void => {
      for (let offset = 1; offset <= selectionButtons.length; offset += 1) {
        const nextIndex = (selectedIndex + direction * offset + selectionButtons.length) % selectionButtons.length;
        if (!selectionButtons[nextIndex]?.disabled) {
          selectedIndex = nextIndex;
          selectionButtons[selectedIndex]?.focus();
          return;
        }
      }
    };
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        // Escape belongs to the upgrade dialog. Consume it here so a
        // delayed browser key event cannot reach Phaser after selection.
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (selectionButtons.length === 0) return;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); moveSelection(1); }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); moveSelection(-1); }
    });
    dialog.append(list);
    const footer = element('div', 'modal-footer');
    const reroll = button(`引き直す（残り${payload.rerollsLeft}回）`, 'button button-secondary');
    reroll.disabled = payload.rerollsLeft <= 0 || locked;
    reroll.addEventListener('click', () => {
      if (locked || reroll.disabled) return;
      locked = true;
      reroll.disabled = true;
      this.gameHost.rerollUpgrade(selectionId, runId);
    });
    footer.append(reroll);
    dialog.append(footer); layer.append(dialog); shell.append(layer);
    this.trapFocus(dialog);
    window.setTimeout(() => { if (layer.isConnected) reroll.disabled = payload.rerollsLeft <= 0; }, 150);
    window.setTimeout(() => selectionButtons.find((choice) => !choice.disabled)?.focus(), 160);
  }

  private showUpgradeBreak(payload: UpgradePayload, shell: HTMLElement, runId: number): void {
    this.battleUpgradeOpen = true;
    this.setBattleContentInert(shell, true);
    const layer = element('div', 'modal-layer upgrade-layer');
    const dialog = element('div', 'modal-dialog');
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'upgrade-break-title'); dialog.tabIndex = -1;
    dialog.append(element('p', 'eyebrow', '強化を保留')); const title = element('h2', '', '続けて成長しますか？'); title.id = 'upgrade-break-title'; dialog.append(title);
    dialog.append(element('p', 'modal-copy', `未選択の強化が${payload.pendingCount}回あります。戦闘は停止したままです。`));
    const actions = element('div', 'modal-footer');
    let locked = false;
    const continueButton = button(`続けて選ぶ（残り${payload.pendingCount}回）`, 'button button-primary button-large');
    continueButton.addEventListener('click', () => {
      if (locked) return;
      locked = true;
      continueButton.disabled = true;
      deferButton.disabled = true;
      this.gameHost.continueUpgrade(payload.selectionId, runId);
    });
    const deferButton = button('残りを保留して戦闘へ戻る', 'button button-secondary button-large');
    deferButton.addEventListener('click', () => {
      if (locked) return;
      locked = true;
      continueButton.disabled = true;
      deferButton.disabled = true;
      this.gameHost.deferUpgrade(payload.selectionId, runId);
    });
    actions.append(continueButton, deferButton);
    dialog.append(actions); layer.append(dialog); shell.append(layer);
    this.trapFocus(dialog);
    window.setTimeout(() => continueButton.focus(), 0);
  }

  private openPause(fromVisibility: boolean, reason = '', runId = this.battleRunSequence): void {
    if (runId !== this.battleRunSequence || !this.runLifecycle.active || this.state.view !== 'battle') return;
    const shell = this.root.querySelector<HTMLElement>('.battle-shell');
    if (!shell) return;
    // Keep the exact dialog and RNG while interrupted. On leaving the batch,
    // require explicit recovery without adding a countdown to normal choices.
    if (this.battleUpgradeOpen || (this.gameHost.isUpgrading() && shell.querySelector('.upgrade-layer'))) {
      if (fromVisibility) this.upgradeInterrupted = true;
      return;
    }
    const interruptedResume = this.resumeCountdownTimer !== null;
    if (interruptedResume) {
      this.clearResumeCountdown();
      shell.querySelector('.resume-layer')?.remove();
    }
    const resumeWithCountdown = fromVisibility || interruptedResume;
    this.gameHost.pause(runId);
    this.audio.cue('pause');
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
    const pauseMenu = element('div', 'pause-menu');
    const pauseView = element('div', 'pause-view');
    pauseView.hidden = true;
    const resume = button('再開', 'button button-primary button-large'); resume.dataset.testid = 'resume-button';
    const resumeBattle = (): void => {
      if (resume.disabled || runId !== this.battleRunSequence || !layer.isConnected) return;
      resume.disabled = true;
      layer.remove();
      if (resumeWithCountdown) this.shortResume(runId);
      else {
        this.gameHost.resume(runId);
        this.audio.cue('resume');
        this.restoreBattleFocus(shell);
      }
    };
    resume.addEventListener('click', resumeBattle);
    const showMenu = (): void => {
      pauseView.replaceChildren();
      pauseView.hidden = true;
      pauseMenu.hidden = false;
      window.setTimeout(() => resume.focus(), 0);
    };
    const rules = button('遊び方'); rules.addEventListener('click', () => this.showPauseRules(pauseMenu, pauseView, showMenu, resumeBattle));
    const loadout = button('装置を確認'); loadout.addEventListener('click', () => this.showPauseLoadout(pauseMenu, pauseView, showMenu, resumeBattle, runId));
    const settings = button('音量と演出'); settings.addEventListener('click', () => this.showPauseSettings(pauseMenu, pauseView, showMenu, resumeBattle));
    const retire = button('リタイア', 'button button-danger'); retire.addEventListener('click', () => { if (window.confirm('このプレイを終了しますか？得点は確定しません。')) this.gameHost.retire(runId); });
    const home = button('ホームへ戻る'); home.addEventListener('click', () => { if (runId === this.battleRunSequence && layer.isConnected && window.confirm('プレイを終了してホームへ戻りますか？')) { this.gameHost.stop(); this.runLifecycle.cancel(); this.render('home'); } });
    pauseMenu.append(resume, rules, loadout, settings, retire, home);
    dialog.append(pauseMenu, pauseView); layer.append(dialog); shell.append(layer);
    this.trapFocus(dialog);
    window.setTimeout(() => resume.focus(), 0);
  }

  private showPauseRules(menu: HTMLElement, view: HTMLElement, back: () => void, resume: () => void): void {
    menu.hidden = true;
    view.hidden = false;
    const copy = element('div', 'pause-rules');
    copy.append(element('h3', '', '操作'), element('p', '', '戦場を1本指でドラッグすると、その方向を短時間優先します。強化候補は1回タップで選びます。'));
    this.appendPauseViewActions(copy, back, resume);
    view.append(copy);
  }

  private showPauseLoadout(menu: HTMLElement, view: HTMLElement, back: () => void, resume: () => void, runId: number): void {
    menu.hidden = true;
    view.hidden = false;
    view.replaceChildren();
    const copy = element('div', 'pause-rules pause-loadout');
    copy.dataset.testid = 'pause-loadout';
    copy.append(element('h3', '', '現在の装置'));
    const snapshot = this.latestBattleSnapshot;
    const loadout = snapshot
      ? Array.from({ length: Math.min(MAX_DEVICE_SLOT_COUNT, (snapshot.build?.unlockedLayer ?? 1) * DEVICE_SLOT_COUNT) * 2 }, (_, index) => {
        const slot = Math.floor(index / 2);
        if (index % 2 === 0) {
          const weapon = itemAtExpandedSlot(snapshot.weapons, slot);
          return `武器面${slot + 1}: ${weapon ? `${this.weaponName(weapon.id)} Lv${weapon.level}` : '空き'}`;
        }
        const support = itemAtExpandedSlot(snapshot.supports, slot);
        return `補助面${slot + 1}: ${support ? `${this.supportName(support.id)} Lv${support.level}` : '空き'}`;
      })
      : ['装置情報を読み込んでいます'];
    const list = element('ul', 'loadout-list');
    for (const item of loadout) list.append(element('li', '', item));
    copy.append(list);
    if (snapshot) {
      const graph = snapshot.build?.graph;
      const installed = [
        ...snapshot.weapons.map((item) => ({ ...item, kind: 'weapon' as const })),
        ...snapshot.supports.map((item) => ({ ...item, kind: 'support' as const })),
      ];
      const controls = element('div', 'loadout-controls');
      controls.append(element('h4', '', '配置を調整（停止中のみ）'));
      controls.append(element('p', 'battle-help', '移設は空いている同種の面へ、入替は同種の装置同士で行います。レベル・待ち時間は保持します。'));
      const refresh = (): void => this.showPauseLoadout(menu, view, back, resume, runId);
      for (const item of installed) {
        const row = element('div', 'loadout-control-row');
        const label = item.kind === 'weapon' ? this.weaponName(item.id) : this.supportName(item.id);
        const evolution = item.kind === 'weapon' && item.evolutionName ? `・${item.evolutionName}` : '';
        row.append(element('span', 'loadout-control-label', `${item.kind === 'weapon' ? '武器' : '補助'}面${item.slot + 1} ${label} Lv${item.level}${evolution}`));
        const actions = element('div', 'loadout-control-actions');
        const freeSlots = graph?.nodes
          .filter((node) => node.kind === item.kind && node.unlocked && !node.occupiedInstanceId)
          .map((node) => node.slot)
          .sort((first, second) => first - second) ?? [];
        const moveTarget = freeSlots[0];
        const move = button(moveTarget === undefined ? '空き面なし' : `面${moveTarget + 1}へ移設`, 'button button-small');
        move.disabled = moveTarget === undefined;
        move.dataset.testid = `move-${item.kind}-${item.instanceId}`;
        move.addEventListener('click', () => {
          if (moveTarget !== undefined && this.gameHost.moveDevice(item.instanceId, moveTarget, runId)) refresh();
        });
        actions.append(move);

        const others = installed.filter((other) => other.kind === item.kind && other.instanceId !== item.instanceId);
        const swapSelect = document.createElement('select');
        swapSelect.className = 'loadout-swap-select';
        swapSelect.setAttribute('aria-label', `${label}の入替先`);
        for (const other of others) {
          const option = document.createElement('option');
          const otherLabel = other.kind === 'weapon' ? this.weaponName(other.id) : this.supportName(other.id);
          option.value = other.instanceId;
          option.textContent = `面${other.slot + 1} ${otherLabel}`;
          swapSelect.append(option);
        }
        const swap = button('入れ替え', 'button button-small');
        swap.disabled = others.length === 0;
        swap.dataset.testid = `swap-${item.kind}-${item.instanceId}`;
        swap.addEventListener('click', () => {
          if (swapSelect.value && this.gameHost.swapDevices(item.instanceId, swapSelect.value, runId)) refresh();
        });
        actions.append(swapSelect, swap);
        row.append(actions);
        controls.append(row);
      }
      copy.append(controls);
    }
    this.appendPauseViewActions(copy, back, resume);
    view.append(copy);
  }

  private showPauseSettings(menu: HTMLElement, view: HTMLElement, back: () => void, resume: () => void): void {
    menu.hidden = true;
    view.hidden = false;
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
    label.append(input); box.append(label);
    this.appendPauseViewActions(box, back, resume);
    view.append(box);
  }

  private appendPauseViewActions(container: HTMLElement, back: () => void, resume: () => void): void {
    const actions = element('div', 'pause-view-actions');
    const backButton = button('一時停止へ戻る', 'button button-secondary');
    backButton.addEventListener('click', back);
    const resumeButton = button('再開', 'button button-primary');
    resumeButton.addEventListener('click', resume);
    actions.append(backButton, resumeButton);
    container.append(actions);
  }

  private shortResume(runId: number): void {
    const shell = this.root.querySelector<HTMLElement>('.battle-shell'); if (!shell) return;
    if (this.resumeCountdownTimer !== null) return;
    const layer = element('div', 'modal-layer resume-layer'); const message = element('div', 'resume-countdown', '3'); layer.append(message); shell.append(layer);
    let remaining = 3;
    this.resumeCountdownTimer = window.setInterval(() => {
      if (runId !== this.battleRunSequence || !layer.isConnected) { this.clearResumeCountdown(); return; }
      if (document.visibilityState === 'hidden') return;
      remaining -= 1;
      if (remaining <= 0) {
        this.clearResumeCountdown();
        layer.remove();
        this.gameHost.resume(runId);
        this.audio.cue('resume');
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
    // Stage 3 preserves the direct endless route and also opens the V5 branch.
    // Both unlocks are committed atomically with the result.
    const unlocksFromResult: StageId[] = [
      result.newUnlock,
      result.stageId === 'stage-3' ? 'stage-4' : null,
    ].filter((stageId): stageId is StageId => stageId !== null);
    const firstClear = !result.retired && result.outcome === 'victory'
      && unlocksFromResult.some((stageId) => !this.state.save.progress.unlockedStages.includes(stageId));
    const finalResult = firstClear ? { ...result, partsEarned: result.partsEarned + FIRST_CLEAR_PART_BONUS } : result;
    const resultId = finalResult.resultId ?? `${finalResult.stageId}:${finalResult.runSeed}:${Math.round(finalResult.survivalTime * 60)}:${Math.round(finalResult.score)}:${finalResult.retired ? 'retired' : finalResult.outcome}`;
    const settledParts = finalResult.retired ? 0 : finalResult.partsEarned;
    try {
      const settlement = this.resultLedger.settle({
        resultId,
        // A server-issued ranking play belongs only to an endless result. A
        // completed endless session may still be retained for result display
        // while the player finishes a normal stage, so never attach that
        // stale identifier to a non-competitive settlement.
        playId: finalResult.playId ?? (finalResult.stageId === 'endless' ? this.rankingClient.snapshot().session?.playId ?? null : null),
        stageId: finalResult.stageId,
        outcome: finalResult.outcome,
        retired: finalResult.retired,
        score: Math.max(0, Math.round(finalResult.score)),
        partsEarned: Math.max(0, Math.round(settledParts)),
      });
      if (!settlement.accepted) {
        // Another tab or a replayed callback already committed this result.
        // Keep the result visible, but do not apply profile counters or parts
        // a second time.
        this.lastResult = finalResult;
        this.gameHost.stop();
        this.runSaveService.clear();
        this.state.notice = 'この結果は既に精算済みです。';
        this.render('result');
        return;
      }
    } catch {
      // Do not apply parts/counters without a durable idempotency record. The
      // checkpoint is intentionally kept so the player can retry after making
      // storage available again; the visible result is still preserved.
      this.state.notice = '結果の精算台帳を保存できませんでした。表示は続けます。';
      this.lastResult = finalResult;
      this.gameHost.stop();
      this.render('result');
      return;
    }
    this.lastResult = finalResult;
    this.gameHost.stop();
    const nextBest = !result.retired && (result.stageId === 'endless' ? result.score > this.state.save.records.endlessBest : !previous || result.score > previous.bestScore);
    const settledKills = result.retired ? 0 : result.kills;
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
    if (!result.retired && result.outcome === 'victory') {
      for (const stageId of unlocksFromResult) {
        if (!unlockedStages.includes(stageId)) unlockedStages.push(stageId);
      }
    }
    const ruleVersion = result.ruleVersion ?? 'runtime-v0';
    // A retired run is deliberately excluded from every durable record. In
    // particular, do not create an otherwise empty ruleset bucket just because
    // the current runtime version was attached to the transient result.
    const ruleVersions = result.retired ? this.state.save.records.ruleVersions : (() => {
      const priorRule = this.state.save.records.ruleVersions[ruleVersion] ?? { endlessBest: 0, stageBest: {} };
      const ruleStageBest = result.stageId === 'endless' ? priorRule.stageBest : {
        ...priorRule.stageBest,
        [result.stageId]: {
          bestScore: Math.max(priorRule.stageBest[result.stageId]?.bestScore ?? 0, Math.round(result.score)),
          bestCore: Math.max(priorRule.stageBest[result.stageId]?.bestCore ?? 0, Math.round(result.coreRemaining)),
          bestTime: Math.max(priorRule.stageBest[result.stageId]?.bestTime ?? 0, result.survivalTime),
        },
      };
      return {
        ...this.state.save.records.ruleVersions,
        [ruleVersion]: {
          endlessBest: result.stageId === 'endless' ? Math.max(priorRule.endlessBest, Math.round(result.score)) : priorRule.endlessBest,
          stageBest: ruleStageBest,
        },
      };
    })();
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
        ruleVersions,
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
    this.runSaveService.clear();
    if (this.commitSave(next)) this.state.notice = nextBest ? '自己最高記録を更新しました。' : '';
    this.render('result');
    this.audio.cue(result.retired ? 'pause' : result.outcome === 'victory' ? 'victory' : 'defeat');
    this.announce(result.retired ? 'プレイを終了しました' : result.outcome === 'victory' ? '防衛成功' : '防衛失敗');
    void this.submitRanking(finalResult);
  }

  private resultView(result: BattleResult): HTMLElement {
    const view = createResultView(result, {
      again: () => this.startStage(result.stageId),
      next: () => { if (result.newUnlock) this.startStage(result.newUnlock); },
      home: () => this.render('home'),
      share: () => { void this.shareResult(result); },
      ranking: this.rankingClient.snapshot(),
      retryRanking: () => { void this.retryRanking(result); },
    });
    this.addNotice(view); return view;
  }

  private async submitRanking(result: BattleResult): Promise<void> {
    if (result.stageId !== 'endless' || result.retired) return;
    if (this.rankingStartPromise) await this.rankingStartPromise;
    const rankingState = this.rankingClient.snapshot();
    if (!rankingState.session) return;
    const session = rankingState.session;
    const submitted = await this.rankingClient.finish({
      displayName: this.state.save.profile.name,
      playId: session?.playId ?? result.playId ?? null,
      result,
    });
    if (submitted.status === 'retryable_failed') this.state.notice = 'ランキング送信に失敗しました。結果画面から再送できます。';
  }

  private async retryRanking(result: BattleResult): Promise<void> {
    const snapshot = this.rankingClient.snapshot();
    if (snapshot.status !== 'retryable_failed') return;
    if (!snapshot.submission) {
      await this.rankingClient.retryStart(this.state.save.profile.name);
      const session = this.rankingClient.snapshot().session;
      if (session) await this.rankingClient.finish({ displayName: this.state.save.profile.name, playId: session.playId, result });
      return;
    }
    await this.rankingClient.retry(result);
  }

  private refreshRankingResult(): void {
    if (this.state.view !== 'result' || !this.lastResult) return;
    this.render('result');
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
    const stage = STAGES[result.stageId];
    const outcome = result.retired ? 'リタイア' : result.outcome === 'victory' ? '突破' : '防衛失敗';
    const text = `カコマレで${stage.name}を${outcome}。${result.score.toLocaleString('ja-JP')}点、${Math.floor(result.survivalTime)}秒生存、${result.kills}体撃破しました。`;
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
