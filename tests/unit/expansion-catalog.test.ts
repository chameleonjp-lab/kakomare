import { describe, expect, it } from 'vitest';
import { EXPANSION_RULE_VERSION, EXPANSION_SUPPORT_ORDER, EXPANSION_SUPPORTS, EXPANSION_WEAPONS } from '../../src/data/expansionCatalog';
import { COMPETITIVE_RULES } from '../../src/data/competitiveRules';
import { SUPPORT_ORDER } from '../../src/data/supports';
import { WEAPON_ORDER } from '../../src/data/weapons';
import { validateExpansionCatalog } from '../../src/validation/expansionCatalog';

describe('V1 expansion design contract', () => {
  it('validates 50 distinct basic weapons without exposing design-only entries at runtime', () => {
    const result = validateExpansionCatalog();
    expect(result.ok, result.errors.join('\n')).toBe(true);
    expect(result.weaponCount).toBe(50);
    expect(new Set(EXPANSION_WEAPONS.map((weapon) => weapon.id)).size).toBe(50);
    expect(EXPANSION_WEAPONS.filter((weapon) => weapon.status === 'implemented')).toHaveLength(8);
    expect(EXPANSION_WEAPONS.filter((weapon) => weapon.status === 'design-only')).toHaveLength(42);
    expect(WEAPON_ORDER).toHaveLength(8);
    expect(EXPANSION_WEAPONS.filter((weapon) => weapon.status === 'design-only').every((weapon) => !WEAPON_ORDER.includes(weapon.id as typeof WEAPON_ORDER[number]))).toBe(true);
  });

  it('has two mechanically different synergy directions for every weapon', () => {
    for (const weapon of EXPANSION_WEAPONS) {
      expect(weapon.differences).toHaveLength(2);
      expect(weapon.synergies).toHaveLength(2);
      expect(weapon.synergies[0].purpose).not.toBe(weapon.synergies[1].purpose);
      expect(weapon.synergies[0].source).not.toBe(weapon.synergies[1].source);
      expect(weapon.synergies.every((synergy) => synergy.testId.startsWith(`C04-${weapon.id}-`))).toBe(true);
    }
  });

  it('covers every weapon-support pair and distinguishes support applicability', () => {
    expect(EXPANSION_SUPPORT_ORDER).toHaveLength(20);
    expect(EXPANSION_SUPPORTS).toHaveLength(20);
    expect(EXPANSION_SUPPORTS.filter((support) => support.status === 'implemented')).toHaveLength(SUPPORT_ORDER.length);
    for (const weapon of EXPANSION_WEAPONS) {
      expect(Object.keys(weapon.supportProfile)).toHaveLength(20);
      expect(Object.keys(weapon.supportProfile).sort()).toEqual([...EXPANSION_SUPPORT_ORDER].sort());
      expect(Object.values(weapon.supportProfile)).toContain('not-applicable');
      for (const [supportId, applicability] of Object.entries(weapon.supportProfile)) {
        if (applicability === 'not-applicable') expect(weapon.nonApplicableReasons[supportId]).toBeTruthy();
      }
    }
  });

  it('fixes a common competitive rule version and bounded starting contract', () => {
    expect(EXPANSION_RULE_VERSION).toBe('expansion-v1-design');
    expect(COMPETITIVE_RULES.version).toBe(EXPANSION_RULE_VERSION);
    expect(COMPETITIVE_RULES.initial.coreHp).toBeGreaterThan(0);
    expect(COMPETITIVE_RULES.initial.capacity).toBeGreaterThan(0);
    expect(COMPETITIVE_RULES.initial.rerolls).toBeGreaterThanOrEqual(0);
    expect(COMPETITIVE_RULES.initial.exclusions).toBeGreaterThanOrEqual(0);
    expect(Object.values(COMPETITIVE_RULES.candidateWeights).every((weight) => Number.isInteger(weight) && weight > 0)).toBe(true);
    expect(COMPETITIVE_RULES.score.timeAndHpAreResultFields).toBe(true);
    expect(new Set(COMPETITIVE_RULES.seedStreams).size).toBe(COMPETITIVE_RULES.seedStreams.length);
  });
});
