import { ENEMIES } from '../../data/enemies';
import { BOSSES } from '../../data/bosses';
import type { BossId, EnemyId } from '../../types/content';
import type { EnemySnapshot, Point } from '../../types/game';
import { angularDistance } from '../systems/Angle';
import type { ImpactAngle } from '../systems/ImpactDirection';

function isBossId(type: EnemyId | BossId): type is BossId {
  return type === 'crown' || type === 'designer' || type === 'echo' || type === 'gate' || type === 'weaver' || type === 'reactor';
}

export const DROPPER_SHOT_INTERVAL_SECONDS = 1.1;
export const DROPPER_TELEGRAPH_SECONDS = 0.6;

export class Enemy {
  public id: number;
  public readonly type: EnemyId | BossId;
  public readonly isBoss: boolean;
  public angle: number;
  public x: number;
  public y: number;
  public distanceToCore: number;
  public hp: number;
  public maxHp: number;
  public shieldHits: number;
  public invulnerable = false;
  public telegraph = false;
  public telegraphPhase = 0;
  public shieldRotation = 0;
  public slowUntil = 0;
  public markedUntil = 0;
  public burningUntil = 0;
  public active = true;
  public splitDone = false;
  public contactDamage: number;
  public speed: number;
  public shotCooldown = 0;
  public specialCooldown = 0;
  public pressureCooldown = 0;
  public lastHitAt = -Infinity;
  public specialDamageTaken = 0;
  public summoned = false;
  public summonedChildren = 0;
  private age = 0;
  /** Radial path state stays separate from the runner's visual wobble. */
  private movementAngle = 0;
  private movementDistance = 0;

  public constructor(id: number, type: EnemyId | BossId, angle: number, distanceToCore: number, difficulty = 1, speedMultiplierCap = 1.25) {
    this.id = id;
    this.type = type;
    this.isBoss = isBossId(type);
    this.angle = angle;
    this.x = 0;
    this.y = 0;
    this.distanceToCore = distanceToCore;
    this.hp = 0;
    this.maxHp = 0;
    this.shieldHits = 0;
    this.contactDamage = 0;
    this.speed = 0;
    this.reset(id, angle, distanceToCore, difficulty, speedMultiplierCap);
  }

  public reset(id: number, angle: number, distanceToCore: number, difficulty = 1, speedMultiplierCap = 1.25): void {
    const definition = this.isBoss ? BOSSES[this.type as BossId] : ENEMIES[this.type as EnemyId];
    this.id = id;
    this.angle = angle;
    this.maxHp = definition.hp * difficulty;
    this.hp = this.maxHp;
    this.contactDamage = this.isBoss ? 0 : ENEMIES[this.type as EnemyId].contactDamage;
    this.speed = definition.speed * Math.min(speedMultiplierCap, 1 + (difficulty - 1) * 0.3);
    this.distanceToCore = distanceToCore;
    this.x = Math.cos(angle) * distanceToCore;
    this.y = Math.sin(angle) * distanceToCore;
    this.movementAngle = angle;
    this.movementDistance = distanceToCore;
    this.shieldHits = this.type === 'lattice' ? 8 : this.type === 'guard' ? 4 : 0;
    this.invulnerable = false;
    this.telegraph = false;
    this.telegraphPhase = 0;
    this.shieldRotation = 0;
    this.slowUntil = 0;
    this.markedUntil = 0;
    this.burningUntil = 0;
    this.active = true;
    this.splitDone = false;
    this.shotCooldown = this.type === 'dropper' ? DROPPER_SHOT_INTERVAL_SECONDS : 0;
    this.specialCooldown = this.isBoss ? 1.2 : this.type === 'charger' ? 2.8 : this.type === 'repair' || this.type === 'factory' ? 2 : 0;
    this.pressureCooldown = this.isBoss ? (BOSSES[this.type as BossId].pressure?.interval ?? 0) : 0;
    this.lastHitAt = -Infinity;
    this.specialDamageTaken = 0;
    this.summoned = false;
    this.summonedChildren = 0;
    this.age = 0;
  }

  public update(seconds: number, elapsed: number, core: Point, movementMultiplier: number, speedMultiplier = 1): boolean {
    if (!this.active) return false;
    this.age += seconds;
    if (this.type === 'charger' || this.type === 'repair' || this.type === 'factory') {
      this.specialCooldown -= seconds;
      if (this.specialCooldown <= 0) this.specialCooldown = this.type === 'charger' ? 2.8 : 2;
      this.telegraph = this.specialCooldown <= (this.type === 'charger' ? 0.9 : 0.65);
    }
    const isStopped = (this.isBoss && this.movementDistance <= 196) || (this.type === 'dropper' && this.movementDistance <= 250);
    const slow = elapsed < this.slowUntil ? 0.55 : 1;
    if (!isStopped) this.movementDistance = Math.max(0, this.movementDistance - this.speed * slow * movementMultiplier * speedMultiplier * seconds);
    this.x = core.x + Math.cos(this.movementAngle) * this.movementDistance;
    this.y = core.y + Math.sin(this.movementAngle) * this.movementDistance;
    if (this.type === 'runner') this.y += Math.sin(elapsed * 8 + this.id) * 2;
    // Keep the wobble visual and frame-local.  The next tick starts from the
    // same radial path instead of feeding the offset back into the path angle.
    this.syncPolarPosition(core, true);
    this.angle = this.movementAngle;
    if (this.type === 'dropper') {
      if (this.distanceToCore <= 250) this.shotCooldown -= seconds;
      this.telegraph = this.distanceToCore <= 250
        && this.shotCooldown > 0
        && this.shotCooldown <= DROPPER_TELEGRAPH_SECONDS;
    }
    if (this.type === 'charger' && !this.telegraph && this.specialCooldown > 2.35) {
      this.movementDistance = Math.max(0, this.movementDistance - this.speed * 2.8 * seconds);
    }
    if (this.type === 'phase') {
      const cycle = this.age % 1.4;
      this.invulnerable = cycle >= 0.85;
      this.telegraph = cycle >= 0.6;
      this.telegraphPhase = cycle;
    } else {
      this.telegraphPhase = 0;
    }
    if (this.type === 'crown') {
      const phase = this.age % 16;
      this.shieldRotation = (phase <= 8 ? phase : 16 - phase) * 0.9;
    }
    if (this.type === 'gate') this.telegraph = this.pressureCooldown <= 0;
    if (this.type === 'designer' || this.type === 'echo' || this.type === 'weaver' || this.type === 'reactor') this.telegraph = this.specialCooldown <= 0;
    return !this.isBoss && this.distanceToCore <= 52;
  }

  public damage(amount: number, elapsed: number, attackAngle: ImpactAngle = 0): { dealt: number; destroyed: boolean; blocked: boolean } {
    if (!this.active || this.invulnerable) return { dealt: 0, destroyed: false, blocked: true };
    if ((this.type === 'lattice' || this.type === 'guard') && this.shieldHits > 0) {
      this.shieldHits -= 1;
      return { dealt: 0, destroyed: false, blocked: true };
    }
    if (this.type === 'crown' && this.isShielded(attackAngle)) return { dealt: 0, destroyed: false, blocked: true };
    const limited = this.type === 'crown' ? Math.min(60, amount) : this.type === 'shell' ? Math.min(24, amount) : amount;
    const dealt = Math.max(0, Math.min(this.hp, limited));
    this.hp -= dealt;
    if (this.type === 'echo') this.specialDamageTaken += dealt;
    this.lastHitAt = elapsed;
    const destroyed = this.hp <= 0;
    if (destroyed) this.active = false;
    return { dealt, destroyed, blocked: false };
  }

  public applyPush(distance: number, elapsed: number): void {
    if (!this.active || this.isBoss) {
      if (this.isBoss) this.applySlow(elapsed, 0.4);
      return;
    }
    this.distanceToCore = Math.min(700, this.distanceToCore + Math.max(0, distance));
    this.movementDistance = this.distanceToCore;
    this.movementAngle = this.angle;
    this.x = Math.cos(this.movementAngle) * this.movementDistance;
    this.y = Math.sin(this.movementAngle) * this.movementDistance;
    this.applySlow(elapsed, 0.4);
  }

  public applyPull(targetX: number, targetY: number, distance: number, elapsed: number, safeDistance = 180): void {
    if (!this.active || this.isBoss) {
      if (this.isBoss) this.applySlow(elapsed, 0.4);
      return;
    }
    const currentDistance = Math.hypot(this.x, this.y);
    const minimumDistance = Math.max(0, safeDistance);
    const availableDistance = Math.max(0, currentDistance - minimumDistance);
    const targetDistance = Math.hypot(targetX - this.x, targetY - this.y);
    const moveDistance = Math.min(availableDistance, Math.max(0, distance), targetDistance);
    if (moveDistance > 0) {
      const targetAngle = Math.atan2(targetY - this.y, targetX - this.x);
      if (targetDistance > 1e-6) {
        const unitX = Math.cos(targetAngle);
        const unitY = Math.sin(targetAngle);
        let allowedDistance = moveDistance;
        if (minimumDistance > 0) {
          // Find the first point where this one-update segment reaches the
          // safety circle.  Clamping the segment parameter (rather than
          // projecting the endpoint) keeps displacement <= the requested
          // pull distance even for an off-axis field.
          const radialDot = this.x * unitX + this.y * unitY;
          const discriminant = radialDot * radialDot - (currentDistance * currentDistance - minimumDistance * minimumDistance);
          if (discriminant >= 0) {
            const boundaryDistance = -radialDot - Math.sqrt(discriminant);
            if (boundaryDistance >= 0 && boundaryDistance < allowedDistance) allowedDistance = boundaryDistance;
          }
        }
        const nextX = this.x + unitX * allowedDistance;
        const nextY = this.y + unitY * allowedDistance;
        this.x = nextX;
        this.y = nextY;
      }
    }
    this.syncPolarPosition({ x: 0, y: 0 });
    this.applySlow(elapsed, 0.4);
  }

  public applySlow(elapsed: number, duration: number): void {
    this.slowUntil = Math.max(this.slowUntil, elapsed + duration);
  }

  public snapshot(core: Point, elapsed = 0): EnemySnapshot {
    const slowFactor = this.slowUntil > elapsed ? 0.55 : 1;
    const state: EnemySnapshot['state'] = this.invulnerable
      ? 'invulnerable'
      : this.telegraph
        ? 'telegraph'
        : this.shieldHits > 0
          ? 'shielded'
          : slowFactor < 1 ? 'slowed' : 'normal';
    return {
      id: this.id,
      type: this.type,
      x: this.x - core.x,
      y: this.y - core.y,
      distanceToCore: this.distanceToCore,
      hitRadius: this.hitRadius,
      hp: this.hp,
      maxHp: this.maxHp,
      shieldHits: this.shieldHits,
      isBoss: this.isBoss,
      invulnerable: this.invulnerable,
      telegraph: this.telegraph,
      telegraphPhase: this.type === 'phase' ? this.telegraphPhase : undefined,
      slowFactor,
      shieldRotation: this.isBoss ? this.shieldRotation : undefined,
      marked: this.markedUntil > elapsed,
      burning: this.burningUntil > elapsed,
      state,
      age: this.age,
      shotCooldown: this.shotCooldown,
      specialCooldown: this.specialCooldown,
      pressureCooldown: this.pressureCooldown,
      splitDone: this.splitDone,
      summoned: this.summoned,
      summonedChildren: this.summonedChildren,
      slowRemaining: Math.max(0, this.slowUntil - elapsed),
      markedRemaining: Math.max(0, this.markedUntil - elapsed),
      burningRemaining: Math.max(0, this.burningUntil - elapsed),
      movementAngle: this.movementAngle,
      movementDistance: this.movementDistance,
      specialDamageTaken: this.specialDamageTaken,
    };
  }

  /** Restore the observable and timer state at a safe update boundary. */
  public restore(snapshot: EnemySnapshot, elapsed: number, core: Point = { x: 0, y: 0 }): boolean {
    if (snapshot.type !== this.type || snapshot.isBoss !== this.isBoss || !Number.isFinite(snapshot.x) || !Number.isFinite(snapshot.y)
      || !Number.isFinite(snapshot.distanceToCore) || snapshot.distanceToCore < 0 || !Number.isFinite(snapshot.hp) || !Number.isFinite(snapshot.maxHp)
      || snapshot.maxHp <= 0 || snapshot.hp < 0 || snapshot.hp > snapshot.maxHp || !Number.isFinite(snapshot.hitRadius) || snapshot.hitRadius < 0
      || !Number.isFinite(snapshot.shieldHits) || snapshot.shieldHits < 0 || !Number.isFinite(snapshot.slowFactor) || snapshot.slowFactor <= 0) return false;
    this.id = snapshot.id;
    this.maxHp = snapshot.maxHp;
    this.hp = snapshot.hp;
    this.distanceToCore = snapshot.distanceToCore;
    this.x = snapshot.x + core.x;
    this.y = snapshot.y + core.y;
    this.angle = Math.atan2(this.y - core.y, this.x - core.x);
    const movementAngle = typeof snapshot.movementAngle === 'number' && Number.isFinite(snapshot.movementAngle) ? snapshot.movementAngle : this.angle;
    const movementDistance = typeof snapshot.movementDistance === 'number' && Number.isFinite(snapshot.movementDistance) ? snapshot.movementDistance : snapshot.distanceToCore;
    this.movementAngle = movementAngle;
    this.movementDistance = Math.max(0, movementDistance);
    this.shieldHits = Math.max(0, Math.floor(snapshot.shieldHits));
    this.invulnerable = snapshot.invulnerable;
    this.telegraph = snapshot.telegraph;
    this.telegraphPhase = snapshot.telegraphPhase ?? 0;
    this.shieldRotation = snapshot.shieldRotation ?? 0;
    this.age = typeof snapshot.age === 'number' && Number.isFinite(snapshot.age) ? Math.max(0, snapshot.age) : 0;
    this.shotCooldown = typeof snapshot.shotCooldown === 'number' && Number.isFinite(snapshot.shotCooldown) ? snapshot.shotCooldown : 0;
    this.specialCooldown = typeof snapshot.specialCooldown === 'number' && Number.isFinite(snapshot.specialCooldown) ? snapshot.specialCooldown : 0;
    this.pressureCooldown = typeof snapshot.pressureCooldown === 'number' && Number.isFinite(snapshot.pressureCooldown) ? snapshot.pressureCooldown : 0;
    this.splitDone = snapshot.splitDone === true;
    this.summoned = snapshot.summoned === true;
    this.summonedChildren = Number.isInteger(snapshot.summonedChildren) ? Math.max(0, snapshot.summonedChildren!) : 0;
    this.specialDamageTaken = typeof snapshot.specialDamageTaken === 'number' && Number.isFinite(snapshot.specialDamageTaken) ? Math.max(0, snapshot.specialDamageTaken) : 0;
    this.slowUntil = elapsed + (typeof snapshot.slowRemaining === 'number' && Number.isFinite(snapshot.slowRemaining) ? Math.max(0, snapshot.slowRemaining) : snapshot.slowFactor < 1 ? 0.1 : 0);
    this.markedUntil = elapsed + (typeof snapshot.markedRemaining === 'number' && Number.isFinite(snapshot.markedRemaining) ? Math.max(0, snapshot.markedRemaining) : snapshot.marked ? 0.1 : 0);
    this.burningUntil = elapsed + (typeof snapshot.burningRemaining === 'number' && Number.isFinite(snapshot.burningRemaining) ? Math.max(0, snapshot.burningRemaining) : snapshot.burning ? 0.1 : 0);
    this.active = true;
    return true;
  }

  public get hitRadius(): number {
    return this.isBoss
      ? BOSSES[this.type as BossId].hitRadius ?? 16
      : ENEMIES[this.type as EnemyId].hitRadius ?? 16;
  }

  private isShielded(attackAngle: ImpactAngle): boolean {
    // An area effect whose center is exactly on the victim has no unique
    // incoming face. Treat it as omnidirectional rather than picking an
    // arbitrary plate from floating point noise.
    if (attackAngle === null) return false;
    const rotation = this.shieldRotation;
    const halfAngle = BOSSES.crown.shieldHalfAngle ?? 0.22;
    for (let index = 0; index < 3; index += 1) {
      const plate = rotation + index * Math.PI * 2 / 3;
      if (angularDistance(attackAngle, plate) < halfAngle) return true;
    }
    return false;
  }

  private syncPolarPosition(core: Point, preservePath = false): void {
    const relativeX = this.x - core.x;
    const relativeY = this.y - core.y;
    const distance = Math.hypot(relativeX, relativeY);
    this.distanceToCore = Number.isFinite(distance) ? distance : 0;
    if (distance > 1e-6 && !preservePath) {
      this.angle = Math.atan2(relativeY, relativeX);
      this.movementAngle = this.angle;
      this.movementDistance = distance;
    }
  }
}
