import { localizeUpgradeCopy } from '../ui/UpgradeCopy';
import { translateGameText, translateData } from '../services/GameTextService';
import { translate as t, formatNumber } from '../services/TranslationService';
import { languageService } from '../services/LanguageService';
import { createAppState, type AppState } from './AppState';
import type { AppView } from './routes';
import { SaveService } from '../services/SaveService';
import { RunSaveService } from '../services/RunSaveService';
import { ResultLedger } from '../services/ResultLedger';
import { RankingClient } from '../services/RankingClient';
import { RankingRunStore, type RankingRunRecord } from '../services/RankingRunStore';
import { AudioService, audioCueForStatus } from '../services/AudioService';
import { ShareService } from '../services/ShareService';
import { LifecycleService } from '../services/LifecycleService';
import { GameHost } from '../game/GameHost';
import type { BattleResult, BattleSnapshot, UpgradeCandidate, UpgradePayload } from '../types/game';
import { createDefaultSave, type SaveData } from '../types/save';
import { button, element, isValidPlayerName } from '../ui/viewUtils';
import { createHomeView } from '../ui/HomeView';
import { createPlacementPreview, placementLabel } from '../ui/PlacementPreview';
import { getSupportHelp, getWeaponHelp, renderEquipmentHelp } from '../ui/EquipmentHelp';
import { createRulesView } from '../ui/RulesView';
import { createSettingsView } from '../ui/SettingsView';
import { createResultView } from '../ui/ResultView';
import { getResearchEffects } from '../data/research';
import { STAGES } from '../data/stages';
import { SUPPORTS } from '../data/supports';
import { WEAPONS } from '../data/weapons';
import { supportSynergyTags, weaponSynergyTags } from '../data/synergyTags';
import type { StageId, SupportId, WeaponId } from '../types/content';
import type { RankingSnapshot } from '../types/ranking';
import type { RunSaveEnvelope } from '../types/runSave';
import { isLocalTestHost } from './testMode';
import { RunLifecycleGuard } from './RunLifecycleGuard';
import { COMPETITIVE_RULES } from '../data/competitiveRules';
import { MAX_DEVICE_SLOT_COUNT, DEVICE_SLOT_COUNT, itemAtExpandedSlot } from '../game/deviceLayout';
import { renderSynergyTags } from '../ui/SynergyTags';
import { applyDeviceProfile, detectDeviceProfile, type DeviceProfile } from './deviceProfile';

const FIRST_CLEAR_PART_BONUS = 25;
interface RankingRunContext {
  name: string;
  record: RankingRunRecord | null;
  client: RankingClient;
  start: Promise<RankingSnapshot>;
}

function runStageIsCompatible(checkpoint: RunSaveEnvelope): boolean {
  const endless = checkpoint.stageId === 'endless';
  const expectedRuleVersion = endless ? COMPETITIVE_RULES.version : 'runtime-v0';
  return endless
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
  private readonly rankingRunStore = new RankingRunStore();
  private activeRankingContext: RankingRunContext | null = null;
  private resultRankingContext: RankingRunContext | null = null;
  private deviceProfile: DeviceProfile = 'mobile';
  private activeRankingName = '';
  private resultRankingName = '';

  public constructor(private readonly root: HTMLElement) {}

  public start(): void {
    if (this.started) return;
    this.started = true;
    document.documentElement.lang = languageService.language;
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
    this.applyRootClasses(view);
    this.root.replaceChildren();
    if (view === 'boot') { this.renderBoot(); return; }
    if (view === 'name-entry') { this.render('home'); return; }
    if (view === 'home') { this.root.append(this.homeView()); return; }
    if (view === 'stage-select' || view === 'research') { this.render('home'); return; }
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
    shell.append(element('h1', '', t('home.title')));
    shell.append(element('p', 'boot-status', t('boot.preparing')));
    this.root.append(shell);
  }

  private renderBootError(): void {
    this.applyRootClasses('boot');
    this.root.replaceChildren();
    const shell = element('section', 'boot-screen');
    shell.dataset.testid = 'boot-error';
    shell.append(element('p', 'eyebrow', t('home.title')));
    shell.append(element('h1', '', t('boot.failed')));
    shell.append(element('p', 'boot-status', t('boot.error')));
    const retry = button(t('common.retry'), 'button button-primary button-large');
    retry.dataset.testid = 'boot-retry';
    retry.addEventListener('click', () => {
      this.started = false;
      this.start();
    });
    shell.append(retry);
    this.root.append(shell);
  }

  private changeLanguage(language: string): void {
    // Re-rendering a battle/countdown restarts timers and GameHost. Only offer
    // language changes outside a run; all simulation and ranking snapshots stay intact.
    if (this.state.view !== 'home' && this.state.view !== 'settings') return;
    if (!languageService.select(language)) return;
    document.documentElement.lang = languageService.language;
    this.render(this.state.view);
  }

  private homeView(): HTMLElement {
    const view = createHomeView(this.state.save, {
      start: () => this.startStage('endless'),
      changeLanguage: language => this.changeLanguage(language),
      changeName: (name) => { this.commitSave({ ...this.state.save, profile: { name } }); },
      resume: this.runSaveService.hasSavedRun() ? () => this.resumeSavedRun() : undefined,
      settings: () => this.render('settings'),
      rules: () => this.render('rules'),
      share: () => { void this.shareHome(); },
    });
    const pending = this.rankingRunStore.listPending();
    for (const record of pending) {
      const recover = button(t('notice.pending', { score: formatNumber(Math.round(record.result!.score)) }));
      recover.dataset.testid = 'pending-ranking-result';
      recover.addEventListener('click', () => {
        this.resultRankingContext = this.createRankingContext(record.name, record);
        this.resultRankingName = record.name; this.lastResult = record.result!;
        this.render('result'); void this.retryRanking(record.result!);
      });
      view.append(recover);
    }
    const legacy = this.rankingClient.snapshot().submission;
    if (legacy) {
      const retry = button(t('notice.legacyRetry', { score: formatNumber(legacy.score) }));
      retry.addEventListener('click', () => { void this.rankingClient.retry().then(snapshot => { this.state.notice = snapshot.status === 'submitted' ? t('notice.legacySent') : t('notice.legacyFailed'); if (this.state.view === 'home') this.render('home'); }); });
      view.append(retry);
    }
    this.addNotice(view);
    return view;
  }

  private createRankingContext(name: string, saved?: RankingRunRecord): RankingRunContext {
    let record = saved ?? null;
    if (name && !record) {
      try { record = this.rankingRunStore.create(name); } catch { this.state.notice = t('notice.runSaveFailed'); }
    }
    const client = new RankingClient({
      storage: record ? this.rankingRunStore.scopedStorage(record.id) : null,
      preserveStoredRun: true,
      onChange: () => { if (this.resultRankingContext?.client === client) this.refreshRankingResult(); },
    });
    return { name, record, client, start: Promise.resolve(client.snapshot()) };
  }

  private settingsView(): HTMLElement {
    return createSettingsView(this.state.save, {
      changeLanguage: language => this.changeLanguage(language),
      change: (patch) => {
        const next = { ...this.state.save, settings: { ...this.state.save.settings, ...patch } };
        this.commitSave(next);
        this.audio.setVolume(next.settings.audio);
        this.audio.setMusicVolume(next.settings.music);
      },
      changeName: (name) => {
        const next = { ...this.state.save, profile: { name } };
        if (this.commitSave(next)) this.announce(t('notice.nameChanged'));
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
    if (this.runLifecycle.active || stageId !== 'endless') return;
    if (this.state.save.profile.name && !isValidPlayerName(this.state.save.profile.name)) {
      this.state.notice = t('home.nameError');
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
    this.activeRankingName = this.state.save.profile.name.trim();
    this.activeRankingContext = this.createRankingContext(this.activeRankingName);
    this.activeRankingContext.start = this.activeRankingContext.client.begin(this.activeRankingName);
    void this.audio.start();
    this.render('countdown');
  }

  private resumeSavedRun(): void {
    if (this.runLifecycle.active) return;
    const loaded = this.runSaveService.load();
    if (!loaded.data) {
      this.state.notice = loaded.message || t('notice.noCheckpoint');
      this.render('home');
      return;
    }
    if (!runStageIsCompatible(loaded.data)) {
      this.state.notice = t('notice.incompatible');
      this.render('home');
      return;
    }
    if (!this.runLifecycle.start()) return;
    this.pendingResumeCheckpoint = loaded.data;
    const savedRecord = loaded.data.rankingRunId ? this.rankingRunStore.get(loaded.data.rankingRunId) : null;
    this.activeRankingName = savedRecord?.name ?? (loaded.data.rankingRunId ? '' : loaded.data.rankingName ?? loaded.data.rankingSession?.displayName ?? '');
    this.activeRankingContext = this.createRankingContext(this.activeRankingName, savedRecord ?? undefined);
    const client = this.activeRankingContext.client;
    this.activeRankingContext.start = loaded.data.rankingSession && this.activeRankingName
      ? Promise.resolve(client.restoreSession(loaded.data.rankingSession, this.activeRankingName))
      : this.activeRankingName ? client.start(this.activeRankingName) : Promise.resolve(client.beginGuest());
    this.state.selectedStage = loaded.data.stageId;
    this.state.notice = loaded.data.rankingRunId && !savedRecord ? t('notice.missingRanking') : loaded.message;
    void this.audio.start();
    this.render('battle');
  }

  private renderCountdown(): void {
    const shell = element('section', 'countdown-screen');
    shell.dataset.testid = 'countdown-screen';
    shell.append(element('p', 'eyebrow', t('battle.preparing')));
    const number = element('p', 'countdown-number', '3');
    number.dataset.testid = 'countdown-number';
    shell.append(number, element('p', 'countdown-copy', t('battle.loading')));
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
    header.append(element('p', 'eyebrow', t('home.title')));
    const pause = button(t('battle.pause'), 'button button-secondary pause-button');
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
    const aimState = element('p', 'aim-state', t('battle.autoAim')); aimState.dataset.testid = 'aim-state'; aimState.setAttribute('role', 'status');
    arenaColumn.append(aimState);
    const status = element('p', 'battle-status', t('battle.readying')); status.dataset.testid = 'battle-status'; status.setAttribute('role', 'status');
    status.hidden = true;
    arenaColumn.append(status);

    const panel = element('aside', 'battle-panel');
    const hud = element('div', 'battle-hud');
    const maxCore = COMPETITIVE_RULES.initial.coreHp;
    const health = this.hudItem(t('battle.health'), `${maxCore} / ${maxCore}`, 'hud-health');
    const time = this.hudItem(STAGES[this.state.selectedStage].isEndless ? t('battle.elapsed') : t('battle.remaining'), STAGES[this.state.selectedStage].isEndless ? t('common.seconds', { value: 0 }) : t('common.seconds', { value: Math.ceil(STAGES[this.state.selectedStage].timeLimit) }), 'hud-time');
    const level = this.hudItem(t('battle.level'), 'Lv1', 'hud-level');
    const xp = this.hudItem(t('battle.xp'), '0 / 25', 'hud-xp');
    const score = this.hudItem(t('battle.score'), '0', 'hud-score');
    hud.append(health, time, level, xp, score);
    const loadoutButton = button(t('battle.loadout'), 'button battle-loadout-button');
    loadoutButton.dataset.testid = 'battle-loadout-button';
    loadoutButton.setAttribute('aria-label', t('battle.loadoutHelp'));
    loadoutButton.addEventListener('click', () => this.openPause(false, '', runId, 'loadout'));
    panel.append(hud, loadoutButton);
    const build = element('div', 'build-panel'); build.dataset.testid = 'build-panel';
    build.append(element('h2', '', t('battle.devices')));
    const buildList = element('p', 'build-list', translateGameText('連針砲 Lv1')); buildList.dataset.testid = 'build-list'; build.append(buildList);
    const limits = element('p', 'battle-help', t('battle.dragHelp')); panel.append(build, limits);
    const controls = element('div', 'battle-controls');
    const rerollInfo = element('p', 'battle-help', t('battle.upgradeHelp')); rerollInfo.dataset.testid = 'upgrade-help';
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
      aimAssist: 'standard',
      researchEffects: getResearchEffects(createDefaultSave()),
      testMode,
      testOutcome: testMode && (outcome === 'victory' || outcome === 'defeat') ? outcome : undefined,
      testUpgrade: testMode && query.get('upgrade') === '1',
      testFullLoadout: testMode && query.get('fullLoadout') === '1',
      testUpgradeExperience: testMode && Number.isInteger(requestedTestExperience) && requestedTestExperience > 0 && requestedTestExperience <= 10000 ? requestedTestExperience : undefined,
      seed: testMode && requestedSeed !== undefined && Number.isFinite(requestedSeed) ? requestedSeed : undefined,
      competitive: this.state.selectedStage === 'endless',
      resumeCheckpoint: resumeCheckpoint ?? undefined,
      callbacks: {
        onSnapshot: (snapshot) => {
          if (runId !== this.battleRunSequence || !shell.isConnected) return;
          this.latestBattleSnapshot = snapshot;
          this.updateBattleHud(snapshot, health, time, level, xp, score, aimState, buildList);
        },
        onUpgrade: (payload) => { if (runId === this.battleRunSequence && shell.isConnected) this.showUpgrade(payload, shell, runId); },
        onFinish: (result) => { window.setTimeout(() => { if (runId === this.battleRunSequence && shell.isConnected) this.finishBattle(result); }, 0); },
        onStatus: (message) => { if (runId !== this.battleRunSequence || !shell.isConnected) return; status.textContent = translateGameText(message); this.announce(translateGameText(message)); this.audio.cue(audioCueForStatus(message)); },
        onAudioCue: (cue) => { if (runId === this.battleRunSequence && shell.isConnected) this.audio.cue(cue); },
        onPauseRequest: () => this.openPause(false, '', runId),
        onCheckpoint: (checkpoint) => {
          if (runId !== this.battleRunSequence || !this.runLifecycle.active) return;
          // A server-issued play belongs only to the competitive endless run
          // that started it. Do not copy a completed/stale session into a
          // normal-stage checkpoint.
          const rankingSession = checkpoint.competitive && this.activeRankingName ? this.activeRankingContext?.client.snapshot().session ?? null : null;
          const checkpointWithRanking = { ...checkpoint, rankingName: this.activeRankingName, ...(this.activeRankingContext?.record ? { rankingRunId: this.activeRankingContext.record.id } : {}), ...(rankingSession ? { rankingSession } : {}) };
          if (!this.runSaveService.persist(checkpointWithRanking)) this.state.notice = t('notice.checkpointFailed');
        },
      },
    });
    if (resumeCheckpoint) window.setTimeout(() => {
      if (runId === this.battleRunSequence && this.state.view === 'battle') this.openPause(false, t('notice.restored'), runId);
    }, 0);
  }

  private hudItem(label: string, value: string, testid: string): HTMLElement {
    const item = element('div', 'hud-item');
    item.append(element('span', 'hud-label', label));
    const valueNode = element('strong', 'hud-value', value); valueNode.dataset.testid = testid; item.append(valueNode);
    return item;
  }

  private updateBattleHud(snapshot: BattleSnapshot, health: HTMLElement, time: HTMLElement, level: HTMLElement, xp: HTMLElement, score: HTMLElement, aimState: HTMLElement, buildList: HTMLElement): void {
    const healthValue = health.querySelector<HTMLElement>('[data-testid="hud-health"]');
    const timeValue = time.querySelector<HTMLElement>('[data-testid="hud-time"]');
    const levelValue = level.querySelector<HTMLElement>('[data-testid="hud-level"]');
    const xpValue = xp.querySelector<HTMLElement>('[data-testid="hud-xp"]');
    const scoreValue = score.querySelector<HTMLElement>('[data-testid="hud-score"]');
    if (healthValue) healthValue.textContent = `${Math.max(0, Math.round(snapshot.core))} / ${snapshot.maxCore}`;
    if (timeValue) timeValue.textContent = snapshot.isEndless ? t('common.seconds', { value: Math.floor(snapshot.elapsed) }) : t('common.seconds', { value: Math.max(0, Math.ceil(snapshot.timeLimit - snapshot.elapsed)) });
    if (levelValue) levelValue.textContent = `Lv${snapshot.level}`;
    if (xpValue) xpValue.textContent = `${Math.floor(snapshot.experience)} / ${snapshot.nextExperience}`;
    if (scoreValue) scoreValue.textContent = snapshot.score.toLocaleString('ja-JP');
    aimState.textContent = snapshot.manualAim ? t('battle.manualAim') : t('battle.autoAim');
    const loadout: string[] = [];
    const visibleSlots = Math.min(MAX_DEVICE_SLOT_COUNT, (snapshot.build?.unlockedLayer ?? 1) * DEVICE_SLOT_COUNT);
    for (let slot = 0; slot < visibleSlots; slot += 1) {
      const weapon = itemAtExpandedSlot(snapshot.weapons, slot);
      const support = itemAtExpandedSlot(snapshot.supports, slot);
      if (weapon) loadout.push(t('loadout.weapon',{number:slot+1,name:this.weaponName(weapon.id),level:weapon.level}));
      if (support) loadout.push(t('loadout.support',{number:slot+1,name:this.supportName(support.id),level:support.level}));
    }
    if (snapshot.build) loadout.push(t('loadout.capacity',{used:snapshot.build.capacity.used,maximum:snapshot.build.capacity.maximum}));
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
        this.openPause(true, t('pause.hidden'), runId);
        return;
      }
      if (shell.querySelector('.pause-layer, .resume-layer')) this.setBattleContentInert(shell, true);
      else this.restoreBattleFocus(shell);
      return;
    }
    this.battleUpgradeOpen = true;
    this.setBattleContentInert(shell, true);
    const layer = element('div', 'modal-layer upgrade-layer');
    const dialog = element('div', 'modal-dialog upgrade-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'upgrade-title');
    dialog.tabIndex = -1;

    const title = element('h2', '', t('upgrade.title'));
    title.id = 'upgrade-title';
    dialog.append(element('p', 'eyebrow', t('upgrade.eyebrow')), title);
    dialog.append(element('p', 'modal-copy', t('upgrade.pauseCopy')));

    const guide = element('div', 'upgrade-guide');
    guide.setAttribute('role', 'note');
    guide.append(
      element('span', 'upgrade-guide-item upgrade-guide-action', t('upgrade.guideAction')),
      element('span', 'upgrade-guide-item upgrade-guide-info', t('upgrade.guideInfo')),
      element('span', 'upgrade-guide-item upgrade-guide-detail', t('upgrade.guideDetail')),
    );
    dialog.append(guide);

    const status = element('div', 'upgrade-status');
    status.append(
      element('p', 'upgrade-pending', t('upgrade.pending',{count:payload.pendingCount})),
      element('p', 'upgrade-tools-help', t('upgrade.bans',{count:payload.bansLeft})),
    );
    dialog.append(status);

    const list = element('div', 'upgrade-list');
    let locked = true;
    const selectionId = payload.selectionId;
    const candidateButtons: Array<{ button: HTMLButtonElement; candidate: UpgradeCandidate }> = [];
    const selectionButtons: HTMLButtonElement[] = [];
    let selectedIndex = 0;

    for (const [candidateIndex, candidate] of payload.candidates.entries()) {
      const copy = localizeUpgradeCopy(candidate);
      const card = element('article', 'upgrade-card upgrade-kind-' + candidate.kind);
      card.dataset.testid = 'upgrade-card';
      card.dataset.candidateId = candidate.id;

      const categoryText = candidate.kind === 'weapon'
        ? t('upgrade.categoryWeapon',{number:candidateIndex+1})
        : candidate.kind === 'support'
          ? t('upgrade.categorySupport',{number:candidateIndex+1})
          : t('upgrade.categoryCore',{number:candidateIndex+1});
      card.append(element('p', 'upgrade-category', categoryText));

      const tagIds = candidate.kind === 'weapon'
        ? weaponSynergyTags(candidate.targetId as WeaponId).map((tag) => tag.id)
        : candidate.kind === 'support'
          ? supportSynergyTags(candidate.targetId as SupportId).map((tag) => tag.id)
          : [];
      if (tagIds.length > 0) card.append(renderSynergyTags(tagIds));

      const choose = button(copy.title, 'upgrade-choice');
      choose.dataset.testid = 'upgrade-candidate';
      choose.setAttribute('aria-label', t('upgrade.chooseAria',{title:copy.title,description:copy.description}));
      choose.disabled = true;
      candidateButtons.push({ button: choose, candidate });

      const action = element('div', 'upgrade-candidate-action');
      action.append(
        element('p', 'upgrade-action-label', candidate.isExisting ? t('upgrade.obtain') : t('upgrade.choosePlacement')),
        choose,
      );
      if (!candidate.isExisting) choose.classList.add('upgrade-choice-readonly');
      card.append(action);

      const description = element('p', 'upgrade-description', copy.description);
      description.id = 'upgrade-description-' + candidateIndex;
      const explanation = element('section', 'upgrade-info-block upgrade-info-explanation');
      explanation.append(element('h4', 'upgrade-info-label', t('upgrade.content')), description);
      card.append(explanation);

      const change = element('p', 'upgrade-change', copy.before + ' → ' + copy.after);
      change.id = 'upgrade-change-' + candidateIndex;
      const changeBlock = element('section', 'upgrade-info-block upgrade-info-change');
      changeBlock.append(element('h4', 'upgrade-info-label', t('upgrade.changes')), change);
      card.append(changeBlock);

      const role = element('p', 'upgrade-role');
      role.append(
        element('span', 'upgrade-role-label', t('upgrade.role')),
        element('span', 'upgrade-role-value', copy.role),
      );
      card.append(role);
      choose.setAttribute('aria-describedby', description.id + ' ' + change.id);

      if (candidate.isExisting) {
        const snapshot = this.latestBattleSnapshot;
        const weapon = snapshot?.weapons.find((item) => candidate.targetInstanceId ? item.instanceId === candidate.targetInstanceId : item.id === candidate.targetId);
        const support = snapshot?.supports.find((item) => candidate.targetInstanceId ? item.instanceId === candidate.targetInstanceId : item.id === candidate.targetId);
        const help = candidate.kind === 'weapon' && weapon ? getWeaponHelp(weapon, snapshot?.supports, snapshot?.weapons)
          : candidate.kind === 'support' && support ? getSupportHelp(support, snapshot?.weapons) : null;
        if (help) {
          const details = element('details', 'upgrade-help-details');
          const summary = element('summary', 'upgrade-help-summary', t('upgrade.details'));
          summary.setAttribute('aria-label', t('upgrade.detailsAria',{title:copy.title}));
          details.append(summary, renderEquipmentHelp(help));
          card.append(details);
        }
        selectionButtons.push(choose);
        choose.addEventListener('focus', () => { selectedIndex = selectionButtons.indexOf(choose); });
        choose.addEventListener('click', () => {
          if (locked) return;
          locked = true;
          this.gameHost.chooseUpgrade(candidate, selectionId, runId);
        });
      } else {
        choose.setAttribute('aria-disabled', 'true');
        choose.title = t('upgrade.placementHint');

        const placementSection = element('section', 'upgrade-place-section');
        placementSection.append(
          element('h4', 'upgrade-step-title', t('upgrade.previewStep')),
          createPlacementPreview(this.latestBattleSnapshot, {
            kind: candidate.kind === 'support' ? 'support' : 'weapon',
            slots: candidate.placementSlots,
            onNodeSelect: (_kind, slot) => {
              const placement = placementButtons.get(slot);
              if (placement && !placement.disabled) placement.click();
            },
          }),
          element('p', 'upgrade-slot-hint', t('upgrade.matchSlot')),
        );
        card.append(placementSection);

        const placementKind = candidate.kind === 'support' ? 'support' : 'weapon';
        const placementButtons = new Map<number, HTMLButtonElement>();
        const placementDetails = new Map<number, HTMLDetailsElement>();
        const placementList = element('div', 'upgrade-placement-list');
        const placementHeading = element('h4', 'upgrade-step-title', t('upgrade.placementStep'));
        placementList.append(placementHeading);
        const replacementConfirm = element('div', 'upgrade-replacement-confirmation');

        for (const slot of candidate.placementSlots ?? [0, 1, 2]) {
          const target = candidate.replacementTargets?.find((item) => item.slot === slot);
          const targetName = target
            ? (candidate.kind === 'support' ? this.supportName(target.id as SupportId) : this.weaponName(target.id as WeaponId))
            : '';
          const resultingLevel = target ? Math.min(target.level, 3) : 1;
          const label = target
            ? t('upgrade.replaceHere')
            : t('upgrade.mountHere');
          const placement = button(label + placementLabel(placementKind, slot) + (target ? '（' + targetName + ' Lv' + target.level + '）' : ''), 'button button-small upgrade-placement');
          placement.dataset.testid = 'upgrade-placement';
          placement.dataset.slot = String(slot);
          placement.setAttribute('aria-label', target
            ? t('upgrade.checkReplacement',{placement:placement.textContent ?? ""})
            : t('upgrade.mountAria',{title:copy.title,position:placementLabel(placementKind,slot)}));
          placement.disabled = true;
          placement.addEventListener('focus', () => { selectedIndex = selectionButtons.indexOf(placement); });
          placement.addEventListener('click', () => {
            if (locked) return;
            const detail = placementDetails.get(slot);
            if (detail) {
              detail.open = true;
              window.setTimeout(() => {
                if (detail.isConnected) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 0);
            }
            if (target) {
              const replacementSummary = element('section', 'upgrade-replacement-summary');
              replacementSummary.append(
                element('h4', 'upgrade-info-label', t('upgrade.replacement')),
                element('p', 'upgrade-replacement-copy', t('upgrade.replaceCopy',{name:targetName,level:target.level,resultLevel:resultingLevel})),
              );
              replacementConfirm.replaceChildren(replacementSummary);
              const options = resultingLevel >= 3 && candidate.kind === 'weapon' ? candidate.replacementBranchOptions ?? [] : [];
              const commit = (branch?: UpgradeCandidate['replacementBranch']): void => {
                if (locked) return;
                locked = true;
                this.gameHost.chooseUpgrade({ ...candidate, placementSlot: slot, replacementTargetInstanceId: target.instanceId, replacementBranch: branch }, selectionId, runId);
              };
              for (const option of options) {
                const confirm = button(t('upgrade.replaceBranch',{name:translateGameText(option.name)}), 'button button-primary');
                confirm.dataset.testid = 'upgrade-replacement-confirm';
                confirm.addEventListener('click', () => commit(option.id));
                replacementConfirm.append(element('p', 'upgrade-replacement-option', translateGameText(option.description)), confirm);
                selectionButtons.push(confirm);
              }
              if (options.length === 0) {
                const confirm = button(t('upgrade.replaceLevel',{level:resultingLevel}), 'button button-primary');
                confirm.dataset.testid = 'upgrade-replacement-confirm';
                confirm.addEventListener('click', () => commit());
                replacementConfirm.append(confirm);
                selectionButtons.push(confirm);
              }
              replacementConfirm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              replacementConfirm.querySelector('button')?.focus();
              return;
            }
            locked = true;
            this.gameHost.chooseUpgrade({ ...candidate, placementSlot: slot }, selectionId, runId);
          });
          placementButtons.set(slot, placement);
          selectionButtons.push(placement);

          const option = element('article', 'upgrade-placement-option');
          option.append(placement);

          const connection = element('section', 'upgrade-placement-connection');
          connection.append(
            element('h5', 'upgrade-placement-label', t('upgrade.connections')),
            element('p', 'upgrade-connection-text', candidate.kind === 'support'
              ? this.supportName(candidate.targetId as SupportId) + '：' + getSupportHelp({ id: candidate.targetId as SupportId, instanceId: 'preview', nodeId: 'preview', slot, level: resultingLevel }, this.latestBattleSnapshot?.weapons).connections.join('／')
              : this.weaponName(candidate.targetId as WeaponId) + '：' + getWeaponHelp({ id: candidate.targetId as WeaponId, instanceId: 'preview', nodeId: 'preview', slot, level: resultingLevel, damageDealt: 0, branch: null, finalBranch: null, evolutionId: null }, this.latestBattleSnapshot?.supports, this.latestBattleSnapshot?.weapons).connections.join('／')),
          );
          option.append(connection);

          const details = element('details', 'upgrade-help-details upgrade-placement-details');
          details.dataset.slot = String(slot);
          details.append(
            element('summary', 'upgrade-help-summary', t('upgrade.details')),
            candidate.kind === 'support'
              ? renderEquipmentHelp(getSupportHelp({ id: candidate.targetId as SupportId, instanceId: 'preview', nodeId: 'preview', slot, level: resultingLevel }, this.latestBattleSnapshot?.weapons))
              : renderEquipmentHelp(getWeaponHelp({ id: candidate.targetId as WeaponId, instanceId: 'preview', nodeId: 'preview', slot, level: resultingLevel, damageDealt: 0, branch: null, finalBranch: null, evolutionId: null }, this.latestBattleSnapshot?.supports, this.latestBattleSnapshot?.weapons)),
          );
          placementDetails.set(slot, details);
          option.append(details);
          placementList.append(option);
        }
        card.append(placementList, replacementConfirm);
      }

      if (candidate.requiresNewItemFirst) {
        const note = element('section', 'upgrade-info-block upgrade-info-note');
        note.append(
          element('h4', 'upgrade-info-label', t('upgrade.note')),
          element('p', 'upgrade-details', t('upgrade.keepThree')),
        );
        card.append(note);
      }
      if (copy.details) {
        const note = element('section', 'upgrade-info-block upgrade-info-note');
        note.append(element('h4', 'upgrade-info-label', t('upgrade.note')), element('p', 'upgrade-details', copy.details));
        card.append(note);
      }

      const banArea = element('div', 'upgrade-ban-area');
      const ban = button(t('upgrade.ban',{count:payload.bansLeft}), 'button button-small upgrade-ban');
      ban.disabled = true;
      if (candidate.canBan === false) ban.title = t('upgrade.cannotBan');
      ban.addEventListener('click', () => {
        if (locked || ban.disabled) return;
        locked = true;
        ban.disabled = true;
        this.gameHost.banUpgrade(candidate.id, selectionId, runId);
      });
      banArea.append(
        element('p', 'upgrade-ban-help', t('upgrade.banHelp')),
        ban,
      );
      card.append(banArea);
      list.append(card);
    }

    window.setTimeout(() => {
      if (!layer.isConnected) return;
      locked = false;
      candidateButtons.forEach(({ button, candidate }) => {
        button.disabled = !candidate.isExisting || candidate.requiresNewItemFirst === true;
      });
      selectionButtons.forEach((selection) => {
        if (selection.classList.contains('upgrade-placement')) selection.disabled = false;
      });
      list.querySelectorAll<HTMLButtonElement>('.upgrade-ban').forEach((ban, index) => {
        ban.disabled = payload.bansLeft <= 0 || payload.candidates[index]?.canBan === false;
      });
    }, 150);

    const moveSelection = (direction: 1 | -1): void => {
      for (let offset = 1; offset <= selectionButtons.length; offset += 1) {
        const nextIndex = (selectedIndex + direction * offset + selectionButtons.length) % selectionButtons.length;
        if (selectionButtons[nextIndex]?.isConnected && !selectionButtons[nextIndex]?.disabled) {
          selectedIndex = nextIndex;
          selectionButtons[selectedIndex]?.focus();
          return;
        }
      }
    };
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
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
    const reroll = button(t('upgrade.reroll',{count:payload.rerollsLeft}), 'button button-secondary');
    reroll.disabled = payload.rerollsLeft <= 0 || locked;
    reroll.addEventListener('click', () => {
      if (locked || reroll.disabled) return;
      locked = true;
      reroll.disabled = true;
      this.gameHost.rerollUpgrade(selectionId, runId);
    });
    footer.append(reroll);
    dialog.append(footer);
    layer.append(dialog);
    shell.append(layer);
    this.trapFocus(dialog);
    window.setTimeout(() => {
      if (layer.isConnected) reroll.disabled = payload.rerollsLeft <= 0;
    }, 150);
    window.setTimeout(() => selectionButtons.find((choice) => !choice.disabled)?.focus(), 160);
  }

  private showUpgradeBreak(payload: UpgradePayload, shell: HTMLElement, runId: number): void {
    this.battleUpgradeOpen = true;
    this.setBattleContentInert(shell, true);
    const layer = element('div', 'modal-layer upgrade-layer');
    const dialog = element('div', 'modal-dialog');
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'upgrade-break-title'); dialog.tabIndex = -1;
    dialog.append(element('p', 'eyebrow', t('upgrade.deferEyebrow'))); const title = element('h2', '', t('upgrade.continueTitle')); title.id = 'upgrade-break-title'; dialog.append(title);
    dialog.append(element('p', 'modal-copy', t('upgrade.deferCopy',{count:payload.pendingCount})));
    const actions = element('div', 'modal-footer');
    let locked = false;
    const continueButton = button(t('upgrade.continue',{count:payload.pendingCount}), 'button button-primary button-large');
    continueButton.addEventListener('click', () => {
      if (locked) return;
      locked = true;
      continueButton.disabled = true;
      deferButton.disabled = true;
      this.gameHost.continueUpgrade(payload.selectionId, runId);
    });
    const deferButton = button(t('upgrade.defer'), 'button button-secondary button-large');
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

  private openPause(fromVisibility: boolean, reason = '', runId = this.battleRunSequence, initialView: 'menu' | 'loadout' = 'menu'): void {
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
    const title = reason || (fromVisibility ? t('pause.hidden') : t('pause.stopped'));
    const titleNode = element('h2', '', title); titleNode.id = 'pause-title';
    const copy = element('p', 'modal-copy', t('pause.description')); copy.id = 'pause-copy';
    dialog.setAttribute('aria-labelledby', titleNode.id); dialog.setAttribute('aria-describedby', copy.id);
    dialog.append(element('p', 'eyebrow', t('battle.pause')), titleNode, copy);
    const pauseMenu = element('div', 'pause-menu');
    const pauseView = element('div', 'pause-view');
    pauseView.hidden = true;
    const resume = button(t('battle.resume'), 'button button-primary button-large'); resume.dataset.testid = 'resume-button';
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
    const rules = button(t('common.rules')); rules.addEventListener('click', () => this.showPauseRules(pauseMenu, pauseView, showMenu, resumeBattle));
    const loadout = button(t('battle.loadout')); loadout.addEventListener('click', () => this.showPauseLoadout(pauseMenu, pauseView, showMenu, resumeBattle, runId));
    const settings = button(t('battle.soundSettings')); settings.addEventListener('click', () => this.showPauseSettings(pauseMenu, pauseView, showMenu, resumeBattle));
    const retire = button(t('battle.retire'), 'button button-danger'); retire.addEventListener('click', () => { if (window.confirm(t('pause.retireConfirm'))) this.gameHost.retire(runId); });
    const home = button(t('common.homeBack')); home.addEventListener('click', () => { if (runId === this.battleRunSequence && layer.isConnected && window.confirm(t('pause.homeConfirm'))) { this.gameHost.stop(); this.runLifecycle.cancel(); this.render('home'); } });
    pauseMenu.append(resume, rules, loadout, settings, retire, home);
    dialog.append(pauseMenu, pauseView); layer.append(dialog); shell.append(layer);
    this.trapFocus(dialog);
    if (initialView === 'loadout') {
      this.showPauseLoadout(pauseMenu, pauseView, showMenu, resumeBattle, runId, false);
      window.setTimeout(() => pauseView.querySelector<HTMLElement>('.placement-preview-summary')?.focus(), 0);
    } else {
      window.setTimeout(() => resume.focus(), 0);
    }
  }

  private showPauseRules(menu: HTMLElement, view: HTMLElement, back: () => void, resume: () => void): void {
    menu.hidden = true;
    view.hidden = false;
    const copy = element('div', 'pause-rules');
    copy.append(element('h3', '', t('pause.controls')), element('p', '', t('pause.controlsHelp')));
    this.appendPauseViewActions(copy, back, resume);
    view.append(copy);
  }

  private showPauseLoadout(menu: HTMLElement, view: HTMLElement, back: () => void, resume: () => void, runId: number, showBack = true): void {
    menu.hidden = true;
    view.hidden = false;
    view.replaceChildren();
    const copy = element('div', 'pause-rules pause-loadout');
    copy.dataset.testid = 'pause-loadout';
    copy.append(element('h3', '', t('pause.loadout')));
    const snapshot = this.latestBattleSnapshot;
    if (!snapshot) copy.append(createPlacementPreview(snapshot));
    if (snapshot) {
      const equipmentDetails = element('details', 'loadout-help');
      const equipmentByPlacement = new Map<string, HTMLDetailsElement>();
      const openEquipment = (kind: 'weapon' | 'support', slot: number): void => {
        const details = equipmentByPlacement.get(`${kind}:${slot}`);
        if (!details) return;
        equipmentDetails.open = true;
        details.open = true;
        window.setTimeout(() => {
          if (details.isConnected) details.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 0);
      };
      const previewSummary = element('summary', 'placement-preview-summary');
      previewSummary.dataset.testid = 'placement-preview-toggle';
      previewSummary.append(
        createPlacementPreview(snapshot, { onNodeSelect: openEquipment }),
        element('p', 'placement-detail-hint', t('pause.placementHelp')),
      );
      equipmentDetails.append(previewSummary);
      for (const weapon of snapshot.weapons) {
        const details = element('details', 'equipment-help-details equipment-weapon');
        details.dataset.placement = `weapon:${weapon.slot}`;
        details.append(element('summary', '', `${placementLabel('weapon', weapon.slot)}：${this.weaponName(weapon.id)} Lv${weapon.level}`), renderEquipmentHelp(getWeaponHelp(weapon, snapshot.supports, snapshot.weapons)));
        equipmentByPlacement.set(`weapon:${weapon.slot}`, details);
        equipmentDetails.append(details);
      }
      for (const support of snapshot.supports) {
        const details = element('details', 'equipment-help-details equipment-support');
        details.dataset.placement = `support:${support.slot}`;
        details.append(element('summary', '', `${placementLabel('support', support.slot)}：${this.supportName(support.id)} Lv${support.level}`), renderEquipmentHelp(getSupportHelp(support, snapshot.weapons)));
        equipmentByPlacement.set(`support:${support.slot}`, details);
        equipmentDetails.append(details);
      }
      copy.append(equipmentDetails);
      if (snapshot.pendingUpgrades > 0 && snapshot.pendingUpgradeSelectionId !== null) {
        const pendingUpgrade = button(t('upgrade.pendingButton',{count:snapshot.pendingUpgrades}), 'button pending-upgrade-from-loadout');
        pendingUpgrade.dataset.testid = 'pending-upgrade-from-loadout';
        pendingUpgrade.addEventListener('click', () => {
          if (!pendingUpgrade.isConnected || runId !== this.battleRunSequence) return;
          resume();
          window.setTimeout(() => {
            const selectionId = this.latestBattleSnapshot?.pendingUpgradeSelectionId;
            if (selectionId !== null && selectionId !== undefined) this.gameHost.requestPendingUpgrade(selectionId, runId);
          }, 0);
        });
        copy.append(pendingUpgrade);
      }
      const graph = snapshot.build?.graph;
      const installed = [
        ...snapshot.weapons.map((item) => ({ ...item, kind: 'weapon' as const })),
        ...snapshot.supports.map((item) => ({ ...item, kind: 'support' as const })),
      ];
      const controls = element('div', 'loadout-controls');
      controls.append(element('h4', '', t('pause.move')));
      controls.append(element('p', 'battle-help', t('loadout.help')));
      const refresh = (): void => this.showPauseLoadout(menu, view, back, resume, runId, showBack);
      const destination = element('div', 'loadout-destination');
      for (const item of installed) {
        const row = element('div', 'loadout-control-row');
        const label = item.kind === 'weapon' ? this.weaponName(item.id) : this.supportName(item.id);
        const evolution = item.kind === 'weapon' && item.evolutionName ? `・${translateGameText(item.evolutionName)}` : '';
        const source = button(t('loadout.move',{position:placementLabel(item.kind,item.slot),name:label,level:item.level,evolution}), `button loadout-source equipment-${item.kind}`);
        source.dataset.testid = 'placement-source';
        source.addEventListener('click', () => {
          if (!view.isConnected || runId !== this.battleRunSequence) return;
          destination.replaceChildren(element('h4', '', t('loadout.destination',{name:label})), createPlacementPreview(snapshot, { kind: item.kind, selectedSlot: item.slot }));
          const confirmArea = element('div', 'placement-confirm-area');
          for (const node of graph?.nodes.filter((node) => node.kind === item.kind && node.unlocked && node.slot !== item.slot) ?? []) {
            const other = installed.find((device) => device.kind === item.kind && device.slot === node.slot);
            const otherName = other ? (other.kind === 'weapon' ? this.weaponName(other.id) : this.supportName(other.id)) : t('pause.empty');
            const target = button(`${placementLabel(item.kind, node.slot)}：${otherName}`, `button equipment-${item.kind}`);
            target.dataset.testid = 'placement-destination';
            target.dataset.slot = String(node.slot);
            target.addEventListener('click', () => {
              const confirmation = other
                ? t('loadout.swapConfirm',{name:label,other:otherName})
                : t('loadout.moveConfirm',{name:label,position:placementLabel(item.kind,node.slot)});
              const confirm = button(t('pause.confirmPlacement'), 'button button-primary');
              confirm.dataset.testid = 'placement-confirm';
              confirm.addEventListener('click', () => {
                if (!confirm.isConnected || runId !== this.battleRunSequence) return;
                const success = other ? this.gameHost.swapDevices(item.instanceId, other.instanceId, runId) : this.gameHost.moveDevice(item.instanceId, node.slot, runId);
                if (success) refresh();
                else this.announce(t('pause.moveFailed'));
              });
              confirmArea.replaceChildren(element('p', '', confirmation), confirm);
              confirm.focus();
            });
            destination.append(target);
          }
          destination.append(confirmArea);
          destination.querySelector<HTMLButtonElement>('button')?.focus();
        });
        row.append(source);
        controls.append(row);
      }
      controls.append(destination);
      copy.append(controls);
    }
    this.appendPauseViewActions(copy, showBack ? back : undefined, resume);
    view.append(copy);
  }

  private showPauseSettings(menu: HTMLElement, view: HTMLElement, back: () => void, resume: () => void): void {
    menu.hidden = true;
    view.hidden = false;
    const box = element('div', 'pause-settings');
    box.append(element('h3', '', t('battle.soundSettings')));
    const label = element('label', 'setting-row', t('settings.sound'));
    const input = element('input') as HTMLInputElement;
    input.id = 'pause-audio'; input.type = 'range'; input.min = '0'; input.max = '100'; input.value = String(this.state.save.settings.audio); input.setAttribute('aria-label', t('settings.soundVolume'));
    input.addEventListener('input', () => {
      const next = { ...this.state.save, settings: { ...this.state.save.settings, audio: Number(input.value) } };
      this.commitSave(next);
      this.audio.setVolume(next.settings.audio);
    });
    label.append(input); box.append(label);
    this.appendPauseViewActions(box, back, resume);
    view.append(box);
  }

  private appendPauseViewActions(container: HTMLElement, back: (() => void) | undefined, resume: () => void): void {
    const actions = element('div', back ? 'pause-view-actions' : 'pause-view-actions pause-view-actions-single');
    if (back) {
      const backButton = button(t('battle.backPause'), 'button button-secondary');
      backButton.addEventListener('click', back);
      actions.append(backButton);
    }
    const resumeButton = button(t('battle.resume'), 'button button-primary');
    resumeButton.addEventListener('click', resume);
    actions.append(resumeButton);
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
    const reason = t('pause.orientation');
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
    const nextProfile = detectDeviceProfile(window);
    if (nextProfile !== this.deviceProfile) {
      this.deviceProfile = nextProfile;
      this.applyRootClasses(this.state.view);
    }
  }

  private applyRootClasses(view: AppView): void {
    this.deviceProfile = detectDeviceProfile(window);
    this.root.className = view === 'battle' ? 'app-root app-root-battle' : 'app-root';
    applyDeviceProfile(this.root, this.deviceProfile);
  }

  private finishBattle(result: BattleResult): void {
    if (!this.runLifecycle.finish()) return;
    this.resultRankingName = this.activeRankingName;
    this.resultRankingContext = this.activeRankingContext;
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
        playId: finalResult.playId ?? (finalResult.stageId === 'endless' ? this.resultRankingContext?.client.snapshot().session?.playId ?? null : null),
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
        this.state.notice = t('notice.settled');
        this.render('result');
        return;
      }
    } catch {
      // Do not apply parts/counters without a durable idempotency record. The
      // checkpoint is intentionally kept so the player can retry after making
      // storage available again; the visible result is still preserved.
      this.state.notice = t('notice.ledgerFailed');
      this.lastResult = finalResult;
      this.gameHost.stop();
      this.render('result');
      return;
    }
    this.lastResult = finalResult;
    this.gameHost.stop();
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
    if (this.commitSave(next)) this.state.notice = '';
    if (this.resultRankingName && !this.resultRankingContext?.record) this.state.notice = t('notice.pendingFailed');
    try {
      if (this.resultRankingContext?.record && !finalResult.retired && !this.rankingRunStore.saveResult(this.resultRankingContext.record, finalResult)) this.state.notice = t('notice.retrySaveFailed');
    } catch { this.state.notice = t('notice.resultSaveFailed'); }
    this.render('result');
    this.audio.cue(result.retired ? 'pause' : result.outcome === 'victory' ? 'victory' : 'defeat');
    this.announce(result.retired ? t('notice.retired') : result.outcome === 'victory' ? t('notice.victory') : t('notice.defeat'));
    void this.submitRanking(finalResult);
  }

  private resultView(result: BattleResult): HTMLElement {
    const client = this.resultRankingContext?.client ?? this.rankingClient;
    const ranking = client.snapshot();
    if (ranking.topRankingStatus === 'idle') window.setTimeout(() => { void client.loadTopRanking(); }, 0);
    const view = createResultView(result, {
      again: () => this.startStage('endless'),
      next: () => this.startStage('endless'),
      home: () => this.render('home'),
      share: () => { void this.shareResult(result); },
      ranking: result.retired ? { ...ranking, status: 'idle', session: null, submission: null, diagnosticCode: 'unconfirmed_result' } : this.resultRankingName ? ranking : { ...ranking, status: 'idle', session: null, submission: null, diagnosticCode: 'guest_run' },
      retryRanking: () => { void this.retryRanking(result); },
    });
    this.addNotice(view); return view;
  }

  private confirmRankingRecord(record: RankingRunRecord): void {
    try { this.rankingRunStore.confirm(record); } catch { /* Keep the same durable submission ID for a later retry. */ }
  }

  private async submitRanking(result: BattleResult): Promise<void> {
    const context = this.resultRankingContext;
    if (result.stageId !== 'endless' || result.retired || !context) return;
    const { client, name, record } = context;
    if (!name) { await client.loadTopRanking(true); return; }
    await context.start;
    const session = client.snapshot().session;
    if (session) {
      const submitted = await client.finish({ displayName: session.displayName, playId: session.playId, result });
      if (submitted.status === 'submitted' && record) this.confirmRankingRecord(record);
      if (submitted.status === 'retryable_failed' && this.resultRankingContext === context) this.state.notice = t('notice.sendFailed');
    }
    await client.loadTopRanking(true);
  }

  private async retryRanking(result: BattleResult): Promise<void> {
    const context = this.resultRankingContext;
    if (!context || this.lastResult !== result || this.runLifecycle.active) return;
    const { client, name, record } = context;
    if (!name || result.retired) { await client.loadTopRanking(true); return; }
    const snapshot = client.snapshot();
    if (snapshot.status === 'submitted' || record?.confirmed) { await client.loadTopRanking(true); return; }
    if (snapshot.submission) await client.retry(result);
    else {
      await client.retryStart(name);
      const session = client.snapshot().session;
      if (session) await client.finish({ displayName: session.displayName, playId: session.playId, result });
    }
    if (client.snapshot().status === 'submitted' && record) this.confirmRankingRecord(record);
    await client.loadTopRanking(true);
  }

  private refreshRankingResult(): void {
    if (this.state.view !== 'result' || !this.lastResult) return;
    this.render('result');
  }

  private async shareHome(): Promise<void> {
    const result = await this.shareService.share(t('home.title'), t('share.home'));
    if (result.method === 'cancelled') return;
    if (!result.success) this.showManualShare(t('share.home'));
    else this.showVisibleNotice(result.method === 'x' ? t('share.opened') : t('share.copied'));
  }

  private async shareResult(result: BattleResult): Promise<void> {
    const text = t('share.result', { score: formatNumber(result.score), seconds: formatNumber(Math.floor(result.survivalTime)), kills: formatNumber(result.kills) });
    const shared = await this.shareService.share(t('home.title'), text);
    if (shared.method === 'cancelled') return;
    if (!shared.success) this.showManualShare(text);
    else this.showVisibleNotice(shared.method === 'x' ? t('share.opened') : t('share.copied'));
  }

  private showManualShare(text: string): void {
    this.showCopyDialog(
      t('share.copy'),
      t('share.manual'),
      this.shareService.getShareText(text),
      t('share.copy'),
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
    field.setAttribute('aria-label', t('copy.label'));
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
      status.textContent = t('copy.selected');
    };
    copyButton.addEventListener('click', () => {
      if (!navigator.clipboard) {
        selectFallback();
        return;
      }
      void navigator.clipboard.writeText(value).then(() => {
        status.textContent = t('copy.done');
        this.announce(t('copy.done'));
      }).catch(selectFallback);
    });
    const closeButton = button(t('common.close'), 'button button-secondary');
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
    const notice = element('p', 'notice', translateGameText(this.state.notice)); notice.setAttribute('role', 'status'); view.prepend(notice); this.state.notice = '';
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
    const message = t('notice.storageFailed');
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

  private weaponName(id: string): string { return translateData(`data.weapons.name.${id}`, WEAPONS[id as keyof typeof WEAPONS]?.name ?? id); }
  private supportName(id: string): string { return translateData(`data.supports.name.${id}`, SUPPORTS[id as keyof typeof SUPPORTS]?.name ?? id); }
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

