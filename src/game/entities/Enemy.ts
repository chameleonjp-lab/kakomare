import { ENEMIES } from '../../data/enemies';
import { BOSSES } from '../../data/bosses';
import type { BossId, EnemyId } from '../../types/content';
import type { EnemySnapshot, Point } from '../../types/game';

function isBossId(type: EnemyId | BossId): type is BossId {
  return type === 'crown' || type === 'designer' || type === 'echo';
}

export class Enemy {
  public id: number;
  public readonly type: EnemyId | BossId;
  public readonly isBoss: boolean;
  public angle: number;
  public x: number;
  public y: number;
  public radius: number;
  public hp: number;
  public maxHp: number;
  public shieldHits: number;
  public invulnerable = false;
  public telegraph = false;
  public shieldRotation = 0;
  public slowUntil = 0;
  public active = true;
  public splitDone = false;
  public contactDamage: number;
  public speed: number;
  public shotCooldown = 0;
  public specialCooldown = 0;
  public lastHitAt = -Infinity;
  public specialDamageTaken = 0;
  private age = 0;

  public constructor(id: number, type: EnemyId | BossId, angle: number, distance: number, difficulty = 1, speedMultiplierCap = 1.25) {
    this.id = id;
    this.type = type;
    this.isBoss = isBossId(type);
    this.angle = angle;
    this.x = 0;
    this.y = 0;
    this.radius = distance;
    this.hp = 0;
    this.maxHp = 0;
    this.shieldHits = 0;
    this.contactDamage = 0;
    this.speed = 0;
    this.reset(id, angle, distance, difficulty, speedMultiplierCap);
  }

  public reset(id: number, angle: number, distance: number, difficulty = 1, speedMultiplierCap = 1.25): void {
    const definition = this.isBoss ? BOSSES[this.type as BossId] : ENEMIES[this.type as EnemyId];
    this.id = id;
    this.angle = angle;
    this.maxHp = definition.hp * difficulty;
    this.hp = this.maxHp;
    this.contactDamage = definition.contactDamage;
    this.speed = definition.speed * Math.min(speedMultiplierCap, 1 + (difficulty - 1) * 0.3);
    this.radius = distance;
    this.x = Math.cos(angle) * distance;
    this.y = Math.sin(angle) * distance;
    this.shieldHits = this.type === 'lattice' ? 8 : 0;
    this.invulnerable = false;
    this.telegraph = false;
    this.shieldRotation = 0;
    this.slowUntil = 0;
    this.active = true;
    this.splitDone = false;
    this.shotCooldown = this.type === 'dropper' ? 1.1 : 0;
    this.specialCooldown = this.isBoss ? 1.2 : 0;
    this.lastHitAt = -Infinity;
    this.specialDamageTaken = 0;
    this.age = 0;
  }

  public update(seconds: number, elapsed: number, core: Point, movementMultiplier: number, speedMultiplier = 1): boolean {
    if (!this.active) return false;
    this.age += seconds;
    const isStopped = this.isBoss && this.radius <= 196 || this.type === 'dropper' && this.radius <= 250;
    const slow = elapsed < this.slowUntil ? 0.55 : 1;
    if (!isStopped) this.radius -= this.speed * slow * movementMultiplier * speedMultiplier * seconds;
    this.x = core.x + Math.cos(this.angle) * this.radius;
    this.y = core.y + Math.sin(this.angle) * this.radius;
    if (this.type === 'runner') this.y += Math.sin(elapsed * 8 + this.id) * 2;
    if (this.type === 'lattice') this.telegraph = this.shieldHits > 0;
    if (this.type === 'dropper') {
      if (this.radius <= 250) this.shotCooldown -= seconds;
      this.telegraph = this.radius <= 250 && this.shotCooldown <= 1.1;
    }
    if (this.type === 'phase') {
      const cycle = this.age % 1.4;
      this.invulnerable = cycle >= 0.85;
      this.telegraph = cycle >= 0.6;
    }
    if (this.type === 'crown') {
      this.telegraph = this.radius < 300;
      const phase = this.age % 16;
      this.shieldRotation = (phase <= 8 ? phase : 16 - phase) * 0.9;
    }
    if (this.type === 'designer' || this.type === 'echo') this.telegraph = this.specialCooldown <= 0;
    return !this.isBoss && this.radius <= 52;
  }

  public damage(amount: number, elapsed: number, attackAngle = 0): { dealt: number; destroyed: boolean; blocked: boolean } {
    if (!this.active || this.invulnerable) return { dealt: 0, destroyed: false, blocked: true };
    if (this.type === 'lattice' && this.shieldHits > 0) {
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
    this.radius = Math.min(700, this.radius + Math.max(0, distance));
    this.x = Math.cos(this.angle) * this.radius;
    this.y = Math.sin(this.angle) * this.radius;
    this.applySlow(elapsed, 0.4);
  }

  public applyPull(targetX: number, targetY: number, distance: number, elapsed: number, safeDistance = 180): void {
    if (!this.active || this.isBoss) {
      if (this.isBoss) this.applySlow(elapsed, 0.4);
      return;
    }
    const currentDistance = Math.hypot(this.x, this.y);
    const nextDistance = Math.max(safeDistance, currentDistance - Math.max(0, distance));
    const angle = Math.atan2(targetY - this.y, targetX - this.x);
    this.x += Math.cos(angle) * (currentDistance - nextDistance);
    this.y += Math.sin(angle) * (currentDistance - nextDistance);
    this.radius = Math.max(safeDistance, Math.hypot(this.x, this.y));
    this.angle = Math.atan2(this.y, this.x);
    this.applySlow(elapsed, 0.4);
  }

  public applySlow(elapsed: number, duration: number): void {
    this.slowUntil = Math.max(this.slowUntil, elapsed + duration);
  }

  public snapshot(core: Point): EnemySnapshot {
    return {
      id: this.id,
      type: this.type,
      x: this.x - core.x,
      y: this.y - core.y,
      radius: this.radius,
      hp: this.hp,
      maxHp: this.maxHp,
      shieldHits: this.shieldHits,
      isBoss: this.isBoss,
      invulnerable: this.invulnerable,
      telegraph: this.telegraph,
      slowFactor: this.slowUntil > 0 ? 0.55 : 1,
      shieldRotation: this.isBoss ? this.shieldRotation : undefined,
    };
  }

  private isShielded(attackAngle: number): boolean {
    const rotation = this.shieldRotation;
    for (let index = 0; index < 3; index += 1) {
      const plate = rotation + index * Math.PI * 2 / 3;
      const difference = Math.abs(((attackAngle - plate + Math.PI) % (Math.PI * 2)) - Math.PI);
      if (difference < 0.22) return true;
    }
    return false;
  }
}
