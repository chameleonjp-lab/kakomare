import type { WeaponId } from '../../types/content';
import type { ProjectileSnapshot } from '../../types/game';

export interface ProjectileOptions {
  id: number;
  kind: 'needle' | 'cluster' | 'disc' | 'enemy';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  piercing: number;
  enemyProjectile?: boolean;
  bounces?: number;
  hitCooldown?: number;
  sourceWeaponId?: WeaponId | null;
  impactX?: number;
  impactY?: number;
  impactRadius?: number;
  impactAngle?: number;
}

export class Projectile {
  public readonly id: number;
  public kind: 'needle' | 'cluster' | 'disc' | 'enemy';
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public radius: number;
  public damage: number;
  public life: number;
  public maxLife: number;
  public piercing: number;
  public enemyProjectile: boolean;
  public sourceWeaponId: WeaponId | null;
  public active = true;
  public targetId: number | null = null;
  public bounces: number;
  public hitCooldown: number;
  public impactX: number | null;
  public impactY: number | null;
  public impactRadius: number;
  public impactAngle: number;
  public impactWarningShown = false;
  public readonly hitAt = new Map<number, number>();

  public constructor(options: ProjectileOptions) {
    this.id = options.id;
    this.kind = options.kind;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.radius = 0;
    this.damage = 0;
    this.life = 0;
    this.maxLife = 0;
    this.piercing = 0;
    this.enemyProjectile = false;
    this.sourceWeaponId = null;
    this.bounces = 0;
    this.hitCooldown = 0;
    this.impactX = null;
    this.impactY = null;
    this.impactRadius = 0;
    this.impactAngle = 0;
    this.reset(options);
  }

  public reset(options: Omit<ProjectileOptions, 'id'>): void {
    this.kind = options.kind;
    this.x = options.x;
    this.y = options.y;
    this.vx = options.vx;
    this.vy = options.vy;
    this.radius = options.radius;
    this.damage = options.damage;
    this.life = options.life;
    this.maxLife = options.life;
    this.piercing = options.piercing;
    this.enemyProjectile = options.enemyProjectile ?? false;
    this.sourceWeaponId = options.sourceWeaponId ?? null;
    this.bounces = options.bounces ?? 0;
    this.hitCooldown = options.hitCooldown ?? 0;
    this.impactX = options.impactX ?? null;
    this.impactY = options.impactY ?? null;
    this.impactRadius = options.impactRadius ?? 0;
    this.impactAngle = options.impactAngle ?? 0;
    this.impactWarningShown = false;
    this.active = true;
    this.targetId = null;
    this.hitAt.clear();
  }

  public update(seconds: number): void {
    if (!this.active) return;
    this.x += this.vx * seconds;
    this.y += this.vy * seconds;
    this.life -= seconds;
    if (this.life <= 0 || Math.hypot(this.x, this.y) > 700) this.active = false;
  }

  public snapshot(): ProjectileSnapshot {
    return {
      id: this.id,
      kind: this.kind,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      radius: this.radius,
      damage: this.damage,
      life: this.life,
      maxLife: this.maxLife,
      piercing: this.piercing,
      enemyProjectile: this.enemyProjectile,
      bounces: this.bounces,
      sourceWeaponId: this.sourceWeaponId,
    };
  }
}
