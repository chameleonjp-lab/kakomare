import Phaser from 'phaser';
import { STAGES } from '../../data/stages';
import { WEAPONS } from '../../data/weapons';
import { ENEMIES } from '../../data/enemies';
import { Core } from '../entities/Core';
import { Enemy } from '../entities/Enemy';
import { Projectile } from '../entities/Projectile';
import { SupportModule } from '../entities/SupportModule';
import { Weapon } from '../entities/Weapon';
import { EnemyPool } from '../pools/EnemyPool';
import { ProjectilePool } from '../pools/ProjectilePool';
import { ParticlePool } from '../pools/ParticlePool';
import { FixedStepClock } from '../systems/FixedStepClock';
import { SpawnDirector, seedFromStage, DeterministicRng } from '../systems/SpawnDirector';
import { selectTarget } from '../systems/TargetingSystem';
import { applyContactDamage, applyDamage } from '../systems/DamageSystem';
import { collideProjectiles } from '../systems/CollisionSystem';
import { EffectBudget, type EffectsLevel } from '../systems/EffectBudget';
import { RunRecorder } from '../systems/RunRecorder';
import { createUpgradeCandidateList, applyUpgradeCandidate } from '../systems/UpgradeSystem';
import { drawEnemy } from '../render/EnemyRenderer';
import { drawDevice } from '../render/WeaponRenderer';
import { drawTelegraphs } from '../render/TelegraphRenderer';
import type { StageId } from '../../types/content';
import type { BattleCallbacks, BattleResult, BattleSnapshot, Point, UpgradeCandidate, UpgradePayload } from '../../types/game';

export interface BattleSceneOptions {
  stageId: StageId;
  effectsLevel: EffectsLevel;
  reducedMotion: boolean;
  aimAssist: 'standard' | 'strong';
  seed?: number;
  testMode?: boolean;
  testOutcome?: 'victory' | 'defeat';
  testUpgrade?: boolean;
  callbacks: BattleCallbacks;
}

interface FlashEffect { x: number; y: number; color: number; life: number; maxLife: number; radius: number }
interface LineEffect { angle: number; color: number; life: number; maxLife: number; width: number }

export class BattleScene extends Phaser.Scene {
  private readonly options: BattleSceneOptions;
  private readonly core = new Core();
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
  private readonly recorder: RunRecorder;
  private readonly spawnDirector: SpawnDirector;
  private readonly rng: DeterministicRng;
  private readonly effectBudget: EffectBudget;
  private graphics!: Phaser.GameObjects.Graphics;
  private elapsed = 0;
  private experience = 0;
  private level = 1;
  private nextExperience = 25;
  private aimAngle = -Math.PI / 2;
  private manualAim = false;
  private aimPointerId: number | null = null;
  private aimStart: Point | null = null;
  private aimReleaseAt = 0;
  private state: 'playing' | 'upgrade' | 'paused' | 'finished' = 'playing';
  private upgradePayload: UpgradePayload | null = null;
  private readonly banned = new Set<string>();
  private bossDefeated = false;
  private testUpgradeOpened = false;
  private lastSnapshotAt = -Infinity;
  private lastEnemyNotice = '';

  public constructor(options: BattleSceneOptions) {
    super({ key: 'KakomareBattleScene' });
    this.options = options;
    this.recorder = new RunRecorder(options.stageId);
    const seed = options.seed ?? seedFromStage(options.stageId, Date.now(), 1);
    this.rng = new DeterministicRng(seed);
    this.spawnDirector = new SpawnDirector(options.stageId, seed, options.testMode ?? false);
    this.effectBudget = new EffectBudget(options.effectsLevel);
  }

  public create(): void {
    this.graphics = this.add.graphics();
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.handlePointerUp, this);
    this.input.on('pointerupoutside', this.handlePointerUp, this);
    this.input.keyboard?.on('keydown-ESC', () => this.requestPause());
    this.options.callbacks.onStatus('戦闘開始');
    this.emitSnapshot(true);
  }

  public update(_time: number, delta: number): void {
    if (this.state === 'finished') return;
    const frameStart = performance.now();
    this.clock.advance(delta / 1000, (seconds) => this.step(seconds));
    this.effectBudget.sample(performance.now() - frameStart, this.elapsed, this.options.reducedMotion);
    this.renderScene();
    this.emitSnapshot(false);
  }

  public chooseUpgrade(candidate: UpgradeCandidate): void {
    if (this.state !== 'upgrade' || !this.upgradePayload || !this.upgradePayload.candidates.some((item) => item.id === candidate.id)) return;
    applyUpgradeCandidate(candidate, this.weapons, this.supports, (amount) => this.core.heal(amount));
    this.recorder.upgrades.push(candidate.title);
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

  public requestPause(): void {
    if (this.state === 'playing') this.pause();
  }

  public resume(): void {
    if (this.state === 'paused') { this.state = 'playing'; this.options.callbacks.onStatus('戦闘再開'); }
  }

  public get paused(): boolean {
    return this.state === 'paused';
  }

  public retire(): void {
    if (this.state === 'finished') return;
    this.finish('defeat', 'プレイを終了しました');
  }

  public shutdownBattle(): void {
    this.state = 'finished';
    this.input.removeAllListeners();
  }

  private step(seconds: number): void {
    if (this.state !== 'playing') return;
    this.elapsed += seconds;
    if (this.manualAim && this.aimPointerId === null && this.elapsed >= this.aimReleaseAt) this.manualAim = false;
    if (this.options.testMode && this.options.testOutcome === 'defeat' && this.elapsed >= 1.8) { this.finish('defeat', 'テスト用の敗北'); return; }
    if (this.options.testMode && this.options.testOutcome === 'victory' && this.elapsed >= 2.8) { this.finish('victory', 'テスト用の勝利'); return; }
    if (this.options.testMode && this.options.testUpgrade && !this.testUpgradeOpened && this.elapsed >= 0.7) { this.testUpgradeOpened = true; this.openUpgrade(); return; }
    const stage = STAGES[this.options.stageId];
    const activeEnemies = this.enemies.filter((enemy) => enemy.active).length;
    this.spawnDirector.update(seconds, this.elapsed, activeEnemies, (request) => this.spawnEnemy(request.type, request.angle));
    if (this.spawnDirector.shouldSpawnBoss(this.elapsed)) this.spawnBoss();

    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      const reached = enemy.update(seconds, this.elapsed, { x: 0, y: 0 }, 1);
      if (reached) {
        const damage = applyContactDamage(this.core, enemy);
        if (damage > 0) {
          this.recorder.recordContact(enemy.angle, damage, `${enemy.isBoss ? '回転冠' : ENEMIES[enemy.type as keyof typeof ENEMIES].name}の接触`);
          this.options.callbacks.onStatus(`コアが${Math.round(damage)}ダメージを受けました`);
        }
      }
      if (enemy.isBoss) enemy.invulnerable = Math.floor(this.elapsed / 2.4) % 3 === 1;
    }
    if (this.core.health <= 0) { this.finish('defeat', this.recorder.lastDamageSource); return; }

    for (const weapon of this.weapons) {
      const weaponIntervalMultiplier = Math.max(0.7, 1 - this.supportEffect('rhythm', weapon.slot));
      if (!weapon.advance(seconds, weaponIntervalMultiplier)) continue;
      this.fireWeapon(weapon);
    }
    for (const projectile of this.projectiles) projectile.update(seconds);
    const collisions = collideProjectiles(this.projectiles, this.enemies, this.elapsed);
    for (const collision of collisions) {
      if (collision.damage > 0) {
        this.recorder.recordWeaponDamage(collision.projectile.kind === 'needle' ? 'needle' : 'cluster', collision.damage);
        this.addScore(collision.damage);
      }
      if (collision.destroyed) this.handleEnemyDestroyed(collision.enemy);
    }
    this.updateEffects(seconds);
    this.compactEntities();
    this.recorder.survivalTime = this.elapsed;
    if (this.elapsed >= stage.timeLimit && !this.bossDefeated) this.finish('defeat', '制限時間内に回転冠を止められませんでした');
    if (this.options.testMode && !this.options.testOutcome && this.elapsed >= 8) this.finish('defeat', 'テスト用の時間切れ');
  }

  private fireWeapon(weapon: Weapon): void {
    const target = selectTarget(this.enemies.filter((enemy) => enemy.active), { x: 0, y: 0 }, { angle: this.aimAngle, manual: this.manualAim }, weapon.stats.range, this.elapsed);
    const angle = target ? Math.atan2(target.y, target.x) : this.aimAngle;
    const damage = weapon.stats.damage * weapon.damageMultiplier * (1 + this.supportEffect('output', weapon.slot));
    if (weapon.id === 'needle') {
      const projectile = this.projectilePool.acquire({ kind: 'needle', x: 0, y: 0, vx: Math.cos(angle) * (weapon.stats.projectileSpeed ?? 480), vy: Math.sin(angle) * (weapon.stats.projectileSpeed ?? 480), radius: 6, damage, life: 1.4, piercing: weapon.stats.pierce ?? 0 });
      this.projectiles.push(projectile);
      this.options.callbacks.onStatus('連針砲を発射');
    } else if (weapon.id === 'ray') {
      this.lines.push({ angle, color: WEAPONS.ray.color, life: 0.16, maxLife: 0.16, width: weapon.stats.width ?? 18 });
      for (const enemy of this.enemies) {
        if (!enemy.active || enemy.radius > weapon.stats.range) continue;
        const enemyAngle = Math.atan2(enemy.y, enemy.x);
        const difference = Math.abs(((enemyAngle - angle + Math.PI) % (Math.PI * 2)) - Math.PI);
        if (difference <= Math.atan2((weapon.stats.width ?? 18) + 18, Math.max(30, enemy.radius))) {
          const result = applyDamage(enemy, damage, this.elapsed);
          this.recorder.recordWeaponDamage('ray', result.amount);
          this.addScore(result.amount);
          if (result.destroyed) this.handleEnemyDestroyed(enemy);
        }
      }
    } else if (weapon.id === 'cluster') {
      const targetPoint = target ? { x: target.x, y: target.y } : { x: Math.cos(angle) * 250, y: Math.sin(angle) * 250 };
      this.flashes.push({ x: targetPoint.x, y: targetPoint.y, color: WEAPONS.cluster.color, life: 0.45, maxLife: 0.45, radius: weapon.stats.radius ?? 72 });
      for (const enemy of this.enemies) {
        if (!enemy.active || Math.hypot(enemy.x - targetPoint.x, enemy.y - targetPoint.y) > (weapon.stats.radius ?? 72)) continue;
        const result = applyDamage(enemy, damage, this.elapsed);
        this.recorder.recordWeaponDamage('cluster', result.amount);
        this.addScore(result.amount);
        if (result.destroyed) this.handleEnemyDestroyed(enemy);
      }
    } else {
      const radius = weapon.stats.radius ?? 165;
      this.lines.push({ angle: 0, color: WEAPONS.repulse.color, life: 0.3, maxLife: 0.3, width: radius });
      const push = (weapon.stats.pushDistance ?? 58) * (1 + this.supportEffect('brake', weapon.slot));
      for (const enemy of this.enemies) {
        if (!enemy.active || enemy.radius > radius) continue;
        const result = applyDamage(enemy, damage, this.elapsed);
        enemy.applyPush(push, this.elapsed);
        this.recorder.recordWeaponDamage('repulse', result.amount);
        this.addScore(result.amount);
        if (result.destroyed) this.handleEnemyDestroyed(enemy);
      }
    }
    weapon.damageDealt = (weapon.damageDealt ?? 0) + damage;
  }

  private spawnEnemy(type: keyof typeof ENEMIES, angle: number): void {
    if (this.enemies.filter((enemy) => enemy.active).length >= this.effectBudget.limits.enemies) return;
    const difficulty = 1 + this.elapsed * 0.003;
    this.enemies.push(this.enemyPool.acquire(type, angle, 330, difficulty));
    const notice = ENEMIES[type].name;
    if (notice !== this.lastEnemyNotice) { this.lastEnemyNotice = notice; this.options.callbacks.onStatus(`${notice}が接近中`); }
  }

  private spawnBoss(): void {
    const boss = this.enemyPool.acquire('crown', this.rng.next() * Math.PI * 2, 370, 1 + this.elapsed * 0.003);
    this.enemies.push(boss);
    this.options.callbacks.onStatus('回転冠が出現しました。盾の隙間を狙ってください');
  }

  private handleEnemyDestroyed(enemy: Enemy): void {
    if (enemy.isBoss) {
      this.bossDefeated = true;
      this.recorder.bossDefeated = true;
      this.addScore(2000);
      this.finish('victory', '');
      return;
    }
    this.recorder.kills += 1;
    this.addScore(10 * (1 + ENEMIES[enemy.type as keyof typeof ENEMIES].threatCost));
    this.experience += enemy.type === 'spore' ? 8 : 4;
    this.flashes.push({ x: enemy.x, y: enemy.y, color: ENEMIES[enemy.type as keyof typeof ENEMIES].color, life: 0.32, maxLife: 0.32, radius: 26 });
    if (enemy.type === 'spore' && !enemy.splitDone) {
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
    this.upgradePayload = { candidates, rerollsLeft: this.level === 2 ? 1 : 0, bansLeft: this.level === 2 ? 1 : 0 };
    this.state = 'upgrade';
    this.options.callbacks.onUpgrade(this.upgradePayload);
    this.options.callbacks.onStatus('強化候補を選んでください');
  }

  private finish(outcome: BattleResult['outcome'], cause: string): void {
    if (this.state === 'finished') return;
    this.state = 'finished';
    if (cause) this.recorder.lastDamageSource = cause;
    this.recorder.survivalTime = this.elapsed;
    const parts = Math.max(20, Math.floor(20 + this.elapsed / 6 + (this.bossDefeated ? 25 : 0)));
    const result = this.recorder.result(outcome, this.core.health, parts);
    this.options.callbacks.onFinish(result);
  }

  private addScore(amount: number): void {
    this.recorder.score += amount;
  }

  private supportEffect(id: 'output' | 'rhythm' | 'brake', weaponSlot: number): number {
    return this.supports
      .filter((support) => support.id === id && (support.slot === weaponSlot || (support.slot + 1) % 3 === weaponSlot))
      .reduce((sum, support) => sum + support.value, 0);
  }

  private compactEntities(): void {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) if (!this.projectiles[index]?.active) this.projectiles.splice(index, 1);
    for (let index = this.enemies.length - 1; index >= 0; index -= 1) if (!this.enemies[index]?.active) this.enemies.splice(index, 1);
  }

  private updateEffects(seconds: number): void {
    for (const flash of this.flashes) { flash.life -= seconds; flash.radius += seconds * 80; }
    for (const line of this.lines) line.life -= seconds;
    this.particles.update(seconds);
    while (this.flashes[0]?.life <= 0) this.flashes.shift();
    while (this.lines[0]?.life <= 0) this.lines.shift();
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
      weapons: this.weapons.map((weapon) => ({ id: weapon.id, level: weapon.level, damageDealt: weapon.damageDealt })),
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
    for (const line of this.lines) {
      const alpha = Math.max(0, line.life / line.maxLife);
      if (line.width > 100) { this.graphics.lineStyle(6, line.color, alpha * 0.7); this.graphics.strokeCircle(cx, cy, Math.min(arena, line.width)); }
      else { this.graphics.lineStyle(line.width, line.color, alpha * 0.8); this.graphics.lineBetween(cx, cy, cx + Math.cos(line.angle) * arena, cy + Math.sin(line.angle) * arena); }
    }
    for (const flash of this.flashes) {
      const alpha = Math.max(0, flash.life / flash.maxLife);
      this.graphics.lineStyle(3, flash.color, alpha);
      this.graphics.strokeCircle(cx + flash.x, cy + flash.y, flash.radius);
    }
    for (const projectile of this.projectiles) {
      if (!projectile.active) continue;
      this.graphics.fillStyle(projectile.enemyProjectile ? 0xfff1a8 : 0x63d7e6, 1);
      this.graphics.fillCircle(cx + projectile.x, cy + projectile.y, projectile.radius);
      this.graphics.lineStyle(2, projectile.enemyProjectile ? 0xff706a : 0x63d7e6, 0.7);
      this.graphics.lineBetween(cx + projectile.x - projectile.vx * 0.025, cy + projectile.y - projectile.vy * 0.025, cx + projectile.x, cy + projectile.y);
    }
    drawDevice(this.graphics, cx, cy, this.weapons.map((weapon) => ({ id: weapon.id, level: weapon.level, damageDealt: weapon.damageDealt })), this.supports.map((support) => ({ id: support.id, level: support.level, slot: support.slot })));
    for (const enemy of this.enemies) if (enemy.active) drawEnemy(this.graphics, enemy.snapshot({ x: 0, y: 0 }), cx, cy);
    drawTelegraphs(this.graphics, this.enemies.filter((enemy) => enemy.active).map((enemy) => enemy.snapshot({ x: 0, y: 0 })), cx, cy);
    if (this.manualAim) {
      this.graphics.lineStyle(2, 0xfff1a8, 0.7);
      this.graphics.lineBetween(cx, cy, cx + Math.cos(this.aimAngle) * arena, cy + Math.sin(this.aimAngle) * arena);
    }
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.state !== 'playing') return;
    this.aimPointerId = pointer.id;
    this.aimStart = { x: pointer.x, y: pointer.y };
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.state !== 'playing' || this.aimPointerId !== pointer.id || !this.aimStart) return;
    const dx = pointer.x - this.aimStart.x;
    const dy = pointer.y - this.aimStart.y;
    if (Math.hypot(dx, dy) < 18) return;
    this.aimAngle = Math.atan2(dy, dx);
    this.manualAim = true;
    this.aimReleaseAt = this.elapsed + 0.8;
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer): void {
    if (this.aimPointerId !== pointer.id) return;
    this.aimPointerId = null;
    this.aimStart = null;
    this.aimReleaseAt = this.elapsed + 0.8;
    this.manualAim = true;
  }
}
