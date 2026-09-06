import { describe, expect, it } from 'vitest';
import { SupportModule, supportEffectsFor } from '../../src/game/entities/SupportModule';
import { Weapon } from '../../src/game/entities/Weapon';
import { applyUpgradeCandidate, createUpgradeCandidateList, shouldRetryUpgradeDraw, wouldStrandNewItems } from '../../src/game/systems/UpgradeSystem';
import { DeterministicRng } from '../../src/game/systems/SpawnDirector';

describe('UpgradeSystem', () => {
  it('offers three unique candidates with at least two related to the current build', () => {
    const weapons = [new Weapon('needle', 0)];
    const candidates = createUpgradeCandidateList(weapons, [], 100, new DeterministicRng(4), new Set());
    expect(candidates).toHaveLength(3);
    expect(new Set(candidates.map((candidate) => candidate.id)).size).toBe(3);
    expect(candidates.filter((candidate) => candidate.isExisting).length).toBeGreaterThanOrEqual(2);
    expect(candidates.filter((candidate) => !candidate.isExisting)).toHaveLength(1);
  });

  it('keeps one new item available even when many existing upgrades are eligible', () => {
    const weapons = [new Weapon('needle', 0), new Weapon('ray', 1)];
    const supports = [new SupportModule('output', 0)];
    for (let seed = 1; seed <= 12; seed += 1) {
      const candidates = createUpgradeCandidateList(weapons, supports, 100, new DeterministicRng(seed), new Set());
      expect(candidates).toHaveLength(3);
      expect(candidates.filter((candidate) => candidate.isExisting)).toHaveLength(2);
      expect(candidates.filter((candidate) => !candidate.isExisting)).toHaveLength(1);
    }
  });

  it('does not offer a new item when the corresponding slots are full', () => {
    const weapons = [new Weapon('needle', 0), new Weapon('ray', 1), new Weapon('cluster', 2)];
    const supports = [new SupportModule('output', 0), new SupportModule('rhythm', 1), new SupportModule('brake', 2)];
    const candidates = createUpgradeCandidateList(weapons, supports, 100, new DeterministicRng(9), new Set());
    expect(candidates).toHaveLength(3);
    expect(candidates.every((candidate) => !candidate.id.endsWith(':new'))).toBe(true);
  });

  it('does not offer maximum-level equipment and returns an explicit empty list when nothing can grow', () => {
    const weapons = [new Weapon('needle', 0), new Weapon('ray', 1), new Weapon('cluster', 2)];
    const supports = [new SupportModule('output', 0), new SupportModule('rhythm', 1), new SupportModule('brake', 2)];
    for (const weapon of weapons) {
      weapon.level = weapon.definition.maxLevel;
      weapon.precisionBonus = 2;
      weapon.branch = weapon.definition.branches[0]?.id ?? null;
    }
    for (const support of supports) support.level = support.definition.maxLevel;
    expect(createUpgradeCandidateList(weapons, supports, 100, new DeterministicRng(7), new Set())).toEqual([]);
  });

  it('excludes a maximum-level item while other equipment can still grow', () => {
    const maximum = new Weapon('needle', 0);
    maximum.level = maximum.definition.maxLevel;
    maximum.precisionBonus = 2;
    maximum.branch = 'spread';
    const candidates = createUpgradeCandidateList(
      [maximum, new Weapon('ray', 1)],
      [new SupportModule('output', 0)],
      100,
      new DeterministicRng(11),
      new Set(),
    );
    expect(candidates).toHaveLength(3);
    expect(new Set(candidates.map((candidate) => candidate.id)).size).toBe(3);
    expect(candidates.some((candidate) => candidate.targetId === 'needle')).toBe(false);
  });

  it('applies a focus upgrade and a new support without relying on a second tap', () => {
    const weapons = [new Weapon('needle', 0)];
    const supports: SupportModule[] = [];
    applyUpgradeCandidate({ id: 'weapon:needle:focus', kind: 'weapon', targetId: 'needle', title: '照準', description: '', before: '', after: '', role: '', isExisting: true }, weapons, supports, () => undefined);
    expect(weapons[0]?.precisionBonus).toBe(1);
    applyUpgradeCandidate({ id: 'support:output:new', kind: 'support', targetId: 'output', title: '出力', description: '', before: '', after: '', role: '', isExisting: false }, weapons, supports, () => undefined);
    expect(supports).toHaveLength(1);
  });

  it('applies support values only to both adjacent weapon slots and keeps focus range and speed distinct', () => {
    const focus = new SupportModule('focus', 0);
    expect(supportEffectsFor([focus], 'focus', 0)).toEqual({ primary: 0.08, secondary: 0.1 });
    expect(supportEffectsFor([focus], 'focus', 1)).toEqual({ primary: 0.08, secondary: 0.1 });
    expect(supportEffectsFor([focus], 'focus', 2)).toEqual({ primary: 0, secondary: 0 });
    focus.level = 3;
    expect(supportEffectsFor([focus], 'focus', 1)).toEqual({ primary: 0.18, secondary: 0.22 });

    const brake = new SupportModule('brake', 2);
    expect(supportEffectsFor([brake], 'brake', 2).primary).toBe(0.1);
    expect(supportEffectsFor([brake], 'brake', 0).primary).toBe(0.1);
    expect(supportEffectsFor([brake], 'brake', 1).primary).toBe(0);
  });

  it('caps additive support effects at their documented limits', () => {
    const outputA = new SupportModule('output', 0);
    const outputB = new SupportModule('output', 1);
    outputA.level = 3;
    outputB.level = 3;
    expect(supportEffectsFor([outputA, outputB], 'output', 1).primary).toBe(0.4);

    const rhythmA = new SupportModule('rhythm', 0);
    const rhythmB = new SupportModule('rhythm', 1);
    rhythmA.level = 3;
    rhythmB.level = 3;
    expect(supportEffectsFor([rhythmA, rhythmB], 'rhythm', 1).primary).toBe(0.3);

    const observeA = new SupportModule('observe', 0);
    const observeB = new SupportModule('observe', 1);
    observeA.level = 3;
    observeB.level = 3;
    expect(supportEffectsFor([observeA, observeB], 'observe', 1).primary).toBe(0.45);

    const brakeA = new SupportModule('brake', 0);
    const brakeB = new SupportModule('brake', 1);
    brakeA.level = 3;
    brakeB.level = 3;
    expect(supportEffectsFor([brakeA, brakeB], 'brake', 1).primary).toBe(0.45);

    const focusA = new SupportModule('focus', 0);
    const focusB = new SupportModule('focus', 1);
    focusA.level = 3;
    focusB.level = 3;
    expect(supportEffectsFor([focusA, focusB], 'focus', 1)).toEqual({ primary: 0.35, secondary: 0.35 });
  });

  it('installs new weapons and supports on the requested empty face', () => {
    const weapons = [new Weapon('needle', 0), new Weapon('ray', 1)];
    const supports: SupportModule[] = [];
    applyUpgradeCandidate({ id: 'weapon:cluster:new', kind: 'weapon', targetId: 'cluster', title: '', description: '', before: '', after: '', role: '', isExisting: false, placementSlot: 2 }, weapons, supports, () => undefined);
    expect(weapons.find((weapon) => weapon.id === 'cluster')?.slot).toBe(2);
    applyUpgradeCandidate({ id: 'support:focus:new', kind: 'support', targetId: 'focus', title: '', description: '', before: '', after: '', role: '', isExisting: false, placementSlot: 1 }, weapons, supports, () => undefined);
    expect(supports[0]?.slot).toBe(1);
  });

  it('offers and applies a level-three development branch', () => {
    const weapons = [new Weapon('needle', 0)];
    weapons[0]!.level = 2;
    const candidates = createUpgradeCandidateList(weapons, [], 100, new DeterministicRng(2), new Set());
    const branch = candidates.find((candidate) => candidate.id.includes(':branch:'));
    expect(branch).toBeDefined();
    applyUpgradeCandidate(branch!, weapons, [], () => undefined);
    expect(weapons[0]!.level).toBe(3);
    expect(weapons[0]!.branch).not.toBeNull();
  });

  it('offers a separate level-five branch and keeps the level-three branch', () => {
    const weapons = [new Weapon('needle', 0)];
    weapons[0]!.level = 4;
    weapons[0]!.branch = 'spread';
    const candidates = createUpgradeCandidateList(weapons, [], 100, new DeterministicRng(5), new Set());
    expect(candidates).toHaveLength(3);
    expect(candidates.some((candidate) => candidate.id.includes(':branch:piercing:'))).toBe(false);
    const levelFiveBranches = candidates.filter((candidate) => candidate.id.endsWith(':5'));
    expect(levelFiveBranches).toHaveLength(2);
    applyUpgradeCandidate(levelFiveBranches[0]!, weapons, [], () => undefined);
    expect(weapons[0]!.level).toBe(5);
    expect(weapons[0]!.branch).toBe('spread');
    expect(weapons[0]!.finalBranch).not.toBeNull();
    expect(createUpgradeCandidateList(weapons, [], 100, new DeterministicRng(5), new Set()).some((candidate) => candidate.targetId === 'needle' && candidate.id.includes(':branch:'))).toBe(false);
  });

  it('supports every level-three and level-five branch combination without overwriting either choice', () => {
    for (const first of ['spread', 'piercing'] as const) {
      for (const final of ['power', 'tempo'] as const) {
        const weapon = new Weapon('needle', 0);
        weapon.level = 2;
        const levelThree = createUpgradeCandidateList([weapon], [], 100, new DeterministicRng(3), new Set())
          .find((candidate) => candidate.id === `weapon:needle:branch:${first}:3`);
        expect(levelThree).toBeDefined();
        applyUpgradeCandidate(levelThree!, [weapon], [], () => undefined);
        weapon.level = 4;
        const levelFive = createUpgradeCandidateList([weapon], [], 100, new DeterministicRng(3), new Set())
          .find((candidate) => candidate.id === `weapon:needle:branch:${final}:5`);
        expect(levelFive).toBeDefined();
        applyUpgradeCandidate(levelFive!, [weapon], [], () => undefined);
        expect({ branch: weapon.branch, finalBranch: weapon.finalBranch }).toEqual({ branch: first, finalBranch: final });
      }
    }
  });

  it('requires a new item before an existing choice could strand all later additions', () => {
    const weapon = new Weapon('needle', 0);
    weapon.level = 4;
    weapon.branch = 'spread';
    weapon.precisionBonus = 2;
    const candidates = createUpgradeCandidateList([weapon], [], 100, new DeterministicRng(8), new Set());
    const finalBranch = candidates.find((candidate) => candidate.id.endsWith(':5'));
    const newItem = candidates.find((candidate) => !candidate.isExisting);
    expect(finalBranch).toBeDefined();
    expect(newItem).toBeDefined();
    expect(wouldStrandNewItems(finalBranch!, [weapon], [], 100, 100, new Set())).toBe(true);
    expect(wouldStrandNewItems(newItem!, [weapon], [], 100, 100, new Set())).toBe(false);
  });

  it('retries a blocked candidate draw only after experience increases', () => {
    expect(shouldRetryUpgradeDraw(25, null)).toBe(true);
    expect(shouldRetryUpgradeDraw(25, 25)).toBe(false);
    expect(shouldRetryUpgradeDraw(29, 25)).toBe(true);
  });
});
