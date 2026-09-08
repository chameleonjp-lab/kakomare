import { normalizeAngle } from './Angle';

/**
 * Direction from the victim towards the source of an attack.  A null value
 * denotes an omnidirectional hit (for example an area effect whose center is
 * exactly on the victim), for which a directional shield has no unique plate
 * to test.
 */
export type ImpactAngle = number | null;

const POSITION_EPSILON = 1e-6;

export function impactAngleFromSource(sourceX: number, sourceY: number, targetX: number, targetY: number): ImpactAngle {
  const x = sourceX - targetX;
  const y = sourceY - targetY;
  if (Math.hypot(x, y) <= POSITION_EPSILON) return null;
  return Math.atan2(y, x);
}

/** Convert a projectile's travel vector to the side it enters the victim from. */
export function impactAngleFromVelocity(vx: number, vy: number): ImpactAngle {
  if (Math.hypot(vx, vy) <= POSITION_EPSILON) return null;
  return normalizeAngle(Math.atan2(vy, vx) + Math.PI);
}

