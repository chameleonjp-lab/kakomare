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
const MAX_ENEMY_HIT_RADIUS = 48;

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
    // Cluster shots resolve their area damage at the stored impact point.
    // They must not damage enemies while travelling there.
    if (projectile.kind === 'cluster') continue;
    for (const enemyIndex of nearbyIndices(enemyGrid, projectile.x, projectile.y, projectile.radius + MAX_ENEMY_HIT_RADIUS)) {
      const enemy = enemies[enemyIndex];
      if (!enemy) continue;
      if (!enemy.active) continue;
      if (diagnostics) diagnostics.candidateChecks += 1;
      const lastHit = projectile.hitAt.get(enemy.id);
      if (projectile.kind === 'disc' && lastHit !== undefined && elapsed - lastHit < projectile.hitCooldown) continue;
      // A piercing shot may remain active across several frames. Remember
      // every enemy it has already passed through, rather than only the last
      // one, so a slow shot cannot repeatedly damage the same target.
      if (projectile.kind !== 'disc' && projectile.hitAt.has(enemy.id)) continue;
      const distance = Math.hypot(projectile.x - enemy.x, projectile.y - enemy.y);
      if (distance > projectile.radius + enemy.hitRadius) continue;
      const result = applyDamage(enemy, damageForEnemy(projectile, enemy), elapsed, Math.atan2(projectile.vy, projectile.vx));
      projectile.targetId = enemy.id;
      projectile.hitAt.set(enemy.id, elapsed);
      if (projectile.kind === 'disc') {
        if (projectile.bounces <= 0) projectile.active = false;
        else {
          projectile.bounces -= 1;
          reflectProjectileFromEnemy(projectile, enemy);
        }
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

function reflectProjectileFromEnemy(projectile: Projectile, enemy: Enemy): void {
  let nx = projectile.x - enemy.x;
  let ny = projectile.y - enemy.y;
  const normalLength = Math.hypot(nx, ny);
  if (normalLength < 1e-6) {
    const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
    nx = -projectile.vx / speed;
    ny = -projectile.vy / speed;
  } else {
    nx /= normalLength;
    ny /= normalLength;
  }
  const dot = projectile.vx * nx + projectile.vy * ny;
  projectile.vx -= 2 * dot * nx;
  projectile.vy -= 2 * dot * ny;
  const separation = projectile.radius + enemy.hitRadius + 0.5;
  projectile.x = enemy.x + nx * separation;
  projectile.y = enemy.y + ny * separation;
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
