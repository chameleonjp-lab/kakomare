import { describe, expect, it } from 'vitest';
import { advanceOrbitAngle } from '../../src/game/systems/OrbitSystem';

describe('OrbitSystem', () => {
  it('advances by angular speed and elapsed battle time', () => {
    expect(advanceOrbitAngle(0, 2, 0.25)).toBeCloseTo(0.5);
  });

  it('keeps the angle stable across full rotations', () => {
    expect(advanceOrbitAngle(5.5, 4, 1)).toBeCloseTo((5.5 + 4) % (Math.PI * 2));
  });

  it('does not couple rotation speed to the weapon firing interval', () => {
    const angleAtTenShotsPerSecond = advanceOrbitAngle(0, 2, 1);
    const angleAtTwelveShotsPerSecond = Array.from({ length: 12 }, () => 1 / 12).reduce(
      (angle, seconds) => advanceOrbitAngle(angle, 2, seconds),
      0,
    );
    expect(angleAtTenShotsPerSecond).toBeCloseTo(2);
    expect(angleAtTwelveShotsPerSecond).toBeCloseTo(2);
  });
});
