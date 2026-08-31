import { describe, expect, it } from 'vitest';
import { FixedStepClock } from '../../src/game/systems/FixedStepClock';

describe('FixedStepClock', () => {
  it('uses the same number of simulation steps for different draw rates', () => {
    const simulate = (frame: number): number => {
      const clock = new FixedStepClock();
      let steps = 0;
      for (let frameIndex = 0; frameIndex < Math.round(3 / frame); frameIndex += 1) clock.advance(frame, () => { steps += 1; });
      return steps;
    };
    expect(simulate(1 / 60)).toBe(simulate(1 / 120));
    expect(simulate(1 / 60)).toBe(simulate(1 / 30));
  });

  it('limits catch-up work to five steps and drops excessive lag', () => {
    const clock = new FixedStepClock();
    let steps = 0;
    const consumed = clock.advance(1, () => { steps += 1; });
    expect(consumed).toBe(5);
    expect(steps).toBe(5);
    expect(clock.advance(0, () => { steps += 1; })).toBe(0);
  });
});
