import { describe, expect, it } from 'vitest';
import { getResearchEffects, purchaseResearch, researchCost, researchLevel } from '../../src/data/research';
import { createDefaultSave } from '../../src/types/save';

describe('research', () => {
  it('subtracts an exact cost and increases the selected level', () => {
    const save = createDefaultSave();
    save.progress.parts = 100;
    const cost = researchCost(save, 'core-health');
    const next = purchaseResearch(save, 'core-health');
    expect(cost).toBe(30);
    expect(next?.progress.parts).toBe(70);
    expect(next && researchLevel(next, 'core-health')).toBe(1);
  });

  it('rejects purchases without enough parts and caps the bonuses', () => {
    const save = createDefaultSave();
    expect(purchaseResearch(save, 'weapon-power')).toBeNull();
    save.progress.researchLevels['weapon-power'] = 5;
    save.progress.researchLevels['core-health'] = 3;
    const effects = getResearchEffects(save);
    expect(effects.powerMultiplier).toBe(1.15);
    expect(effects.maxCore).toBe(115);
  });
});
