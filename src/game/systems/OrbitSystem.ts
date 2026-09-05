const FULL_TURN = Math.PI * 2;

export function advanceOrbitAngle(angle: number, angularSpeed: number, seconds: number): number {
  const next = angle + angularSpeed * seconds;
  return ((next % FULL_TURN) + FULL_TURN) % FULL_TURN;
}
