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

export interface EnemyProjectileCollisionEvent {
  projectile: Projectile;
  enemyProjectile: Projectile;
}

export interface CollisionDiagnostics {
  candidateChecks: number;
}

const COLLISION_CELL_SIZE = 64;

export function collideProjectiles(
  projectiles: Projectile[],
  enemies: Enemy[],
  elapsed: number,
  damageForEnemy: (projectile: Projectile, enemy: Enemy) => number = (projectile) => projectile.damage,
  diagnostics?: CollisionDiagnostics,
  stopAfter?: (event: CollisionEvent) => boolean,
): CollisionEvent[] {
  const events: CollisionEvent[] = [];
  const enemyGrid = createSpatialGrid(enemies, (enemy) => enemy.active);
  for (const projectile of projectiles) {
    if (!projectile.active || projectile.enemyProjectile) continue;
    for (const enemyIndex of nearbyIndices(enemyGrid, projectile.x, projectile.y, projectile.radius + 16)) {
      const enemy = enemies[enemyIndex];
      if (!enemy) continue;
      if (!enemy.active) continue;
      if (diagnostics) diagnostics.candidateChecks += 1;
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
      const event = { projectile, enemy, damage: result.amount, destroyed: result.destroyed, blocked: result.blocked };
      events.push(event);
      if (stopAfter?.(event)) return events;
      if (!projectile.active) break;
    }
  }
  return events;
}

export function collideEnemyProjectiles(projectiles: Projectile[], diagnostics?: CollisionDiagnostics): EnemyProjectileCollisionEvent[] {
  const events: EnemyProjectileCollisionEvent[] = [];
  const friendly = projectiles.filter((projectile) => projectile.active && !projectile.enemyProjectile);
  const hostile = projectiles.filter((projectile) => projectile.active && projectile.enemyProjectile);
  const friendlyGrid = createSpatialGrid(friendly, (projectile) => projectile.active);
  for (const enemyProjectile of hostile) {
    for (const projectileIndex of nearbyIndices(friendlyGrid, enemyProjectile.x, enemyProjectile.y, enemyProjectile.radius + 16)) {
      const projectile = friendly[projectileIndex];
      if (!projectile) continue;
      if (!projectile.active || !enemyProjectile.active) continue;
      if (diagnostics) diagnostics.candidateChecks += 1;
      if (Math.hypot(projectile.x - enemyProjectile.x, projectile.y - enemyProjectile.y) > projectile.radius + enemyProjectile.radius) continue;
      enemyProjectile.active = false;
      if (projectile.kind === 'disc') {
        if (projectile.bounces <= 0) projectile.active = false;
        else projectile.bounces -= 1;
      } else if (projectile.piercing <= 0) projectile.active = false;
      else projectile.piercing -= 1;
      events.push({ projectile, enemyProjectile });
    }
  }
  return events;
}

interface SpatialGrid {
  cells: Map<string, number[]>;
}

function createSpatialGrid<T extends { x: number; y: number }>(items: T[], include: (item: T) => boolean): SpatialGrid {
  const cells = new Map<string, number[]>();
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item || !include(item)) continue;
    const key = cellKey(Math.floor(item.x / COLLISION_CELL_SIZE), Math.floor(item.y / COLLISION_CELL_SIZE));
    const indices = cells.get(key);
    if (indices) indices.push(index);
    else cells.set(key, [index]);
  }
  return { cells };
}

function nearbyIndices(grid: SpatialGrid, x: number, y: number, radius: number): number[] {
  const minimumX = Math.floor((x - radius) / COLLISION_CELL_SIZE);
  const maximumX = Math.floor((x + radius) / COLLISION_CELL_SIZE);
  const minimumY = Math.floor((y - radius) / COLLISION_CELL_SIZE);
  const maximumY = Math.floor((y + radius) / COLLISION_CELL_SIZE);
  const result: number[] = [];
  for (let cellY = minimumY; cellY <= maximumY; cellY += 1) {
    for (let cellX = minimumX; cellX <= maximumX; cellX += 1) {
      const indices = grid.cells.get(cellKey(cellX, cellY));
      if (indices) result.push(...indices);
    }
  }
  // Keep the same stable entity order as the previous linear scan. This makes
  // collision outcomes deterministic while reducing the compared set.
  result.sort((first, second) => first - second);
  return result;
}

function cellKey(x: number, y: number): string {
  return `${x}:${y}`;
}
