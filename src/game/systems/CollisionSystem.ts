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

export function collideProjectiles(projectiles: Projectile[], enemies: Enemy[], elapsed: number, damageForEnemy: (projectile: Projectile, enemy: Enemy) => number = (projectile) => projectile.damage): CollisionEvent[] {
  const events: CollisionEvent[] = [];
  for (const projectile of projectiles) {
    if (!projectile.active || projectile.enemyProjectile) continue;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const lastHit = projectile.hitAt.get(enemy.id);
      if (projectile.kind === 'disc' && lastHit !== undefined && elapsed - lastHit < projectile.hitCooldown) continue;
      if (projectile.kind !== 'disc' && projectile.targetId === enemy.id) continue;
      const distance = Math.hypot(projectile.x - enemy.x, projectile.y - enemy.y);
      if (distance > projectile.radius + 16) continue;
      const result = applyDamage(enemy, damageForEnemy(projectile, enemy), elapsed, Math.atan2(projectile.vy, projectile.vx));
      projectile.targetId = enemy.id;
      projectile.hitAt.set(enemy.id, elapsed);
      if (projectile.kind === 'disc') {
        if (projectile.bounces <= 0) projectile.active = false;
        else projectile.bounces -= 1;
      } else if (projectile.piercing <= 0) projectile.active = false;
      else projectile.piercing -= 1;
      events.push({ projectile, enemy, damage: result.amount, destroyed: result.destroyed, blocked: result.blocked });
      if (!projectile.active) break;
    }
  }
  return events;
}
