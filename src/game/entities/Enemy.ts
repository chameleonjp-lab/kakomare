import { ENEMIES } from '../../data/enemies';
import { BOSSES } from '../../data/bosses';
import type { BossId, EnemyId } from '../../types/content';
import type { EnemySnapshot, Point } from '../../types/game';

export class Enemy {
  public readonly id: number;
  public readonly type: EnemyId | BossId;
  public readonly isBoss: boolean;
  public readonly angle: number;
  public x: number;
  public y: number;
  public radius: number;
  public hp: number;
  public readonly maxHp: number;
  public shieldHits: number;
  public invulnerable = false;
  public telegraph = false;
  public slowUntil = 0;
  public active = true;
  public splitDone = false;
  public contactDamage: number;
  public speed: number;

  public constructor(id: number, type: EnemyId | BossId, angle: number, distance: number, difficulty = 1) {
    this.id = id;
    this.type = type;
    this.angle = angle;
    this.isBoss = type === 'crown';
    const definition = type === 'crown' ? BOSSES.crown : ENEMIES[type];
    this.maxHp = definition.hp * difficulty;
    this.hp = this.maxHp;
    this.contactDamage = definition.contactDamage;
    this.speed = definition.speed * Math.min(1.25, 1 + (difficulty - 1) * 0.3);
    this.radius = distance;
    this.x = Math.cos(angle) * distance;
    this.y = Math.sin(angle) * distance;
    this.shieldHits = type === 'lattice' ? 8 : 0;
  }

  public update(seconds: number, elapsed: number, core: Point, movementMultiplier: number): boolean {
    if (!this.active || this.isBoss && this.radius <= 196) {
      if (this.isBoss) this.telegraph = false;
      return false;
    }
    const slow = elapsed < this.slowUntil ? 0.55 : 1;
    this.radius -= this.speed * slow * movementMultiplier * seconds;
    this.x = core.x + Math.cos(this.angle) * this.radius;
    this.y = core.y + Math.sin(this.angle) * this.radius;
    if (this.type === 'runner') this.y += Math.sin(elapsed * 8 + this.id) * 2;
    if (this.type === 'lattice') this.telegraph = this.shieldHits > 0;
    if (this.type === 'crown') this.telegraph = this.radius < 300;
    return !this.isBoss && this.radius <= 52;
  }

  public damage(amount: number, elapsed: number): { dealt: number; destroyed: boolean; blocked: boolean } {
    if (!this.active || this.invulnerable) return { dealt: 0, destroyed: false, blocked: true };
    if (this.type === 'lattice' && this.shieldHits > 0) {
      this.shieldHits -= 1;
      return { dealt: 0, destroyed: false, blocked: true };
    }
    const limited = this.type === 'crown' ? Math.min(60, amount) : this.type === 'shard' ? amount : Math.min(24, amount);
    this.hp -= Math.max(0, limited);
    if (this.type === 'crown') {
      this.invulnerable = Math.floor(elapsed / 2.4) % 3 === 1;
    }
    const destroyed = this.hp <= 0;
    if (destroyed) this.active = false;
    return { dealt: Math.max(0, limited), destroyed, blocked: false };
  }

  public applyPush(distance: number, elapsed: number): void {
    if (!this.active || this.isBoss) {
      if (this.isBoss) this.slowUntil = Math.max(this.slowUntil, elapsed + 0.4);
      return;
    }
    this.radius = Math.min(660, this.radius + Math.max(0, distance));
    this.x = Math.cos(this.angle) * this.radius;
    this.y = Math.sin(this.angle) * this.radius;
    this.slowUntil = Math.max(this.slowUntil, elapsed + 0.4);
  }

  public snapshot(core: Point): EnemySnapshot {
    return {
      id: this.id,
      type: this.type === 'crown' ? 'shard' : this.type,
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
    };
  }
}
