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
import { drawTelegraphs } from '../render/TelegraphRenderer';
import { drawDevice } from '../render/WeaponRenderer';
import { applyContactDamage, applyDamage } from '../systems/DamageSystem';
import { EffectBudget, selectVisibleEntities, type EffectsLevel } from '../systems/EffectBudget';
import { FixedStepClock } from '../systems/FixedStepClock';
import { RunRecorder } from '../systems/RunRecorder';
import { collideEnemyProjectiles, collideProjectiles } from '../systems/CollisionSystem';
import { createUpgradeCandidateList, applyUpgradeCandidate, shouldRetryUpgradeDraw, wouldStrandNewItems } from '../systems/UpgradeSystem';
import { DeterministicRng, seedFromStage, SpawnDirector } from '../systems/SpawnDirector';
import { MANUAL_AIM_HALF_ANGLE, selectTarget } from '../systems/TargetingSystem';
import { advanceOrbitAngle } from '../systems/OrbitSystem';
import type { BossId, EnemyId, StageId, SupportId, WeaponId } from '../../types/content';
import type { BattleCallbacks, BattleResult, BattleSnapshot, Point, UpgradeCandidate, UpgradePayload } from '../../types/game';
import type { ResearchEffects } from '../../data/research';
import { RunLifecycleGuard } from '../../app/RunLifecycleGuard';

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
  callbacks: BattleCallbacks;
}

interface FlashEffect { x: number; y: number; color: number; life: number; maxLife: number; radius: number; kind?: 'impact' | 'telegraph' }
interface LineEffect { angle: number; color: number; life: number; maxLife: number; width: number; startX?: number; startY?: number; length?: number }
interface GravityField { x: number; y: number; life: number; maxLife: number; radius: number; damage: number; pullStrength: number; safeDistance: number; damageTimer: number; collapse: boolean; slowDuration: number }
const MAX_ACTIVE_ENEMIES = 180;
const MAX_FRIENDLY_PROJECTILES = 280;
const MAX_ENEMY_PROJECTILES = 80;
const MAX_GRAVITY_FIELDS = 24;
const LOGICAL_RENDER_SIZE = 720;
const ARENA_RADIUS = 325;
const CLUSTER_TELEGRAPH_SECONDS = 0.45;

export class BattleScene extends Phaser.Scene {
  private readonly options: BattleSceneOptions;
  private readonly core: Core;
  private readonly clock = new FixedStepClock();
  private readonly enemyPool = new EnemyPool();
  private readonly projectilePool = new ProjectilePool();
  private readonly particles = new ParticlePool();
  private readonly enemies: Enemy[] = [];
  private readonly projectiles: Projectile[] = [];
  private readonly weapons = [new Weapon('needle', 0)];
  private readonly supports: SupportModule[] = [];
  private readonly flashes: FlashEffect[] = [];
  private readonly lines: LineEffect[] = [];
  private readonly gravityFields: GravityField[] = [];
  private readonly orbitAngles = new Map<number, number>();
  private readonly orbitHits = new Map<string, number>();
  private readonly targetLocks = new Map<number, number>();
  private readonly discTrailAt = new Map<number, number>();
  private readonly pendingSporeSplits: number[] = [];
  private readonly recorder: RunRecorder;
  private readonly spawnDirector: SpawnDirector;
  private readonly rng: DeterministicRng;
  private readonly effectBudget: EffectBudget;
  private readonly runLifecycle = new RunLifecycleGuard(true);
  private readonly runSeed: number;
  private created = false;
  private graphics!: Phaser.GameObjects.Graphics;
  private elapsed = 0;
  private experience = 0;
  private level = 1;
  private nextExperience = 25;
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
  private lastCandidateSignature = '';
  private blockedUpgradeExperience: number | null = null;
  private bossDefeated = false;
  private testUpgradeOpened = false;
  private testOutcomeTimer: number | null = null;
  private lastSnapshotAt = -Infinity;
  private lastEnemyNotice = '';
  private endlessMilestone = 0;
  private designerWave: { angle: number; life: number; maxLife: number } | null = null;
  private echoWave: { angle: number; life: number; maxLife: number } | null = null;
  private crownPressure: { angle: number; life: number; maxLife: number } | null = null;
  private lastDesignerSector = -1;
  private crownWavesTriggered = 0;
  private renderPixelRatio = 1;
  private renderBackingSize = LOGICAL_RENDER_SIZE;

  public constructor(options: BattleSceneOptions) {
    super({ key: 'KakomareBattleScene' });
    this.options = options;
    this.runSeed = options.seed ?? seedFromStage(options.stageId, Date.now(), 1);
    this.core = new Core(options.researchEffects.maxCore);
    this.recorder = new RunRecorder(options.stageId, STAGES[options.stageId].boss, this.runSeed);
    this.rng = new DeterministicRng(this.runSeed);
    this.spawnDirector = new SpawnDirector(options.stageId, this.runSeed, options.testMode ?? false);
    this.effectBudget = new EffectBudget(options.effectsLevel);
    this.rerollsLeft = 1 + Math.min(2, options.researchEffects.rerolls);
    this.bansLeft = 1 + Math.min(2, options.researchEffects.bans);
  }

  public create(): void {
    this.created = true;
    this.graphics = this.add.graphics();
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

  public chooseUpgrade(candidate: UpgradeCandidate): void {
    if (this.state !== 'upgrade' || !this.upgradePayload || !this.upgradePayload.candidates.some((item) => item.id === candidate.id)) return;
    if (candidate.requiresNewItemFirst) {
      this.options.callbacks.onStatus('候補を3つ保つため、先に新しい装置を取得してください');
      this.options.callbacks.onUpgrade({ ...this.upgradePayload, candidates: [...this.upgradePayload.candidates] });
      return;
    }
    if (!candidate.isExisting && !this.availablePlacementSlots(candidate.kind).includes(candidate.placementSlot ?? -1)) {
      this.options.callbacks.onStatus('装置を置く空き面を選んでください');
      this.options.callbacks.onUpgrade({ ...this.upgradePayload, candidates: [...this.upgradePayload.candidates] });
      return;
    }
    applyUpgradeCandidate(candidate, this.weapons, this.supports, (amount) => this.core.heal(amount));
    if (candidate.kind === 'repair') this.repairsUsed += 1;
    this.recorder.upgrades.push(candidate.title);
    if (candidate.id.includes(':branch:')) this.recorder.branches.push(candidate.title);
    this.state = 'playing';
    this.upgradePayload = null;
    this.options.callbacks.onStatus(`${candidate.title}を取得しました`);
    this.options.callbacks.onUpgrade({ candidates: [], rerollsLeft: 0, bansLeft: 0 });
  }

  public rerollUpgrade(): void {
    if (this.state !== 'upgrade' || !this.upgradePayload || this.rerollsLeft <= 0) return;
    const candidates = this.createCandidates(this.signature(this.upgradePayload.candidates));
    if (candidates.length !== 3) {
      this.options.callbacks.onStatus('これ以上候補を引き直せません');
      this.options.callbacks.onUpgrade({ ...this.upgradePayload, candidates: [...this.upgradePayload.candidates] });
      return;
    }
    this.rerollsLeft -= 1;
    this.upgradePayload = { candidates, rerollsLeft: this.rerollsLeft, bansLeft: this.bansLeft };
    this.lastCandidateSignature = this.signature(candidates);
    this.options.callbacks.onUpgrade(this.upgradePayload);
  }

  public banUpgrade(candidateId: string): void {
    if (this.state !== 'upgrade' || !this.upgradePayload || this.bansLeft <= 0) return;
    const candidate = this.upgradePayload.candidates.find((item) => item.id === candidateId);
    if (!candidate) return;
    const nextBanned = this.effectiveBans();
    nextBanned.add(candidate.id);
    const candidates = this.createCandidates(this.signature(this.upgradePayload.candidates), nextBanned);
    if (candidates.length !== 3) {
      this.options.callbacks.onStatus('候補を3つ保てないため、この候補は除外できません');
      this.options.callbacks.onUpgrade({ ...this.upgradePayload, candidates: [...this.upgradePayload.candidates] });
      return;
    }
    this.banned.add(candidate.id);
    this.bansLeft -= 1;
    this.upgradePayload = { candidates, rerollsLeft: this.rerollsLeft, bansLeft: this.bansLeft };
    this.lastCandidateSignature = this.signature(candidates);
    this.options.callbacks.onUpgrade(this.upgradePayload);
  }

  public pause(): void {
    if (this.state === 'playing' || this.state === 'upgrade') {
      this.pauseReturnState = this.state;
      this.state = 'paused';
      this.options.callbacks.onStatus('一時停止中');
    }
  }

  public resume(): void {
    if (this.state === 'paused') { this.state = this.pauseReturnState; this.options.callbacks.onStatus('戦闘再開'); }
  }

  public get paused(): boolean { return this.state === 'paused'; }
  public get upgrading(): boolean { return this.state === 'upgrade' || this.state === 'paused' && this.pauseReturnState === 'upgrade'; }

  public retire(): void {
    if (this.state === 'finished') return;
    this.finish('defeat', 'プレイを終了しました', true);
  }

  public shutdownBattle(): void {
    if (this.testOutcomeTimer !== null) { window.clearTimeout(this.testOutcomeTimer); this.testOutcomeTimer = null; }
    this.state = 'finished';
    this.runLifecycle.cancel();
    if (this.created) this.input.removeAllListeners();
    this.created = false;
  }

  private step(seconds: number): void {
    if (!this.runLifecycle.active) return;
    if (this.state !== 'playing' && this.state !== 'upgrade') return;
    if (this.state === 'upgrade') seconds *= 0.1;
    this.elapsed += seconds;
    if (this.manualAim && this.aimPointerId === null && this.elapsed >= this.aimReleaseAt) this.manualAim = false;
    if (this.state === 'playing' && this.options.testMode && this.options.testUpgrade && !this.testUpgradeOpened && this.elapsed >= 0.7) { this.testUpgradeOpened = true; this.openUpgrade(); return; }
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
    this.spawnDirector.update(seconds, this.elapsed, activeEnemies, (request) => { this.spawnEnemy(request.type, request.angle); }, reservedArenaSlots);

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

    for (const weapon of this.weapons) {
      const intervalMultiplier = Math.max(0.7, 1 - this.supportEffect('rhythm', weapon.slot));
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
      (projectile, enemy) => this.adjustForSpecialEnemy(enemy, projectile.damage, this.weapons.find((weapon) => weapon.id === projectile.sourceWeaponId)?.slot ?? 0),
      undefined,
      (collision) => collision.destroyed && collision.enemy.isBoss && !stage.isEndless,
    );
    for (const collision of collisions) {
      if (collision.damage > 0) {
        const weaponId = collision.projectile.sourceWeaponId ?? 'needle';
        this.recordWeaponDamage(weaponId, collision.damage);
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
  }

  private fireWeapon(weapon: Weapon, allowBranch = true, powerFactor = 1): void {
    if (this.state === 'finished') return;
    const range = weapon.stats.range * (1 + this.supportEffect('focus', weapon.slot));
    const usesTarget = weapon.id !== 'repulse' && weapon.id !== 'orbit';
    const target = usesTarget
      ? selectTarget(this.enemies.filter((enemy) => enemy.active), { x: 0, y: 0 }, { angle: this.aimAngle, manual: this.manualAim }, range, this.elapsed, weapon.id, this.targetLocks.get(weapon.slot))
      : null;
    if (target) this.targetLocks.set(weapon.slot, target.id);
    else if (usesTarget) this.targetLocks.delete(weapon.slot);
    const angle = target ? Math.atan2(target.y, target.x) : this.aimAngle;
    const damage = this.weaponPower(weapon, powerFactor);
    if (weapon.id === 'needle') this.fireNeedle(weapon, angle, damage);
    else if (weapon.id === 'ray') this.fireRay(weapon, angle, damage);
    else if (weapon.id === 'cluster') this.fireCluster(weapon, target, angle, damage);
    else if (weapon.id === 'repulse') this.fireRepulse(weapon, damage);
    else if (weapon.id === 'chain') this.fireChain(weapon, target, angle, damage);
    else if (weapon.id === 'orbit') this.fireOrbit(weapon, damage);
    else if (weapon.id === 'disc') this.fireDisc(weapon, angle, damage);
    else this.fireGravity(weapon, target, angle, damage);
    if (!allowBranch) return;
  }

  private fireNeedle(weapon: Weapon, angle: number, damage: number): void {
    const spread = weapon.branch === 'spread' ? 3 : 1;
    const piercing = (weapon.stats.pierce ?? 0) + (weapon.branch === 'piercing' ? 2 : 0);
    const piercingDamage = weapon.branch === 'piercing' ? damage * 1.12 : damage;
    const speed = (weapon.stats.projectileSpeed ?? 480) * this.options.researchEffects.projectileSpeedMultiplier * (1 + this.supportEffect('focus', weapon.slot, 'secondary')) * (weapon.branch === 'piercing' ? 1.18 : 1);
    for (let index = 0; index < spread; index += 1) {
      const offset = spread === 1 ? 0 : (index - 1) * 0.14;
      this.addProjectile({
        kind: 'needle', x: 0, y: 0, vx: Math.cos(angle + offset) * speed, vy: Math.sin(angle + offset) * speed,
        radius: 6, damage: piercingDamage, life: 1.4, piercing, sourceWeaponId: weapon.id,
      });
    }
  }

  private fireRay(weapon: Weapon, angle: number, damage: number): void {
    if ((this.state as string) === 'finished') return;
    const width = (weapon.stats.width ?? 18) + (weapon.branch === 'wide' ? 20 : 0);
    const life = weapon.branch === 'wide' ? 0.22 : 0.16;
    const primaryLength = weapon.branch === 'reflect' ? Math.min(ARENA_RADIUS, weapon.stats.range) : weapon.stats.range;
    this.addLine({ angle, color: WEAPONS.ray.color, life, maxLife: life, width, length: primaryLength });
    this.hitRaySegment(weapon, 0, 0, angle, primaryLength, width, damage);
    if (this.state === 'finished') return;
    if (weapon.branch === 'reflect') {
      // The ray hits the circular outer boundary and reflects back along the
      // physically predictable opposite direction. Its second segment starts
      // at the actual boundary point, so the visual and damage path agree.
      const boundaryX = Math.cos(angle) * primaryLength;
      const boundaryY = Math.sin(angle) * primaryLength;
      const reflected = angle + Math.PI;
      const reflectedLength = Math.min(ARENA_RADIUS * 2, weapon.stats.range);
      this.addLine({ angle: reflected, color: WEAPONS.ray.color, life: 0.14, maxLife: 0.14, width: width * 0.7, startX: boundaryX, startY: boundaryY, length: reflectedLength });
      this.hitRaySegment(weapon, boundaryX, boundaryY, reflected, reflectedLength, width * 0.7, damage * 0.55);
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
      const result = applyDamage(enemy, this.adjustForSpecialEnemy(enemy, damage, weapon.slot), this.elapsed, angle);
      this.recordWeaponDamage(weapon.id, result.amount);
      if (result.destroyed) this.handleEnemyDestroyed(enemy);
      if ((this.state as string) === 'finished') return;
    }
  }

  private fireCluster(weapon: Weapon, target: Enemy | null, angle: number, damage: number): void {
    const radius = weapon.stats.radius ?? 72;
    const targetPoint = target ? { x: target.x, y: target.y } : { x: Math.cos(angle) * 250, y: Math.sin(angle) * 250 };
    const speed = (weapon.stats.projectileSpeed ?? 330) * this.options.researchEffects.projectileSpeedMultiplier * (1 + this.supportEffect('focus', weapon.slot, 'secondary'));
    const distance = Math.hypot(targetPoint.x, targetPoint.y);
    const travelSeconds = Math.max(CLUSTER_TELEGRAPH_SECONDS, distance / Math.max(1, speed));
    const velocity = distance / travelSeconds;
    this.addProjectile({
      kind: 'cluster', x: 0, y: 0, vx: Math.cos(angle) * velocity, vy: Math.sin(angle) * velocity,
      radius: 10, damage, life: travelSeconds, piercing: 0, sourceWeaponId: weapon.id,
      impactX: targetPoint.x, impactY: targetPoint.y, impactRadius: radius, impactAngle: angle,
    });
  }

  private resolveClusterImpact(projectile: Projectile): void {
    const weapon = this.weapons.find((item) => item.id === projectile.sourceWeaponId);
    if (!weapon || projectile.impactX === null || projectile.impactY === null) return;
    const x = projectile.impactX;
    const y = projectile.impactY;
    const radius = projectile.impactRadius;
    const angle = projectile.impactAngle;
    this.addFlash({ x, y, color: WEAPONS.cluster.color, life: CLUSTER_TELEGRAPH_SECONDS, maxLife: CLUSTER_TELEGRAPH_SECONDS, radius, kind: 'impact' });
    const hitIds = new Set<number>();
    this.hitArea(weapon, x, y, radius, projectile.damage, angle, hitIds);
    if (this.state === 'finished') return;
    if (weapon.branch === 'split') {
      for (let index = 0; index < 3; index += 1) {
        const splitAngle = angle + index * Math.PI * 2 / 3;
        this.hitArea(weapon, x + Math.cos(splitAngle) * 58, y + Math.sin(splitAngle) * 58, radius * 0.45, projectile.damage * 0.3, splitAngle, hitIds);
        if ((this.state as string) === 'finished') return;
      }
    }
    if (weapon.branch === 'residue') this.createGravityField(x, y, 1.8, radius * 0.75, 0, 0, 180, false, 0.55);
  }

  private fireRepulse(weapon: Weapon, damage: number): void {
    const radius = weapon.stats.radius ?? 165;
    const pushBonus = weapon.branch === 'strong-push' ? 1.5 : 1;
    const brakeEffect = this.supportEffect('brake', weapon.slot);
    const push = (weapon.stats.pushDistance ?? 58) * (1 + brakeEffect) * pushBonus;
    const slowDuration = (weapon.branch === 'delayed' ? 1.4 : 0.4) * (1 + brakeEffect);
    this.addLine({ angle: 0, color: WEAPONS.repulse.color, life: 0.3, maxLife: 0.3, width: radius });
    for (const enemy of this.enemies) {
      if (!enemy.active || Math.hypot(enemy.x, enemy.y) > radius + enemy.hitRadius) continue;
      const result = applyDamage(enemy, this.adjustForSpecialEnemy(enemy, damage, weapon.slot), this.elapsed, Math.atan2(enemy.y, enemy.x));
      enemy.applyPush(push, this.elapsed);
      enemy.applySlow(this.elapsed, slowDuration);
      this.recorder.recordControl('pushed', slowDuration);
      this.recordWeaponDamage(weapon.id, result.amount);
      if (result.destroyed) this.handleEnemyDestroyed(enemy);
      if ((this.state as string) === 'finished') return;
    }
  }

  private fireChain(weapon: Weapon, target: Enemy | null, angle: number, damage: number): void {
    let current = target;
    const hit = new Set<number>();
    let lastPoint = { x: 0, y: 0 };
    const count = (weapon.stats.chainCount ?? 3) + (weapon.branch === 'chain' ? 2 : 0);
    for (let index = 0; index < count && current; index += 1) {
      hit.add(current.id);
      const currentPoint = { x: current.x, y: current.y };
      const linkAngle = Math.atan2(currentPoint.y - lastPoint.y, currentPoint.x - lastPoint.x);
      this.addLine({ angle: linkAngle, color: WEAPONS.chain.color, life: 0.22, maxLife: 0.22, width: 5, startX: lastPoint.x, startY: lastPoint.y, length: Math.hypot(currentPoint.x - lastPoint.x, currentPoint.y - lastPoint.y) });
      const result = applyDamage(current, this.adjustForSpecialEnemy(current, damage * Math.pow(0.8, index), weapon.slot), this.elapsed, Math.atan2(current.y, current.x));
      this.recordWeaponDamage(weapon.id, result.amount);
      if (result.destroyed) this.handleEnemyDestroyed(current);
      if ((this.state as string) === 'finished') return;
      lastPoint = currentPoint;
      current = this.enemies.filter((enemy) => enemy.active && !hit.has(enemy.id) && Math.hypot(enemy.x - lastPoint.x, enemy.y - lastPoint.y) <= 150).sort((a, b) => Math.hypot(a.x - lastPoint.x, a.y - lastPoint.y) - Math.hypot(b.x - lastPoint.x, b.y - lastPoint.y))[0] ?? null;
    }
    if (weapon.branch === 'burst' && lastPoint.x !== 0 && lastPoint.y !== 0) this.hitArea(weapon, lastPoint.x, lastPoint.y, 40, damage * 0.5, angle);
  }

  private fireOrbit(weapon: Weapon, damage: number): void {
    const angle = this.orbitAngles.get(weapon.slot) ?? 0;
    const count = (weapon.stats.count ?? 2) + (weapon.branch === 'many' ? 1 : 0);
    const radius = (weapon.stats.orbitRadius ?? 108) + (weapon.branch === 'outer' ? 38 : 0);
    const bladeLength = (weapon.stats.bladeLength ?? 32) + (weapon.branch === 'outer' ? 28 : 0);
    for (let index = 0; index < count; index += 1) {
      const bladeAngle = angle + index * Math.PI * 2 / count;
      for (const enemy of this.enemies) {
        const key = `${weapon.slot}:${enemy.id}`;
        const halfLength = bladeLength / 2;
        const startX = Math.cos(bladeAngle) * (radius - halfLength);
        const startY = Math.sin(bladeAngle) * (radius - halfLength);
        const endX = Math.cos(bladeAngle) * (radius + halfLength);
        const endY = Math.sin(bladeAngle) * (radius + halfLength);
        if (!enemy.active || distanceToSegment(enemy.x, enemy.y, startX, startY, endX, endY) > 8 + enemy.hitRadius) continue;
        if (this.elapsed - (this.orbitHits.get(key) ?? -Infinity) < (weapon.stats.hitCooldown ?? 0.45)) continue;
        this.orbitHits.set(key, this.elapsed);
        const result = applyDamage(enemy, this.adjustForSpecialEnemy(enemy, damage, weapon.slot), this.elapsed, bladeAngle);
        this.recordWeaponDamage(weapon.id, result.amount);
        if (result.destroyed) this.handleEnemyDestroyed(enemy);
        if (this.state === 'finished') return;
      }
    }
  }

  private updateOrbitAngles(seconds: number): void {
    for (const weapon of this.weapons) {
      if (weapon.id !== 'orbit') continue;
      const speed = (weapon.stats.orbitSpeed ?? 1.9) * (weapon.branch === 'many' ? 1.25 : 1);
      const previous = this.orbitAngles.get(weapon.slot) ?? 0;
      this.orbitAngles.set(weapon.slot, advanceOrbitAngle(previous, speed, seconds));
    }
  }

  private fireDisc(weapon: Weapon, angle: number, damage: number): void {
    const speed = (weapon.stats.projectileSpeed ?? 290) * this.options.researchEffects.projectileSpeedMultiplier * (1 + this.supportEffect('focus', weapon.slot, 'secondary')) * (weapon.branch === 'echo' ? 1.2 : 1);
    this.addProjectile({
      kind: 'disc', x: 0, y: 0, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      radius: 10, damage, life: 4, piercing: 0, bounces: (weapon.stats.bounceCount ?? 3) + (weapon.branch === 'echo' ? 3 : 0), hitCooldown: weapon.stats.hitCooldown ?? 0.3, sourceWeaponId: weapon.id,
    });
  }

  private fireGravity(weapon: Weapon, target: Enemy | null, angle: number, damage: number): void {
    const stats = weapon.stats;
    const safeDistance = stats.safeDistance ?? 180;
    const targetDistance = target ? Math.hypot(target.x, target.y) : 260;
    const distance = Math.max(safeDistance + 12, Math.min(stats.range, targetDistance));
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    const duration = (stats.duration ?? 2.2) * (weapon.branch === 'long' ? 1.4 : 1);
    const radius = (stats.pullRadius ?? 125) * (weapon.branch === 'long' ? 1.2 : 1);
    this.createGravityField(x, y, duration, radius, damage, stats.pullStrength ?? 34, safeDistance, weapon.branch === 'collapse');
    this.addLine({ angle, color: WEAPONS.gravity.color, life: 0.38, maxLife: 0.38, width: stats.pullRadius ?? 125 });
  }

  private hitArea(weapon: Weapon, x: number, y: number, radius: number, damage: number, attackAngle: number | null, hitIds?: Set<number>): void {
    if (this.state === 'finished') return;
    for (const enemy of this.enemies) {
      if (!enemy.active || hitIds?.has(enemy.id) || Math.hypot(enemy.x - x, enemy.y - y) > radius + enemy.hitRadius) continue;
      hitIds?.add(enemy.id);
      const result = applyDamage(enemy, this.adjustForSpecialEnemy(enemy, damage, weapon.slot), this.elapsed, attackAngle ?? Math.atan2(enemy.y, enemy.x));
      this.recordWeaponDamage(weapon.id, result.amount);
      if (result.destroyed) this.handleEnemyDestroyed(enemy);
      if ((this.state as string) === 'finished') return;
    }
  }

  private createGravityField(x: number, y: number, duration: number, radius: number, damage: number, pullStrength: number, safeDistance: number, collapse: boolean, slowDuration = 0): void {
    if (this.gravityFields.length >= MAX_GRAVITY_FIELDS) return;
    this.gravityFields.push({ x, y, life: duration, maxLife: duration, radius, damage, pullStrength, safeDistance, damageTimer: 0, collapse, slowDuration });
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
          const result = applyDamage(enemy, this.adjustForSpecialEnemy(enemy, field.damage, this.weapons.find((item) => item.id === 'gravity')?.slot ?? 0), this.elapsed, Math.atan2(enemy.y, enemy.x));
          this.recordWeaponDamage('gravity', result.amount);
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
          const weapon = this.weapons.find((item) => item.id === 'gravity');
          if (weapon) this.hitArea(weapon, field.x, field.y, field.radius, weapon.stats.damage * 1.8, null);
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
        if (!projectile.impactWarningShown && (projectile.life <= CLUSTER_TELEGRAPH_SECONDS || !projectile.active) && projectile.impactX !== null && projectile.impactY !== null) {
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
      const disc = this.weapons.find((weapon) => weapon.id === projectile.sourceWeaponId);
      if (disc?.branch === 'trail' && this.elapsed >= (this.discTrailAt.get(projectile.id) ?? 0)) {
        this.discTrailAt.set(projectile.id, this.elapsed + 0.18);
        this.addFlash({ x: projectile.x, y: projectile.y, color: WEAPONS.disc.color, life: 0.2, maxLife: 0.2, radius: 24 });
        this.hitArea(disc, projectile.x, projectile.y, 28, projectile.damage * 0.2, Math.atan2(projectile.vy, projectile.vx));
        if (this.state === 'finished') return;
      }
      const distance = Math.hypot(projectile.x, projectile.y);
      if (distance < ARENA_RADIUS) continue;
      if (projectile.bounces <= 0) { projectile.active = false; continue; }
      const nx = projectile.x / Math.max(1, distance);
      const ny = projectile.y / Math.max(1, distance);
      const dot = projectile.vx * nx + projectile.vy * ny;
      projectile.vx -= 2 * dot * nx;
      projectile.vy -= 2 * dot * ny;
      projectile.x = nx * (ARENA_RADIUS - 1);
      projectile.y = ny * (ARENA_RADIUS - 1);
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
            kind: 'enemy', x: Math.cos(angle) * ARENA_RADIUS, y: Math.sin(angle) * ARENA_RADIUS, vx: -Math.cos(angle) * 210, vy: -Math.sin(angle) * 210,
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
    const enemy = this.enemyPool.acquire(type, angle, 330, difficulty, stage.isEndless ? 1.4 : 1.25);
    if (!this.enemies.includes(enemy)) this.enemies.push(enemy);
    const notice = ENEMIES[type].name;
    if (notice !== this.lastEnemyNotice) { this.lastEnemyNotice = notice; this.options.callbacks.onStatus(`${notice}が接近中`); }
    return true;
  }

  private availableEnemySlots(): number {
    const baseLimit = Math.min(MAX_ACTIVE_ENEMIES, this.spawnDirector.enemyLimit);
    const reserveBossSlot = STAGES[this.options.stageId].isEndless && !this.enemies.some((enemy) => enemy.active && enemy.isBoss) ? 1 : 0;
    const active = this.enemies.filter((enemy) => enemy.active).length;
    return Math.max(0, baseLimit - reserveBossSlot - active);
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
    const boss = this.enemyPool.acquire(bossId, this.rng.next() * Math.PI * 2, 370, difficulty, stage.isEndless ? 1.4 : 1.25);
    if (!this.enemies.includes(boss)) this.enemies.push(boss);
    this.options.callbacks.onStatus(`${BOSSES[bossId].name}が出現しました。予告を見て対応してください`);
    return true;
  }

  private handleEnemyDestroyed(enemy: Enemy): void {
    if (this.state === 'finished') return;
    if (enemy.isBoss) {
      this.designerWave = null;
      this.echoWave = null;
      this.crownPressure = null;
      this.bossDefeated = true;
      this.recorder.bossDefeated = true;
      this.recorder.bossesDefeated += 1;
      this.addScore(2_000);
      if (STAGES[this.options.stageId].isEndless) this.options.callbacks.onStatus(`${BOSSES[enemy.type as BossId].name}を撃破しました。戦闘を続けます`);
      else this.finish('victory', '');
      return;
    }
    const enemyId = enemy.type as EnemyId;
    this.recorder.kills += 1;
    this.recorder.recordEnemyKill(enemyId);
    this.addScore(10 * (1 + ENEMIES[enemyId].threatCost));
    this.experience += enemyId === 'spore' ? 8 : 4;
    this.addFlash({ x: enemy.x, y: enemy.y, color: ENEMIES[enemyId].color, life: 0.32, maxLife: 0.32, radius: 26 });
    this.emitParticles(enemy.x, enemy.y, ENEMIES[enemyId].color);
    if (enemyId === 'spore' && !enemy.splitDone) {
      enemy.splitDone = true;
      this.pendingSporeSplits.push(enemy.angle);
    }
    if (this.experience >= this.nextExperience && this.state === 'playing') this.openUpgrade();
  }

  private flushPendingSporeSplits(): void {
    for (const angle of this.pendingSporeSplits.splice(0)) {
      this.spawnEnemy('shard', angle - 0.2);
      this.spawnEnemy('shard', angle + 0.2);
    }
  }

  private openUpgrade(): void {
    if (!shouldRetryUpgradeDraw(this.experience, this.blockedUpgradeExperience)) return;
    const candidates = this.createCandidates(this.lastCandidateSignature);
    if (candidates.length !== 3) {
      // Keep both the threshold experience and level intact. A failed draw is
      // not a level-up, and must never consume progress silently. Retry once
      // new experience arrives so a temporary empty draw cannot end growth.
      this.blockedUpgradeExperience = this.experience;
      this.options.callbacks.onStatus('選べる強化候補がないため、経験値を保持して戦闘を続けます');
      return;
    }
    this.blockedUpgradeExperience = null;
    this.experience -= this.nextExperience;
    this.level += 1;
    this.nextExperience = 16 + this.level * 9;
    this.upgradePayload = {
      candidates,
      rerollsLeft: this.rerollsLeft,
      bansLeft: this.bansLeft,
    };
    this.lastCandidateSignature = this.signature(candidates);
    this.state = 'upgrade';
    this.options.callbacks.onUpgrade(this.upgradePayload);
    this.options.callbacks.onStatus('強化候補を選んでください');
  }

  private effectiveBans(): Set<string> {
    const bans = new Set(this.banned);
    if (this.repairsUsed >= 2) bans.add('repair:core');
    return bans;
  }

  private createCandidates(avoidSignature = '', bans = this.effectiveBans()): UpgradeCandidate[] {
    let fallback: UpgradeCandidate[] = [];
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const candidates = createUpgradeCandidateList(this.weapons, this.supports, this.core.health, this.rng, bans, this.core.maxHealth);
      if (candidates.length !== 3) return [];
      const annotated = candidates.map((candidate) => {
        const bansAfterChoice = new Set(bans);
        if (candidate.kind === 'repair' && this.repairsUsed >= 1) bansAfterChoice.add('repair:core');
        const withWarning = wouldStrandNewItems(candidate, this.weapons, this.supports, this.core.health, this.core.maxHealth, bansAfterChoice)
          ? { ...candidate, requiresNewItemFirst: true }
          : candidate;
        return withWarning.isExisting ? withWarning : { ...withWarning, placementSlots: this.availablePlacementSlots(withWarning.kind) };
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
    if (kind === 'weapon') return [0, 1, 2].filter((slot) => !this.weapons.some((weapon) => weapon.slot === slot));
    if (kind === 'support') return [0, 1, 2].filter((slot) => !this.supports.some((support) => support.slot === slot));
    return [];
  }

  private finish(outcome: BattleResult['outcome'], cause: string, retired = false): void {
    if (!this.runLifecycle.finish()) return;
    if (this.testOutcomeTimer !== null) { window.clearTimeout(this.testOutcomeTimer); this.testOutcomeTimer = null; }
    const stage = STAGES[this.options.stageId];
    if (outcome === 'victory' && !retired) this.addScore(stage.clearBonus);
    this.state = 'finished';
    if (cause) this.recorder.lastDamageSource = cause;
    this.recorder.survivalTime = this.elapsed;
    for (const support of this.supports) this.recorder.recordSupportUsage(support.id);
    const baseParts = Math.max(20, Math.floor(20 + this.elapsed / 6 + this.recorder.bossesDefeated * 25));
    const parts = retired ? 0 : Math.floor(baseParts * this.options.researchEffects.partMultiplier);
    const result = this.recorder.result(outcome, this.core.health, parts, retired, outcome === 'victory' && !stage.isEndless ? nextStageId(this.options.stageId) : null);
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
    const projectile = this.projectilePool.acquire(options);
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

  private recordWeaponDamage(id: WeaponId, amount: number): void {
    if (amount <= 0) return;
    this.recorder.recordWeaponDamage(id, amount);
    const weapon = this.weapons.find((item) => item.id === id);
    if (weapon) weapon.damageDealt += amount;
  }

  private weaponPower(weapon: Weapon, factor = 1): number {
    return weapon.stats.damage * weapon.damageMultiplier * (1 + this.supportEffect('output', weapon.slot)) * this.options.researchEffects.powerMultiplier * factor;
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
  }

  private updateEffects(seconds: number): void {
    for (const flash of this.flashes) { flash.life -= seconds; if (!this.options.reducedMotion) flash.radius += seconds * 80; }
    for (const line of this.lines) line.life -= seconds;
    this.particles.update(seconds);
  }

  private emitSnapshot(force: boolean): void {
    if (!force && this.elapsed - this.lastSnapshotAt < 0.1) return;
    this.lastSnapshotAt = this.elapsed;
    const visibleEnemies = this.visibleEnemies();
    const visibleProjectiles = this.visibleProjectiles();
    const snapshot: BattleSnapshot = {
      elapsed: this.elapsed,
      core: this.core.health,
      maxCore: this.core.maxHealth,
      experience: this.experience,
      nextExperience: this.nextExperience,
      score: Math.round(this.recorder.score + this.elapsed * 5 + this.core.health * 20),
      kills: this.recorder.kills,
      enemies: visibleEnemies.map((enemy) => enemy.snapshot({ x: 0, y: 0 }, this.elapsed)),
      projectiles: visibleProjectiles.map((projectile) => projectile.snapshot()),
      weapons: this.weapons.map((weapon) => ({ id: weapon.id, level: weapon.level, damageDealt: weapon.damageDealt, branch: weapon.branch, finalBranch: weapon.finalBranch })),
      supports: this.supports.map((support) => ({ id: support.id, level: support.level, slot: support.slot })),
      aimAngle: this.aimAngle,
      manualAim: this.manualAim,
      bossActive: this.enemies.some((enemy) => enemy.active && enemy.isBoss),
      bossDefeated: this.bossDefeated,
      sectorDamage: [...this.recorder.sectorDamage],
      effectsLevel: this.effectBudget.effectsLevel,
    };
    this.options.callbacks.onSnapshot(snapshot);
  }

  private renderScene(): void {
    const width = this.scale.width / this.renderPixelRatio;
    const height = this.scale.height / this.renderPixelRatio;
    const cx = width / 2;
    const cy = height / 2;
    const arena = Math.min(ARENA_RADIUS, Math.min(width, height) * 0.45);
    this.graphics.clear();
    this.graphics.fillStyle(0x07131f, 1); this.graphics.fillRect(0, 0, width, height);
    this.graphics.lineStyle(1, 0x163246, 0.65);
    for (let index = 0; index < 6; index += 1) {
      const angle = index * Math.PI / 3;
      this.graphics.lineBetween(cx, cy, cx + Math.cos(angle) * arena, cy + Math.sin(angle) * arena);
    }
    this.graphics.strokeCircle(cx, cy, arena);
    this.graphics.strokeCircle(cx, cy, arena * 0.65);
    for (const field of this.gravityFields) {
      const alpha = Math.max(0.08, field.life / field.maxLife) * 0.45;
      this.graphics.fillStyle(WEAPONS.gravity.color, alpha); this.graphics.fillCircle(cx + field.x, cy + field.y, field.radius);
      this.graphics.lineStyle(2, WEAPONS.gravity.color, alpha + 0.2); this.graphics.strokeCircle(cx + field.x, cy + field.y, field.radius);
      this.graphics.lineStyle(1, 0xfff1a8, alpha); this.graphics.strokeCircle(cx + field.x, cy + field.y, Math.max(12, field.radius * 0.35));
    }
    for (const line of this.lines) {
      if (line.life <= 0) continue;
      const alpha = Math.max(0, line.life / line.maxLife);
      if (line.width > 100) { this.graphics.lineStyle(6, line.color, alpha * 0.7); this.graphics.strokeCircle(cx, cy, Math.min(arena, line.width)); }
      else {
        const startX = line.startX ?? 0;
        const startY = line.startY ?? 0;
        const length = line.length ?? arena;
        this.graphics.lineStyle(line.width, line.color, alpha * 0.8);
        this.graphics.lineBetween(cx + startX, cy + startY, cx + startX + Math.cos(line.angle) * length, cy + startY + Math.sin(line.angle) * length);
      }
    }
    this.drawFlashes(cx, cy, false);
    const visibleEnemies = this.visibleEnemies();
    const visibleProjectiles = this.visibleProjectiles();
    for (const projectile of visibleProjectiles) if (!projectile.enemyProjectile) this.drawProjectile(projectile, cx, cy);
    for (const particle of this.particles.active()) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      this.graphics.fillStyle(particle.color, alpha * 0.8);
      this.graphics.fillCircle(cx + particle.x, cy + particle.y, 2 + alpha * 2);
    }
    drawDevice(this.graphics, cx, cy, this.weapons.map((weapon) => ({ id: weapon.id, level: weapon.level, damageDealt: weapon.damageDealt, branch: weapon.branch, finalBranch: weapon.finalBranch })), this.supports.map((support) => ({ id: support.id, level: support.level, slot: support.slot })));
    this.drawOrbitBlades(cx, cy);
    for (const enemy of visibleEnemies) drawEnemy(this.graphics, enemy.snapshot({ x: 0, y: 0 }, this.elapsed), cx, cy);
    drawTelegraphs(this.graphics, visibleEnemies.map((enemy) => enemy.snapshot({ x: 0, y: 0 }, this.elapsed)), cx, cy);
    if (this.designerWave) this.drawSpecialLine(cx, cy, arena, this.designerWave.angle, this.designerWave.life / this.designerWave.maxLife, WEAPONS.chain.color, 5);
    if (this.echoWave) this.drawSpecialLine(cx, cy, arena, this.echoWave.angle, this.echoWave.life / this.echoWave.maxLife, WEAPONS.disc.color, 5);
    if (this.crownPressure) this.drawSpecialLine(cx, cy, arena, this.crownPressure.angle, this.crownPressure.life / this.crownPressure.maxLife, BOSSES.crown.color, 6, 42, Math.min(196, arena));
    this.drawFlashes(cx, cy, true);
    if (this.manualAim) this.drawManualAim(cx, cy, arena);
    if (this.manualAim) {
      this.graphics.lineStyle(2, 0xfff1a8, 0.7);
      this.graphics.lineBetween(cx, cy, cx + Math.cos(this.aimAngle) * arena, cy + Math.sin(this.aimAngle) * arena);
    }
    for (const projectile of visibleProjectiles) if (projectile.enemyProjectile) this.drawProjectile(projectile, cx, cy);
  }

  private visibleEnemies(): Enemy[] {
    const active = this.enemies.filter((enemy) => enemy.active);
    return selectVisibleEntities(active, this.effectBudget.limits.enemies, (first, second) => {
      if (first.isBoss !== second.isBoss) return first.isBoss ? -1 : 1;
      if (first.telegraph !== second.telegraph) return first.telegraph ? -1 : 1;
      return first.distanceToCore - second.distanceToCore || first.id - second.id;
    });
  }

  private visibleProjectiles(): Projectile[] {
    const friendly = selectVisibleEntities(
      this.projectiles.filter((projectile) => projectile.active && !projectile.enemyProjectile),
      this.effectBudget.limits.projectiles,
      (first, second) => Math.hypot(first.x, first.y) - Math.hypot(second.x, second.y) || first.id - second.id,
    );
    const hostile = selectVisibleEntities(
      this.projectiles.filter((projectile) => projectile.active && projectile.enemyProjectile),
      this.effectBudget.limits.enemyProjectiles,
      (first, second) => Math.hypot(first.x, first.y) - Math.hypot(second.x, second.y) || first.id - second.id,
    );
    return [...friendly, ...hostile];
  }

  private applyRenderResolution(): void {
    const parentWidth = this.scale.parentSize.width || this.game.canvas.getBoundingClientRect().width || LOGICAL_RENDER_SIZE;
    const parentHeight = this.scale.parentSize.height || this.game.canvas.getBoundingClientRect().height || LOGICAL_RENDER_SIZE;
    const cssSize = Math.max(1, Math.min(parentWidth, parentHeight));
    const pixelRatio = this.effectBudget.pixelRatio(window.devicePixelRatio || 1);
    const backingSize = Math.max(1, Math.min(LOGICAL_RENDER_SIZE * 2, Math.round(cssSize * pixelRatio)));
    if (backingSize === this.renderBackingSize) return;
    this.renderBackingSize = backingSize;
    this.renderPixelRatio = backingSize / LOGICAL_RENDER_SIZE;
    this.scale.setGameSize(backingSize, backingSize);
    this.cameras.main.setZoom(this.renderPixelRatio);
  }

  private drawSpecialLine(cx: number, cy: number, arena: number, angle: number, alpha: number, color: number, width: number, startDistance = 170, endDistance = arena): void {
    this.graphics.lineStyle(width, color, Math.max(0.2, alpha));
    this.graphics.lineBetween(cx + Math.cos(angle) * startDistance, cy + Math.sin(angle) * startDistance, cx + Math.cos(angle) * endDistance, cy + Math.sin(angle) * endDistance);
  }

  private drawFlashes(cx: number, cy: number, telegraphs: boolean): void {
    for (const flash of this.flashes) {
      if (flash.life <= 0 || (flash.kind === 'telegraph') !== telegraphs) continue;
      const alpha = Math.max(0, flash.life / flash.maxLife);
      if (flash.kind === 'telegraph') {
        this.graphics.fillStyle(flash.color, alpha * 0.06);
        this.graphics.fillCircle(cx + flash.x, cy + flash.y, flash.radius);
        this.graphics.lineStyle(2, flash.color, alpha * 0.85);
      } else {
        this.graphics.fillStyle(flash.color, alpha * 0.12);
        this.graphics.fillCircle(cx + flash.x, cy + flash.y, flash.radius * 0.7);
        this.graphics.lineStyle(3, flash.color, alpha);
      }
      this.graphics.strokeCircle(cx + flash.x, cy + flash.y, flash.radius);
    }
  }

  private drawManualAim(cx: number, cy: number, arena: number): void {
    const points = [{ x: cx, y: cy }];
    const steps = 10;
    for (let index = 0; index <= steps; index += 1) {
      const angle = this.aimAngle - MANUAL_AIM_HALF_ANGLE + (MANUAL_AIM_HALF_ANGLE * 2 * index) / steps;
      points.push({ x: cx + Math.cos(angle) * arena, y: cy + Math.sin(angle) * arena });
    }
    this.graphics.fillStyle(0xfff1a8, 0.08);
    this.graphics.lineStyle(1, 0xfff1a8, 0.45);
    this.graphics.beginPath();
    this.graphics.moveTo(points[0]?.x ?? cx, points[0]?.y ?? cy);
    for (const point of points.slice(1)) this.graphics.lineTo(point.x, point.y);
    this.graphics.closePath();
    this.graphics.fillPath();
    this.graphics.strokePath();
  }

  private drawOrbitBlades(cx: number, cy: number): void {
    for (const weapon of this.weapons.filter((item) => item.id === 'orbit')) {
      const angle = this.orbitAngles.get(weapon.slot) ?? 0;
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
        this.graphics.lineStyle(7, WEAPONS.orbit.color, 0.9);
        this.graphics.lineBetween(startX, startY, endX, endY);
        this.graphics.fillStyle(0xfff1a8, 0.85);
        this.graphics.fillCircle(endX, endY, 3);
      }
    }
  }

  private drawProjectile(projectile: Projectile, centerX: number, centerY: number): void {
    const color = projectile.enemyProjectile ? 0xfff1a8 : projectile.kind === 'disc' ? WEAPONS.disc.color : projectile.sourceWeaponId ? WEAPONS[projectile.sourceWeaponId].color : 0x63d7e6;
    const x = centerX + projectile.x;
    const y = centerY + projectile.y;
    this.graphics.fillStyle(color, 1);
    this.graphics.fillCircle(x, y, projectile.radius);
    this.graphics.lineStyle(projectile.enemyProjectile ? 3 : 2, projectile.enemyProjectile ? 0xff706a : color, 0.9);
    this.graphics.lineBetween(x - projectile.vx * 0.025, y - projectile.vy * 0.025, x, y);
    if (projectile.enemyProjectile) {
      this.graphics.lineStyle(2, 0xfff1a8, 0.95);
      this.graphics.strokeCircle(x, y, projectile.radius + 5);
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
}

function distanceToSegment(pointX: number, pointY: number, startX: number, startY: number, endX: number, endY: number): number {
  const dx = endX - startX;
  const dy = endY - startY;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= 1e-6) return Math.hypot(pointX - startX, pointY - startY);
  const projection = Math.max(0, Math.min(1, ((pointX - startX) * dx + (pointY - startY) * dy) / lengthSquared));
  return Math.hypot(pointX - (startX + dx * projection), pointY - (startY + dy * projection));
}
