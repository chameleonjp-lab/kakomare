import { describe, expect, it } from 'vitest';
import { ProgressionSystem, experienceRequiredForLevel } from '../../src/game/systems/ProgressionSystem';

describe('ProgressionSystem', () => {
  it('keeps X05 experience math and confirms ten choices without losing the remainder', () => {
    const progression = new ProgressionSystem({ level: 27, experience: 3_085 });
    expect(progression.nextExperience).toBe(259);
    expect(progression.pendingChoices).toBe(10);
    for (let index = 0; index < 10; index += 1) expect(progression.confirmChoice()).toBe(true);
    expect(progression.level).toBe(37);
    expect(progression.experience).toBe(90);
    expect(progression.nextExperience).toBe(349);
    expect(progression.pendingChoices).toBe(0);
  });

  it('does not consume the same choice twice', () => {
    const progression = new ProgressionSystem({ level: 1, experience: experienceRequiredForLevel(1) });
    expect(progression.confirmChoice()).toBe(true);
    expect(progression.confirmChoice()).toBe(false);
    expect(progression.level).toBe(2);
    expect(progression.experience).toBe(0);
  });

  it('counts multiple pending choices before any selection is confirmed', () => {
    const progression = new ProgressionSystem({ level: 1, experience: 25 + 34 + 43 });
    expect(progression.pendingChoices).toBe(3);
    expect(progression.level).toBe(1);
    expect(progression.experience).toBe(102);
  });
});

