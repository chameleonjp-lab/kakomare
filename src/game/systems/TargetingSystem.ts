import type { Enemy } from '../entities/Enemy';
import type { Point } from '../../types/game';
import type { WeaponId } from '../../types/content';

export const MANUAL_AIM_HALF_ANGLE = Math.PI / 6;

export interface AimState {
  angle: number;
  manual: boolean;
}

function angularDistance(a: number, b: number): number {
  const diff = Math.abs(((a - b + Math.PI) % (Math.PI * 2)) - Math.PI);
  return diff;
}

export function targetPriority(enemy: Enemy, aim: AimState, _now: number, weaponId?: WeaponId, enemies: Enemy[] = []): number {
  const markerBoost = enemy.type !== 'marker' && enemies.some((marker) => marker.active && marker.type === 'marker' && Math.hypot(marker.x - enemy.x, marker.y - enemy.y) <= 120) ? 1.2 : 1;
  const timeToCore = Math.max(0, enemy.distanceToCore - 52) / Math.max(1, enemy.speed * markerBoost);
  const urgency = Math.max(0, 100 - timeToCore * 24);
  const role = enemy.type === 'lattice' ? 24
    : enemy.type === 'runner' ? 18
      : enemy.type === 'dropper' ? 30
        : enemy.type === 'marker' ? 35
          : enemy.type === 'phase' ? 18
            : enemy.isBoss ? 30 : 0;
  const manual = aim.manual && angularDistance(Math.atan2(enemy.y, enemy.x), aim.angle) <= MANUAL_AIM_HALF_ANGLE ? 80 : 0;
  const telegraph = enemy.telegraph ? 45 : 0;
  return urgency + role + manual + telegraph + weaponCompatibility(enemy, weaponId, enemies);
}

export function selectTarget(enemies: Enemy[], origin: Point, aim: AimState, range: number, now: number, weaponId?: WeaponId, lockedTargetId?: number | null): Enemy | null {
  const eligible = enemies.filter((enemy) => enemy.active && Math.hypot(enemy.x - origin.x, enemy.y - origin.y) <= range + enemy.hitRadius);
  const manualCandidates = aim.manual
    ? eligible.filter((enemy) => angularDistance(Math.atan2(enemy.y - origin.y, enemy.x - origin.x), aim.angle) <= MANUAL_AIM_HALF_ANGLE)
    : [];
  const candidates = manualCandidates.length > 0 ? manualCandidates : eligible;
  const locked = lockedTargetId === undefined || lockedTargetId === null ? null : candidates.find((enemy) => enemy.id === lockedTargetId);
  if (locked) return locked;
  return [...candidates].sort((a, b) => targetPriority(b, aim, now, weaponId, eligible) - targetPriority(a, aim, now, weaponId, eligible)
    || Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y)
    || a.id - b.id)[0] ?? null;
}

export function weaponCompatibility(enemy: Enemy, weaponId?: WeaponId, enemies: Enemy[] = []): number {
  if (!weaponId) return 0;
  const nearbyEnemies = enemies.filter((other) => other.active && other.id !== enemy.id && Math.hypot(other.x - enemy.x, other.y - enemy.y) <= 120).length;
  switch (weaponId) {
    case 'needle': return enemy.type === 'lattice' ? 24 : enemy.type === 'shell' ? 18 : enemy.type === 'phase' ? 14 : 0;
    case 'ray': return enemy.type === 'shell' ? 20 : enemy.type === 'lattice' ? 12 : 0;
    case 'cluster': return nearbyEnemies > 0 ? 34 : 0;
    case 'repulse': return enemy.distanceToCore <= 230 ? 30 : -60;
    case 'chain': return nearbyEnemies > 0 ? 38 : 0;
    case 'orbit': return enemy.distanceToCore <= 240 ? 28 : -60;
    case 'disc': return enemy.type === 'dropper' || enemy.type === 'marker' ? 15 : 0;
    case 'gravity': return nearbyEnemies > 0 ? 30 : 0;
  }
}

export function angleToTarget(origin: Point, target: Point): number {
  return Math.atan2(target.y - origin.y, target.x - origin.x);
}
