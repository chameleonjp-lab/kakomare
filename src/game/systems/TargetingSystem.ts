import type { Enemy } from '../entities/Enemy';
import type { Point } from '../../types/game';
import type { WeaponId } from '../../types/content';
import { angularDistance } from './Angle';

export { angularDistance } from './Angle';

export const MANUAL_AIM_HALF_ANGLE = Math.PI / 6;

export interface AimState {
  angle: number;
  manual: boolean;
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
    case 'grid': return enemy.type === 'dropper' || enemy.type === 'marker' ? 34 : enemy.isBoss ? -24 : 0;
    case 'mine': return enemy.distanceToCore <= 360 ? 26 : -35;
    case 'lance': return enemy.type === 'shell' || enemy.type === 'lattice' ? 34 : enemy.isBoss ? 12 : -8;
    case 'drone': return enemy.type === 'dropper' || enemy.type === 'marker' || enemy.telegraph ? 32 : nearbyEnemies === 0 ? 8 : 0;
    case 'prism': return nearbyEnemies > 1 ? 30 : 4;
    case 'mortar': return enemy.distanceToCore > 260 ? 32 : 8;
    case 'ribbon': return enemy.type === 'runner' ? 34 : enemy.distanceToCore < 220 ? 20 : 0;
    case 'shockwave': return enemy.distanceToCore <= 260 ? 30 : -20;
    case 'barrage': return nearbyEnemies > 2 ? 36 : 0;
    case 'anchor': return enemy.distanceToCore <= 340 ? 28 : -10;
    case 'flare': return enemy.telegraph || enemy.type === 'dropper' ? 40 : 0;
    case 'cutter': return nearbyEnemies > 0 ? 26 : 4;
    case 'beacon': return enemy.type === 'marker' || enemy.type === 'dropper' ? 34 : 0;
    case 'nova': return nearbyEnemies > 2 ? 38 : enemy.isBoss ? 14 : 0;
    case 'harpoon': return enemy.type === 'shell' || enemy.type === 'lattice' ? 30 : 0;
    case 'vortex': return nearbyEnemies > 1 ? 34 : enemy.distanceToCore < 260 ? 18 : 0;
    case 'ward': return enemy.distanceToCore < 230 || enemy.telegraph ? 32 : 0;
    case 'fan': return enemy.distanceToCore < 260 && nearbyEnemies > 0 ? 34 : 6;
    case 'swell': return enemy.distanceToCore > 240 ? 28 : 8;
    case 'seeker': return enemy.telegraph || enemy.type === 'marker' || enemy.type === 'dropper' ? 38 : 12;
    case 'drill': return enemy.type === 'shell' || enemy.type === 'lattice' || enemy.type === 'guard' ? 42 : enemy.isBoss ? 15 : 0;
    case 'mist': return nearbyEnemies > 0 ? 30 : enemy.distanceToCore < 220 ? 18 : 0;
    case 'spark': return enemy.type === 'marker' || enemy.type === 'phase' ? 32 : nearbyEnemies > 0 ? 20 : 0;
    case 'coil': return nearbyEnemies > 0 ? 32 : enemy.distanceToCore < 240 ? 12 : 0;
    case 'bloom': return nearbyEnemies > 1 ? 38 : 6;
    case 'shuttle': return enemy.type === 'shell' || enemy.type === 'lattice' ? 28 : enemy.distanceToCore < 260 ? 12 : 0;
    case 'siphon': return enemy.type === 'charger' || enemy.type === 'runner' || enemy.telegraph ? 36 : 8;
    case 'mirror': return enemy.type === 'dropper' || enemy.type === 'marker' || enemy.isBoss ? 30 : 4;
    case 'stasis': return enemy.type === 'charger' || enemy.type === 'repair' || enemy.type === 'factory' ? 42 : enemy.distanceToCore < 220 ? 16 : 0;
    case 'quake': return enemy.distanceToCore < 260 && nearbyEnemies > 0 ? 34 : enemy.distanceToCore < 180 ? 26 : -8;
    case 'spoke': return enemy.type === 'dropper' || enemy.type === 'marker' ? 34 : nearbyEnemies > 1 ? 18 : 0;
    case 'hollow': return enemy.type === 'guard' || enemy.type === 'shell' ? 36 : enemy.distanceToCore < 230 ? 12 : 0;
    case 'snare': return enemy.type === 'charger' || enemy.type === 'runner' ? 42 : enemy.distanceToCore < 220 ? 14 : 0;
    case 'chime': return enemy.type === 'phase' || enemy.type === 'marker' || enemy.isBoss ? 30 : nearbyEnemies > 0 ? 12 : 0;
    case 'thunder': return enemy.type === 'factory' || enemy.type === 'repair' || enemy.type === 'dropper' ? 40 : enemy.isBoss ? 18 : 0;
    case 'frost': return enemy.type === 'charger' || enemy.type === 'runner' || enemy.type === 'guard' ? 36 : nearbyEnemies > 0 ? 18 : 0;
    case 'swarm': return nearbyEnemies > 1 ? 34 : enemy.type === 'dropper' || enemy.type === 'marker' ? 22 : 6;
    case 'counter': return enemy.telegraph || enemy.type === 'dropper' || enemy.isBoss ? 42 : 0;
    case 'dive': return enemy.type === 'guard' || enemy.type === 'shell' || enemy.type === 'marker' ? 34 : 8;
    case 'axis': return nearbyEnemies > 1 ? 30 : enemy.type === 'dropper' || enemy.type === 'marker' ? 24 : 4;
    case 'seed': return enemy.distanceToCore > 200 ? 24 : enemy.distanceToCore < 140 ? 18 : 4;
    case 'requiem': return enemy.isBoss ? 38 : nearbyEnemies > 2 ? 32 : 0;
  }
  return 0;
}

export function angleToTarget(origin: Point, target: Point): number {
  return Math.atan2(target.y - origin.y, target.x - origin.x);
}
