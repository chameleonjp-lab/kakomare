import type { WeaponId } from '../../types/content';
import type { ProjectileSnapshot } from '../../types/game';

export interface ProjectileOptions {
  id: number;
  kind: 'needle' | 'cluster' | 'disc' | 'lance' | 'grid' | 'drone' | 'enemy';
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
  sourceWeaponInstanceId?: string | null;
  /** Boundary used by this projectile; expansion does not retarget old shots. */
  boundaryRadius?: number;
  impactX?: number;
  impactY?: number;
  impactRadius?: number;
  impactAngle?: number;
  /** True for the three child shots created by the cluster split branch. */
  clusterSplitChild?: boolean;
}

export class Projectile {
  public readonly id: number;
  public kind: 'needle' | 'cluster' | 'disc' | 'lance' | 'grid' | 'drone' | 'enemy';
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public radius: number;
  public damage: number;
  public life: number;
  public maxLife: number;
  /** Number of additional enemy hits after the first contact (0 = one hit). */
  public piercing: number;
  public enemyProjectile: boolean;
  public sourceWeaponId: WeaponId | null;
  public sourceWeaponInstanceId: string | null;
  public boundaryRadius: number;
  public active = true;
  public targetId: number | null = null;
  public bounces: number;
  public hitCooldown: number;
  public impactX: number | null;
  public impactY: number | null;
  public impactRadius: number;
  public impactAngle: number;
  public clusterSplitChild = false;
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
    this.sourceWeaponInstanceId = null;
    this.boundaryRadius = 325;
    this.bounces = 0;
    this.hitCooldown = 0;
    this.impactX = null;
    this.impactY = null;
    this.impactRadius = 0;
    this.impactAngle = 0;
    this.clusterSplitChild = false;
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
    this.sourceWeaponInstanceId = options.sourceWeaponInstanceId ?? null;
    this.boundaryRadius = Number.isFinite(options.boundaryRadius) && (options.boundaryRadius ?? 0) > 0 ? options.boundaryRadius! : 325;
    this.bounces = options.bounces ?? 0;
    this.hitCooldown = options.hitCooldown ?? 0;
    this.impactX = options.impactX ?? null;
    this.impactY = options.impactY ?? null;
    this.impactRadius = options.impactRadius ?? 0;
    this.impactAngle = options.impactAngle ?? 0;
    this.clusterSplitChild = options.clusterSplitChild ?? false;
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
      sourceWeaponInstanceId: this.sourceWeaponInstanceId,
      boundaryRadius: this.boundaryRadius,
      targetId: this.targetId,
      hitCooldown: this.hitCooldown,
      impactX: this.impactX,
      impactY: this.impactY,
      impactRadius: this.impactRadius,
      impactAngle: this.impactAngle,
      clusterSplitChild: this.clusterSplitChild,
      impactWarningShown: this.impactWarningShown,
      hitAt: [...this.hitAt.entries()],
    };
  }

  /** Restore a projectile without recalculating its source weapon stats. */
  public restore(snapshot: ProjectileSnapshot): boolean {
    if (snapshot.id !== this.id || !Number.isFinite(snapshot.x) || !Number.isFinite(snapshot.y) || !Number.isFinite(snapshot.vx) || !Number.isFinite(snapshot.vy)
      || !Number.isFinite(snapshot.radius) || snapshot.radius < 0 || !Number.isFinite(snapshot.damage) || snapshot.damage < 0
      || !Number.isFinite(snapshot.life) || snapshot.life < 0 || !Number.isFinite(snapshot.maxLife) || snapshot.maxLife <= 0 || snapshot.life > snapshot.maxLife
      || !Number.isFinite(snapshot.piercing) || snapshot.piercing < 0 || !Number.isFinite(snapshot.bounces) || snapshot.bounces < 0
      || !Number.isFinite(snapshot.boundaryRadius) || snapshot.boundaryRadius <= 0 || typeof snapshot.enemyProjectile !== 'boolean'
      || (snapshot.targetId !== undefined && snapshot.targetId !== null && (!Number.isInteger(snapshot.targetId) || snapshot.targetId < 1))
      || (snapshot.hitAt !== undefined && (!Array.isArray(snapshot.hitAt) || !snapshot.hitAt.every((pair) => Array.isArray(pair) && pair.length === 2 && Number.isInteger(pair[0]) && pair[0] >= 1 && Number.isFinite(pair[1]))))) return false;
    this.kind = snapshot.kind;
    this.x = snapshot.x;
    this.y = snapshot.y;
    this.vx = snapshot.vx;
    this.vy = snapshot.vy;
    this.radius = snapshot.radius;
    this.damage = snapshot.damage;
    this.life = snapshot.life;
    this.maxLife = snapshot.maxLife;
    this.piercing = snapshot.piercing;
    this.enemyProjectile = snapshot.enemyProjectile;
    this.sourceWeaponId = snapshot.sourceWeaponId;
    this.sourceWeaponInstanceId = snapshot.sourceWeaponInstanceId;
    this.boundaryRadius = snapshot.boundaryRadius;
    this.bounces = snapshot.bounces;
    this.targetId = snapshot.targetId ?? null;
    this.hitCooldown = snapshot.hitCooldown ?? 0;
    this.impactX = snapshot.impactX ?? null;
    this.impactY = snapshot.impactY ?? null;
    this.impactRadius = snapshot.impactRadius ?? 0;
    this.impactAngle = snapshot.impactAngle ?? 0;
    this.clusterSplitChild = snapshot.clusterSplitChild === true;
    this.impactWarningShown = snapshot.impactWarningShown === true;
    this.active = true;
    this.hitAt.clear();
    for (const pair of snapshot.hitAt ?? []) {
      if (Array.isArray(pair) && pair.length === 2 && Number.isInteger(pair[0]) && Number.isFinite(pair[1])) this.hitAt.set(pair[0], pair[1]);
    }
    return true;
  }
}
