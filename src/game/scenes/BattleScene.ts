import Phaser from 'phaser';
import { BOSSES } from '../../data/bosses';
import { ENEMIES } from '../../data/enemies';
import { STAGES, nextStageId } from '../../data/stages';
import { WEAPONS } from '../../data/weapons';
import { Core } from '../entities/Core';
import { Enemy } from '../entities/Enemy';
import { Projectile } from '../entities/Projectile';
import { SupportModule } from '../entities/SupportModule';
import { Weapon } from '../entities/Weapon';
import { EnemyPool } from '../pools/EnemyPool';
import { ParticlePool } from '../pools/ParticlePool';
import { ProjectilePool } from '../pools/ProjectilePool';
import { drawEnemy } from '../render/EnemyRenderer';
import { drawTelegraphs } from '../render/TelegraphRenderer';
import { drawDevice } from '../render/WeaponRenderer';
import { applyContactDamage, applyDamage } from '../systems/DamageSystem';
import { EffectBudget, type EffectsLevel } from '../systems/EffectBudget';
import { FixedStepClock } from '../systems/FixedStepClock';
import { RunRecorder } from '../systems/RunRecorder';
import { collideProjectiles } from '../systems/CollisionSystem';
import { createUpgradeCandidateList, applyUpgradeCandidate } from '../systems/UpgradeSystem';
import { DeterministicRng, seedFromStage, SpawnDirector } from '../systems/SpawnDirector';
import { selectTarget } from '../systems/TargetingSystem';
import type { BossId, EnemyId, StageId, SupportId, WeaponId } from '../../types/content';
import type { BattleCallbacks, BattleResult, BattleSnapshot, Point, UpgradeCandidate, UpgradePayload } from '../../types/game';
import type { ResearchEffects } from '../../data/research';

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

interface FlashEffect { x: number; y: number; color: number; life: number; maxLife: number; radius: number }
interface LineEffect { angle: number; color: number; life: number; maxLife: number; width: number }
interface GravityField { x: number; y: number; life: number; maxLife: number; radius: number; damage: number; pullStrength: number; safeDistance: number; damageTimer: number; collapse: boolean }
interface SpecialTelegraph { angle: number; life: number; maxLife: number; color: number; width: number }

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
  private readonly specialTelegraphs: SpecialTelegraph[] = [];
  private readonly orbitAngles = new Map<number, number>();
  private readonly orbitHits = new Map<string, number>();
  private readonly recorder: RunRecorder;
  private readonly spawnDirector: SpawnDirector;
  private readonly rng: DeterministicRng;
  private readonly effectBudget: EffectBudget;
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
  private upgradePayload: UpgradePayload | null = null;
  private readonly banned = new Set<string>();
  private bossDefeated = false;
  private testUpgradeOpened = false;
  private testOutcomeTimer: number | null = null;
  private lastSnapshotAt = -Infinity;
  private lastEnemyNotice = '';
  private endlessMilestone = 0;
  private designerWave: { angle: number; life: number; maxLife: number } | null = null;
  private echoWave: { angle: number; life: number; maxLife: number } | null = null;
  private lastEchoHit = -Infinity;

  public constructor(options: BattleSceneOptions) {
    super({ key: 'KakomareBattleScene' });
    this.options = options;
    this.runSeed = options.seed ?? seedFromStage(options.stageId, Date.now(), 1);
    this.core = new Core(options.researchEffects.maxCore);
    this.recorder = new RunRecorder(options.stageId, STAGES[options.stageId].boss, this.runSeed);
    this.rng = new DeterministicRng(this.runSeed);
    this.spawnDirector = new SpawnDirector(options.stageId, this.runSeed, options.testMode ?? false);
    this.effectBudget = new EffectBudget(options.effectsLevel);
  }

  public create(): void {
    this.created = true;
    this.graphics = this.add.graphics();
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.input.on('pointerupoutside', this.handlePointerUp, this);
    this.input.on('pointercancel', this.handlePointerUp, this);
    this.input.keyboard?.on('keydown-ESC', () => this.requestPause());
    this.scheduleTestOutcome();
    this.options.callbacks.onStatus('戦闘開始');
    this.emitSnapshot(true);
  }

  public update(_time: number, delta: number): void {
    if (this.state === 'finished') return;
    const frameStart = performance.now();
    this.clock.advance(delta / 1000, (seconds) => this.step(seconds));
    this.renderScene();
    this.effectBudget.sample(performance.now() - frameStart, this.elapsed, this.options.reducedMotion);
    this.emitSnapshot(false);
  }

  public chooseUpgrade(candidate: UpgradeCandidate): void {
    if (this.state !== 'upgrade' || !this.upgradePayload || !this.upgradePayload.candidates.some((item) => item.id === candidate.id)) return;
    applyUpgradeCandidate(candidate, this.weapons, this.supports, (amount) => this.core.heal(amount));
    this.recorder.upgrades.push(candidate.title);
    if (candidate.id.includes(':branch:')) this.recorder.branches.push(candidate.title);
    this.state = 'playing';
    this.upgradePayload = null;
    this.options.callbacks.onStatus(`${candidate.title}を取得しました`);
    this.options.callbacks.onUpgrade({ candidates: [], rerollsLeft: 0, bansLeft: 0 });
  }

  public rerollUpgrade(): void {
    if (this.state !== 'upgrade' || !this.upgradePayload || this.upgradePayload.rerollsLeft <= 0) return;
    this.upgradePayload.rerollsLeft -= 1;
    this.upgradePayload.candidates = createUpgradeCandidateList(this.weapons, this.supports, this.core.health, this.rng, this.banned);
    this.options.callbacks.onUpgrade(this.upgradePayload);
  }

  public banUpgrade(candidateId: string): void {
    if (this.state !== 'upgrade' || !this.upgradePayload || this.upgradePayload.bansLeft <= 0) return;
    const candidate = this.upgradePayload.candidates.find((item) => item.id === candidateId);
    if (!candidate) return;
    this.banned.add(candidate.id);
    this.upgradePayload.bansLeft -= 1;
    this.upgradePayload.candidates = createUpgradeCandidateList(this.weapons, this.supports, this.core.health, this.rng, this.banned);
    this.options.callbacks.onUpgrade(this.upgradePayload);
  }

  public pause(): void {
    if (this.state === 'playing') { this.state = 'paused'; this.options.callbacks.onStatus('一時停止中'); }
  }

  public requestPause(): void { if (this.state === 'playing') this.pause(); }

  public resume(): void {
    if (this.state === 'paused') { this.state = 'playing'; this.options.callbacks.onStatus('戦闘再開'); }
  }

  public get paused(): boolean { return this.state === 'paused'; }

  public retire(): void {
    if (this.state === 'finished') return;
    this.finish('defeat', 'プレイを終了しました', true);
  }

  public shutdownBattle(): void {
    if (this.testOutcomeTimer !== null) { window.clearTimeout(this.testOutcomeTimer); this.testOutcomeTimer = null; }
    this.state = 'finished';
    if (this.created) this.input.removeAllListeners();
    this.created = false;
  }

  private step(seconds: number): void {
    if (this.state !== 'playing') return;
    this.elapsed += seconds;
    if (this.manualAim && this.aimPointerId === null && this.elapsed >= this.aimReleaseAt) this.manualAim = false;
    if (this.options.testMode && this.options.testUpgrade && !this.testUpgradeOpened && this.elapsed >= 0.7) { this.testUpgradeOpened = true; this.openUpgrade(); return; }
    const stage = STAGES[this.options.stageId];
    const activeEnemies = this.enemies.filter((enemy) => enemy.active).length;
    this.spawnDirector.update(seconds, this.elapsed, activeEnemies, (request) => this.spawnEnemy(request.type, request.angle));
    if (this.spawnDirector.shouldSpawnBoss(this.elapsed) && !this.enemies.some((enemy) => enemy.active && enemy.isBoss)) this.spawnBoss();

    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      const markerBoost = this.markerBoostFor(enemy);
      const reached = enemy.update(seconds, this.elapsed, { x: 0, y: 0 }, 1, markerBoost);
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
    this.updateDropperAttacks();
    if (this.core.health <= 0) { this.finish('defeat', this.recorder.lastDamageSource); return; }

    for (const weapon of this.weapons) {
      const intervalMultiplier = Math.max(0.7, 1 - this.supportEffect('rhythm', weapon.slot));
      if (!weapon.advance(seconds, intervalMultiplier)) continue;
      this.fireWeapon(weapon);
      const branchEvery = Math.round(this.supportEffect('branch', weapon.slot));
      if (branchEvery > 0 && weapon.shotsFired % branchEvery === 0) this.fireWeapon(weapon, false, 0.5);
    }
    this.updateGravityFields(seconds);
    this.updateProjectiles(seconds);
    const collisions = collideProjectiles(this.projectiles, this.enemies, this.elapsed, (projectile, enemy) => this.adjustForSpecialEnemy(enemy, projectile.damage, this.weapons.find((weapon) => weapon.id === projectile.sourceWeaponId)?.slot ?? 0));
    for (const collision of collisions) {
      if (collision.damage > 0) {
        const weaponId = collision.projectile.sourceWeaponId ?? 'needle';
        this.recordWeaponDamage(weaponId, collision.damage);
        this.addScore(collision.damage);
      }
      if (collision.destroyed) this.handleEnemyDestroyed(collision.enemy);
      if ((this.state as string) === 'finished') break;
    }
    this.updateEnemyProjectiles();
    this.updateBossActions(seconds);
    this.updateEffects(seconds);
    this.compactEntities();
    this.recorder.survivalTime = this.elapsed;
    if (stage.isEndless) this.updateEndlessMilestone();
    if (!stage.isEndless && this.elapsed >= stage.timeLimit && !this.bossDefeated) this.finish('defeat', `${stage.name}の制限時間内に${BOSSES[stage.boss].name}を止められませんでした`);
    if (this.options.testMode && !this.options.testOutcome && this.elapsed >= 8) this.finish('defeat', 'テスト用の時間切れ');
  }

  private fireWeapon(weapon: Weapon, allowBranch = true, powerFactor = 1): void {
    const range = weapon.stats.range * (1 + this.supportEffect('focus', weapon.slot));
    const target = selectTarget(this.enemies.filter((enemy) => enemy.active), { x: 0, y: 0 }, { angle: this.aimAngle, manual: this.manualAim }, range, this.elapsed);
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
    const speed = (weapon.stats.projectileSpeed ?? 480) * this.options.researchEffects.projectileSpeedMultiplier * (1 + this.supportEffect('focus', weapon.slot));
    for (let index = 0; index < spread; index += 1) {
      const offset = spread === 1 ? 0 : (index - 1) * 0.14;
    this.addProjectile({
        kind: 'needle', x: 0, y: 0, vx: Math.cos(angle + offset) * speed, vy: Math.sin(angle + offset) * speed,
        radius: 6, damage, life: 1.4, piercing, sourceWeaponId: weapon.id,
      });
    }
  }

  private fireRay(weapon: Weapon, angle: number, damage: number): void {
    const width = (weapon.stats.width ?? 18) + (weapon.branch === 'wide' ? 20 : 0);
    this.addLine({ angle, color: WEAPONS.ray.color, life: weapon.branch === 'wide' ? 0.22 : 0.16, maxLife: weapon.branch === 'wide' ? 0.22 : 0.16, width });
    this.hitRay(weapon, angle, width, damage);
    if (weapon.branch === 'reflect') {
      const reflected = angle + Math.PI * 0.72;
      this.addLine({ angle: reflected, color: WEAPONS.ray.color, life: 0.14, maxLife: 0.14, width: width * 0.7 });
      this.hitRay(weapon, reflected, width * 0.7, damage * 0.55);
    }
  }

  private hitRay(weapon: Weapon, angle: number, width: number, damage: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.radius > weapon.stats.range) continue;
      const enemyAngle = Math.atan2(enemy.y, enemy.x);
      const difference = Math.abs(((enemyAngle - angle + Math.PI) % (Math.PI * 2)) - Math.PI);
      if (difference > Math.atan2(width + 18, Math.max(30, enemy.radius))) continue;
      const result = applyDamage(enemy, this.adjustForSpecialEnemy(enemy, damage, weapon.slot), this.elapsed, angle);
      this.recordWeaponDamage(weapon.id, result.amount);
      this.addScore(result.amount);
      if (result.destroyed) this.handleEnemyDestroyed(enemy);
    }
  }

  private fireCluster(weapon: Weapon, target: Enemy | null, angle: number, damage: number): void {
    const radius = weapon.stats.radius ?? 72;
    const targetPoint = target ? { x: target.x, y: target.y } : { x: Math.cos(angle) * 250, y: Math.sin(angle) * 250 };
    this.addFlash({ x: targetPoint.x, y: targetPoint.y, color: WEAPONS.cluster.color, life: 0.45, maxLife: 0.45, radius });
    this.hitArea(weapon, targetPoint.x, targetPoint.y, radius, damage, angle);
    if (weapon.branch === 'split') for (let index = 0; index < 3; index += 1) {
      const splitAngle = angle + index * Math.PI * 2 / 3;
      this.hitArea(weapon, targetPoint.x + Math.cos(splitAngle) * 58, targetPoint.y + Math.sin(splitAngle) * 58, radius * 0.45, damage * 0.3, splitAngle);
    }
    if (weapon.branch === 'residue') this.createGravityField(targetPoint.x, targetPoint.y, 1.8, radius * 0.75, 0, 0, 180, false);
  }

  private fireRepulse(weapon: Weapon, damage: number): void {
    const radius = weapon.stats.radius ?? 165;
    const pushBonus = weapon.branch === 'strong-push' ? 1.5 : 1;
    const push = (weapon.stats.pushDistance ?? 58) * (1 + this.supportEffect('brake', weapon.slot)) * pushBonus;
    this.addLine({ angle: 0, color: WEAPONS.repulse.color, life: 0.3, maxLife: 0.3, width: radius });
    for (const enemy of this.enemies) {
      if (!enemy.active || enemy.radius > radius) continue;
      const result = applyDamage(enemy, this.adjustForSpecialEnemy(enemy, damage, weapon.slot), this.elapsed);
      enemy.applyPush(push, this.elapsed);
      this.recorder.recordControl('pushed', weapon.branch === 'delayed' ? 1.4 : 0.4);
      if (weapon.branch === 'delayed') enemy.applySlow(this.elapsed, 1.4);
      this.recordWeaponDamage(weapon.id, result.amount);
      this.addScore(result.amount);
      if (result.destroyed) this.handleEnemyDestroyed(enemy);
    }
  }

  private fireChain(weapon: Weapon, target: Enemy | null, angle: number, damage: number): void {
    let current = target;
    const hit = new Set<number>();
    let lastPoint = { x: 0, y: 0 };
    const count = weapon.stats.chainCount ?? 3;
    for (let index = 0; index < count && current; index += 1) {
      hit.add(current.id);
      const currentPoint = { x: current.x, y: current.y };
      this.addLine({ angle: Math.atan2(currentPoint.y - lastPoint.y, currentPoint.x - lastPoint.x), color: WEAPONS.chain.color, life: 0.22, maxLife: 0.22, width: 5 });
      const result = applyDamage(current, this.adjustForSpecialEnemy(current, damage * Math.pow(0.8, index), weapon.slot), this.elapsed, Math.atan2(current.y, current.x));
      this.recordWeaponDamage(weapon.id, result.amount);
      this.addScore(result.amount);
      if (result.destroyed) this.handleEnemyDestroyed(current);
      if (this.state === 'finished') return;
      lastPoint = currentPoint;
      current = this.enemies.filter((enemy) => enemy.active && !hit.has(enemy.id) && Math.hypot(enemy.x - lastPoint.x, enemy.y - lastPoint.y) <= 150).sort((a, b) => Math.hypot(a.x - lastPoint.x, a.y - lastPoint.y) - Math.hypot(b.x - lastPoint.x, b.y - lastPoint.y))[0] ?? null;
    }
    if (weapon.branch === 'burst' && lastPoint.x !== 0 && lastPoint.y !== 0) this.hitArea(weapon, lastPoint.x, lastPoint.y, 40, damage * 0.5, angle);
  }

  private fireOrbit(weapon: Weapon, damage: number): void {
    const previous = this.orbitAngles.get(weapon.slot) ?? 0;
    const speed = (weapon.stats.orbitSpeed ?? 1.9) * (weapon.branch === 'many' ? 1.25 : 1);
    const angle = previous + speed * 0.1;
    this.orbitAngles.set(weapon.slot, angle);
    const count = (weapon.stats.count ?? 2) + (weapon.branch === 'many' ? 1 : 0);
    const radius = (weapon.stats.orbitRadius ?? 108) + (weapon.branch === 'outer' ? 38 : 0);
    for (let index = 0; index < count; index += 1) {
      const bladeAngle = angle + index * Math.PI * 2 / count;
      const x = Math.cos(bladeAngle) * radius;
      const y = Math.sin(bladeAngle) * radius;
      for (const enemy of this.enemies) {
        const key = `${weapon.slot}:${enemy.id}`;
        if (!enemy.active || Math.hypot(enemy.x - x, enemy.y - y) > 24) continue;
        if (this.elapsed - (this.orbitHits.get(key) ?? -Infinity) < (weapon.stats.hitCooldown ?? 0.45)) continue;
        this.orbitHits.set(key, this.elapsed);
        const result = applyDamage(enemy, this.adjustForSpecialEnemy(enemy, damage, weapon.slot), this.elapsed, bladeAngle);
        this.recordWeaponDamage(weapon.id, result.amount);
        this.addScore(result.amount);
        if (result.destroyed) this.handleEnemyDestroyed(enemy);
      }
    }
  }

  private fireDisc(weapon: Weapon, angle: number, damage: number): void {
    const speed = (weapon.stats.projectileSpeed ?? 290) * this.options.researchEffects.projectileSpeedMultiplier * (1 + this.supportEffect('focus', weapon.slot));
    this.addProjectile({
      kind: 'disc', x: 0, y: 0, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      radius: 10, damage, life: 4, piercing: 0, bounces: weapon.stats.bounceCount ?? 3, hitCooldown: weapon.stats.hitCooldown ?? 0.3, sourceWeaponId: weapon.id,
    });
  }

  private fireGravity(weapon: Weapon, target: Enemy | null, angle: number, damage: number): void {
    const stats = weapon.stats;
    const safeDistance = stats.safeDistance ?? 180;
    const targetDistance = target ? Math.hypot(target.x, target.y) : 260;
    const distance = Math.max(safeDistance + 12, Math.min(stats.range, targetDistance));
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    this.createGravityField(x, y, stats.duration ?? 2.2, stats.pullRadius ?? 125, damage, stats.pullStrength ?? 34, safeDistance, weapon.branch === 'collapse');
    this.addLine({ angle, color: WEAPONS.gravity.color, life: 0.38, maxLife: 0.38, width: stats.pullRadius ?? 125 });
  }

  private hitArea(weapon: Weapon, x: number, y: number, radius: number, damage: number, attackAngle: number): void {
    for (const enemy of this.enemies) {
      if (!enemy.active || Math.hypot(enemy.x - x, enemy.y - y) > radius) continue;
      const result = applyDamage(enemy, this.adjustForSpecialEnemy(enemy, damage, weapon.slot), this.elapsed, attackAngle);
      this.recordWeaponDamage(weapon.id, result.amount);
      this.addScore(result.amount);
      if (result.destroyed) this.handleEnemyDestroyed(enemy);
      if (this.state === 'finished') return;
    }
  }

  private createGravityField(x: number, y: number, duration: number, radius: number, damage: number, pullStrength: number, safeDistance: number, collapse: boolean): void {
    const fieldLimit = this.effectBudget.effectsLevel === 'standard' ? 24 : this.effectBudget.effectsLevel === 'low' ? 16 : 8;
    if (this.gravityFields.length >= fieldLimit) this.gravityFields.shift();
    this.gravityFields.push({ x, y, life: duration, maxLife: duration, radius, damage, pullStrength, safeDistance, damageTimer: 0, collapse });
  }

  private updateGravityFields(seconds: number): void {
    for (const field of this.gravityFields) {
      field.life -= seconds;
      field.damageTimer -= seconds;
      for (const enemy of this.enemies) {
        if (!enemy.active || Math.hypot(enemy.x - field.x, enemy.y - field.y) > field.radius) continue;
        if (field.pullStrength > 0) {
          enemy.applyPull(field.x, field.y, field.pullStrength * seconds, this.elapsed, field.safeDistance);
          this.recorder.recordControl('pulled', seconds);
        }
        if (field.damage > 0 && field.damageTimer <= 0) {
          const result = applyDamage(enemy, this.adjustForSpecialEnemy(enemy, field.damage, this.weapons.find((item) => item.id === 'gravity')?.slot ?? 0), this.elapsed);
          this.recordWeaponDamage('gravity', result.amount);
          this.addScore(result.amount);
          if (result.destroyed) this.handleEnemyDestroyed(enemy);
        }
      }
      if (field.damageTimer <= 0) field.damageTimer = 0.25;
    }
    for (let index = this.gravityFields.length - 1; index >= 0; index -= 1) {
      const field = this.gravityFields[index];
      if (field && field.life <= 0) {
        if (field.collapse) {
          const weapon = this.weapons.find((item) => item.id === 'gravity');
          if (weapon) this.hitArea(weapon, field.x, field.y, field.radius, weapon.stats.damage * 1.8, 0);
        }
        this.gravityFields.splice(index, 1);
      }
    }
  }

  private updateProjectiles(seconds: number): void {
    for (const projectile of this.projectiles) {
      projectile.update(seconds);
      if (!projectile.active || projectile.kind !== 'disc') continue;
      const distance = Math.hypot(projectile.x, projectile.y);
      if (distance < 325) continue;
      if (projectile.bounces <= 0) { projectile.active = false; continue; }
      const nx = projectile.x / Math.max(1, distance);
      const ny = projectile.y / Math.max(1, distance);
      const dot = projectile.vx * nx + projectile.vy * ny;
      projectile.vx -= 2 * dot * nx;
      projectile.vy -= 2 * dot * ny;
      projectile.x = nx * 324;
      projectile.y = ny * 324;
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
      if (!enemy.active || enemy.type !== 'dropper' || enemy.radius > 250 || enemy.shotCooldown > 0) continue;
      const angle = Math.atan2(enemy.y, enemy.x);
      this.addProjectile({
        kind: 'enemy', x: enemy.x, y: enemy.y, vx: -Math.cos(angle) * 180, vy: -Math.sin(angle) * 180,
        radius: 9, damage: 10, life: 2.2, piercing: 0, enemyProjectile: true,
      });
      enemy.shotCooldown = 1.1;
      this.options.callbacks.onStatus('投下体が遠隔弾を準備しました');
    }
  }

  private updateBossActions(seconds: number): void {
    const boss = this.enemies.find((enemy) => enemy.active && enemy.isBoss);
    if (!boss) return;
    boss.specialCooldown -= seconds;
    if (boss.type === 'designer') {
      if (!this.designerWave && boss.specialCooldown <= 0) {
        const angle = Math.floor(this.rng.next() * 6) * Math.PI / 3;
        this.designerWave = { angle, life: 1.5, maxLife: 1.5 };
        boss.specialCooldown = 6;
        this.options.callbacks.onStatus('群れの設計者が方向を予告しています');
      }
      if (this.designerWave) {
        this.designerWave.life -= seconds;
        if (this.designerWave.life <= 0) {
          const angle = this.designerWave.angle;
          for (let index = 0; index < 3; index += 1) this.spawnEnemy(index === 0 ? 'shell' : 'runner', angle + (index - 1) * 0.16);
          this.designerWave = null;
        }
      }
    }
    if (boss.type === 'echo') {
      if (!this.echoWave && boss.lastHitAt > this.lastEchoHit && boss.specialCooldown <= 0) {
        this.lastEchoHit = boss.lastHitAt;
        const angle = Math.floor(this.rng.next() * 6) * Math.PI / 3 + Math.PI / 6;
        this.echoWave = { angle, life: 1.2, maxLife: 1.2 };
        this.options.callbacks.onStatus('反響核が反射弾の方向を予告しています');
      }
      if (this.echoWave) {
        this.echoWave.life -= seconds;
        if (this.echoWave.life <= 0) {
          const angle = this.echoWave.angle;
          this.addProjectile({
            kind: 'enemy', x: Math.cos(angle) * 325, y: Math.sin(angle) * 325, vx: -Math.cos(angle) * 210, vy: -Math.sin(angle) * 210,
            radius: 10, damage: 10, life: 2.3, piercing: 0, enemyProjectile: true,
          });
          this.echoWave = null;
          boss.specialCooldown = 3;
        }
      }
    }
  }

  private spawnEnemy(type: EnemyId, angle: number): void {
    if (this.enemies.filter((enemy) => enemy.active).length >= Math.min(this.effectBudget.limits.enemies, this.spawnDirector.enemyLimit)) return;
    const stage = STAGES[this.options.stageId];
    const difficulty = 1 + this.elapsed * stage.difficultyFactor;
    this.enemies.push(this.enemyPool.acquire(type, angle, 330, difficulty));
    const notice = ENEMIES[type].name;
    if (notice !== this.lastEnemyNotice) { this.lastEnemyNotice = notice; this.options.callbacks.onStatus(`${notice}が接近中`); }
  }

  private spawnBoss(): void {
    if (this.enemies.filter((enemy) => enemy.active).length >= this.effectBudget.limits.enemies) return;
    const bossId = this.spawnDirector.bossId;
    const stage = STAGES[this.options.stageId];
    const boss = this.enemyPool.acquire(bossId, this.rng.next() * Math.PI * 2, 370, 1 + this.elapsed * stage.difficultyFactor);
    this.enemies.push(boss);
    this.options.callbacks.onStatus(`${BOSSES[bossId].name}が出現しました。予告を見て対応してください`);
  }

  private handleEnemyDestroyed(enemy: Enemy): void {
    if (enemy.isBoss) {
      this.bossDefeated = true;
      this.recorder.bossDefeated = true;
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
      this.spawnEnemy('shard', enemy.angle - 0.2);
      this.spawnEnemy('shard', enemy.angle + 0.2);
    }
    if (this.experience >= this.nextExperience && this.state === 'playing') this.openUpgrade();
  }

  private openUpgrade(): void {
    this.experience -= this.nextExperience;
    this.level += 1;
    this.nextExperience = 16 + this.level * 9;
    const candidates = createUpgradeCandidateList(this.weapons, this.supports, this.core.health, this.rng, this.banned);
    this.upgradePayload = {
      candidates,
      rerollsLeft: (this.level === 2 ? 1 : 0) + this.options.researchEffects.rerolls,
      bansLeft: (this.level === 2 ? 1 : 0) + this.options.researchEffects.bans,
    };
    this.state = 'upgrade';
    this.options.callbacks.onUpgrade(this.upgradePayload);
    this.options.callbacks.onStatus('強化候補を選んでください');
  }

  private finish(outcome: BattleResult['outcome'], cause: string, retired = false): void {
    if (this.state === 'finished') return;
    if (this.testOutcomeTimer !== null) { window.clearTimeout(this.testOutcomeTimer); this.testOutcomeTimer = null; }
    const stage = STAGES[this.options.stageId];
    if (outcome === 'victory' && !retired) this.addScore(stage.clearBonus);
    this.state = 'finished';
    if (cause) this.recorder.lastDamageSource = cause;
    this.recorder.survivalTime = this.elapsed;
    const baseParts = Math.max(20, Math.floor(20 + this.elapsed / 6 + (this.recorder.bossDefeated ? 25 : 0)));
    const parts = Math.floor(baseParts * this.options.researchEffects.partMultiplier);
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
    const activeCount = this.projectiles.filter((projectile) => projectile.active).length;
    const enemyCount = this.projectiles.filter((projectile) => projectile.active && projectile.enemyProjectile).length;
    if (activeCount >= this.effectBudget.limits.projectiles) return null;
    if (options.enemyProjectile && enemyCount >= this.effectBudget.limits.enemyProjectiles) return null;
    const projectile = this.projectilePool.acquire(options);
    this.projectiles.push(projectile);
    return projectile;
  }

  private addLine(effect: LineEffect): void {
    const limit = this.effectBudget.effectsLevel === 'standard' ? 48 : this.effectBudget.effectsLevel === 'low' ? 28 : 14;
    if (this.lines.length >= limit) this.lines.shift();
    this.lines.push(effect);
  }

  private addFlash(effect: FlashEffect): void {
    const limit = this.effectBudget.effectsLevel === 'standard' ? 32 : this.effectBudget.effectsLevel === 'low' ? 20 : 10;
    if (this.flashes.length >= limit) this.flashes.shift();
    this.flashes.push(effect);
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

  private supportEffect(id: SupportId, weaponSlot: number): number {
    return this.supports
      .filter((support) => support.id === id && (support.slot === weaponSlot || (support.slot + 1) % 3 === weaponSlot))
      .reduce((sum, support) => sum + support.value, 0);
  }

  private markerBoostFor(enemy: Enemy): number {
    if (enemy.type === 'marker') return 1;
    return this.enemies.some((marker) => marker.active && marker.type === 'marker' && Math.hypot(marker.x - enemy.x, marker.y - enemy.y) <= 120) ? 1.2 : 1;
  }

  private compactEntities(): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) if (!this.projectiles[index]?.active) this.projectiles.splice(index, 1);
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
    for (const telegraph of this.specialTelegraphs) telegraph.life -= seconds;
    this.particles.update(seconds);
    while (this.flashes[0]?.life <= 0) this.flashes.shift();
    while (this.lines[0]?.life <= 0) this.lines.shift();
    while (this.specialTelegraphs[0]?.life <= 0) this.specialTelegraphs.shift();
  }

  private emitSnapshot(force: boolean): void {
    if (!force && this.elapsed - this.lastSnapshotAt < 0.1) return;
    this.lastSnapshotAt = this.elapsed;
    const snapshot: BattleSnapshot = {
      elapsed: this.elapsed,
      core: this.core.health,
      maxCore: this.core.maxHealth,
      experience: this.experience,
      nextExperience: this.nextExperience,
      score: Math.round(this.recorder.score + this.elapsed * 5 + this.core.health * 20),
      kills: this.recorder.kills,
      enemies: this.enemies.filter((enemy) => enemy.active).map((enemy) => enemy.snapshot({ x: 0, y: 0 })),
      projectiles: this.projectiles.filter((projectile) => projectile.active).map((projectile) => projectile.snapshot()),
      weapons: this.weapons.map((weapon) => ({ id: weapon.id, level: weapon.level, damageDealt: weapon.damageDealt, branch: weapon.branch })),
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
    const width = this.scale.width;
    const height = this.scale.height;
    const cx = width / 2;
    const cy = height / 2;
    const arena = Math.min(width, height) * 0.43;
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
      const alpha = Math.max(0, line.life / line.maxLife);
      if (line.width > 100) { this.graphics.lineStyle(6, line.color, alpha * 0.7); this.graphics.strokeCircle(cx, cy, Math.min(arena, line.width)); }
      else { this.graphics.lineStyle(line.width, line.color, alpha * 0.8); this.graphics.lineBetween(cx, cy, cx + Math.cos(line.angle) * arena, cy + Math.sin(line.angle) * arena); }
    }
    if (this.designerWave) this.drawSpecialLine(cx, cy, arena, this.designerWave.angle, this.designerWave.life / this.designerWave.maxLife, WEAPONS.chain.color, 5);
    if (this.echoWave) this.drawSpecialLine(cx, cy, arena, this.echoWave.angle, this.echoWave.life / this.echoWave.maxLife, WEAPONS.disc.color, 5);
    for (const flash of this.flashes) {
      const alpha = Math.max(0, flash.life / flash.maxLife);
      this.graphics.lineStyle(3, flash.color, alpha);
      this.graphics.strokeCircle(cx + flash.x, cy + flash.y, flash.radius);
    }
    for (const projectile of this.projectiles) if (projectile.active && !projectile.enemyProjectile) this.drawProjectile(projectile, cx, cy);
    for (const particle of this.particles.active()) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      this.graphics.fillStyle(particle.color, alpha * 0.8);
      this.graphics.fillCircle(cx + particle.x, cy + particle.y, 2 + alpha * 2);
    }
    drawDevice(this.graphics, cx, cy, this.weapons.map((weapon) => ({ id: weapon.id, level: weapon.level, damageDealt: weapon.damageDealt, branch: weapon.branch })), this.supports.map((support) => ({ id: support.id, level: support.level, slot: support.slot })));
    for (const enemy of this.enemies) if (enemy.active) drawEnemy(this.graphics, enemy.snapshot({ x: 0, y: 0 }), cx, cy);
    drawTelegraphs(this.graphics, this.enemies.filter((enemy) => enemy.active).map((enemy) => enemy.snapshot({ x: 0, y: 0 })), cx, cy);
    if (this.manualAim) {
      this.graphics.lineStyle(2, 0xfff1a8, 0.7);
      this.graphics.lineBetween(cx, cy, cx + Math.cos(this.aimAngle) * arena, cy + Math.sin(this.aimAngle) * arena);
    }
    for (const projectile of this.projectiles) if (projectile.active && projectile.enemyProjectile) this.drawProjectile(projectile, cx, cy);
  }

  private drawSpecialLine(cx: number, cy: number, arena: number, angle: number, alpha: number, color: number, width: number): void {
    this.graphics.lineStyle(width, color, Math.max(0.2, alpha));
    this.graphics.lineBetween(cx + Math.cos(angle) * 170, cy + Math.sin(angle) * 170, cx + Math.cos(angle) * arena, cy + Math.sin(angle) * arena);
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
    if (Math.hypot(dx, dy) < 18) return;
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
