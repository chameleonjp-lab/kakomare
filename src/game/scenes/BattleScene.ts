import Phaser from 'phaser';
import { BOSSES } from '../../data/bosses';
import { ENEMIES } from '../../data/enemies';
import { STAGES, nextStageId } from '../../data/stages';
import { WEAPONS } from '../../data/weapons';
import { Core } from '../entities/Core';
import { DROPPER_SHOT_INTERVAL_SECONDS, Enemy } from '../entities/Enemy';
import { Projectile } from '../entities/Projectile';
import { SupportModule, supportEffectsFor } from '../entities/SupportModule';
import { Weapon } from '../entities/Weapon';
import { EnemyPool } from '../pools/EnemyPool';
import { ParticlePool } from '../pools/ParticlePool';
import { ProjectilePool } from '../pools/ProjectilePool';
import { drawEnemy } from '../render/EnemyRenderer';
import { RENDER_LAYERS } from '../render/RenderLayer';
import { drawTelegraphs } from '../render/TelegraphRenderer';
import { drawDevice } from '../render/WeaponRenderer';
import { applyContactDamage, applyDamage } from '../systems/DamageSystem';
import { DamageNumberPool } from '../systems/DamageNumberPool';
import { EffectBudget, selectVisibleEntities, type EffectsLevel } from '../systems/EffectBudget';
import { FixedStepClock } from '../systems/FixedStepClock';
import { RunRecorder } from '../systems/RunRecorder';
import { collideEnemyProjectiles, collideProjectiles } from '../systems/CollisionSystem';
import { createUpgradeCandidateList, applyUpgradeCandidate, type ContinuousUpgradeId } from '../systems/UpgradeSystem';
import { DeterministicRng, seedFromStage, SpawnDirector, type SpawnWaveWarning } from '../systems/SpawnDirector';
import { MANUAL_AIM_HALF_ANGLE, selectTarget } from '../systems/TargetingSystem';
import { impactAngleFromSource, impactAngleFromVelocity } from '../systems/ImpactDirection';
import { advanceOrbitAngle } from '../systems/OrbitSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import type { BossId, EnemyId, StageId, SupportId, WeaponId } from '../../types/content';
import type { BattleCallbacks, BattleResult, BattleSnapshot, Point, UpgradeCandidate, UpgradePayload } from '../../types/game';
import type { ResearchEffects } from '../../data/research';
import { RunLifecycleGuard } from '../../app/RunLifecycleGuard';
import { BuildGraph } from '../build/BuildGraph';
import { BuildCapacity } from '../build/BuildCapacity';
import { ArenaGeometry } from '../systems/ArenaGeometry';
import { createCompetitiveRandomStreams, type CompetitiveRandomStreams } from '../systems/RandomStreams';
import { effectiveWeaponStats } from '../systems/CombatStats';
import { COMPETITIVE_RULES } from '../../data/competitiveRules';
import type { BuildLayer } from '../../types/build';

export interface BattleSceneOptions {
  stageId: StageId;
  effectsLevel: EffectsLevel;
  reducedMotion: boolean;
  screenShake: boolean;
  aimAssist: 'standard' | 'strong';
  researchEffects: ResearchEffects;
  seed?: number;
  testMode?: boolean;
  testOutcome?: 'victory' | 'defeat';
  testUpgrade?: boolean;
  testUpgradeExperience?: number;
  /** Enables the V1 common initial conditions without enabling ranking I/O. */
  competitive?: boolean;
  callbacks: BattleCallbacks;
}

interface FlashEffect { x: number; y: number; color: number; life: number; maxLife: number; radius: number; kind?: 'impact' | 'telegraph' }
interface LineEffect { angle: number; color: number; life: number; maxLife: number; width: number; startX?: number; startY?: number; length?: number }
interface GravityField {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  radius: number;
  damage: number;
  pullStrength: number;
  safeDistance: number;
  damageTimer: number;
  collapse: boolean;
  /** Collapse damage is locked when the field is created. */
  collapseDamage: number;
  slowDuration: number;
  sourceWeaponInstanceId: string | null;
}
interface MineField {
  id: number;
  x: number;
  y: number;
  life: number;
  maxLife: number;
  radius: number;
  damage: number;
  sourceWeaponInstanceId: string;
  triggered: boolean;
}
interface DroneUnit {
  index: number;
  x: number;
  y: number;
  angle: number;
  cooldown: number;
  life: number;
  maxLife: number;
  sourceWeaponInstanceId: string;
}
const MAX_ACTIVE_ENEMIES = 180;
const MAX_FRIENDLY_PROJECTILES = 280;
const MAX_ENEMY_PROJECTILES = 80;
const MAX_GRAVITY_FIELDS = 24;
const MAX_MINES = 48;
const MAX_DRONES = 24;
const LOGICAL_RENDER_SIZE = 720;
const BASE_ARENA_RADIUS = 325;
const CLUSTER_TELEGRAPH_SECONDS = 0.45;
export const GRAVITY_COLLAPSE_DAMAGE_MULTIPLIER = 1.8;
export const REPULSE_STRONG_PUSH_DAMAGE_MULTIPLIER = 1.25;
const CLUSTER_SPLIT_DAMAGE_MULTIPLIER = 0.3;
const CLUSTER_SPLIT_DISTANCE = 58;
const CLUSTER_SPLIT_SPEED = 240;

export class BattleScene extends Phaser.Scene {
  private readonly options: BattleSceneOptions;
  private readonly core: Core;
  private readonly clock = new FixedStepClock();
  private readonly enemyPool = new EnemyPool();
  private readonly projectilePool = new ProjectilePool();
  private readonly particles = new ParticlePool();
  private readonly enemies: Enemy[] = [];
  private readonly projectiles: Projectile[] = [];
  private readonly weapons: Weapon[];
  private readonly supports: SupportModule[] = [];
  private readonly buildGraph = new BuildGraph();
  private readonly buildCapacity = new BuildCapacity();
  private readonly arenaGeometry = new ArenaGeometry();
  private readonly flashes: FlashEffect[] = [];
  private readonly lines: LineEffect[] = [];
  private readonly gravityFields: GravityField[] = [];
  private readonly mines: MineField[] = [];
  private readonly drones = new Map<string, DroneUnit[]>();
  private readonly lanceCharge = new Map<string, number>();
  private readonly orbitAngles = new Map<string, number>();
  private readonly orbitHits = new Map<string, number>();
  private readonly targetLocks = new Map<string, number>();
  private readonly discTrailAt = new Map<number, number>();
  private readonly pendingSporeSplits: number[] = [];
  private readonly recorder: RunRecorder;
  private readonly spawnDirector: SpawnDirector;
  private readonly rng: DeterministicRng;
  private readonly candidateRng: DeterministicRng;
  private readonly randomStreams: CompetitiveRandomStreams;
  private readonly effectBudget: EffectBudget;
  private readonly damageNumbers = new DamageNumberPool();
  private readonly damageNumberTexts: Phaser.GameObjects.Text[] = [];
  private readonly runLifecycle = new RunLifecycleGuard(true);
  private readonly runSeed: number;
  private readonly competitive: boolean;
  private readonly ruleVersion: string;
  private readonly combatResearchEffects: ResearchEffects;
  private created = false;
  private backgroundGraphics!: Phaser.GameObjects.Graphics;
  private deviceGraphics!: Phaser.GameObjects.Graphics;
  private friendlyGraphics!: Phaser.GameObjects.Graphics;
  private enemyGraphics!: Phaser.GameObjects.Graphics;
  private telegraphGraphics!: Phaser.GameObjects.Graphics;
  private hostileGraphics!: Phaser.GameObjects.Graphics;
  private elapsed = 0;
  private readonly progression = new ProgressionSystem();
  private weaponPolishStacks = 0;
  private pendingPartsBonus = 0;
  private aimAngle = -Math.PI / 2;
  private manualAim = false;
  private aimPointerId: number | null = null;
  private aimStart: Point | null = null;
  private aimMoved = false;
  private aimReleaseAt = 0;
  private state: 'playing' | 'upgrade' | 'paused' | 'finished' = 'playing';
  private pauseReturnState: 'playing' | 'upgrade' = 'playing';
  private upgradePayload: UpgradePayload | null = null;
  private readonly banned = new Set<string>();
  private rerollsLeft: number;
  private bansLeft: number;
  private repairsUsed = 0;
  private upgradeSequence = 0;
  private choicesSinceBreak = 0;
  private upgradeRequestQueued = false;
  private pendingUpgradeDeferred = false;
  private bossDefeated = false;
  private testUpgradeOpened = false;
  private testOutcomeTimer: number | null = null;
  private lastSnapshotAt = -Infinity;
  private lastEnemyNotice = '';
  private endlessMilestone = 0;
  private designerWave: { angle: number; life: number; maxLife: number } | null = null;
  private echoWave: { angle: number; life: number; maxLife: number } | null = null;
  private crownPressure: { angle: number; life: number; maxLife: number } | null = null;
  private specialWaveWarning: { angle: number; life: number; maxLife: number } | null = null;
  private lastDesignerSector = -1;
  private crownWavesTriggered = 0;
  private renderPixelRatio = 1;
  private renderBackingSize = LOGICAL_RENDER_SIZE;
  private nextMineId = 1;

  public constructor(options: BattleSceneOptions) {
    super({ key: 'KakomareBattleScene' });
    this.options = options;
    this.runSeed = options.seed ?? seedFromStage(options.stageId, Date.now(), 1);
    this.competitive = options.competitive === true;
    this.ruleVersion = this.competitive ? COMPETITIVE_RULES.version : 'runtime-v0';
    this.combatResearchEffects = this.competitive
      ? { ...options.researchEffects, maxCore: COMPETITIVE_RULES.initial.coreHp, powerMultiplier: 1, projectileSpeedMultiplier: 1, partMultiplier: 1 }
      : options.researchEffects;
    this.core = new Core(this.combatResearchEffects.maxCore);
    this.recorder = new RunRecorder(options.stageId, STAGES[options.stageId].boss, this.runSeed, this.ruleVersion);
    this.randomStreams = createCompetitiveRandomStreams(this.runSeed);
    // V0's normal mode historically shared one scene RNG for candidates and
    // boss-side effects. Keep that sequence for existing seeded UI tests and
    // saves; the competitive path uses purpose-specific streams.
    this.rng = this.competitive ? this.randomStreams.combatEffect : new DeterministicRng(this.runSeed);
    this.candidateRng = this.competitive ? this.randomStreams.candidateDraw : this.rng;
    this.spawnDirector = new SpawnDirector(options.stageId, this.randomStreams.enemySpawn, options.testMode ?? false);
    this.weapons = [new Weapon('needle', 0)];
    this.buildGraph.install(this.weapons[0]!.instanceId, 'weapon', this.weapons[0]!.slot);
    this.buildCapacity.reserve(this.weapons[0]!.instanceId, 'weapon');
    this.effectBudget = new EffectBudget(options.effectsLevel);
    this.rerollsLeft = this.competitive ? COMPETITIVE_RULES.initial.rerolls : 1 + Math.min(2, this.combatResearchEffects.rerolls);
    this.bansLeft = this.competitive ? COMPETITIVE_RULES.initial.exclusions : 1 + Math.min(2, this.combatResearchEffects.bans);
  }

  public create(): void {
    this.created = true;
    this.backgroundGraphics = this.createRenderLayer(RENDER_LAYERS.background);
    this.deviceGraphics = this.createRenderLayer(RENDER_LAYERS.device);
    this.friendlyGraphics = this.createRenderLayer(RENDER_LAYERS.friendly);
    this.enemyGraphics = this.createRenderLayer(RENDER_LAYERS.enemies);
    this.telegraphGraphics = this.createRenderLayer(RENDER_LAYERS.telegraphs);
    this.hostileGraphics = this.createRenderLayer(RENDER_LAYERS.hostileProjectiles);
    this.applyRenderResolution();
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.input.on('pointerupoutside', this.handlePointerUp, this);
    this.input.on('pointercancel', this.handlePointerUp, this);
    this.input.keyboard?.on('keydown-ESC', () => {
      // Upgrade selection already owns focus and freezes the simulation.
      // Do not let a browser-level Escape race open a pause state behind it.
      if (this.state === 'upgrade') return;
      this.options.callbacks.onPauseRequest();
    });
    this.scheduleTestOutcome();
    this.options.callbacks.onStatus('戦闘開始');
    this.emitSnapshot(true);
  }

  public update(time: number, delta: number): void {
    if (!this.runLifecycle.active || this.state === 'finished') return;
    const frameStart = performance.now();
    this.clock.advance(delta / 1000, (seconds) => this.step(seconds));
    this.renderScene();
    this.effectBudget.sample(performance.now() - frameStart, time / 1000);
    this.applyRenderResolution();
    this.emitSnapshot(false);
  }

  public chooseUpgrade(candidate: UpgradeCandidate, selectionId?: number): void {
    const payload = this.upgradePayload;
    if (this.state !== 'upgrade' || !payload || payload.phase === 'break' || selectionId !== payload.selectionId) return;
    const storedCandidate = payload.candidates.find((item) => item.id === candidate.id);
    if (!storedCandidate) return;
    if (storedCandidate.requiresNewItemFirst) {
      this.options.callbacks.onStatus('候補を3つ保つため、先に新しい装置を取得してください');
      this.options.callbacks.onUpgrade({ ...payload, candidates: [...payload.candidates] });
      return;
    }
    const selectedCandidate = { ...storedCandidate, placementSlot: candidate.placementSlot };
    if (!selectedCandidate.isExisting && (selectedCandidate.kind === 'weapon' || selectedCandidate.kind === 'support') && !this.availablePlacementSlots(selectedCandidate.kind).includes(selectedCandidate.placementSlot ?? -1)) {
      this.options.callbacks.onStatus('装置を置く空き面を選んでください');
      this.options.callbacks.onUpgrade({ ...payload, candidates: [...payload.candidates] });
      return;
    }
    if (!selectedCandidate.isExisting && (selectedCandidate.kind === 'weapon' || selectedCandidate.kind === 'support') && !this.buildCapacity.canFit(1)) {
      this.options.callbacks.onStatus('稼働容量が足りないため、この装置は確定できません');
      this.options.callbacks.onUpgrade({ ...payload, candidates: [...payload.candidates] });
      return;
    }
    if (selectedCandidate.kind === 'expansion' && !selectedCandidate.expansionLayer) {
      this.options.callbacks.onStatus('この拡張候補は現在の配置と合いません');
      return;
    }
    if (!this.progression.canChoose()) {
      this.options.callbacks.onStatus('経験値が足りないため、この強化は確定できません');
      return;
    }
    let expansionApplied = false;
    this.recorder.recordInput({ kind: 'upgrade', tick: this.inputTick(), selectionId: payload.selectionId, candidateId: selectedCandidate.id, placementSlot: selectedCandidate.placementSlot });
    const applied = applyUpgradeCandidate(
      selectedCandidate,
      this.weapons,
      this.supports,
      (amount) => this.core.heal(amount),
      {
        onContinuous: (id) => this.applyContinuousUpgrade(id),
        onExpansion: (layer) => { expansionApplied = this.unlockBuildLayer(layer); },
      },
    );
    if (!applied || (selectedCandidate.kind === 'expansion' && !expansionApplied) || !this.progression.confirmChoice()) {
      this.options.callbacks.onStatus('候補が現在の構成と合わないため、強化を確定できません');
      this.options.callbacks.onUpgrade({ ...payload, candidates: [...payload.candidates] });
      return;
    }
    if (!selectedCandidate.isExisting && (selectedCandidate.kind === 'weapon' || selectedCandidate.kind === 'support')) {
      const slot = selectedCandidate.placementSlot;
      const installed = selectedCandidate.kind === 'weapon'
        ? [...this.weapons].reverse().find((weapon) => weapon.id === selectedCandidate.targetId && weapon.slot === slot)
        : [...this.supports].reverse().find((support) => support.id === selectedCandidate.targetId && support.slot === slot);
      if (installed) {
        const instanceId = installed.instanceId;
        this.buildGraph.install(instanceId, selectedCandidate.kind, slot ?? installed.slot);
        this.buildCapacity.reserve(instanceId, selectedCandidate.kind);
      }
    }
    if (selectedCandidate.kind === 'repair') this.repairsUsed += 1;
    this.recorder.upgrades.push(selectedCandidate.title);
    if (selectedCandidate.id.includes(':branch:')) this.recorder.branches.push(selectedCandidate.title);
    this.upgradePayload = null;
    this.choicesSinceBreak += 1;
    this.releaseAimInput();
    this.emitSnapshot(true);
    this.state = 'playing';
    if (this.progression.pendingChoices > 0) {
      if (this.choicesSinceBreak >= 3) {
        this.state = 'upgrade';
        this.presentUpgradeBreak();
      }
      else if (!this.openUpgrade()) this.upgradeRequestQueued = true;
      return;
    }
    this.choicesSinceBreak = 0;
    this.options.callbacks.onStatus(`${selectedCandidate.title}を取得しました`);
    this.notifyUpgradeClosed();
  }

  public rerollUpgrade(selectionId?: number): void {
    const payload = this.upgradePayload;
    if (this.state !== 'upgrade' || !payload || payload.phase === 'break' || selectionId !== payload.selectionId || this.rerollsLeft <= 0) return;
    const candidates = this.createCandidates(this.signature(payload.candidates));
    if (candidates.length !== 3) {
      this.options.callbacks.onStatus('これ以上候補を引き直せません');
      this.options.callbacks.onUpgrade({ ...payload, candidates: [...payload.candidates] });
      return;
    }
    if (this.signature(candidates) === this.signature(payload.candidates)) {
      this.options.callbacks.onStatus('現在の候補が、いま選べる内容のすべてです');
      this.options.callbacks.onUpgrade({ ...payload, candidates: [...payload.candidates] });
      return;
    }
    this.rerollsLeft -= 1;
    this.upgradeSequence += 1;
    this.upgradePayload = { ...payload, phase: 'selection', selectionId: this.upgradeSequence, candidates, rerollsLeft: this.rerollsLeft, bansLeft: this.bansLeft, pendingCount: this.progression.pendingChoices };
    this.options.callbacks.onUpgrade(this.upgradePayload);
  }

  public banUpgrade(candidateId: string, selectionId?: number): void {
    const payload = this.upgradePayload;
    if (this.state !== 'upgrade' || !payload || payload.phase === 'break' || selectionId !== payload.selectionId || this.bansLeft <= 0) return;
    const candidate = payload.candidates.find((item) => item.id === candidateId);
    if (!candidate) return;
    if (candidate.canBan === false) {
      this.options.callbacks.onStatus('この継続強化は、成長を止めないため除外できません');
      this.options.callbacks.onUpgrade({ ...payload, candidates: [...payload.candidates] });
      return;
    }
    const nextBanned = this.effectiveBans();
    nextBanned.add(candidate.id);
    const candidates = this.createCandidates(this.signature(payload.candidates), nextBanned);
    if (candidates.length !== 3) {
      this.options.callbacks.onStatus('候補を3つ保てないため、この候補は除外できません');
      this.options.callbacks.onUpgrade({ ...payload, candidates: [...payload.candidates] });
      return;
    }
    this.banned.add(candidate.id);
    this.bansLeft -= 1;
    this.upgradeSequence += 1;
    this.upgradePayload = { ...payload, phase: 'selection', selectionId: this.upgradeSequence, candidates, rerollsLeft: this.rerollsLeft, bansLeft: this.bansLeft, pendingCount: this.progression.pendingChoices };
    this.options.callbacks.onUpgrade(this.upgradePayload);
  }

  public continueUpgrade(selectionId?: number): void {
    if (this.state !== 'upgrade' || !this.upgradePayload || this.upgradePayload.phase !== 'break' || selectionId !== this.upgradePayload.selectionId) return;
    this.choicesSinceBreak = 0;
    this.upgradePayload = null;
    this.state = 'playing';
    if (!this.openUpgrade()) this.upgradeRequestQueued = true;
  }

  public deferUpgrade(selectionId?: number): void {
    if (this.state !== 'upgrade' || !this.upgradePayload || this.upgradePayload.phase !== 'break' || selectionId !== this.upgradePayload.selectionId) return;
    const pending = this.progression.pendingChoices;
    this.upgradePayload = null;
    this.choicesSinceBreak = 0;
    this.pendingUpgradeDeferred = true;
    this.upgradeRequestQueued = false;
    this.state = 'playing';
    this.releaseAimInput();
    this.emitSnapshot(true);
    this.options.callbacks.onStatus(`未選択の強化 ${pending}回。戦闘へ戻りました`);
    this.notifyUpgradeClosed();
  }

  /** Queue a HUD request once; the next complete combat update keeps finish priority. */
  public requestPendingUpgrade(selectionId: number): void {
    if (this.state !== 'playing' || !this.pendingUpgradeDeferred || !this.progression.canChoose()) return;
    if (selectionId !== this.upgradeSequence || this.upgradeRequestQueued) return;
    this.pendingUpgradeDeferred = false;
    this.upgradeRequestQueued = true;
    this.releaseAimInput();
    this.emitSnapshot(true);
  }

  public pause(): void {
    if (this.state === 'playing' || this.state === 'upgrade') {
      this.recorder.recordInput({ kind: 'pause', tick: this.inputTick() });
      this.pauseReturnState = this.state;
      this.state = 'paused';
      this.releaseAimInput();
      this.options.callbacks.onStatus('一時停止中');
    }
  }

  public resume(): void {
    if (this.state === 'paused') {
      this.recorder.recordInput({ kind: 'resume', tick: this.inputTick() });
      this.releaseAimInput();
      this.state = this.pauseReturnState;
      this.options.callbacks.onStatus('戦闘再開');
    }
  }

  /** Move an installed copy while the combat clock is stopped. */
  public moveDevice(instanceId: string, toSlot: number): boolean {
    if (this.state !== 'paused' && this.state !== 'upgrade') return false;
    if (!Number.isInteger(toSlot) || toSlot < 0) return false;
    const weapon = this.weapons.find((item) => item.instanceId === instanceId);
    const support = weapon ? undefined : this.supports.find((item) => item.instanceId === instanceId);
    const kind: 'weapon' | 'support' = weapon ? 'weapon' : 'support';
    const item = weapon ?? support;
    if (!item || item.slot === toSlot) return false;
    if (!this.buildGraph.move(instanceId, kind, item.slot, toSlot)) return false;
    item.slot = toSlot;
    this.recorder.recordInput({ kind: 'build', action: 'move', instanceId, slot: toSlot, tick: this.inputTick() });
    this.emitSnapshot(true);
    this.options.callbacks.onStatus(`${kind === 'weapon' ? '武器' : '補助'}を面${toSlot + 1}へ移設しました`);
    return true;
  }

  /** Swap two installed copies of the same kind without an empty-face window. */
  public swapDevices(firstInstanceId: string, secondInstanceId: string): boolean {
    if (this.state !== 'paused' && this.state !== 'upgrade') return false;
    const firstWeapon = this.weapons.find((item) => item.instanceId === firstInstanceId);
    const secondWeapon = this.weapons.find((item) => item.instanceId === secondInstanceId);
    const firstSupport = this.supports.find((item) => item.instanceId === firstInstanceId);
    const secondSupport = this.supports.find((item) => item.instanceId === secondInstanceId);
    const kind = firstWeapon && secondWeapon ? 'weapon' : firstSupport && secondSupport ? 'support' : null;
    if (!kind) return false;
    if (!this.buildGraph.swap(firstInstanceId, secondInstanceId, kind)) return false;
    const first = kind === 'weapon' ? firstWeapon! : firstSupport!;
    const second = kind === 'weapon' ? secondWeapon! : secondSupport!;
    const firstSlot = first.slot;
    first.slot = second.slot;
    second.slot = firstSlot;
    this.recorder.recordInput({ kind: 'build', action: 'swap', instanceId: firstInstanceId, otherInstanceId: secondInstanceId, tick: this.inputTick() });
    this.emitSnapshot(true);
    this.options.callbacks.onStatus(`${kind === 'weapon' ? '武器' : '補助'}の配置を入れ替えました`);
    return true;
  }

  public get paused(): boolean { return this.state === 'paused'; }
  public get upgrading(): boolean { return this.state === 'upgrade' || this.state === 'paused' && this.pauseReturnState === 'upgrade'; }

  public retire(): void {
    if (this.state === 'finished') return;
    this.recorder.recordInput({ kind: 'retire', tick: this.inputTick() });
    this.finish('defeat', 'プレイを終了しました', true);
  }

  public shutdownBattle(): void {
    if (this.testOutcomeTimer !== null) { window.clearTimeout(this.testOutcomeTimer); this.testOutcomeTimer = null; }
    this.state = 'finished';
    this.releaseAimInput();
    this.runLifecycle.cancel();
    if (this.created) this.input.removeAllListeners();
    this.created = false;
  }

  private step(seconds: number): void {
    if (!this.runLifecycle.active) return;
    if (this.state !== 'playing') return;
    this.elapsed += seconds;
    this.updateSpecialWaveWarning(seconds);
    if (this.manualAim && this.aimPointerId === null && this.elapsed >= this.aimReleaseAt) this.manualAim = false;
    if (this.options.testMode && this.options.testUpgrade && !this.testUpgradeOpened && this.elapsed >= 0.7) {
      this.testUpgradeOpened = true;
      // The browser fixture asks to inspect the real upgrade dialog before a
      // kill has happened. Supply exactly one affordable choice in test mode;
      // production runs still earn experience only from defeated enemies.
      const injected = this.options.testUpgradeExperience;
      this.progression.addExperience(injected !== undefined && Number.isInteger(injected) && injected > 0 && injected <= 10000
        ? injected
        : this.progression.nextExperience);
      this.upgradeRequestQueued = true;
    }
    const stage = STAGES[this.options.stageId];
    const bossRequested = this.spawnDirector.requestBossSpawn(this.elapsed);
    const activeBoss = this.enemies.some((enemy) => enemy.active && enemy.isBoss);
    if (bossRequested && !activeBoss && this.spawnBoss()) this.spawnDirector.confirmBossSpawn();
    // Resolve pending boss actions before normal spawns and dropper shots so a
    // saturated arena cannot starve an already-telegraphed boss action.
    this.updateBossActions(seconds);
    const activeEnemies = this.enemies.filter((enemy) => enemy.active).length;
    const reservedBossSlots = stage.isEndless && !this.enemies.some((enemy) => enemy.active && enemy.isBoss) ? 1 : 0;
    const reservedArenaSlots = Math.max(reservedBossSlots, this.pendingBossEnemySlots());
    this.spawnDirector.update(
      seconds,
      this.elapsed,
      activeEnemies,
      (request) => { this.spawnEnemy(request.type, request.angle); },
      reservedArenaSlots,
      (warning) => this.showSpecialWaveWarning(warning),
    );

    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      const markerBoost = this.markerBoostFor(enemy);
      const wasTelegraph = enemy.telegraph;
      const reached = enemy.update(seconds, this.elapsed, { x: 0, y: 0 }, 1, markerBoost);
      if (enemy.type === 'dropper' && !wasTelegraph && enemy.telegraph) {
        this.options.callbacks.onStatus('投下体が遠隔弾を準備しています');
      }
      if (enemy.slowUntil > this.elapsed) this.recorder.recordControl('slowed', seconds);
      if (reached) {
        const damage = applyContactDamage(this.core, enemy);
        if (damage > 0) {
          this.triggerScreenShake(damage);
          this.recorder.recordContact(enemy.angle, damage, `${enemy.isBoss ? BOSSES[enemy.type as BossId].name : ENEMIES[enemy.type as EnemyId].name}の接触`);
          this.options.callbacks.onStatus(`コアが${Math.round(damage)}ダメージを受けました`);
        }
      }
    }
    if (this.core.health <= 0) { this.finish('defeat', this.recorder.lastDamageSource); return; }
    this.updateDropperAttacks();
    this.updateOrbitAngles(seconds);
    this.updateChargeWeapons(seconds);
    this.updateMines(seconds);
    this.updateDrones(seconds);
    if ((this.state as string) === 'finished') return;

    for (const weapon of this.weapons) {
      const effective = this.combatStats(weapon);
      const baseCooldown = weapon.stats.cooldown * weapon.cooldownMultiplier;
      const intervalMultiplier = baseCooldown > 0 ? effective.cooldown / baseCooldown : 1;
      if (!weapon.advance(seconds, intervalMultiplier)) continue;
      this.fireWeapon(weapon);
      if ((this.state as string) === 'finished') return;
      const branchEvery = Math.round(this.supportEffect('branch', weapon.slot));
      if (branchEvery > 0 && weapon.shotsFired % branchEvery === 0) this.fireWeapon(weapon, false, 0.5);
      if ((this.state as string) === 'finished') return;
    }
    this.updateGravityFields(seconds);
    if ((this.state as string) === 'finished') return;
    this.updateProjectiles(seconds);
    if ((this.state as string) === 'finished') return;
    const collisions = collideProjectiles(
      this.projectiles,
      this.enemies,
      this.elapsed,
      (projectile, enemy) => this.adjustForSpecialEnemy(enemy, projectile.damage, this.weaponForProjectile(projectile)?.slot ?? 0),
      undefined,
      (collision) => collision.destroyed && collision.enemy.isBoss && !stage.isEndless,
    );
    for (const collision of collisions) {
      if (collision.damage > 0) {
        const weaponId = collision.projectile.sourceWeaponId ?? 'needle';
        this.recordHitDamage(weaponId, collision.damage, collision.enemy.x, collision.enemy.y, this.weaponForProjectile(collision.projectile)?.instanceId);
      }
      if (collision.destroyed) this.handleEnemyDestroyed(collision.enemy);
      if ((this.state as string) === 'finished') break;
    }
    if ((this.state as string) === 'finished') return;
    collideEnemyProjectiles(this.projectiles);
    this.updateEnemyProjectiles();
    if (this.core.health <= 0) { this.finish('defeat', this.recorder.lastDamageSource); return; }
    this.flushPendingSporeSplits();
    this.updateEffects(seconds);
    this.compactEntities();
    this.recorder.survivalTime = this.elapsed;
    if (stage.isEndless) this.updateEndlessMilestone();
    if (!stage.isEndless && this.elapsed >= stage.timeLimit && !this.bossDefeated) this.finish('defeat', `${stage.name}の制限時間内に${BOSSES[stage.boss].name}を止められませんでした`);
    if (this.options.testMode && !this.options.testOutcome && this.elapsed >= 8) this.finish('defeat', 'テスト用の時間切れ');
    if (this.state === 'playing' && !this.pendingUpgradeDeferred && this.upgradeRequestQueued && this.progression.canChoose()) this.openUpgrade();
  }

  private fireWeapon(weapon: Weapon, allowBranch = true, powerFactor = 1): void {
    if (this.state === 'finished') return;
    const range = this.combatStats(weapon).range;
    const usesTarget = weapon.id !== 'repulse' && weapon.id !== 'orbit';
    const origin = usesTarget ? this.weaponOrigin(weapon) : { x: 0, y: 0 };
    const target = usesTarget
      ? selectTarget(this.enemies.filter((enemy) => enemy.active), origin, { angle: this.aimAngle, manual: this.manualAim }, range, this.elapsed, weapon.id, this.targetLocks.get(weapon.instanceId))
      : null;
    if (target) this.targetLocks.set(weapon.instanceId, target.id);
    else if (usesTarget) this.targetLocks.delete(weapon.instanceId);
    const angle = target ? Math.atan2(target.y - origin.y, target.x - origin.x) : this.aimAngle;
    const damage = this.weaponPower(weapon, powerFactor);
    if (weapon.id === 'needle') this.fireNeedle(weapon, angle, damage, allowBranch);
    else if (weapon.id === 'ray') this.fireRay(weapon, angle, damage);
    else if (weapon.id === 'cluster') this.fireCluster(weapon, target, angle, damage);
    else if (weapon.id === 'repulse') this.fireRepulse(weapon, damage);
    else if (weapon.id === 'chain') this.fireChain(weapon, target, angle, damage);
    else if (weapon.id === 'orbit') this.fireOrbit(weapon, damage);
    else if (weapon.id === 'disc') this.fireDisc(weapon, angle, damage);
    else if (weapon.id === 'gravity') this.fireGravity(weapon, target, angle, damage);
    else if (weapon.id === 'grid') this.fireGrid(weapon, target, angle, damage);
    else if (weapon.id === 'mine') this.fireMine(weapon, target, angle, damage);
    else if (weapon.id === 'lance') this.fireLance(weapon, angle, damage);
    else this.deployDrones(weapon);
    if (!allowBranch) return;
  }

  private fireNeedle(weapon: Weapon, angle: number, damage: number, allowEvolution = true): void {
    this.options.callbacks.onAudioCue?.('shot');
    this.recorder.recordWeaponEvent(weapon.id, 'shots');
    const origin = this.weaponOrigin(weapon);
    const spread = weapon.branch === 'spread' ? 3 : 1;
    const piercing = (weapon.stats.pierce ?? 0) + (weapon.branch === 'piercing' ? 2 : 0);
    const piercingDamage = weapon.branch === 'piercing' ? damage * 1.12 : damage;
    const speed = (this.combatStats(weapon).projectileSpeed ?? 480) * (weapon.branch === 'piercing' ? 1.18 : 1);
    for (let index = 0; index < spread; index += 1) {
      const offset = spread === 1 ? 0 : (index - 1) * 0.14;
      this.addProjectile({
        kind: 'needle', x: origin.x, y: origin.y, vx: Math.cos(angle + offset) * speed, vy: Math.sin(angle + offset) * speed,
        radius: 6, damage: piercingDamage, life: 1.4, piercing, sourceWeaponId: weapon.id, sourceWeaponInstanceId: weapon.instanceId,
      });
    }
    if (allowEvolution && weapon.evolutionId === 'needle-volley') {
      for (const offset of [-0.24, 0.24]) {
        this.addProjectile({
          kind: 'needle', x: origin.x, y: origin.y, vx: Math.cos(angle + offset) * speed, vy: Math.sin(angle + offset) * speed,
          radius: 5, damage: piercingDamage * 0.55, life: 1.25, piercing: Math.max(0, piercing - 1), sourceWeaponId: weapon.id, sourceWeaponInstanceId: weapon.instanceId,
        });
      }
    }
  }

  private fireRay(weapon: Weapon, angle: number, damage: number): void {
    if ((this.state as string) === 'finished') return;
    this.options.callbacks.onAudioCue?.('heavy');
    this.recorder.recordWeaponEvent(weapon.id, 'shots');
    const width = (weapon.stats.width ?? 18) + (weapon.branch === 'wide' ? 20 : 0);
    const life = weapon.branch === 'wide' ? 0.22 : 0.16;
    const origin = this.weaponOrigin(weapon);
    const range = this.combatStats(weapon).range;
    const arenaRadius = this.arenaRadius();
    const boundaryDistance = this.arenaGeometry.distanceToBoundary(origin, angle, this.buildGraph.unlockedLayer);
    const primaryLength = Math.min(boundaryDistance, range);
    this.addLine({ angle, color: WEAPONS.ray.color, life, maxLife: life, width, startX: origin.x, startY: origin.y, length: primaryLength });
    this.hitRaySegment(weapon, origin.x, origin.y, angle, primaryLength, width, damage);
    if (this.state === 'finished') return;
    if (weapon.branch === 'reflect' && range > boundaryDistance + 1e-6) {
      // The ray hits the circular outer boundary and reflects back along the
      // physically predictable opposite direction. Its second segment starts
      // at the actual boundary point, so the visual and damage path agree.
      const boundaryX = origin.x + Math.cos(angle) * primaryLength;
      const boundaryY = origin.y + Math.sin(angle) * primaryLength;
      const reflected = angle + Math.PI;
      const reflectedLength = Math.min(arenaRadius * 2, range - boundaryDistance);
      this.addLine({ angle: reflected, color: WEAPONS.ray.color, life: 0.14, maxLife: 0.14, width: width * 0.7, startX: boundaryX, startY: boundaryY, length: reflectedLength });
      this.hitRaySegment(weapon, boundaryX, boundaryY, reflected, reflectedLength, width * 0.7, damage * 0.55);
    }
    if (weapon.evolutionId === 'ray-cross') {
      const crossAngle = angle + Math.PI / 2;
      const crossLength = Math.min(primaryLength * 0.72, range * 0.72);
      this.addLine({ angle: crossAngle, color: WEAPONS.ray.color, life: 0.12, maxLife: 0.12, width: width * 0.65, startX: origin.x, startY: origin.y, length: crossLength });
      this.hitRaySegment(weapon, origin.x, origin.y, crossAngle, crossLength, width * 0.65, damage * 0.45);
    }
  }

  private hitRaySegment(weapon: Weapon, startX: number, startY: number, angle: number, length: number, width: number, damage: number): void {
    if (this.state === 'finished') return;
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const segmentLength = Math.max(1, length);
    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      const projection = Math.max(0, Math.min(1, ((enemy.x - startX) * directionX + (enemy.y - startY) * directionY) / segmentLength));
      const closestX = startX + directionX * length * projection;
      const closestY = startY + directionY * length * projection;
      if (Math.hypot(enemy.x - closestX, enemy.y - closestY) > width / 2 + enemy.hitRadius) continue;
      // A ray is a travelling line, so every victim along that line sees the
      // same incoming side even when it is hit near the edge of the width.
      const impactAngle = impactAngleFromVelocity(directionX, directionY);
      const result = applyDamage(enemy, this.adjustForSpecialEnemy(enemy, damage, weapon.slot), this.elapsed, impactAngle);
      this.recordHitDamage(weapon.id, result.amount, enemy.x, enemy.y, weapon.instanceId);
      if (result.destroyed) this.handleEnemyDestroyed(enemy);
      if ((this.state as string) === 'finished') return;
    }
  }

  private fireCluster(weapon: Weapon, target: Enemy | null, angle: number, damage: number): void {
    this.options.callbacks.onAudioCue?.('heavy');
    this.recorder.recordWeaponEvent(weapon.id, 'shots');
    const origin = this.weaponOrigin(weapon);
    const radius = weapon.stats.radius ?? 72;
    const targetPoint = target ? { x: target.x, y: target.y } : { x: origin.x + Math.cos(angle) * 250, y: origin.y + Math.sin(angle) * 250 };
    const speed = this.combatStats(weapon).projectileSpeed ?? 330;
    const directionX = targetPoint.x - origin.x;
    const directionY = targetPoint.y - origin.y;
    const distance = Math.hypot(directionX, directionY);
    const travelSeconds = Math.max(CLUSTER_TELEGRAPH_SECONDS, distance / Math.max(1, speed));
    const velocity = distance / travelSeconds;
    this.addProjectile({
      kind: 'cluster', x: origin.x, y: origin.y, vx: distance > 0 ? directionX / distance * velocity : 0, vy: distance > 0 ? directionY / distance * velocity : 0,
      radius: 10, damage, life: travelSeconds, piercing: 0, sourceWeaponId: weapon.id, sourceWeaponInstanceId: weapon.instanceId,
      impactX: targetPoint.x, impactY: targetPoint.y, impactRadius: radius, impactAngle: distance > 0 ? Math.atan2(directionY, directionX) : angle,
    });
  }

  private resolveClusterImpact(projectile: Projectile): void {
    const weapon = this.weaponForProjectile(projectile);
    if (!weapon || projectile.impactX === null || projectile.impactY === null) return;
    const x = projectile.impactX;
    const y = projectile.impactY;
    const radius = projectile.impactRadius;
    const angle = projectile.impactAngle;
    this.addFlash({ x, y, color: WEAPONS.cluster.color, life: CLUSTER_TELEGRAPH_SECONDS, maxLife: CLUSTER_TELEGRAPH_SECONDS, radius, kind: 'impact' });
    const hitIds = new Set<number>();
    // The burst originates at the impact center.  Each victim therefore gets
    // the face-facing-center direction; a victim exactly at the center is an
    // omnidirectional hit and has no arbitrary shield plate selected.
    this.hitArea(weapon, x, y, radius, projectile.damage, null, hitIds);
    if (this.state === 'finished') return;
    if (weapon.branch === 'split' && !projectile.clusterSplitChild) {
      for (let index = 0; index < 3; index += 1) {
        const splitAngle = angle + index * Math.PI * 2 / 3;
        const impactX = x + Math.cos(splitAngle) * CLUSTER_SPLIT_DISTANCE;
        const impactY = y + Math.sin(splitAngle) * CLUSTER_SPLIT_DISTANCE;
        const travelSeconds = CLUSTER_SPLIT_DISTANCE / CLUSTER_SPLIT_SPEED;
        // The split branch is a real post-impact projectile, not an instant
        // damage fan. This keeps its three directions visible and gives
        // shields / phase timing a chance to interact with the child shots.
        this.addProjectile({
          kind: 'cluster', x, y,
          vx: Math.cos(splitAngle) * CLUSTER_SPLIT_SPEED,
          vy: Math.sin(splitAngle) * CLUSTER_SPLIT_SPEED,
          radius: 6,
          damage: projectile.damage * CLUSTER_SPLIT_DAMAGE_MULTIPLIER,
          life: travelSeconds,
          piercing: 0,
          sourceWeaponId: weapon.id,
          sourceWeaponInstanceId: weapon.instanceId,
          impactX,
          impactY,
          impactRadius: radius * 0.45,
          impactAngle: splitAngle,
          clusterSplitChild: true,
        });
      }
    }
    if (weapon.branch === 'residue') this.createGravityField(x, y, 1.8, radius * 0.75, 0, 0, 180, false, 0.55 * (1 + this.supportEffect('brake', weapon.slot)), weapon.instanceId);
    if (weapon.evolutionId === 'cluster-ring' && !projectile.clusterSplitChild) {
      const childRadius = radius * 0.42;
      for (let index = 0; index < 3; index += 1) {
        const childAngle = angle + index * Math.PI * 2 / 3;
        const childX = x + Math.cos(childAngle) * radius * 0.7;
        const childY = y + Math.sin(childAngle) * radius * 0.7;
        this.addProjectile({
          kind: 'cluster', x, y, vx: Math.cos(childAngle) * CLUSTER_SPLIT_SPEED, vy: Math.sin(childAngle) * CLUSTER_SPLIT_SPEED,
          radius: 6, damage: projectile.damage * 0.32, life: radius * 0.7 / CLUSTER_SPLIT_SPEED, piercing: 0,
          sourceWeaponId: weapon.id, sourceWeaponInstanceId: weapon.instanceId, impactX: childX, impactY: childY,
          impactRadius: childRadius, impactAngle: childAngle, clusterSplitChild: true,
        });
      }
    }
  }

  private fireRepulse(weapon: Weapon, damage: number): void {
    this.options.callbacks.onAudioCue?.('heavy');
    this.recorder.recordWeaponEvent(weapon.id, 'shots');
    const radius = weapon.stats.radius ?? 165;
    const pushBonus = weapon.branch === 'strong-push' ? 1.5 : 1;
    const brakeEffect = this.supportEffect('brake', weapon.slot);
    const push = (weapon.stats.pushDistance ?? 58) * (1 + brakeEffect) * pushBonus;
    const slowDuration = (weapon.branch === 'delayed' ? 1.4 : 0.4) * (1 + brakeEffect);
    const damageMultiplier = weapon.branch === 'strong-push' ? (weapon.branchDefinition?.damageMultiplier ?? REPULSE_STRONG_PUSH_DAMAGE_MULTIPLIER) : 1;
    this.addLine({ angle: 0, color: WEAPONS.repulse.color, life: 0.3, maxLife: 0.3, width: radius });
    for (const enemy of this.enemies) {
      if (!enemy.active || Math.hypot(enemy.x, enemy.y) > radius + enemy.hitRadius) continue;
      const result = applyDamage(enemy, this.adjustForSpecialEnemy(enemy, damage * damageMultiplier, weapon.slot), this.elapsed, impactAngleFromSource(0, 0, enemy.x, enemy.y));
      enemy.applyPush(push, this.elapsed);
      enemy.applySlow(this.elapsed, slowDuration);
      this.recorder.recordControl('pushed', slowDuration);
      this.recordHitDamage(weapon.id, result.amount, enemy.x, enemy.y, weapon.instanceId);
      if (result.destroyed) this.handleEnemyDestroyed(enemy);
      if ((this.state as string) === 'finished') return;
    }
    if (weapon.evolutionId === 'repulse-double') {
      const outerRadius = radius + 58;
      this.addLine({ angle: 0, color: WEAPONS.repulse.color, life: 0.2, maxLife: 0.2, width: outerRadius });
      for (const enemy of this.enemies) {
        if (!enemy.active || Math.hypot(enemy.x, enemy.y) > outerRadius + enemy.hitRadius || Math.hypot(enemy.x, enemy.y) <= radius) continue;
        enemy.applySlow(this.elapsed, 0.6 * (1 + brakeEffect));
        this.recorder.recordControl('slowed', 0.6);
      }
    }
  }

  private fireChain(weapon: Weapon, target: Enemy | null, _angle: number, damage: number): void {
    this.options.callbacks.onAudioCue?.('heavy');
    this.recorder.recordWeaponEvent(weapon.id, 'shots');
    let current = target;
    const hit = new Set<number>();
    let lastPoint = this.weaponOrigin(weapon);
    let chainHit = false;
    const count = (weapon.stats.chainCount ?? 3) + (weapon.branch === 'chain' ? 2 : 0) + (weapon.evolutionId === 'chain-mesh' ? 2 : 0);
    for (let index = 0; index < count && current; index += 1) {
      hit.add(current.id);
      const currentPoint = { x: current.x, y: current.y };
      const linkAngle = Math.atan2(currentPoint.y - lastPoint.y, currentPoint.x - lastPoint.x);
      this.addLine({ angle: linkAngle, color: WEAPONS.chain.color, life: 0.22, maxLife: 0.22, width: 5, startX: lastPoint.x, startY: lastPoint.y, length: Math.hypot(currentPoint.x - lastPoint.x, currentPoint.y - lastPoint.y) });
      // A chain hit enters from the previous node (or the core for the first
      // node), rather than from the victim's radial direction.  This keeps
      // shield plates consistent when a chain turns between enemies.
      const impactAngle = impactAngleFromSource(lastPoint.x, lastPoint.y, current.x, current.y);
      const result = applyDamage(current, this.adjustForSpecialEnemy(current, damage * Math.pow(0.8, index), weapon.slot), this.elapsed, impactAngle);
      chainHit = true;
      this.recordHitDamage(weapon.id, result.amount, current.x, current.y, weapon.instanceId);
      if (result.destroyed) this.handleEnemyDestroyed(current);
      if ((this.state as string) === 'finished') return;
      lastPoint = currentPoint;
      current = this.enemies.filter((enemy) => enemy.active && !hit.has(enemy.id) && Math.hypot(enemy.x - lastPoint.x, enemy.y - lastPoint.y) <= 150).sort((a, b) => Math.hypot(a.x - lastPoint.x, a.y - lastPoint.y) - Math.hypot(b.x - lastPoint.x, b.y - lastPoint.y))[0] ?? null;
    }
    // An axis-aligned victim is still a valid final node.  Use the hit state,
    // rather than requiring both coordinates to be non-zero, to decide if a
    // terminal burst should happen.
    if (weapon.branch === 'burst' && chainHit) this.hitArea(weapon, lastPoint.x, lastPoint.y, 40, damage * 0.5, null);
  }

  private fireOrbit(weapon: Weapon, damage: number): void {
    this.options.callbacks.onAudioCue?.('heavy');
    this.recorder.recordWeaponEvent(weapon.id, 'shots');
    const angle = this.orbitAngles.get(weapon.instanceId) ?? 0;
    const count = (weapon.stats.count ?? 2) + (weapon.branch === 'many' ? 1 : 0);
    const radius = (weapon.stats.orbitRadius ?? 108) + (weapon.branch === 'outer' ? 38 : 0);
    const bladeLength = (weapon.stats.bladeLength ?? 32) + (weapon.branch === 'outer' ? 28 : 0);
    for (let index = 0; index < count; index += 1) {
      const bladeAngle = angle + index * Math.PI * 2 / count;
      for (const enemy of this.enemies) {
        const key = `${weapon.instanceId}:${enemy.id}`;
        const halfLength = bladeLength / 2;
        const startX = Math.cos(bladeAngle) * (radius - halfLength);
        const startY = Math.sin(bladeAngle) * (radius - halfLength);
        const endX = Math.cos(bladeAngle) * (radius + halfLength);
        const endY = Math.sin(bladeAngle) * (radius + halfLength);
        if (!enemy.active || distanceToSegment(enemy.x, enemy.y, startX, startY, endX, endY) > 8 + enemy.hitRadius) continue;
        if (this.elapsed - (this.orbitHits.get(key) ?? -Infinity) < (weapon.stats.hitCooldown ?? 0.45)) continue;
        this.orbitHits.set(key, this.elapsed);
        // The blade's visible motion is a positive-angle orbit.  Its tangent
        // is the attack travel direction; use the opposite side for the
        // victim-facing shield check so the shield follows the animation.
        const impactAngle = impactAngleFromVelocity(Math.cos(bladeAngle + Math.PI / 2), Math.sin(bladeAngle + Math.PI / 2));
        const result = applyDamage(enemy, this.adjustForSpecialEnemy(enemy, damage, weapon.slot), this.elapsed, impactAngle);
        this.recordHitDamage(weapon.id, result.amount, enemy.x, enemy.y, weapon.instanceId);
        if (result.destroyed) this.handleEnemyDestroyed(enemy);
        if (this.state === 'finished') return;
      }
    }
    if (weapon.evolutionId === 'orbit-double') this.hitOrbitRing(weapon, damage * 0.6, radius + 52, bladeLength * 0.9, count);
  }

  private hitOrbitRing(weapon: Weapon, damage: number, radius: number, bladeLength: number, count: number): void {
    const angle = (this.orbitAngles.get(weapon.instanceId) ?? 0) + Math.PI / Math.max(1, count);
    for (let index = 0; index < count; index += 1) {
      const bladeAngle = angle + index * Math.PI * 2 / count;
      const startX = Math.cos(bladeAngle) * (radius - bladeLength / 2);
      const startY = Math.sin(bladeAngle) * (radius - bladeLength / 2);
      const endX = Math.cos(bladeAngle) * (radius + bladeLength / 2);
      const endY = Math.sin(bladeAngle) * (radius + bladeLength / 2);
      for (const enemy of this.enemies) {
        if (!enemy.active || distanceToSegment(enemy.x, enemy.y, startX, startY, endX, endY) > 8 + enemy.hitRadius) continue;
        const key = `${weapon.instanceId}:evolution:${enemy.id}`;
        if (this.elapsed - (this.orbitHits.get(key) ?? -Infinity) < (weapon.stats.hitCooldown ?? 0.45)) continue;
        this.orbitHits.set(key, this.elapsed);
        const result = applyDamage(enemy, this.adjustForSpecialEnemy(enemy, damage, weapon.slot), this.elapsed, impactAngleFromVelocity(Math.cos(bladeAngle + Math.PI / 2), Math.sin(bladeAngle + Math.PI / 2)));
        this.recordHitDamage(weapon.id, result.amount, enemy.x, enemy.y, weapon.instanceId);
        if (result.destroyed) this.handleEnemyDestroyed(enemy);
      }
    }
  }

  private updateOrbitAngles(seconds: number): void {
    for (const weapon of this.weapons) {
      if (weapon.id !== 'orbit') continue;
      const speed = (weapon.stats.orbitSpeed ?? 1.9) * (weapon.branch === 'many' ? 1.25 : 1);
      const previous = this.orbitAngles.get(weapon.instanceId) ?? 0;
      this.orbitAngles.set(weapon.instanceId, advanceOrbitAngle(previous, speed, seconds));
    }
  }

  private fireDisc(weapon: Weapon, angle: number, damage: number): void {
    this.options.callbacks.onAudioCue?.('heavy');
    this.recorder.recordWeaponEvent(weapon.id, 'shots');
    const origin = this.weaponOrigin(weapon);
    const speed = (this.combatStats(weapon).projectileSpeed ?? 290) * (weapon.branch === 'echo' ? 1.2 : 1);
    this.addProjectile({
      kind: 'disc', x: origin.x, y: origin.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      radius: 10, damage, life: 4, piercing: 0, bounces: (weapon.stats.bounceCount ?? 3) + (weapon.branch === 'echo' ? 3 : 0), hitCooldown: weapon.stats.hitCooldown ?? 0.3, sourceWeaponId: weapon.id, sourceWeaponInstanceId: weapon.instanceId,
    });
    if (weapon.evolutionId === 'disc-resonant') {
      this.addProjectile({
        kind: 'disc', x: origin.x, y: origin.y, vx: Math.cos(angle + Math.PI / 3) * speed * 0.86, vy: Math.sin(angle + Math.PI / 3) * speed * 0.86,
        radius: 8, damage: damage * 0.45, life: 3.2, piercing: 0, bounces: Math.max(1, Math.floor((weapon.stats.bounceCount ?? 3) / 2)), hitCooldown: (weapon.stats.hitCooldown ?? 0.3) + 0.05, sourceWeaponId: weapon.id, sourceWeaponInstanceId: weapon.instanceId,
      });
    }
  }

  private fireGravity(weapon: Weapon, target: Enemy | null, angle: number, damage: number): void {
    this.options.callbacks.onAudioCue?.('heavy');
    this.recorder.recordWeaponEvent(weapon.id, 'shots');
    const origin = this.weaponOrigin(weapon);
    const stats = weapon.stats;
    const range = this.combatStats(weapon).range;
    const safeDistance = stats.safeDistance ?? 180;
    const targetX = target ? target.x : origin.x + Math.cos(angle) * 260;
    const targetY = target ? target.y : origin.y + Math.sin(angle) * 260;
    const vectorX = targetX - origin.x;
    const vectorY = targetY - origin.y;
    const targetDistance = Math.hypot(vectorX, vectorY);
    const directionX = targetDistance > 1e-6 ? vectorX / targetDistance : Math.cos(angle);
    const directionY = targetDistance > 1e-6 ? vectorY / targetDistance : Math.sin(angle);
    const directionAngle = Math.atan2(directionY, directionX);
    const boundaryDistance = this.arenaGeometry.distanceToBoundary(origin, directionAngle, this.buildGraph.unlockedLayer);
    const distance = Math.max(12, Math.min(range, targetDistance, Math.max(12, boundaryDistance - 12)));
    let x = origin.x + directionX * distance;
    let y = origin.y + directionY * distance;
    if (Math.hypot(x, y) < safeDistance + 12) {
      const safeRadius = Math.min(safeDistance + 12, this.arenaRadius() - 12);
      x = Math.cos(angle) * safeRadius;
      y = Math.sin(angle) * safeRadius;
    }
    const duration = (stats.duration ?? 2.2) * (weapon.branch === 'long' ? 1.4 : 1);
    const radius = (stats.pullRadius ?? 125) * (weapon.branch === 'long' ? 1.2 : 1);
    const brakeEffect = this.supportEffect('brake', weapon.slot);
    this.createGravityField(x, y, duration, radius, damage, stats.pullStrength ?? 34, safeDistance, weapon.branch === 'collapse', 0.4 * (1 + brakeEffect), weapon.instanceId);
    if (weapon.evolutionId === 'gravity-linked') {
      const offset = Math.PI / 5;
      this.createGravityField(x + Math.cos(angle + offset) * 62, y + Math.sin(angle + offset) * 62, duration * 0.72, radius * 0.7, damage * 0.45, stats.pullStrength ?? 34, safeDistance, false, 0.35 * (1 + brakeEffect), weapon.instanceId);
      this.addLine({ angle: angle + offset, color: WEAPONS.gravity.color, life: 0.3, maxLife: 0.3, startX: x, startY: y, length: 62, width: 4 });
    }
    this.addLine({ angle, color: WEAPONS.gravity.color, life: 0.38, maxLife: 0.38, startX: origin.x, startY: origin.y, length: distance, width: stats.pullRadius ?? 125 });
  }

  private updateChargeWeapons(seconds: number): void {
    for (const weapon of this.weapons) {
      if (weapon.id !== 'lance') continue;
      const limit = Math.max(1, weapon.stats.chargeTime ?? 0.8) * 3;
      this.lanceCharge.set(weapon.instanceId, Math.min(limit, (this.lanceCharge.get(weapon.instanceId) ?? 0) + seconds));
    }
  }

  private fireGrid(weapon: Weapon, _target: Enemy | null, angle: number, damage: number): void {
    this.options.callbacks.onAudioCue?.('heavy');
    this.recorder.recordWeaponEvent(weapon.id, 'shots');
    const origin = this.weaponOrigin(weapon);
    const range = this.combatStats(weapon).range;
    const width = (weapon.stats.width ?? 30) + (weapon.branch === 'narrow' ? -8 : 0);
    const count = Math.min(4, Math.max(1, (weapon.stats.count ?? 1) + (weapon.branch === 'multi-direction' ? 1 : 0)));
    this.addLine({ angle, color: WEAPONS.grid.color, life: 0.24, maxLife: 0.24, width: Math.max(8, width), startX: origin.x, startY: origin.y, length: range });
    let intercepted = 0;
    const interceptLine = (lineAngle: number, lineWidth: number, lineLength: number): void => {
      const lineEndX = origin.x + Math.cos(lineAngle) * lineLength;
      const lineEndY = origin.y + Math.sin(lineAngle) * lineLength;
      const threats = this.projectiles
        .filter((projectile) => projectile.active && projectile.enemyProjectile && distanceToSegment(projectile.x, projectile.y, origin.x, origin.y, lineEndX, lineEndY) <= lineWidth + projectile.radius)
        .sort((first, second) => Math.hypot(first.x - origin.x, first.y - origin.y) - Math.hypot(second.x - origin.x, second.y - origin.y));
      for (const projectile of threats) {
        if (intercepted >= count) break;
        projectile.active = false;
        intercepted += 1;
        this.recorder.recordWeaponEvent(weapon.id, 'intercepts');
        this.addFlash({ x: projectile.x, y: projectile.y, color: WEAPONS.grid.color, life: 0.25, maxLife: 0.25, radius: 16 });
        const repair = this.supportEffect('repair', weapon.slot);
        if (repair > 0) this.core.heal(Math.min(3, repair));
      }
    };
    interceptLine(angle, width, range);
    const cross = angle + Math.PI / 2;
    if (weapon.evolutionId === 'grid-cross') interceptLine(cross, width * 0.7, range * 0.72);
    // A grid remains a weapon even in a quiet wave. Its fallback shot is
    // weaker than a dedicated damage weapon, preserving the advertised
    // enemy-bullet priority without making it universally optimal.
    const speed = this.combatStats(weapon).projectileSpeed ?? 420;
    this.addProjectile({
      kind: 'grid', x: origin.x, y: origin.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      radius: 5, damage: damage * (intercepted > 0 ? 0.75 : 0.42), life: Math.min(1.6, range / Math.max(1, speed)), piercing: 0,
      sourceWeaponId: weapon.id, sourceWeaponInstanceId: weapon.instanceId,
    });
    if (weapon.evolutionId === 'grid-cross') {
      this.addLine({ angle: cross, color: WEAPONS.grid.color, life: 0.18, maxLife: 0.18, width: Math.max(8, width * 0.7), startX: origin.x, startY: origin.y, length: range * 0.72 });
    }
  }

  private fireMine(weapon: Weapon, target: Enemy | null, angle: number, damage: number): void {
    this.options.callbacks.onAudioCue?.('heavy');
    this.recorder.recordWeaponEvent(weapon.id, 'shots');
    const origin = this.weaponOrigin(weapon);
    const stats = weapon.stats;
    const targetDistance = target ? Math.hypot(target.x - origin.x, target.y - origin.y) : 260;
    const defaultDistance = weapon.branch === 'near' ? Math.min(260, targetDistance) : Math.max(240, Math.min(this.combatStats(weapon).range, targetDistance + 90));
    const distance = Math.max(60, Math.min(this.combatStats(weapon).range, defaultDistance));
    const offsets = weapon.evolutionId === 'mine-cross' ? [-0.26, 0, 0.26] : [0];
    const mineLimit = Math.min(MAX_MINES, Math.max(1, (stats.count ?? 2) + (weapon.evolutionId === 'mine-cross' ? 1 : 0)));
    for (const offset of offsets) {
      const point = { x: origin.x + Math.cos(angle + offset) * distance, y: origin.y + Math.sin(angle + offset) * distance };
      const mine: MineField = {
        id: this.nextMineId++, x: point.x, y: point.y, life: stats.duration ?? 6, maxLife: stats.duration ?? 6,
        radius: stats.radius ?? 44, damage: offset === 0 ? damage : damage * 0.55, sourceWeaponInstanceId: weapon.instanceId, triggered: false,
      };
      while (this.mines.filter((item) => item.sourceWeaponInstanceId === weapon.instanceId).length >= mineLimit) {
        const oldest = this.mines.findIndex((item) => item.sourceWeaponInstanceId === weapon.instanceId);
        if (oldest < 0) break;
        this.mines.splice(oldest, 1);
      }
      if (this.mines.length >= MAX_MINES) this.mines.shift();
      this.mines.push(mine);
      this.addFlash({ x: point.x, y: point.y, color: WEAPONS.mine.color, life: 0.4, maxLife: 0.4, radius: mine.radius, kind: 'telegraph' });
    }
  }

  private fireLance(weapon: Weapon, angle: number, damage: number): void {
    const charge = this.lanceCharge.get(weapon.instanceId) ?? 0;
    const minimum = Math.max(0.8, weapon.stats.chargeTime ?? 0.8);
    if (charge < minimum) return;
    this.lanceCharge.set(weapon.instanceId, 0);
    this.options.callbacks.onAudioCue?.('heavy');
    this.recorder.recordWeaponEvent(weapon.id, 'shots');
    const origin = this.weaponOrigin(weapon);
    const speed = this.combatStats(weapon).projectileSpeed ?? 620;
    const range = this.combatStats(weapon).range;
    const piercing = (weapon.stats.pierce ?? 3) + (weapon.branch === 'shatter' ? 2 : 0);
    const lanceDamage = weapon.branch === 'shatter' ? damage * 1.2 : damage;
    const life = range / Math.max(1, speed);
    this.addProjectile({
      kind: 'lance', x: origin.x, y: origin.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      radius: weapon.stats.width ?? 10, damage: lanceDamage, life, piercing, sourceWeaponId: weapon.id, sourceWeaponInstanceId: weapon.instanceId,
    });
    this.addLine({ angle, color: WEAPONS.lance.color, life: 0.22, maxLife: 0.22, width: weapon.stats.width ?? 10, startX: origin.x, startY: origin.y, length: 110 });
    if (weapon.evolutionId === 'lance-double') {
      this.addProjectile({
        kind: 'lance', x: origin.x, y: origin.y, vx: Math.cos(angle + 0.04) * speed * 0.92, vy: Math.sin(angle + 0.04) * speed * 0.92,
        radius: Math.max(5, (weapon.stats.width ?? 10) * 0.72), damage: lanceDamage * 0.48, life: life * 0.96, piercing: Math.max(0, piercing - 1), sourceWeaponId: weapon.id, sourceWeaponInstanceId: weapon.instanceId,
      });
    }
  }

  private deployDrones(weapon: Weapon): void {
    const existing = this.drones.get(weapon.instanceId) ?? [];
    const desired = Math.min(2, Math.max(1, weapon.stats.count ?? 1));
    const duration = weapon.stats.duration ?? 12;
    const totalActiveDrones = [...this.drones.values()].reduce((sum, units) => sum + units.filter((unit) => unit.life > 0).length, 0);
    const available = Math.max(0, MAX_DRONES - (totalActiveDrones - existing.filter((unit) => unit.life > 0).length));
    for (let index = existing.length; index < Math.min(desired, available); index += 1) {
      const crossOffset = weapon.evolutionId === 'drone-cross' ? (index % 2 === 0 ? -0.28 : 0.28) : 0;
      existing.push({ index, x: 0, y: 0, angle: index * Math.PI + crossOffset, cooldown: 0.35, life: duration, maxLife: duration, sourceWeaponInstanceId: weapon.instanceId });
    }
    this.drones.set(weapon.instanceId, existing);
    this.recorder.recordWeaponEvent(weapon.id, 'shots');
  }

  private updateDrones(seconds: number): void {
    for (const weapon of this.weapons.filter((item) => item.id === 'drone')) {
      const units = this.drones.get(weapon.instanceId);
      if (!units || units.length === 0) continue;
      const origin = this.weaponOrigin(weapon);
      const speed = (weapon.stats.orbitSpeed ?? 1.2) * (weapon.branch === 'near' ? 1.25 : 1) * (weapon.evolutionId === 'drone-cross' ? 1.12 : 1);
      const orbitRadius = (weapon.stats.orbitRadius ?? 74) * (weapon.branch === 'remote' ? 1.35 : 1) * (weapon.evolutionId === 'drone-cross' ? 1.1 : 1);
      for (const drone of units) {
        drone.life -= seconds;
        drone.angle += speed * seconds;
        drone.cooldown -= seconds;
        drone.x = origin.x + Math.cos(drone.angle + drone.index * Math.PI) * orbitRadius;
        drone.y = origin.y + Math.sin(drone.angle + drone.index * Math.PI) * orbitRadius;
        if (drone.life <= 0) continue;
        if (drone.cooldown > 0) continue;
        const target = selectTarget(this.enemies.filter((enemy) => enemy.active), { x: drone.x, y: drone.y }, { angle: this.aimAngle, manual: this.manualAim }, this.combatStats(weapon).range, this.elapsed, weapon.id, this.targetLocks.get(weapon.instanceId));
        if (!target) { drone.cooldown = 0.2; continue; }
        const dx = target.x - drone.x; const dy = target.y - drone.y; const distance = Math.hypot(dx, dy);
        const projectileSpeed = this.combatStats(weapon).projectileSpeed ?? 300;
        this.addProjectile({
          kind: 'drone', x: drone.x, y: drone.y, vx: distance > 0 ? dx / distance * projectileSpeed : 0, vy: distance > 0 ? dy / distance * projectileSpeed : 0,
          radius: 4, damage: this.weaponPower(weapon) * 0.6, life: 1.8, piercing: 0, sourceWeaponId: weapon.id, sourceWeaponInstanceId: weapon.instanceId,
        });
        this.recorder.recordWeaponEvent(weapon.id, 'shots');
        drone.cooldown = weapon.stats.hitCooldown ?? 0.55;
      }
    }
    for (const [instanceId, units] of this.drones) {
      const active = units.filter((unit) => unit.life > 0);
      if (active.length > 0) this.drones.set(instanceId, active);
      else this.drones.delete(instanceId);
    }
  }

  private updateMines(seconds: number): void {
    for (const mine of this.mines) {
      mine.life -= seconds;
      if (mine.triggered || mine.life <= 0) continue;
      const target = this.enemies.find((enemy) => enemy.active && Math.hypot(enemy.x - mine.x, enemy.y - mine.y) <= mine.radius + enemy.hitRadius);
      if (!target) continue;
      mine.triggered = true;
      mine.life = 0;
      const weapon = this.weapons.find((item) => item.instanceId === mine.sourceWeaponInstanceId);
      if (!weapon) continue;
      this.recorder.recordWeaponEvent(weapon.id, 'detonations');
      this.addFlash({ x: mine.x, y: mine.y, color: WEAPONS.mine.color, life: 0.32, maxLife: 0.32, radius: mine.radius });
      this.hitArea(weapon, mine.x, mine.y, mine.radius, mine.damage, null);
      const repair = this.supportEffect('repair', weapon.slot);
      if (repair > 0) this.core.heal(Math.min(2, repair));
      if (this.state === 'finished') return;
    }
    for (let index = this.mines.length - 1; index >= 0; index -= 1) if (this.mines[index]?.life <= 0) this.mines.splice(index, 1);
  }

  private hitArea(weapon: Weapon, x: number, y: number, radius: number, damage: number, attackAngle: number | null, hitIds?: Set<number>): void {
    if (this.state === 'finished') return;
    for (const enemy of this.enemies) {
      if (!enemy.active || hitIds?.has(enemy.id) || Math.hypot(enemy.x - x, enemy.y - y) > radius + enemy.hitRadius) continue;
      hitIds?.add(enemy.id);
      const result = applyDamage(enemy, this.adjustForSpecialEnemy(enemy, damage, weapon.slot), this.elapsed, attackAngle ?? impactAngleFromSource(x, y, enemy.x, enemy.y));
        this.recordHitDamage(weapon.id, result.amount, enemy.x, enemy.y, weapon.instanceId);
      if (result.destroyed) this.handleEnemyDestroyed(enemy);
      if ((this.state as string) === 'finished') return;
    }
  }

  private createGravityField(x: number, y: number, duration: number, radius: number, damage: number, pullStrength: number, safeDistance: number, collapse: boolean, slowDuration = 0, sourceWeaponInstanceId: string | null = null): void {
    if (this.gravityFields.length >= MAX_GRAVITY_FIELDS) return;
    this.gravityFields.push({
      x,
      y,
      life: duration,
      maxLife: duration,
      radius,
      damage,
      pullStrength,
      safeDistance,
      damageTimer: 0,
      collapse,
      // Lock the effective weapon power at creation.  A field can outlive a
      // level-up, but its delayed collapse must not retroactively change when
      // the player upgrades another weapon during the field's lifetime.
      collapseDamage: collapse ? damage * GRAVITY_COLLAPSE_DAMAGE_MULTIPLIER : 0,
      slowDuration,
      sourceWeaponInstanceId,
    });
  }

  private updateGravityFields(seconds: number): void {
    for (const field of this.gravityFields) {
      field.life -= seconds;
      field.damageTimer -= seconds;
      for (const enemy of this.enemies) {
        if (!enemy.active || Math.hypot(enemy.x - field.x, enemy.y - field.y) > field.radius + enemy.hitRadius) continue;
        if (field.pullStrength > 0) {
          enemy.applyPull(field.x, field.y, field.pullStrength * seconds, this.elapsed, field.safeDistance);
          this.recorder.recordControl('pulled', seconds);
        }
        if (field.slowDuration > 0) {
          enemy.applySlow(this.elapsed, field.slowDuration);
          this.recorder.recordControl('slowed', seconds);
        }
        if (field.damage > 0 && field.damageTimer <= 0) {
          const fieldWeapon = field.sourceWeaponInstanceId ? this.weapons.find((item) => item.instanceId === field.sourceWeaponInstanceId) : this.weapons.find((item) => item.id === 'gravity');
          const result = applyDamage(enemy, this.adjustForSpecialEnemy(enemy, field.damage, fieldWeapon?.slot ?? 0), this.elapsed, impactAngleFromSource(field.x, field.y, enemy.x, enemy.y));
          this.recordHitDamage('gravity', result.amount, enemy.x, enemy.y, fieldWeapon?.instanceId);
          if (result.destroyed) this.handleEnemyDestroyed(enemy);
          if (this.state === 'finished') return;
        }
      }
      if (field.damageTimer <= 0) field.damageTimer = 0.25;
    }
    for (let index = this.gravityFields.length - 1; index >= 0; index -= 1) {
      const field = this.gravityFields[index];
      if (field && field.life <= 0) {
        if (field.collapse) {
          const weapon = field.sourceWeaponInstanceId ? this.weapons.find((item) => item.instanceId === field.sourceWeaponInstanceId) : this.weapons.find((item) => item.id === 'gravity');
          if (weapon) this.hitArea(weapon, field.x, field.y, field.radius, field.collapseDamage, null);
          if (this.state === 'finished') return;
        }
        this.gravityFields.splice(index, 1);
      }
    }
  }

  private updateProjectiles(seconds: number): void {
    for (const projectile of this.projectiles) {
      projectile.update(seconds);
      if (projectile.kind === 'cluster') {
        if (!projectile.clusterSplitChild && !projectile.impactWarningShown && (projectile.life <= CLUSTER_TELEGRAPH_SECONDS || !projectile.active) && projectile.impactX !== null && projectile.impactY !== null) {
          projectile.impactWarningShown = true;
          this.addFlash({ x: projectile.impactX, y: projectile.impactY, color: WEAPONS.cluster.color, life: CLUSTER_TELEGRAPH_SECONDS, maxLife: CLUSTER_TELEGRAPH_SECONDS, radius: projectile.impactRadius, kind: 'telegraph' });
        }
        // A long-range impact can cross the render guard at 700px before its
        // lifetime reaches zero. The stored impact is still the promised
        // destination, so resolve it whenever the travelling projectile ends.
        if (!projectile.active) this.resolveClusterImpact(projectile);
        continue;
      }
      if (!projectile.active || projectile.kind !== 'disc') continue;
      const disc = this.weaponForProjectile(projectile);
      if (disc?.branch === 'trail' && this.elapsed >= (this.discTrailAt.get(projectile.id) ?? 0)) {
        this.discTrailAt.set(projectile.id, this.elapsed + 0.18);
        this.addFlash({ x: projectile.x, y: projectile.y, color: WEAPONS.disc.color, life: 0.2, maxLife: 0.2, radius: 24 });
        // Trail damage is an area centered on the disc's current position.
        // Let each victim derive its own source-facing side instead of using
        // the disc's travel direction for every enemy in the area.
        this.hitArea(disc, projectile.x, projectile.y, 28, projectile.damage * 0.2, null);
        if (this.state === 'finished') return;
      }
      const distance = Math.hypot(projectile.x, projectile.y);
      const boundaryRadius = projectile.boundaryRadius || BASE_ARENA_RADIUS;
      if (distance < boundaryRadius) continue;
      if (projectile.bounces <= 0) { projectile.active = false; continue; }
      const nx = projectile.x / Math.max(1, distance);
      const ny = projectile.y / Math.max(1, distance);
      const dot = projectile.vx * nx + projectile.vy * ny;
      projectile.vx -= 2 * dot * nx;
      projectile.vy -= 2 * dot * ny;
      projectile.x = nx * (boundaryRadius - 1);
      projectile.y = ny * (boundaryRadius - 1);
      projectile.bounces -= 1;
    }
  }

  private updateEnemyProjectiles(): void {
    for (const projectile of this.projectiles) {
      if (!projectile.active || !projectile.enemyProjectile) continue;
      if (Math.hypot(projectile.x, projectile.y) > 42) continue;
      const damage = this.core.damage(projectile.damage);
      projectile.active = false;
      if (damage > 0) {
        this.triggerScreenShake(damage);
        this.recorder.recordContact(Math.atan2(projectile.y, projectile.x), damage, '遠隔弾の被害');
        this.options.callbacks.onStatus(`遠隔弾がコアへ${Math.round(damage)}ダメージ`);
      }
    }
  }

  private updateDropperAttacks(): void {
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.type !== 'dropper' || enemy.distanceToCore > 250 || enemy.shotCooldown > 0) continue;
      const angle = Math.atan2(enemy.y, enemy.x);
      const projectile = this.addProjectile({
        kind: 'enemy', x: enemy.x, y: enemy.y, vx: -Math.cos(angle) * 180, vy: -Math.sin(angle) * 180,
        radius: 9, damage: 10, life: 2.2, piercing: 0, enemyProjectile: true,
      });
      if (!projectile) continue;
      enemy.shotCooldown = DROPPER_SHOT_INTERVAL_SECONDS;
      this.options.callbacks.onStatus('投下体が遠隔弾を発射しました');
    }
  }

  private updateBossActions(seconds: number): void {
    const boss = this.enemies.find((enemy) => enemy.active && enemy.isBoss);
    if (!boss) return;
    boss.specialCooldown -= seconds;
    if (boss.type === 'crown') {
      const wavesDue = Math.min(3, Math.floor((1 - boss.hp / boss.maxHp + 1e-9) / 0.3));
      if (wavesDue > this.crownWavesTriggered && this.availableEnemySlots() >= 4) {
        this.crownWavesTriggered += 1;
        const angle = Math.floor(this.rng.next() * 6) * Math.PI / 3;
        for (let index = 0; index < 4; index += 1) this.spawnEnemy(index % 2 === 0 ? 'shard' : 'runner', angle + (index - 1.5) * 0.1, true);
        this.options.callbacks.onStatus('回転冠が耐久低下に反応し、一方向から増援を呼びました');
      }
      const pressure = BOSSES.crown.pressure;
      if (pressure && boss.distanceToCore <= 200) {
        boss.pressureCooldown -= seconds;
        if (!this.crownPressure && boss.pressureCooldown <= 0) {
          this.crownPressure = { angle: boss.angle, life: pressure.telegraph, maxLife: pressure.telegraph };
          boss.pressureCooldown = pressure.interval;
          this.options.callbacks.onStatus('回転冠がコア向け攻撃を予告しています');
        }
        if (this.crownPressure) {
          this.crownPressure.life -= seconds;
          if (this.crownPressure.life <= 0) {
            const angle = this.crownPressure.angle;
            const projectile = this.addProjectile({
              kind: 'enemy', x: boss.x, y: boss.y, vx: -Math.cos(angle) * pressure.speed, vy: -Math.sin(angle) * pressure.speed,
              radius: 10, damage: pressure.damage, life: pressure.life, piercing: 0, enemyProjectile: true,
            });
            this.crownPressure = null;
            if (projectile) this.options.callbacks.onStatus('回転冠がコア向け攻撃を放ちました');
          }
        }
      }
    }
    if (boss.type === 'designer') {
      if (!this.designerWave && boss.specialCooldown <= 0) {
        let sector = Math.floor(this.rng.next() * 6);
        if (sector === this.lastDesignerSector) sector = (sector + 1 + Math.floor(this.rng.next() * 5)) % 6;
        this.lastDesignerSector = sector;
        const angle = sector * Math.PI / 3;
        this.designerWave = { angle, life: 1.5, maxLife: 1.5 };
        this.options.callbacks.onStatus('群れの設計者が方向を予告しています');
      }
      if (this.designerWave) {
        this.designerWave.life -= seconds;
        if (this.designerWave.life <= 0 && this.availableEnemySlots() >= 3) {
          const angle = this.designerWave.angle;
          for (let index = 0; index < 3; index += 1) this.spawnEnemy(index === 0 ? 'shell' : 'runner', angle + (index - 1) * 0.16, true);
          this.designerWave = null;
          boss.specialCooldown = 6;
        }
      }
    }
    if (boss.type === 'echo') {
      const echoThreshold = boss.maxHp * 0.06;
      if (!this.echoWave && boss.specialDamageTaken >= echoThreshold && boss.specialCooldown <= 0) {
        boss.specialDamageTaken -= echoThreshold;
        const angle = this.quietSectorAngle() + Math.PI / 6;
        this.echoWave = { angle, life: 1.2, maxLife: 1.2 };
        this.options.callbacks.onStatus('反響核が反射弾の方向を予告しています');
      }
      if (this.echoWave) {
        this.echoWave.life -= seconds;
        if (this.echoWave.life <= 0) {
          const angle = this.echoWave.angle;
          const projectile = this.addProjectile({
            kind: 'enemy', x: Math.cos(angle) * this.arenaRadius(), y: Math.sin(angle) * this.arenaRadius(), vx: -Math.cos(angle) * 210, vy: -Math.sin(angle) * 210,
            radius: 10, damage: 10, life: 2.3, piercing: 0, enemyProjectile: true,
          });
          if (projectile) {
            this.echoWave = null;
            boss.specialCooldown = boss.hp / boss.maxHp <= 0.35 ? 2.2 : 3;
          }
        }
      }
    }
  }

  private spawnEnemy(type: EnemyId, angle: number, bossReinforcement = false): boolean {
    const reservedSlots = bossReinforcement ? 0 : this.pendingBossEnemySlots();
    if (this.availableEnemySlots() <= reservedSlots) return false;
    const stage = STAGES[this.options.stageId];
    const difficulty = stage.isEndless ? Math.pow(1.22, Math.floor(this.elapsed / 300)) : 1 + this.elapsed * stage.difficultyFactor;
    const enemy = this.enemyPool.acquire(type, angle, this.arenaRadius() + 5, difficulty, stage.isEndless ? 1.4 : 1.25);
    if (!this.enemies.includes(enemy)) this.enemies.push(enemy);
    const notice = ENEMIES[type].name;
    if (notice !== this.lastEnemyNotice) { this.lastEnemyNotice = notice; this.options.callbacks.onStatus(`${notice}が接近中`); }
    return true;
  }

  private showSpecialWaveWarning(warning: SpawnWaveWarning): void {
    this.specialWaveWarning = { angle: warning.angle, life: warning.leadTime, maxLife: warning.leadTime };
    this.options.callbacks.onStatus('一方向から敵の集中波が来ます');
  }

  private updateSpecialWaveWarning(seconds: number): void {
    if (!this.specialWaveWarning) return;
    this.specialWaveWarning.life -= seconds;
    if (this.specialWaveWarning.life <= 0) this.specialWaveWarning = null;
  }

  private availableEnemySlots(): number {
    const baseLimit = Math.min(MAX_ACTIVE_ENEMIES, this.spawnDirector.enemyLimit);
    const reserveBossSlot = STAGES[this.options.stageId].isEndless && !this.enemies.some((enemy) => enemy.active && enemy.isBoss) ? 1 : 0;
    const active = this.enemies.filter((enemy) => enemy.active).length;
    return Math.max(0, baseLimit - reserveBossSlot - active - this.spawnDirector.pendingSpecialWaveSlots);
  }

  private pendingBossEnemySlots(): number {
    const boss = this.enemies.find((enemy) => enemy.active && enemy.isBoss);
    if (!boss) return 0;
    if (boss.type === 'crown') {
      const wavesDue = Math.min(3, Math.floor((1 - boss.hp / boss.maxHp + 1e-9) / 0.3));
      if (wavesDue > this.crownWavesTriggered) return 4;
    }
    if (boss.type === 'designer' && this.designerWave) return 3;
    return 0;
  }

  private spawnBoss(): boolean {
    if (this.enemies.filter((enemy) => enemy.active).length >= MAX_ACTIVE_ENEMIES) return false;
    const bossId = this.spawnDirector.bossId;
    const stage = STAGES[this.options.stageId];
    const difficulty = stage.isEndless ? Math.pow(1.25, Math.floor(this.elapsed / 300)) : 1 + this.elapsed * stage.difficultyFactor;
    const boss = this.enemyPool.acquire(bossId, this.rng.next() * Math.PI * 2, this.arenaRadius() + 45, difficulty, stage.isEndless ? 1.4 : 1.25);
    if (!this.enemies.includes(boss)) this.enemies.push(boss);
    this.options.callbacks.onStatus(`${BOSSES[bossId].name}が出現しました。予告を見て対応してください`);
    return true;
  }

  private handleEnemyDestroyed(enemy: Enemy): void {
    if (this.state === 'finished') return;
    if (enemy.isBoss) {
      this.options.callbacks.onAudioCue?.('defeat');
      this.designerWave = null;
      this.echoWave = null;
      this.crownPressure = null;
      this.specialWaveWarning = null;
      this.bossDefeated = true;
      this.recorder.bossDefeated = true;
      this.recorder.bossesDefeated += 1;
      this.addScore(2_000);
      if (STAGES[this.options.stageId].isEndless) this.options.callbacks.onStatus(`${BOSSES[enemy.type as BossId].name}を撃破しました。戦闘を続けます`);
      else this.finish('victory', '');
      return;
    }
    const enemyId = enemy.type as EnemyId;
    this.options.callbacks.onAudioCue?.('defeat');
    this.recorder.kills += 1;
    this.recorder.recordEnemyKill(enemyId);
    this.addScore(10 * (1 + ENEMIES[enemyId].threatCost));
    this.progression.addExperience(enemyId === 'spore' ? 8 : 4);
    this.addFlash({ x: enemy.x, y: enemy.y, color: ENEMIES[enemyId].color, life: 0.32, maxLife: 0.32, radius: 26 });
    this.emitParticles(enemy.x, enemy.y, ENEMIES[enemyId].color);
    if (enemyId === 'spore' && !enemy.splitDone) {
      enemy.splitDone = true;
      this.pendingSporeSplits.push(enemy.angle);
    }
    if (this.progression.canChoose() && this.state === 'playing' && !this.pendingUpgradeDeferred) this.upgradeRequestQueued = true;
  }

  private flushPendingSporeSplits(): void {
    for (const angle of this.pendingSporeSplits.splice(0)) {
      this.spawnEnemy('shard', angle - 0.2);
      this.spawnEnemy('shard', angle + 0.2);
    }
  }

  private openUpgrade(): boolean {
    if (!this.progression.canChoose() || this.state !== 'playing' || this.pendingUpgradeDeferred) return false;
    const candidates = this.createCandidates();
    if (candidates.length !== 3) {
      // The continuous candidates make this an invariant violation rather
      // than a normal game state. Keep the experience untouched and leave the
      // request queued so a broken content table cannot discard progression.
      this.options.callbacks.onStatus('強化候補を準備できませんでした。経験値は保持されています');
      return false;
    }
    this.upgradeRequestQueued = false;
    this.upgradeSequence += 1;
    this.upgradePayload = {
      phase: 'selection',
      selectionId: this.upgradeSequence,
      candidates,
      rerollsLeft: this.rerollsLeft,
      bansLeft: this.bansLeft,
      pendingCount: this.progression.pendingChoices,
      choicesSinceBreak: this.choicesSinceBreak,
    };
    this.state = 'upgrade';
    this.options.callbacks.onUpgrade(this.upgradePayload);
    this.options.callbacks.onStatus('強化候補を選んでください');
    return true;
  }

  private effectiveBans(): Set<string> {
    const bans = new Set(this.banned);
    if (this.repairsUsed >= 2) bans.add('repair:core');
    return bans;
  }

  private createCandidates(avoidSignature = '', bans = this.effectiveBans()): UpgradeCandidate[] {
    let fallback: UpgradeCandidate[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const candidates = createUpgradeCandidateList(
        this.weapons,
        this.supports,
        this.core.health,
        this.candidateRng,
        bans,
        this.core.maxHealth,
        { weaponPolishStacks: this.weaponPolishStacks, pendingPartsBonus: this.pendingPartsBonus },
        {
          weaponSlots: this.availablePlacementSlots('weapon'),
          supportSlots: this.availablePlacementSlots('support'),
          maxWeapons: this.buildGraph.unlockedSlots('weapon').length,
          maxSupports: this.buildGraph.unlockedSlots('support').length,
          expansionCandidates: this.expansionCandidates(),
        },
      );
      if (candidates.length !== 3) return [];
      const annotated = candidates.map((candidate) => {
        return candidate.isExisting ? candidate : { ...candidate, placementSlots: this.availablePlacementSlots(candidate.kind) };
      });
      fallback = annotated;
      if (!avoidSignature || this.signature(annotated) !== avoidSignature) return annotated;
    }
    return fallback;
  }

  private signature(candidates: UpgradeCandidate[]): string {
    return candidates.map((candidate) => candidate.id).sort().join('|');
  }

  private availablePlacementSlots(kind: UpgradeCandidate['kind']): number[] {
    if (kind === 'weapon') return this.buildGraph.availableSlots('weapon').filter((slot) => !this.weapons.some((weapon) => weapon.slot === slot));
    if (kind === 'support') return this.buildGraph.availableSlots('support').filter((slot) => !this.supports.some((support) => support.slot === slot));
    return [];
  }

  private expansionCandidates(): UpgradeCandidate[] {
    const nextLayer = this.buildGraph.unlockedLayer >= 3 ? null : (this.buildGraph.unlockedLayer + 1) as BuildLayer;
    if (nextLayer === null) return [];
    const unlockAt = nextLayer === 2 ? 6 : 15;
    if (this.progression.level < unlockAt || !this.buildGraph.canUnlockLayer(nextLayer) || !this.buildCapacity.canUnlockLayer(nextLayer)) return [];
    return [{
      id: `build:expand:${nextLayer}`,
      kind: 'expansion',
      targetId: nextLayer === 2 ? 'layer-2' : 'layer-3',
      title: `第${nextLayer}層を開く`,
      description: `武器・補助を置ける第${nextLayer}層を開き、配置と稼働容量を広げます。`,
      before: `配置層 ${nextLayer - 1}`,
      after: `配置層 ${nextLayer} / 容量 ${nextLayer === 2 ? 12 : 18}`,
      role: '配置拡張',
      isExisting: true,
      expansionLayer: nextLayer,
      canBan: false,
    }];
  }

  private unlockBuildLayer(layer: BuildLayer): boolean {
    // Check both owners before mutating either one so a malformed save or
    // future capacity policy cannot leave the graph and capacity at different
    // layers after a rejected candidate.
    if (!this.buildGraph.canUnlockLayer(layer) || !this.buildCapacity.canUnlockLayer(layer)) return false;
    return this.buildGraph.unlockLayer(layer) && this.buildCapacity.unlockLayer(layer);
  }

  private inputTick(): number { return Math.max(0, Math.round(this.elapsed / FixedStepClock.STEP)); }

  private applyContinuousUpgrade(id: ContinuousUpgradeId): void {
    if (id === 'polish') this.weaponPolishStacks += 1;
    if (id === 'armor') this.core.reinforce(2);
    if (id === 'parts') this.pendingPartsBonus += 1;
  }

  private presentUpgradeBreak(): void {
    if (this.state !== 'upgrade' || this.progression.pendingChoices <= 0) return;
    this.upgradeSequence += 1;
    this.upgradePayload = {
      phase: 'break',
      selectionId: this.upgradeSequence,
      candidates: [],
      rerollsLeft: this.rerollsLeft,
      bansLeft: this.bansLeft,
      pendingCount: this.progression.pendingChoices,
      choicesSinceBreak: this.choicesSinceBreak,
    };
    this.options.callbacks.onUpgrade(this.upgradePayload);
    this.options.callbacks.onStatus(`未選択の強化 ${this.progression.pendingChoices}回。続けて選ぶか保留できます`);
  }

  private notifyUpgradeClosed(): void {
    this.options.callbacks.onUpgrade({
      phase: 'selection',
      selectionId: this.upgradeSequence,
      candidates: [],
      rerollsLeft: 0,
      bansLeft: 0,
      pendingCount: this.progression.pendingChoices,
      choicesSinceBreak: this.choicesSinceBreak,
    });
  }

  private finish(outcome: BattleResult['outcome'], cause: string, retired = false): void {
    if (!this.runLifecycle.finish()) return;
    if (this.testOutcomeTimer !== null) { window.clearTimeout(this.testOutcomeTimer); this.testOutcomeTimer = null; }
    const stage = STAGES[this.options.stageId];
    if (outcome === 'victory' && !retired) this.addScore(stage.clearBonus);
    this.state = 'finished';
    this.upgradePayload = null;
    this.pendingUpgradeDeferred = false;
    this.upgradeRequestQueued = false;
    this.releaseAimInput();
    if (cause) this.recorder.lastDamageSource = cause;
    this.recorder.survivalTime = this.elapsed;
    for (const support of this.supports) this.recorder.recordSupportUsage(support.id);
    const baseParts = Math.max(20, Math.floor(20 + this.elapsed / 6 + this.recorder.bossesDefeated * 25));
    const parts = retired ? 0 : Math.floor(baseParts * this.combatResearchEffects.partMultiplier) + this.pendingPartsBonus;
    const result = this.recorder.result(outcome, this.core.health, parts, retired, outcome === 'victory' && !stage.isEndless ? nextStageId(this.options.stageId) : null);
    result.build = {
      unlockedLayer: this.buildGraph.unlockedLayer,
      graph: this.buildGraph.snapshot(),
      capacity: this.buildCapacity.snapshot(),
    };
    this.options.callbacks.onFinish(result);
  }

  private scheduleTestOutcome(): void {
    if (!this.options.testMode || !this.options.testOutcome) return;
    const outcome = this.options.testOutcome;
    const complete = (): void => {
      this.testOutcomeTimer = null;
      if (this.state === 'finished') return;
      if (this.state !== 'playing') { this.testOutcomeTimer = window.setTimeout(complete, 250); return; }
      this.finish(outcome, outcome === 'victory' ? 'テスト用の勝利' : 'テスト用の敗北');
    };
    this.testOutcomeTimer = window.setTimeout(complete, outcome === 'victory' ? 1_300 : 900);
  }

  private updateEndlessMilestone(): void {
    const milestone = Math.floor(this.elapsed / 300);
    if (milestone <= this.endlessMilestone) return;
    this.endlessMilestone = milestone;
    this.addScore(5_000);
    this.options.callbacks.onStatus(`${milestone * 5}分到達。次の危険度へ移行します`);
  }

  private addScore(amount: number): void { this.recorder.score += amount; }

  private addProjectile(options: Omit<ConstructorParameters<typeof Projectile>[0], 'id'>): Projectile | null {
    const friendlyCount = this.projectiles.filter((projectile) => projectile.active && !projectile.enemyProjectile).length;
    const enemyCount = this.projectiles.filter((projectile) => projectile.active && projectile.enemyProjectile).length;
    if (!options.enemyProjectile && friendlyCount >= MAX_FRIENDLY_PROJECTILES) return null;
    if (options.enemyProjectile && enemyCount >= MAX_ENEMY_PROJECTILES) return null;
    const projectile = this.projectilePool.acquire({ ...options, boundaryRadius: options.boundaryRadius ?? this.arenaRadius() });
    if (!this.projectiles.includes(projectile)) this.projectiles.push(projectile);
    return projectile;
  }

  private addLine(effect: LineEffect): void {
    const limit = this.effectBudget.effectsLevel === 'standard' ? 48 : this.effectBudget.effectsLevel === 'low' ? 28 : 14;
    const reusable = this.lines.find((item) => item.life <= 0) ?? (this.lines.length >= limit ? this.lines.reduce((oldest, item) => item.life < oldest.life ? item : oldest) : null);
    if (reusable) Object.assign(reusable, effect);
    else this.lines.push(effect);
  }

  private addFlash(effect: FlashEffect): void {
    const limit = this.effectBudget.effectsLevel === 'standard' ? 32 : this.effectBudget.effectsLevel === 'low' ? 20 : 10;
    const reusable = this.flashes.find((item) => item.life <= 0) ?? (this.flashes.length >= limit ? this.flashes.reduce((oldest, item) => item.life < oldest.life ? item : oldest) : null);
    if (reusable) Object.assign(reusable, effect);
    else this.flashes.push(effect);
  }

  private emitParticles(x: number, y: number, color: number): void {
    if (this.options.reducedMotion) return;
    const count = this.effectBudget.effectsLevel === 'standard' ? 8 : this.effectBudget.effectsLevel === 'low' ? 5 : 2;
    for (let index = 0; index < count; index += 1) {
      const angle = index * Math.PI * 2 / count;
      this.particles.emit(x + Math.cos(angle) * 5, y + Math.sin(angle) * 5, color, 0.28, this.effectBudget.limits.particles);
    }
  }

  private triggerScreenShake(damage: number): void {
    if (!this.options.screenShake || this.options.reducedMotion || this.effectBudget.limits.shake <= 0) return;
    const intensity = Math.min(this.effectBudget.limits.shake, Math.max(1, damage / 8));
    this.cameras.main.shake(120, Math.min(0.02, intensity / 200), false);
  }

  private recordWeaponDamage(id: WeaponId, amount: number, instanceId?: string): void {
    if (amount <= 0) return;
    this.recorder.recordWeaponDamage(id, amount, instanceId);
    const weapon = instanceId ? this.weapons.find((item) => item.instanceId === instanceId) : this.weapons.find((item) => item.id === id);
    if (weapon) weapon.damageDealt += amount;
  }

  private recordHitDamage(id: WeaponId, amount: number, x: number, y: number, instanceId?: string): void {
    this.recordWeaponDamage(id, amount, instanceId);
    this.damageNumbers.emit(x, y, amount, WEAPONS[id].color, this.effectBudget.limits.damageNumbers);
  }

  private syncDamageNumberTexts(centerX: number, centerY: number): void {
    const active = this.damageNumbers.active().slice(0, this.effectBudget.limits.damageNumbers);
    for (let index = 0; index < active.length; index += 1) {
      const item = active[index];
      if (!item) continue;
      const text = this.damageNumberTexts[index] ?? this.createDamageNumberText(index);
      text.setText(String(Math.max(1, Math.round(item.amount))));
      text.setPosition(centerX + item.x, centerY + item.y);
      text.setColor(this.colorToCss(item.color));
      text.setAlpha(Math.min(1, item.life / 0.18));
      text.setScale(0.88 + Math.min(0.12, item.life / item.maxLife * 0.12));
      text.setVisible(true);
    }
    for (let index = active.length; index < this.damageNumberTexts.length; index += 1) this.damageNumberTexts[index]?.setVisible(false);
  }

  private createDamageNumberText(index: number): Phaser.GameObjects.Text {
    const text = this.add.text(0, 0, '', {
      color: '#fff1a8',
      fontFamily: 'sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      stroke: '#07131f',
      strokeThickness: 4,
    });
    text.setOrigin(0.5);
    text.setDepth(RENDER_LAYERS.feedback);
    text.setVisible(false);
    this.damageNumberTexts[index] = text;
    return text;
  }

  private colorToCss(color: number): string {
    return `#${Math.max(0, color).toString(16).padStart(6, '0').slice(-6)}`;
  }

  private weaponPower(weapon: Weapon, factor = 1): number {
    return this.combatStats(weapon).damage * factor;
  }

  private combatStats(weapon: Weapon) {
    return effectiveWeaponStats(
      weapon,
      this.supports,
      this.combatResearchEffects.powerMultiplier,
      this.combatResearchEffects.projectileSpeedMultiplier,
      this.weaponPolishStacks,
    );
  }

  private adjustForSpecialEnemy(enemy: Enemy, amount: number, weaponSlot: number): number {
    return amount * (1 + this.supportEffect('observe', weaponSlot) * (enemy.type === 'shell' || enemy.type === 'marker' || enemy.type === 'dropper' || enemy.type === 'phase' ? 1 : 0));
  }

  private supportEffect(id: SupportId, weaponSlot: number, component: 'primary' | 'secondary' = 'primary'): number {
    return supportEffectsFor(this.supports, id, weaponSlot)[component];
  }

  private markerBoostFor(enemy: Enemy): number {
    if (enemy.type === 'marker') return 1;
    return this.enemies.some((marker) => marker.active && marker.type === 'marker' && Math.hypot(marker.x - enemy.x, marker.y - enemy.y) <= 120) ? 1.2 : 1;
  }

  private quietSectorAngle(): number {
    const counts = [0, 0, 0, 0, 0, 0];
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.isBoss) continue;
      const sector = Math.floor(((enemy.angle + Math.PI * 2 + Math.PI / 6) % (Math.PI * 2)) / (Math.PI / 3));
      counts[sector] = (counts[sector] ?? 0) + 1;
    }
    const minimum = Math.min(...counts);
    const candidates = counts.map((count, index) => count === minimum ? index : -1).filter((index) => index >= 0);
    return (this.rng.pick(candidates) ?? 0) * Math.PI / 3;
  }

  private compactEntities(): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      if (!projectile?.active) {
        if (projectile) this.discTrailAt.delete(projectile.id);
        this.projectiles.splice(index, 1);
      }
    }
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) if (!this.enemies[index]?.active) this.enemies.splice(index, 1);
    const activeEnemyIds = new Set(this.enemies.map((enemy) => enemy.id));
    for (const key of this.orbitHits.keys()) {
      const enemyId = Number(key.split(':')[1]);
      if (!activeEnemyIds.has(enemyId)) this.orbitHits.delete(key);
    }
    const activeWeaponIds = new Set(this.weapons.map((weapon) => weapon.instanceId));
    for (const instanceId of this.orbitAngles.keys()) if (!activeWeaponIds.has(instanceId)) this.orbitAngles.delete(instanceId);
    for (const instanceId of this.targetLocks.keys()) if (!activeWeaponIds.has(instanceId)) this.targetLocks.delete(instanceId);
    for (const instanceId of this.lanceCharge.keys()) if (!activeWeaponIds.has(instanceId)) this.lanceCharge.delete(instanceId);
    for (const instanceId of this.drones.keys()) if (!activeWeaponIds.has(instanceId)) this.drones.delete(instanceId);
  }

  private updateEffects(seconds: number): void {
    for (const flash of this.flashes) { flash.life -= seconds; if (!this.options.reducedMotion) flash.radius += seconds * 80; }
    for (const line of this.lines) line.life -= seconds;
    this.damageNumbers.update(seconds, this.options.reducedMotion);
    this.particles.update(seconds);
  }

  private arenaRadius(): number {
    return this.arenaGeometry.radiusForLayer(this.buildGraph.unlockedLayer);
  }

  private weaponOrigin(weapon: Weapon): Point {
    const node = this.buildGraph.nodeFor('weapon', weapon.slot);
    return node ? this.arenaGeometry.weaponOrigin(node) : { x: 0, y: 0 };
  }

  private weaponForProjectile(projectile: Projectile): Weapon | undefined {
    return (projectile.sourceWeaponInstanceId ? this.weapons.find((weapon) => weapon.instanceId === projectile.sourceWeaponInstanceId) : undefined)
      ?? (projectile.sourceWeaponId ? this.weapons.find((weapon) => weapon.id === projectile.sourceWeaponId) : undefined);
  }

  private emitSnapshot(force: boolean): void {
    if (!force && this.elapsed - this.lastSnapshotAt < 0.1) return;
    this.lastSnapshotAt = this.elapsed;
    const visibleEnemies = this.visibleEnemies();
    const visibleProjectiles = this.visibleProjectiles();
    const snapshot: BattleSnapshot = {
      elapsed: this.elapsed,
      timeLimit: STAGES[this.options.stageId].timeLimit,
      isEndless: STAGES[this.options.stageId].isEndless === true,
      core: this.core.health,
      maxCore: this.core.maxHealth,
      level: this.progression.level,
      experience: this.progression.experience,
      nextExperience: this.progression.nextExperience,
      pendingUpgrades: this.progression.pendingChoices,
      pendingUpgradeSelectionId: this.pendingUpgradeDeferred ? this.upgradeSequence : null,
      score: Math.round(this.recorder.score + this.elapsed * 5 + this.core.health * 20),
      kills: this.recorder.kills,
      enemies: visibleEnemies.map((enemy) => enemy.snapshot({ x: 0, y: 0 }, this.elapsed)),
      projectiles: visibleProjectiles.map((projectile) => projectile.snapshot()),
      weapons: this.weapons.map((weapon) => ({ id: weapon.id, instanceId: weapon.instanceId, nodeId: weapon.nodeId, slot: weapon.slot, level: weapon.level, damageDealt: weapon.damageDealt, branch: weapon.branch, finalBranch: weapon.finalBranch, evolutionId: weapon.evolutionId, evolutionName: weapon.evolutionDefinition?.name })),
      supports: this.supports.map((support) => ({ id: support.id, instanceId: support.instanceId, nodeId: support.nodeId, level: support.level, slot: support.slot })),
      aimAngle: this.aimAngle,
      manualAim: this.manualAim,
      bossActive: this.enemies.some((enemy) => enemy.active && enemy.isBoss),
      bossDefeated: this.bossDefeated,
      sectorDamage: [...this.recorder.sectorDamage],
      effectsLevel: this.effectBudget.effectsLevel,
      build: {
        unlockedLayer: this.buildGraph.unlockedLayer,
        graph: this.buildGraph.snapshot(),
        capacity: this.buildCapacity.snapshot(),
      },
    };
    this.options.callbacks.onSnapshot(snapshot);
  }

  private renderScene(): void {
    const width = this.scale.width / this.renderPixelRatio;
    const height = this.scale.height / this.renderPixelRatio;
    const cx = width / 2;
    const cy = height / 2;
    // The camera scales the complete active arena into the logical canvas.
    // Keeping the simulation radius here (rather than clipping it to the
    // current canvas) ensures layer-2/3 enemies and telegraphs remain visible
    // at the same visual boundary as layer 1.
    const arena = this.arenaRadius();
    const backgroundLayer = this.backgroundGraphics;
    const deviceLayer = this.deviceGraphics;
    const friendlyLayer = this.friendlyGraphics;
    const enemyLayer = this.enemyGraphics;
    const telegraphLayer = this.telegraphGraphics;
    const hostileLayer = this.hostileGraphics;
    for (const layer of [backgroundLayer, deviceLayer, friendlyLayer, enemyLayer, telegraphLayer, hostileLayer]) layer.clear();

    // Keep these groups separate so danger warnings and hostile projectiles
    // cannot be hidden by ordinary attack effects during a later refactor.
    backgroundLayer.fillStyle(0x07131f, 1); backgroundLayer.fillRect(0, 0, width, height);
    backgroundLayer.lineStyle(1, 0x163246, 0.65);
    for (let index = 0; index < 6; index += 1) {
      const angle = index * Math.PI / 3;
      backgroundLayer.lineBetween(cx, cy, cx + Math.cos(angle) * arena, cy + Math.sin(angle) * arena);
    }
    backgroundLayer.strokeCircle(cx, cy, arena);
    backgroundLayer.strokeCircle(cx, cy, arena * 0.65);
    for (const field of this.gravityFields) {
      const alpha = Math.max(0.08, field.life / field.maxLife) * 0.45;
      backgroundLayer.fillStyle(WEAPONS.gravity.color, alpha); backgroundLayer.fillCircle(cx + field.x, cy + field.y, field.radius);
      backgroundLayer.lineStyle(2, WEAPONS.gravity.color, alpha + 0.2); backgroundLayer.strokeCircle(cx + field.x, cy + field.y, field.radius);
      backgroundLayer.lineStyle(1, 0xfff1a8, alpha); backgroundLayer.strokeCircle(cx + field.x, cy + field.y, Math.max(12, field.radius * 0.35));
    }
    for (const line of this.lines) {
      if (line.life <= 0) continue;
      const alpha = Math.max(0, line.life / line.maxLife);
      if (line.width > 100) { backgroundLayer.lineStyle(6, line.color, alpha * 0.7); backgroundLayer.strokeCircle(cx, cy, Math.min(arena, line.width)); }
      else {
        const startX = line.startX ?? 0;
        const startY = line.startY ?? 0;
        const length = line.length ?? arena;
        backgroundLayer.lineStyle(line.width, line.color, alpha * 0.8);
        backgroundLayer.lineBetween(cx + startX, cy + startY, cx + startX + Math.cos(line.angle) * length, cy + startY + Math.sin(line.angle) * length);
      }
    }
    this.drawFlashes(backgroundLayer, cx, cy, false);
    const visibleEnemies = this.visibleEnemies();
    const visibleProjectiles = this.visibleProjectiles();

    drawDevice(deviceLayer, cx, cy, this.weapons.map((weapon) => ({ id: weapon.id, instanceId: weapon.instanceId, nodeId: weapon.nodeId, slot: weapon.slot, level: weapon.level, damageDealt: weapon.damageDealt, branch: weapon.branch, finalBranch: weapon.finalBranch, evolutionId: weapon.evolutionId, evolutionName: weapon.evolutionDefinition?.name })), this.supports.map((support) => ({ id: support.id, instanceId: support.instanceId, nodeId: support.nodeId, level: support.level, slot: support.slot })), this.buildGraph.unlockedLayer);
    for (const projectile of visibleProjectiles) if (!projectile.enemyProjectile) this.drawProjectile(friendlyLayer, projectile, cx, cy);
    for (const particle of this.particles.active()) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      friendlyLayer.fillStyle(particle.color, alpha * 0.8);
      friendlyLayer.fillCircle(cx + particle.x, cy + particle.y, 2 + alpha * 2);
    }
    this.drawOrbitBlades(friendlyLayer, cx, cy);
    this.drawMines(friendlyLayer, cx, cy);
    this.drawDrones(friendlyLayer, cx, cy);
    for (const enemy of visibleEnemies) drawEnemy(enemyLayer, enemy.snapshot({ x: 0, y: 0 }, this.elapsed), cx, cy);
    this.syncDamageNumberTexts(cx, cy);
    drawTelegraphs(telegraphLayer, visibleEnemies.map((enemy) => enemy.snapshot({ x: 0, y: 0 }, this.elapsed)), cx, cy);
    if (this.designerWave) this.drawSpecialLine(telegraphLayer, cx, cy, arena, this.designerWave.angle, this.designerWave.life / this.designerWave.maxLife, WEAPONS.chain.color, 5);
    if (this.echoWave) this.drawSpecialLine(telegraphLayer, cx, cy, arena, this.echoWave.angle, this.echoWave.life / this.echoWave.maxLife, WEAPONS.disc.color, 5);
    if (this.crownPressure) this.drawSpecialLine(telegraphLayer, cx, cy, arena, this.crownPressure.angle, this.crownPressure.life / this.crownPressure.maxLife, BOSSES.crown.color, 6, 42, Math.min(196, arena));
    if (this.specialWaveWarning) this.drawSpecialWaveWarning(telegraphLayer, cx, cy, arena, this.specialWaveWarning.angle, this.specialWaveWarning.life / this.specialWaveWarning.maxLife);
    this.drawFlashes(telegraphLayer, cx, cy, true);
    if (this.manualAim) this.drawManualAim(telegraphLayer, cx, cy, arena);
    if (this.manualAim) {
      telegraphLayer.lineStyle(2, 0xfff1a8, 0.7);
      telegraphLayer.lineBetween(cx, cy, cx + Math.cos(this.aimAngle) * arena, cy + Math.sin(this.aimAngle) * arena);
    }
    for (const projectile of visibleProjectiles) if (projectile.enemyProjectile) this.drawProjectile(hostileLayer, projectile, cx, cy);
  }

  private createRenderLayer(depth: number): Phaser.GameObjects.Graphics {
    const layer = this.add.graphics();
    layer.setDepth(depth);
    return layer;
  }

  private visibleEnemies(): Enemy[] {
    // Every simulated enemy remains visible at every effects setting.  An
    // active threat can be selected, collide, or reach the core regardless of
    // decorative effects, so dropping it from the render would hide a real
    // gameplay event.  The spawn director already caps this list at 180.
    return this.enemies.filter((enemy) => enemy.active);
  }

  private visibleProjectiles(): Projectile[] {
    const friendly = selectVisibleEntities(
      this.projectiles.filter((projectile) => projectile.active && !projectile.enemyProjectile),
      this.effectBudget.limits.projectiles,
      (first, second) => Math.hypot(first.x, first.y) - Math.hypot(second.x, second.y) || first.id - second.id,
    );
    // Hostile projectiles are gameplay hazards and are therefore all drawn.
    // Friendly projectiles may still use a visual budget because losing a
    // decorative shot does not conceal an incoming hit.
    const hostile = this.projectiles.filter((projectile) => projectile.active && projectile.enemyProjectile);
    return [...friendly, ...hostile];
  }

  private applyRenderResolution(): void {
    const parentWidth = this.scale.parentSize.width || this.game.canvas.getBoundingClientRect().width || LOGICAL_RENDER_SIZE;
    const parentHeight = this.scale.parentSize.height || this.game.canvas.getBoundingClientRect().height || LOGICAL_RENDER_SIZE;
    const cssSize = Math.max(1, Math.min(parentWidth, parentHeight));
    const pixelRatio = this.effectBudget.pixelRatio(window.devicePixelRatio || 1);
    const backingSize = Math.max(1, Math.min(LOGICAL_RENDER_SIZE * 2, Math.round(cssSize * pixelRatio)));
    if (backingSize !== this.renderBackingSize) {
      this.renderBackingSize = backingSize;
      this.renderPixelRatio = backingSize / LOGICAL_RENDER_SIZE;
      this.scale.setGameSize(backingSize, backingSize);
    }
    // Expansion changes the world radius while the canvas stays fixed. Zoom
    // the camera, not the combat coordinates, so placement and collision math
    // remain deterministic across layers and devices.
    this.cameras.main.setZoom(this.renderPixelRatio * this.arenaViewportScale());
  }

  private arenaViewportScale(): number {
    return Math.min(1, (LOGICAL_RENDER_SIZE * 0.45) / this.arenaRadius());
  }

  private drawSpecialLine(graphics: Phaser.GameObjects.Graphics, cx: number, cy: number, arena: number, angle: number, alpha: number, color: number, width: number, startDistance = 170, endDistance = arena): void {
    graphics.lineStyle(width, color, Math.max(0.2, alpha));
    graphics.lineBetween(cx + Math.cos(angle) * startDistance, cy + Math.sin(angle) * startDistance, cx + Math.cos(angle) * endDistance, cy + Math.sin(angle) * endDistance);
  }

  private drawSpecialWaveWarning(graphics: Phaser.GameObjects.Graphics, cx: number, cy: number, arena: number, angle: number, progress: number): void {
    const alpha = Math.max(0.25, Math.min(1, progress));
    const sweep = Math.PI / 9;
    const radius = Math.max(1, arena - 8);
    const steps = 8;
    graphics.lineStyle(7, 0xfff1a8, alpha * 0.9);
    graphics.beginPath();
    for (let index = 0; index <= steps; index += 1) {
      const pointAngle = angle - sweep + (sweep * 2 * index) / steps;
      const x = cx + Math.cos(pointAngle) * radius;
      const y = cy + Math.sin(pointAngle) * radius;
      if (index === 0) graphics.moveTo(x, y);
      else graphics.lineTo(x, y);
    }
    graphics.strokePath();
    graphics.lineStyle(2, 0xfff1a8, alpha);
    for (const edge of [-sweep, sweep]) {
      graphics.lineBetween(
        cx + Math.cos(angle + edge) * (arena - 38),
        cy + Math.sin(angle + edge) * (arena - 38),
        cx + Math.cos(angle + edge) * (arena - 8),
        cy + Math.sin(angle + edge) * (arena - 8),
      );
    }
  }

  private drawFlashes(graphics: Phaser.GameObjects.Graphics, cx: number, cy: number, telegraphs: boolean): void {
    for (const flash of this.flashes) {
      if (flash.life <= 0 || (flash.kind === 'telegraph') !== telegraphs) continue;
      const alpha = Math.max(0, flash.life / flash.maxLife);
      if (flash.kind === 'telegraph') {
        graphics.fillStyle(flash.color, alpha * 0.06);
        graphics.fillCircle(cx + flash.x, cy + flash.y, flash.radius);
        graphics.lineStyle(2, flash.color, alpha * 0.85);
      } else {
        graphics.fillStyle(flash.color, alpha * 0.12);
        graphics.fillCircle(cx + flash.x, cy + flash.y, flash.radius * 0.7);
        graphics.lineStyle(3, flash.color, alpha);
      }
      graphics.strokeCircle(cx + flash.x, cy + flash.y, flash.radius);
    }
  }

  private drawManualAim(graphics: Phaser.GameObjects.Graphics, cx: number, cy: number, arena: number): void {
    const points = [{ x: cx, y: cy }];
    const steps = 10;
    for (let index = 0; index <= steps; index += 1) {
      const angle = this.aimAngle - MANUAL_AIM_HALF_ANGLE + (MANUAL_AIM_HALF_ANGLE * 2 * index) / steps;
      points.push({ x: cx + Math.cos(angle) * arena, y: cy + Math.sin(angle) * arena });
    }
    graphics.fillStyle(0xfff1a8, 0.08);
    graphics.lineStyle(1, 0xfff1a8, 0.45);
    graphics.beginPath();
    graphics.moveTo(points[0]?.x ?? cx, points[0]?.y ?? cy);
    for (const point of points.slice(1)) graphics.lineTo(point.x, point.y);
    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();
  }

  private drawOrbitBlades(graphics: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    for (const weapon of this.weapons.filter((item) => item.id === 'orbit')) {
      const angle = this.orbitAngles.get(weapon.instanceId) ?? 0;
      const count = (weapon.stats.count ?? 2) + (weapon.branch === 'many' ? 1 : 0);
      const radius = (weapon.stats.orbitRadius ?? 108) + (weapon.branch === 'outer' ? 38 : 0);
      const bladeLength = (weapon.stats.bladeLength ?? 32) + (weapon.branch === 'outer' ? 28 : 0);
      for (let index = 0; index < count; index += 1) {
        const bladeAngle = angle + index * Math.PI * 2 / count;
        const halfLength = bladeLength / 2;
        const startX = cx + Math.cos(bladeAngle) * (radius - halfLength);
        const startY = cy + Math.sin(bladeAngle) * (radius - halfLength);
        const endX = cx + Math.cos(bladeAngle) * (radius + halfLength);
        const endY = cy + Math.sin(bladeAngle) * (radius + halfLength);
        graphics.lineStyle(7, WEAPONS.orbit.color, 0.9);
        graphics.lineBetween(startX, startY, endX, endY);
        graphics.fillStyle(0xfff1a8, 0.85);
        graphics.fillCircle(endX, endY, 3);
      }
    }
  }

  private drawMines(graphics: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    for (const mine of this.mines) {
      if (mine.life <= 0 || mine.triggered) continue;
      const alpha = Math.max(0.2, Math.min(1, mine.life / mine.maxLife));
      const x = cx + mine.x;
      const y = cy + mine.y;
      graphics.fillStyle(WEAPONS.mine.color, alpha * 0.2);
      graphics.fillCircle(x, y, mine.radius);
      graphics.lineStyle(2, WEAPONS.mine.color, alpha);
      graphics.strokeCircle(x, y, mine.radius);
      graphics.lineStyle(2, 0xfff1a8, alpha);
      graphics.lineBetween(x - 7, y, x + 7, y);
      graphics.lineBetween(x, y - 7, x, y + 7);
    }
  }

  private drawDrones(graphics: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    for (const weapon of this.weapons.filter((item) => item.id === 'drone')) {
      const units = this.drones.get(weapon.instanceId) ?? [];
      const origin = this.weaponOrigin(weapon);
      for (const drone of units) {
        if (drone.life <= 0) continue;
        const alpha = Math.max(0.25, Math.min(1, drone.life / drone.maxLife));
        const x = cx + drone.x;
        const y = cy + drone.y;
        graphics.lineStyle(1, WEAPONS.drone.color, alpha * 0.45);
        graphics.lineBetween(cx + origin.x, cy + origin.y, x, y);
        graphics.fillStyle(WEAPONS.drone.color, alpha * 0.85);
        graphics.fillCircle(x, y, 7);
        graphics.lineStyle(2, 0xf2f0e8, alpha);
        graphics.strokeCircle(x, y, 10);
        graphics.lineBetween(x - 5, y - 5, x + 5, y + 5);
        graphics.lineBetween(x + 5, y - 5, x - 5, y + 5);
      }
    }
  }

  private drawProjectile(graphics: Phaser.GameObjects.Graphics, projectile: Projectile, centerX: number, centerY: number): void {
    const color = projectile.enemyProjectile ? 0xfff1a8 : projectile.kind === 'disc' ? WEAPONS.disc.color : projectile.sourceWeaponId ? WEAPONS[projectile.sourceWeaponId].color : 0x63d7e6;
    const x = centerX + projectile.x;
    const y = centerY + projectile.y;
    graphics.fillStyle(color, 1);
    graphics.fillCircle(x, y, projectile.radius);
    graphics.lineStyle(projectile.enemyProjectile ? 3 : 2, projectile.enemyProjectile ? 0xff706a : color, 0.9);
    graphics.lineBetween(x - projectile.vx * 0.025, y - projectile.vy * 0.025, x, y);
    if (projectile.enemyProjectile) {
      graphics.lineStyle(2, 0xfff1a8, 0.95);
      graphics.strokeCircle(x, y, projectile.radius + 5);
    }
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.state !== 'playing' || this.aimPointerId !== null) return;
    this.aimPointerId = pointer.id;
    this.aimStart = { x: pointer.x, y: pointer.y };
    this.aimMoved = false;
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.state !== 'playing' || this.aimPointerId !== pointer.id || !this.aimStart) return;
    const dx = pointer.x - this.aimStart.x;
    const dy = pointer.y - this.aimStart.y;
    const cssPixelThreshold = 18 * Math.max(1, this.scale.displayScale.x);
    if (Math.hypot(dx, dy) < cssPixelThreshold) return;
    this.aimAngle = Math.atan2(dy, dx);
    this.recorder.recordInput({ kind: 'aim', tick: this.inputTick(), angle: this.aimAngle });
    this.aimMoved = true;
    this.manualAim = true;
    this.aimReleaseAt = this.elapsed + (this.options.aimAssist === 'strong' ? 1.1 : 0.8);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.aimPointerId !== pointer.id) return;
    this.aimPointerId = null;
    this.aimStart = null;
    if (!this.aimMoved) return;
    this.aimReleaseAt = this.elapsed + (this.options.aimAssist === 'strong' ? 1.1 : 0.8);
    this.manualAim = true;
    this.aimMoved = false;
  }

  private releaseAimInput(): void {
    this.aimPointerId = null;
    this.aimStart = null;
    this.aimMoved = false;
    this.manualAim = false;
    this.aimReleaseAt = 0;
  }
}

function distanceToSegment(pointX: number, pointY: number, startX: number, startY: number, endX: number, endY: number): number {
  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-6) return Math.hypot(pointX - startX, pointY - startY);
  const projection = Math.max(0, Math.min(1, ((pointX - startX) * dx + (pointY - startY) * dy) / lengthSquared));
  return Math.hypot(pointX - (startX + dx * projection), pointY - (startY + dy * projection));
}
