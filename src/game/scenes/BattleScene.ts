Warning: truncated output (original token count: 37428)
Total output lines: 2686

import Phaser from 'phaser';
import { BOSSES } from '../../data/bosses';
import { ENEMIES } from '../../data/enemies';
import { STAGES, nextStageId } from '../../data/stages';
import { WEAPONS } from '../../data/weapons';
import { Core } from '../entities/Core';
import { DROPPER_SHOT_INTERVAL_SECONDS, Enemy } from '../entities/Enemy';
import { Projectile } from '../entities/Projectile';
import { SUPPORT_EFFECT_CAPS, SupportModule, supportEffectsFor } from '../entities/SupportModule';
import { SUPPORTS } from '../../data/supports';
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
import { DeterministicRng, seedFromStage, SpawnDirector, type SpawnDirectorSnapshot, type SpawnWaveWarning } from '../systems/SpawnDirector';
import { MANUAL_AIM_HALF_ANGLE, selectTarget } from '../systems/TargetingSystem';
import { impactAngleFromSource, impactAngleFromVelocity } from '../systems/ImpactDirection';
import { advanceOrbitAngle } from '../systems/OrbitSystem';
import { ProgressionSystem } from '../systems/ProgressionSystem';
import type { BossId, EnemyId, StageId, SupportId, WeaponId } from '../../types/content';
import type { BattleCallbacks, BattleResult, BattleSnapshot, Point, UpgradeCandidate, UpgradePayload } from '../../types/game';
import type { RunSaveEnvelope } from '../../types/runSave';
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
  /** Stable local run identity; it is not a server play_id. */
  runId?: string | number;
  /** Safe-boundary state restored after a browser restart. */
  resumeCheckpoint?: RunSaveEnvelope;
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

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function createRunIdentity(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* fall through to a best-effort local identity */ }
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecordValue) : [];
}

function isGravityField(value: unknown): value is GravityField {
  if (!isRecordValue(value)) return false;
  return finiteNumber(value.x) && finiteNumber(value.y) && finiteNumber(value.life) && finiteNumber(value.maxLife)
    && finiteNumber(value.radius) && finiteNumber(value.damage) && finiteNumber(value.pullStrength) && finiteNumber(value.safeDistance)
    && finiteNumber(value.damageTimer) && typeof value.collapse === 'boolean' && finiteNumber(value.collapseDamage)
    && finiteNumber(value.slowDuration) && (value.sourceWeaponInstanceId === null || typeof value.sourceWeaponInstanceId === 'string');
}

function isMineField(value: unknown): value is MineField {
  if (!isRecordValue(value)) return false;
  return Number.isInteger(value.id) && (value.id as number) > 0 && finiteNumber(value.x) && finiteNumber(value.y)
    && finiteNumber(value.life) && finiteNumber(value.maxLife) && finiteNumber(value.radius) && finiteNumber(value.damage)
    && typeof value.sourceWeaponInstanceId === 'string' && typeof value.triggered === 'boolean';
}

function isDroneUnit(value: unknown): value is DroneUnit {
  if (!isRecordValue(value)) return false;
  return Number.isInteger(value.index) && (value.index as number) >= 0 && finiteNumber(value.x) && finiteNumber(value.y)
    && finiteNumber(value.angle) && finiteNumber(value.cooldown) && finiteNumber(value.life) && finiteNumber(value.maxLife)
    && typeof value.sourceWeaponInstanceId === 'string';
}

function waveFromRuntime(value: unknown): { angle: number; life: number; maxLife: number } | null {
  if (!isRecordValue(value) || !finiteNumber(value.angle) || !finiteNumber(value.life) || !finiteNumber(value.maxLife)
    || value.maxLife <= 0 || value.life < 0) return null;
  return { angle: value.angle, life: value.life, maxLife: value.maxLife };
}

function restoreNumberMap(target: Map<string, number>, value: unknown, integer = false): void {
  target.clear();
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string' || !finiteNumber(item[1])) continue;
    if (integer && !Number.isInteger(item[1])) continue;
    target.set(item[0], item[1]);
  }
}

function restoreNumericKeyMap(target: Map<number, number>, value: unknown): void {
  target.clear();
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (!Array.isArray(item) || item.length !== 2 || !Number.isInteger(item[0]) || !finiteNumber(item[1])) continue;
    target.set(item[0], item[1]);
  }
}

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
  private readonly supportPulseAt = new Map<string, number>();
  private readonly igniteTriggered = new Set<number>();
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
  private readonly runId: string;
  private readonly resumeCheckpoint?: RunSaveEnvelope;
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
  private lastCheckpointAt = -Infinity;
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
    this.resumeCheckpoint = options.resumeCheckpoint;
    // `options.runId` is a short UI callback guard and resets after a reload;
    // it must not be used as the durable result id. A resumed checkpoint keeps
    // its original identity, while a fresh play receives a unique local id.
    this.runId = options.resumeCheckpoint?.runId ?? createRunIdentity();
    this.runSeed = options.resumeCheckpoint?.runSeed ?? options.seed ?? seedFromStage(options.stageId, Date.now(), 1);
    this.competitive = options.competitive === true;
    this.ruleVersion = this.competitive ? COMPETITIVE_RULES.version : 'runtime-v0';
    this.combatResearchEffects = this.competitive
      ? { ...options.researchEffects, maxCore: COMPETITIVE_RULES.initial.coreHp, powerMultiplier: 1, projectileSpeedMultiplier: 1, partMultiplier: 1 }
      : options.researchEffects;
    this.core = new Core(this.combatResearchEffects.maxCore);
    this.recorder = new RunRecorder(options.stageId, STAGES[options.stageId].boss, this.runSeed, this.ruleVersion, this.runId);
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
    if (this.resumeCheckpoint) this.restoreCheckpoint(this.resumeCheckpoint);
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
    if (!this.resumeCheckpoint) this.scheduleTestOutcome();
    this.options.callbacks.onStatus('戦闘開始');
    this.emitSnapshot(true);
    if (this.resumeCheckpoint) {
      // A restored run always starts behind an explicit pause notice. Do not
      // render the upgrade layer before that pause is acknowledged: the view
      // would otherwise own the focus while the scene is still `paused`, and
      // the HUD/pause action could no longer provide the intentional resume
      // boundary. `resume()` re-emits the saved payload after the user has
      // explicitly resumed.
      this.options.callbacks.onStatus('途中状態を復元しました。再開するまで戦闘は停止しています');
    }
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
      this.emitSnapshot(true);
      this.options.callbacks.onStatus('一時停止中');
    }
  }

  public resume(): void {
    if (this.state === 'paused') {
      this.recorder.recordInput({ kind: 'resume', tick: this.inputTick() });
      this.releaseAimInput();
      this.state = this.pauseReturnState;
      this.options.callbacks.onStatus('戦闘再開');
      if (this.state === 'upgrade' && this.upgradePayload) this.options.callbacks.onUpgrade({ ...this.upgradePayload, candidates: [...this.upgradePayload.candidates] });
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
      if ((enemy.type === 'charger' || enemy.type === 'repair' || enemy.type === 'factory') && wasTelegraph && !enemy.telegraph) {
        if (enemy.type === 'repair') {
          const target = this.enemies.find((other) => other.active && !other.isBoss && other.id !== enemy.id && Math.hypot(other.x - enemy.x, other.y - enemy.y) <= 180);
          if (target) {
            target.hp = Math.min(target.maxHp, target.hp + 6);
            this.options.callbacks.onStatus('修復体が近くの敵を回復しました');
          }
        } else if (enemy.type === 'factory' && enemy.summonedChildren < 4) {
          const remaining = 4 - enemy.summonedChildren;
          for (let index = 0; index < Math.min(2, remaining); index += 1) {
            if (this.spawnEnemy('shard', enemy.angle + (index === 0 ? -0.16 : 0.16), false, true)) enemy.summonedChildren += 1;
          }
          this.options.callbacks.onStatus('造兵体が小型の召喚体を作りました');
        } else if (enemy.type === 'charger') {
          this.options.callbacks.onStatus('突進体が突進を開始しました');
        }
      }
      if (enemy.slowUntil > this.elapsed) this.recorder.recordControl('slowed', seconds);
      if (reached) {
        const mitigation = this.globalSupportEffect('veil', 'secondary');
        const damage = applyContactDamage(this.core, enemy, 1 - mitigation);
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
    this.updateSupportPulses();
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
    else if (weapon.id === 'drone') this.deployDrones(weapon);
    else this.fireAdditionalWeapon(weapon, target, angle, damage);
    if (!allowBranch) return;
  }

  /**
   * V4/V5 weapons share a small set of pooled primitives, but their effective
   * attack path remains distinct: fan/axis weapons vary direction, drill and
   * harpoon pierce, mirror/shuttle bounce, and mist/frost/snare leave bounded
   * control fields. Every branch keeps the weapon instance as its source.
   */
  private fireAdditionalWeapon(weapon: Weapon, target: Enemy | null, angle: number, damage: number): void {
    this.options.callbacks.onAudioCue?.('shot');
    this.recorder.recordWeaponEvent(weapon.id, 'shots');
    const origin = this.weaponOrigin(weapon);
    const stats = this.combatStats(weapon);
    const isWide = weapon.id === 'barrage' || weapon.id === 'prism' || weapon.id === 'fan' || weapon.id === 'swarm' || weapon.id === 'bloom';
    const isHeavy = weapon.id === 'mortar' || weapon.id === 'nova' || weapon.id === 'drill' || weapon.id === 'thunder' || weapon.id === 'requiem';
    const isBouncing = weapon.id === 'mirror' || weapon.id === 'shuttle';
    const count = Math.max(1, Math.min(4, (weapon.stats.count ?? 1) + (weapon.id === 'swarm' ? 1 : 0)));
    const spread = isWide ? 0.18 : weapon.id === 'axis' || weapon.id === 'spoke' ? 0.28 : 0.06;
    const speed = stats.projectileSpeed ?? 360;
    const life = isHeavy ? 0.9 : weapon.id === 'swell' ? 1.55 : 1.25;
    const projectileKind: 'needle' | 'disc' = isBouncing ? 'disc' : 'needle';
    const damageFactor = isHeavy ? 1.35…17428 tokens truncated… index = 0; index < active.length; index += 1) {
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
    const brink = this.core.health <= this.core.maxHealth * 0.3 ? this.globalSupportEffect('brink') : 0;
    return effectiveWeaponStats(
      weapon,
      this.supports,
      this.combatResearchEffects.powerMultiplier * (1 + brink),
      this.combatResearchEffects.projectileSpeedMultiplier,
      this.weaponPolishStacks,
    );
  }

  private adjustForSpecialEnemy(enemy: Enemy, amount: number, weaponSlot: number): number {
    const special = enemy.type === 'shell' || enemy.type === 'marker' || enemy.type === 'dropper' || enemy.type === 'phase'
      || enemy.type === 'guard' || enemy.isBoss;
    let adjusted = amount * (1 + this.supportEffect('observe', weaponSlot) * (special ? 1 : 0));
    const shatter = this.supportEffect('shatter', weaponSlot, 'secondary');
    if ((enemy.type === 'lattice' || enemy.type === 'guard') && enemy.shieldHits > 0 && shatter > 0) {
      // A shatter connection removes at most one extra plate per hit. This
      // keeps the eight-hit shield meaningful while giving heavy/slow weapons
      // a finite second route through it.
      enemy.shieldHits = Math.max(0, enemy.shieldHits - 1);
      adjusted *= 1 + Math.min(0.45, this.supportEffect('shatter', weaponSlot));
    }
    const conductive = this.supportEffect('conductive', weaponSlot, 'secondary');
    if (conductive > 0 && enemy.slowUntil > this.elapsed) {
      const maxTargets = Math.min(2, Math.max(1, Math.floor(conductive)));
      const nearby = this.enemies
        .filter((other) => other.active && other.id !== enemy.id && Math.hypot(other.x - enemy.x, other.y - enemy.y) <= 120)
        .sort((first, second) => first.id - second.id)
        .slice(0, maxTargets);
      for (const other of nearby) other.applySlow(this.elapsed, 0.35);
    }
    if (this.supportEffect('catalyst', weaponSlot) > 0 && enemy.slowUntil > this.elapsed && (enemy.type === 'marker' || enemy.type === 'phase' || enemy.isBoss)) {
      adjusted *= 1 + Math.min(0.45, this.supportEffect('catalyst', weaponSlot));
    }
    return adjusted;
  }

  private supportEffect(id: SupportId, weaponSlot: number, component: 'primary' | 'secondary' = 'primary'): number {
    return supportEffectsFor(this.supports, id, weaponSlot)[component];
  }

  private globalSupportEffect(id: SupportId, component: 'primary' | 'secondary' = 'primary'): number {
    const matching = this.supports.filter((support) => support.id === id);
    const total = matching.reduce((sum, support) => sum + (component === 'primary' ? support.value : support.secondaryValue), 0);
    return Math.min(SUPPORT_EFFECT_CAPS[id][component], total);
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
    const snapshot = this.createSnapshot();
    this.options.callbacks.onSnapshot(snapshot);
    const shouldCheckpoint = force
      ? this.state === 'paused' || this.state === 'upgrade' || this.pendingUpgradeDeferred
      : this.elapsed - this.lastCheckpointAt >= 5;
    if (shouldCheckpoint) this.emitCheckpoint(this.createSnapshot(true));
  }

  private createSnapshot(includeAllProjectiles = false): BattleSnapshot {
    const visibleEnemies = this.visibleEnemies();
    const snapshotEnemies = includeAllProjectiles
      ? this.enemies.filter((enemy) => enemy.active)
      : visibleEnemies;
    const visibleProjectiles = includeAllProjectiles
      ? this.projectiles.filter((projectile) => projectile.active)
      : this.visibleProjectiles();
    return {
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
      enemies: snapshotEnemies.map((enemy) => enemy.snapshot({ x: 0, y: 0 }, this.elapsed)),
      projectiles: visibleProjectiles.map((projectile) => projectile.snapshot()),
      weapons: this.weapons.map((weapon) => ({ id: weapon.id, instanceId: weapon.instanceId, nodeId: weapon.nodeId, slot: weapon.slot, level: weapon.level, damageDealt: weapon.damageDealt, branch: weapon.branch, finalBranch: weapon.finalBranch, evolutionId: weapon.evolutionId, evolutionName: weapon.evolutionDefinition?.name, cooldownRemaining: weapon.cooldown, precisionBonus: weapon.precisionBonus, shotsFired: weapon.shotsFired })),
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
  }

  private emitCheckpoint(snapshot: BattleSnapshot): void {
    if (!this.options.callbacks.onCheckpoint || this.state === 'finished') return;
    this.lastCheckpointAt = this.elapsed;
    const phase = this.state === 'upgrade' || (this.state === 'paused' && this.pauseReturnState === 'upgrade') ? 'upgrade' : 'paused';
    const checkpoint: RunSaveEnvelope = {
      version: 3,
      runId: this.runId,
      runSeed: this.runSeed,
      stageId: this.options.stageId,
      ruleVersion: this.ruleVersion,
      contentVersion: 'catalog-v5',
      competitive: this.competitive,
      phase,
      savedAt: new Date().toISOString(),
      tick: this.inputTick(),
      // Endless mode uses Infinity for the live HUD, which JSON cannot carry.
      // A zero limit is the explicit persisted representation of “no limit”.
      snapshot: { ...snapshot, timeLimit: snapshot.isEndless ? 0 : snapshot.timeLimit },
      inputLog: this.recorder.inputRecorder.snapshot(),
      randomState: {
        'enemy-spawn': this.randomStreams.enemySpawn.getState(),
        // V0 normal mode intentionally shares one scene RNG for candidate
        // draws and combat effects. Persist that stream in both purpose
        // slots so a v3 checkpoint can restore the legacy sequence exactly.
        'candidate-draw': this.competitive ? this.randomStreams.candidateDraw.getState() : this.rng.getState(),
        'combat-effect': this.competitive ? this.randomStreams.combatEffect.getState() : this.rng.getState(),
        presentation: this.randomStreams.presentation.getState(),
      },
      spawnState: this.spawnDirector.snapshot() as unknown as Record<string, unknown>,
      runtimeState: {
        state: phase,
        pauseReturnState: this.pauseReturnState,
        pendingUpgradeDeferred: this.pendingUpgradeDeferred,
        upgradeRequestQueued: this.upgradeRequestQueued,
        banned: [...this.banned],
        rerollsLeft: this.rerollsLeft,
        bansLeft: this.bansLeft,
        repairsUsed: this.repairsUsed,
        upgradeSequence: this.upgradeSequence,
        choicesSinceBreak: this.choicesSinceBreak,
        weaponPolishStacks: this.weaponPolishStacks,
        pendingPartsBonus: this.pendingPartsBonus,
        bossDefeated: this.bossDefeated,
        endlessMilestone: this.endlessMilestone,
        testUpgradeOpened: this.testUpgradeOpened,
        lastEnemyNotice: this.lastEnemyNotice,
        nextMineId: this.nextMineId,
        enemyPoolNextId: this.enemyPool.nextIdentifier,
        projectilePoolNextId: this.projectilePool.nextIdentifier,
        pendingSporeSplits: [...this.pendingSporeSplits],
        upgradePayload: this.upgradePayload ? JSON.parse(JSON.stringify(this.upgradePayload)) as UpgradePayload : null,
        recorder: this.recorder.snapshotState(),
        clock: this.clock.snapshot(),
        gravityFields: this.gravityFields.map((field) => ({ ...field })),
        mines: this.mines.map((mine) => ({ ...mine })),
        drones: [...this.drones.entries()].map(([instanceId, units]) => ({ instanceId, units: units.map((unit) => ({ ...unit })) })),
        lanceCharge: [...this.lanceCharge.entries()],
        orbitAngles: [...this.orbitAngles.entries()],
        orbitHits: [...this.orbitHits.entries()],
        targetLocks: [...this.targetLocks.entries()],
        supportPulseAt: [...this.supportPulseAt.entries()],
        igniteTriggered: [...this.igniteTriggered],
        discTrailAt: [...this.discTrailAt.entries()],
        designerWave: this.designerWave ? { ...this.designerWave } : null,
        echoWave: this.echoWave ? { ...this.echoWave } : null,
        crownPressure: this.crownPressure ? { ...this.crownPressure } : null,
        specialWaveWarning: this.specialWaveWarning ? { ...this.specialWaveWarning } : null,
        lastDesignerSector: this.lastDesignerSector,
        crownWavesTriggered: this.crownWavesTriggered,
      },
    };
    this.options.callbacks.onCheckpoint(checkpoint);
  }

  private restoreCheckpoint(checkpoint: RunSaveEnvelope): void {
    if (checkpoint.stageId !== this.options.stageId || checkpoint.ruleVersion !== this.ruleVersion || checkpoint.competitive !== this.competitive) return;
    const snapshot = checkpoint.snapshot;
    if (!this.progression.restore({ level: snapshot.level, experience: snapshot.experience, nextExperience: snapshot.nextExperience, pendingChoices: snapshot.pendingUpgrades })) return;
    this.elapsed = snapshot.elapsed;
    this.core.maxHealth = snapshot.maxCore;
    this.core.health = Math.max(0, Math.min(snapshot.maxCore, snapshot.core));
    this.aimAngle = snapshot.aimAngle;
    this.manualAim = snapshot.manualAim;
    if (!this.recorder.inputRecorder.restore(checkpoint.inputLog)) return;
    this.recorder.kills = snapshot.kills;
    this.recorder.score = Math.max(0, snapshot.score - snapshot.elapsed * 5 - snapshot.core * 20);
    this.recorder.survivalTime = snapshot.elapsed;
    this.bossDefeated = snapshot.bossDefeated;
    this.recorder.bossDefeated = snapshot.bossDefeated;
    const runtime = checkpoint.runtimeState;
    if (runtime) {
      if (Array.isArray(runtime.banned)) for (const id of runtime.banned) if (typeof id === 'string') this.banned.add(id);
      if (Number.isInteger(runtime.rerollsLeft)) this.rerollsLeft = Math.max(0, runtime.rerollsLeft as number);
      if (Number.isInteger(runtime.bansLeft)) this.bansLeft = Math.max(0, runtime.bansLeft as number);
      if (Number.isInteger(runtime.repairsUsed)) this.repairsUsed = Math.max(0, runtime.repairsUsed as number);
      if (Number.isInteger(runtime.upgradeSequence)) this.upgradeSequence = Math.max(0, runtime.upgradeSequence as number);
      if (Number.isInteger(runtime.choicesSinceBreak)) this.choicesSinceBreak = Math.max(0, runtime.choicesSinceBreak as number);
      if (finiteNumber(runtime.weaponPolishStacks)) this.weaponPolishStacks = Math.max(0, runtime.weaponPolishStacks);
      if (finiteNumber(runtime.pendingPartsBonus)) this.pendingPartsBonus = Math.max(0, runtime.pendingPartsBonus);
      if (Number.isInteger(runtime.endlessMilestone)) this.endlessMilestone = Math.max(0, runtime.endlessMilestone as number);
      this.pendingUpgradeDeferred = runtime.pendingUpgradeDeferred === true;
      this.upgradeRequestQueued = runtime.upgradeRequestQueued === true;
      this.testUpgradeOpened = runtime.testUpgradeOpened === true;
      if (typeof runtime.lastEnemyNotice === 'string') this.lastEnemyNotice = runtime.lastEnemyNotice;
      if (Number.isInteger(runtime.nextMineId) && (runtime.nextMineId as number) > 0) this.nextMineId = runtime.nextMineId as number;
    }
    if (runtime && isRecordValue(runtime.recorder)) this.recorder.restoreState(runtime.recorder as unknown as Parameters<RunRecorder['restoreState']>[0]);
    if (runtime && isRecordValue(runtime.clock)) this.clock.restore(runtime.clock as unknown as Parameters<FixedStepClock['restore']>[0]);
    else this.clock.restore({ accumulatorTicks: 0, totalSteps: Math.max(0, Math.round(this.elapsed / FixedStepClock.STEP)) });
    this.restoreRuntimeFields(runtime);
    this.restoreWeapons(snapshot);
    this.restoreSupports(snapshot);
    if (snapshot.build) {
      if (!this.buildGraph.restore(snapshot.build.graph) || !this.buildCapacity.restore(snapshot.build.capacity)) return;
    }
    this.enemies.length = 0;
    for (const enemySnapshot of snapshot.enemies) {
      const enemy = this.enemyPool.restore(enemySnapshot, this.elapsed, STAGES[this.options.stageId].isEndless ? 1.4 : 1.25);
      if (enemy && !this.enemies.includes(enemy)) this.enemies.push(enemy);
    }
    this.projectiles.length = 0;
    for (const projectileSnapshot of snapshot.projectiles) {
      const projectile = this.projectilePool.restore(projectileSnapshot);
      if (projectile && !this.projectiles.includes(projectile)) this.projectiles.push(projectile);
    }
    if (runtime) {
      if (Number.isSafeInteger(runtime.enemyPoolNextId) && (runtime.enemyPoolNextId as number) >= 1) this.enemyPool.restoreNextIdentifier(runtime.enemyPoolNextId as number);
      if (Number.isSafeInteger(runtime.projectilePoolNextId) && (runtime.projectilePoolNextId as number) >= 1) this.projectilePool.restoreNextIdentifier(runtime.projectilePoolNextId as number);
    }
    if (checkpoint.spawnState) this.spawnDirector.restore(checkpoint.spawnState as Partial<SpawnDirectorSnapshot>);
    this.randomStreams.enemySpawn.setState(checkpoint.randomState['enemy-spawn']);
    this.randomStreams.candidateDraw.setState(checkpoint.randomState['candidate-draw']);
    this.randomStreams.combatEffect.setState(checkpoint.randomState['combat-effect']);
    this.randomStreams.presentation.setState(checkpoint.randomState.presentation);
    if (!this.competitive) this.rng.setState(checkpoint.randomState['candidate-draw']);
    if (runtime && isRecordValue(runtime.upgradePayload)) {
      const payload = runtime.upgradePayload;
      if ((payload.phase === 'selection' || payload.phase === 'break' || payload.phase === undefined)
        && Number.isInteger(payload.selectionId) && (payload.selectionId as number) > 0 && Array.isArray(payload.candidates)
        && payload.candidates.every((candidate) => isRecordValue(candidate) && typeof candidate.id === 'string')) {
        this.upgradePayload = JSON.parse(JSON.stringify(payload)) as UpgradePayload;
      }
    }
    // A restarted tab always enters an explicit pause. This is the safe
    // boundary: it never advances time while the user is reading the resume
    // notice, even when the last periodic checkpoint was taken while playing.
    this.pauseReturnState = checkpoint.phase === 'upgrade' || runtime?.pauseReturnState === 'upgrade' ? 'upgrade' : 'playing';
    this.state = 'paused';
    this.lastCheckpointAt = this.elapsed;
  }

  private restoreRuntimeFields(runtime: Record<string, unknown> | undefined): void {
    if (!runtime) return;
    const fields = arrayOfRecords(runtime.gravityFields).filter(isGravityField) as unknown as GravityField[];
    const mines = arrayOfRecords(runtime.mines).filter(isMineField) as unknown as MineField[];
    this.gravityFields.splice(0, this.gravityFields.length, ...fields);
    this.mines.splice(0, this.mines.length, ...mines);
    this.drones.clear();
    if (Array.isArray(runtime.drones)) {
      for (const item of runtime.drones) {
        if (!isRecordValue(item) || typeof item.instanceId !== 'string' || !Array.isArray(item.units)) continue;
        const units = item.units.filter(isDroneUnit).map((unit) => ({ ...unit }));
        if (units.length > 0) this.drones.set(item.instanceId, units);
      }
    }
    restoreNumberMap(this.lanceCharge, runtime.lanceCharge);
    restoreNumberMap(this.orbitAngles, runtime.orbitAngles);
    restoreNumberMap(this.orbitHits, runtime.orbitHits);
    restoreNumberMap(this.targetLocks, runtime.targetLocks, true);
    restoreNumberMap(this.supportPulseAt, runtime.supportPulseAt);
    this.igniteTriggered.clear();
    if (Array.isArray(runtime.igniteTriggered)) for (const id of runtime.igniteTriggered) if (Number.isInteger(id) && id >= 0) this.igniteTriggered.add(id);
    restoreNumericKeyMap(this.discTrailAt, runtime.discTrailAt);
    this.pendingSporeSplits.splice(0, this.pendingSporeSplits.length, ...(Array.isArray(runtime.pendingSporeSplits) ? runtime.pendingSporeSplits.filter((value): value is number => finiteNumber(value)) : []));
    this.designerWave = waveFromRuntime(runtime.designerWave);
    this.echoWave = waveFromRuntime(runtime.echoWave);
    this.crownPressure = waveFromRuntime(runtime.crownPressure);
    this.specialWaveWarning = waveFromRuntime(runtime.specialWaveWarning);
    if (Number.isInteger(runtime.lastDesignerSector)) this.lastDesignerSector = runtime.lastDesignerSector as number;
    if (Number.isInteger(runtime.crownWavesTriggered)) this.crownWavesTriggered = Math.max(0, runtime.crownWavesTriggered as number);
  }

  private restoreWeapons(snapshot: BattleSnapshot): void {
    this.weapons.splice(0, this.weapons.length);
    for (const item of snapshot.weapons) {
      const weapon = new Weapon(item.id, item.slot, item.instanceId);
      weapon.level = Math.max(1, Math.min(WEAPONS[item.id].levels.length, Math.floor(item.level)));
      weapon.damageDealt = Math.max(0, item.damageDealt);
      weapon.branch = item.branch;
      weapon.finalBranch = item.finalBranch;
      weapon.evolutionId = item.evolutionId;
      weapon.cooldown = Math.max(0, item.cooldownRemaining ?? 0);
      weapon.precisionBonus = Math.max(0, item.precisionBonus ?? 0);
      weapon.shotsFired = Math.max(0, Math.floor(item.shotsFired ?? 0));
      this.weapons.push(weapon);
    }
  }

  private restoreSupports(snapshot: BattleSnapshot): void {
    this.supports.splice(0, this.supports.length);
    for (const item of snapshot.supports) {
      const support = new SupportModule(item.id, item.slot, item.instanceId);
      support.level = Math.max(1, Math.min(SUPPORTS[item.id].levels.length, Math.floor(item.level)));
      this.supports.push(support);
    }
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
    const activeBoss = this.enemies.find((enemy) => enemy.active && enemy.isBoss);
    if (this.designerWave) {
      const color = activeBoss?.type === 'weaver' ? BOSSES.weaver.color : WEAPONS.chain.color;
      this.drawSpecialLine(telegraphLayer, cx, cy, arena, this.designerWave.angle, this.designerWave.life / this.designerWave.maxLife, color, 5);
    }
    if (this.echoWave) {
      const color = activeBoss?.type === 'reactor' ? BOSSES.reactor.color : WEAPONS.disc.color;
      this.drawSpecialLine(telegraphLayer, cx, cy, arena, this.echoWave.angle, this.echoWave.life / this.echoWave.maxLife, color, 5);
    }
    if (this.crownPressure) {
      const color = activeBoss?.type === 'gate' ? BOSSES.gate.color : BOSSES.crown.color;
      this.drawSpecialLine(telegraphLayer, cx, cy, arena, this.crownPressure.angle, this.crownPressure.life / this.crownPressure.maxLife, color, 6, 42, Math.min(196, arena));
    }
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
