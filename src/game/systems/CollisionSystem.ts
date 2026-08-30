import { Enemy } from '../entities/Enemy';
import { Projectile } from '../entities/Projectile';
import { applyDamage } from './DamageSystem';

export interface CollisionEvent {
  projectile: Projectile;
  enemy: Enemy;
  damage: number;
  destroyed: boolean;
  blocked: boolean;
}

export function collideProjectiles(projectiles: Projectile[], enemies: Enemy[], elapsed: number): CollisionEvent[] {
  const events: CollisionEvent[] = [];
  for (const projectile of projectiles) {
    if (!projectile.active || projectile.enemyProjectile) continue;
    for (const enemy of enemies) {
      if (!enemy.active || projectile.targetId === enemy.id) continue;
      const distance = Math.hypot(projectile.x - enemy.x, projectile.y - enemy.y);
      if (distance > projectile.radius + 16) continue;
      const result = applyDamage(enemy, projectile.damage, elapsed);
      projectile.targetId = enemy.id;
      if (projectile.piercing <= 0) projectile.active = false;
      else projectile.piercing -= 1;
      events.push({ projectile, enemy, damage: result.amount, destroyed: result.destroyed, blocked: result.blocked });
      if (!projectile.active) break;
    }
  }
  return events;
}
