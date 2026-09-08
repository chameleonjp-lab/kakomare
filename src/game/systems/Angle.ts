/**
 * The game stores angles in radians, while input and entity movement can
 * produce either positive or negative values.  JavaScript's remainder keeps
 * the sign of its dividend, so a plain `% (Math.PI * 2)` is not sufficient at
 * the -pi/pi seam.
 */
export const FULL_TURN = Math.PI * 2;

/** Return an angle in the half-open interval [-pi, pi). */
export function normalizeAngle(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  const wrapped = ((angle + Math.PI) % FULL_TURN + FULL_TURN) % FULL_TURN - Math.PI;
  return wrapped;
}

/** Return the shortest unsigned angular distance between two directions. */
export function angularDistance(first: number, second: number): number {
  return Math.abs(normalizeAngle(first - second));
}

