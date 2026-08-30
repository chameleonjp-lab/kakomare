import type { ProjectileSnapshot } from '../../types/game';

export class Projectile {
  public readonly id: number;
  public readonly kind: 'needle' | 'cluster' | 'enemy';
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public radius: number;
  public damage: number;
  public life: number;
  public readonly maxLife: number;
  public piercing: number;
  public readonly enemyProjectile: boolean;
  public active = true;
  public targetId: number | null = null;

  public constructor(options: {
    id: number;
    kind: 'needle' | 'cluster' | 'enemy';
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    damage: number;
    life: number;
    piercing: number;
    enemyProjectile?: boolean;
  }) {
    this.id = options.id;
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
    };
  }
}
