import type { Enemy } from '../entities/Enemy';
import type { Point } from '../../types/game';

export interface AimState {
  angle: number;
  manual: boolean;
}

function angularDistance(a: number, b: number): number {
  const diff = Math.abs(((a - b + Math.PI) % (Math.PI * 2)) - Math.PI);
  return diff;
}

export function targetPriority(enemy: Enemy, aim: AimState, _now: number): number {
  const urgency = Math.max(0, 100 - Math.max(0, enemy.radius - 52) / 6);
  const role = enemy.type === 'lattice' ? 20
    : enemy.type === 'runner' ? 15
      : enemy.type === 'dropper' ? 25
        : enemy.type === 'marker' ? 24
          : enemy.isBoss ? 30 : 0;
  const manual = aim.manual && angularDistance(enemy.angle, aim.angle) <= Math.PI / 3 ? 80 : 0;
  const telegraph = enemy.telegraph ? 45 : 0;
  return urgency + role + manual + telegraph;
}

export function selectTarget(enemies: Enemy[], origin: Point, aim: AimState, range: number, now: number): Enemy | null {
  return enemies
    .filter((enemy) => enemy.active && enemy.radius <= range)
    .sort((a, b) => targetPriority(b, aim, now) - targetPriority(a, aim, now) || Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y))[0] ?? null;
}

export function angleToTarget(origin: Point, target: Point): number {
  return Math.atan2(target.y - origin.y, target.x - origin.x);
}
