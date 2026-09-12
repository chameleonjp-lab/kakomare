import { describe, expect, it } from 'vitest';
import { SupportModule, supportEffectsFor } from '../../src/game/entities/SupportModule';
import { Weapon } from '../../src/game/entities/Weapon';
import { SUPPORT_ORDER } from '../../src/data/supports';
import { WEAPON_ORDER } from '../../src/data/weapons';
import { applyUpgradeCandidate, createUpgradeCandidateList, isReplacementCandidate, replacementTargetFor, shouldRetryUpgradeDraw, wouldStrandNewItems } from '../../src/game/systems/UpgradeSystem';
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

  it('offers weapon and support replacement candidates when every unlocked face is occupied', () => {
    const weapons = [new Weapon('needle', 0), new Weapon('ray', 1), new Weapon('cluster', 2)];
    const supports = [new SupportModule('output', 0), new SupportModule('rhythm', 1), new SupportModule('branch', 2)];
    for (const weapon of weapons) weapon.level = 3;
    for (const support of supports) support.level = 3;
    const kinds = new Set<string>();
    let sample: ReturnType<typeof createUpgradeCandidateList>[number] | undefined;
    for (let seed = 1; seed <= 128 && kinds.size < 2; seed += 1) {
      const candidates = createUpgradeCandidateList(weapons, supports, 100, new DeterministicRng(seed), new Set(), 100, {}, {
        weaponSlots: [], supportSlots: [], maxWeapons: 3, maxSupports: 3, enableReplacements: true, competitive: true,
      });
      const replacement = candidates.find((candidate) => isReplacementCandidate(candidate));
      if (replacement) {
        kinds.add(replacement.kind);
        sample ??= replacement;
      }
    }
    expect(kinds).toEqual(new Set(['weapon', 'support']));
    expect(sample).toBeDefined();
    expect(sample?.replacementSlots).toEqual([0, 1, 2]);
    expect(sample?.replacementTargets?.map((target) => target.slot)).toEqual([0, 1, 2]);
    expect(replacementTargetFor({ ...sample!, placementSlot: 1 }, 1)?.instanceId).toBe(
      sample?.replacementTargets?.find((target) => target.slot === 1)?.instanceId,
    );
  });

  it('replaces a weapon at Lv3 without carrying precision, branches, evolution, or instance identity', () => {
    const outgoing = new Weapon('needle', 0);
    outgoing.level = 8;
    outgoing.precisionBonus = 2;
    outgoing.branch = 'spread';
    outgoing.finalBranch = 'tempo';
    outgoing.evolutionId = 'needle-volley';
    outgoing.cooldown = 0.42;
    const weapons = [outgoing, new Weapon('ray', 1), new Weapon('cluster', 2)];
    for (const weapon of weapons.slice(1)) weapon.level = 3;
    let candidate: ReturnType<typeof createUpgradeCandidateList>[number] | undefined;
    for (let seed = 1; seed <= 128 && !candidate; seed += 1) {
      candidate = createUpgradeCandidateList(weapons, [], 100, new DeterministicRng(seed), new Set(), 100, {}, {
        weaponSlots: [], supportSlots: [], maxWeapons: 3, maxSupports: 0, enableReplacements: true, competitive: true,
      }).find((item) => isReplacementCandidate(item) && item.kind === 'weapon' && item.targetId === 'chain');
    }
    expect(candidate).toBeDefined();
    const selected = { ...candidate!, placementSlot: 0, replacementTargetInstanceId: outgoing.instanceId, replacementBranch: candidate!.replacementBranchOptions?.[0]?.id };
    expect(applyUpgradeCandidate(selected, weapons, [], () => undefined)).toBe(true);
    const replacement = weapons.find((weapon) => weapon.id === 'chain');
    expect(replacement).toBeDefined();
    expect(replacement?.slot).toBe(0);
    expect(replacement?.level).toBe(3);
    expect(replacement?.branch).toBe(candidate!.replacementBranchOptions?.[0]?.id);
    expect(replacement?.precisionBonus).toBe(0);
    expect(replacement?.finalBranch).toBeNull();
    expect(replacement?.evolutionId).toBeNull();
    expect(replacement?.cooldown).toBeCloseTo(0.42);
    expect(replacement?.instanceId).not.toBe(outgoing.instanceId);
    expect(weapons.some((weapon) => weapon.id === 'needle')).toBe(false);
  });

  it('rejects a replacement with a stale target or missing Lv3 branch without mutation', () => {
    const weapons = [new Weapon('needle', 0), new Weapon('ray', 1), new Weapon('cluster', 2)];
    for (const weapon of weapons) weapon.level = 3;
    let candidate: ReturnType<typeof createUpgradeCandidateList>[number] | undefined;
    for (let seed = 1; seed <= 128 && !candidate; seed += 1) {
      candidate = createUpgradeCandidateList(weapons, [], 100, new DeterministicRng(seed), new Set(), 100, {}, {
        weaponSlots: [], supportSlots: [], maxWeapons: 3, maxSupports: 0, enableReplacements: true, competitive: true,
      }).find((item) => isReplacementCandidate(item) && item.kind === 'weapon');
    }
    expect(candidate).toBeDefined();
    const before = weapons.map((weapon) => ({ id: weapon.id, instanceId: weapon.instanceId, level: weapon.level }));
    expect(applyUpgradeCandidate({ ...candidate!, placementSlot: 0, replacementTargetInstanceId: 'stale-target' }, weapons, [], () => undefined)).toBe(false);
    expect(weapons.map((weapon) => ({ id: weapon.id, instanceId: weapon.instanceId, level: weapon.level }))).toEqual(before);
    expect(applyUpgradeCandidate({ ...candidate!, placementSlot: 0, replacementTargetInstanceId: weapons[0]!.instanceId }, weapons, [], () => undefined)).toBe(false);
    expect(weapons.map((weapon) => ({ id: weapon.id, instanceId: weapon.instanceId, level: weapon.level }))).toEqual(before);
  });

  it('replaces a support on its selected face and resets its level to at most three', () => {
    const supports = [new SupportModule('output', 0), new SupportModule('rhythm', 1), new SupportModule('branch', 2)];
    for (const support of supports) support.level = 3;
    let candidate: ReturnType<typeof createUpgradeCandidateList>[number] | undefined;
    for (let seed = 1; seed <= 128 && !candidate; seed += 1) {
      candidate = createUpgradeCandidateList([], supports, 100, new DeterministicRng(seed), new Set(), 100, {}, {
        weaponSlots: [], supportSlots: [], maxWeapons: 0, maxSupports: 3, enableReplacements: true, competitive: true,
      }).find((item) => isReplacementCandidate(item) && item.kind === 'support' && item.targetId === 'focus');
    }
    expect(candidate).toBeDefined();
    const outgoing = supports[0]!;
    expect(applyUpgradeCandidate({ ...candidate!, placementSlot: 0, replacementTargetInstanceId: outgoing.instanceId }, [], supports, () => undefined)).toBe(true);
    expect(supports.find((support) => support.id === 'focus')?.slot).toBe(0);
    expect(supports.find((support) => support.id === 'focus')?.level).toBe(3);
    expect(supports.find((support) => support.id === 'focus')?.instanceId).not.toBe(outgoing.instanceId);
    expect(supports.some((support) => support.id === 'output')).toBe(false);
  });

  it('reproducibly draws every remaining weapon/support replacement from the full catalogs', () => {
    const weapons = [new Weapon('needle', 0), new Weapon('ray', 1), new Weapon('cluster', 2)];
    const supports = [new SupportModule('output', 0), new SupportModule('rhythm', 1), new SupportModule('branch', 2)];
    for (const weapon of weapons) { weapon.level = weapon.definition.maxLevel; weapon.precisionBonus = 2; }
    for (const support of supports) support.level = support.definition.maxLevel;
    const weaponIds = new Set<string>();
    const supportIds = new Set<string>();
    for (let seed = 1; seed <= 4096; seed += 1) {
      const candidates = createUpgradeCandidateList(weapons, supports, 100, new DeterministicRng(seed), new Set(), 100, {}, {
        weaponSlots: [], supportSlots: [], maxWeapons: 3, maxSupports: 3, enableReplacements: true, competitive: true,
      });
      for (const candidate of candidates) {
        if (!isReplacementCandidate(candidate)) continue;
        if (candidate.kind === 'weapon') weaponIds.add(String(candidate.targetId));
        if (candidate.kind === 'support') supportIds.add(String(candidate.targetId));
      }
    }
    expect(weaponIds).toEqual(new Set(WEAPON_ORDER.filter((id) => !weapons.some((weapon) => weapon.id === id))));
    expect(supportIds).toEqual(new Set(SUPPORT_ORDER.filter((id) => !supports.some((support) => support.id === id))));
  });

  it('uses a meaningful competitive stabilizer exit and omits profile parts', () => {
    const weapons = [new Weapon('needle', 0), new Weapon('ray', 1), new Weapon('cluster', 2)];
    const supports = [new SupportModule('output', 0), new SupportModule('rhythm', 1), new SupportModule('branch', 2)];
    for (const weapon of weapons) { weapon.level = weapon.definition.maxLevel; weapon.precisionBonus = 2; }
    for (const support of supports) support.level = support.definition.maxLevel;
    const banned = new Set<string>([
      ...WEAPON_ORDER.filter((id) => !weapons.some((weapon) => weapon.id === id)).map((id) => `weapon:${id}:replace`),
      ...SUPPORT_ORDER.filter((id) => !supports.some((support) => support.id === id)).map((id) => `support:${id}:replace`),
    ]);
    const candidates = createUpgradeCandidateList(weapons, supports, 100, new DeterministicRng(7), banned, 100, {}, {
      weaponSlots: [], supportSlots: [], maxWeapons: 3, maxSupports: 3, enableReplacements: true, competitive: true,
    });
    expect(candidates.some((candidate) => candidate.id === 'continuous:stabilizer')).toBe(true);
    expect(candidates.some((candidate) => candidate.id === 'continuous:parts')).toBe(false);
    expect(candidates.find((candidate) => candidate.id === 'continuous:stabilizer')?.description).toContain('威力');
  });

  it('offers repeatable progress when all equipment is at its normal cap', () => {
    const weapons = [new Weapon('needle', 0), new Weapon('ray', 1), new Weapon('cluster', 2)];
    const supports = [new SupportModule('output', 0), new SupportModule('rhythm', 1), new SupportModule('brake', 2)];
    for (const weapon of weapons) {
      weapon.level = weapon.definition.maxLevel;
      weapon.precisionBonus = 2;
      weapon.branch = weapon.definition.branches[0]?.id ?? null;
    }
    for (const support of supports) support.level = support.definition.maxLevel;
    const candidates = createUpgradeCandidateList(weapons, supports, 100, new DeterministicRng(7), new Set());
    expect(candidates).toHaveLength(3);
    expect(candidates.map((candidate) => candidate.id)).toEqual([
      'continuous:polish',
      'continuous:armor',
      'continuous:parts',
    ]);
    expect(candidates.every((candidate) => candidate.canBan === false)).toBe(true);
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
    expect(supportEffectsFor([focusA, focusB], 'focus', 1)).toEqual({ primary: 0.35, secondary: 0.44 });
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

  it('offers and applies one distinct level-eight evolution for a level-seven weapon', () => {
    const weapon = new Weapon('needle', 0);
    weapon.level = 7;
    let evolution = createUpgradeCandidateList([weapon], [], 100, new DeterministicRng(1), new Set(), 100, {}, { maxWeapons: 1, maxSupports: 0, weaponSlots: [], supportSlots: [] })
      .find((candidate) => candidate.id.includes(':evolution:'));
    for (let seed = 2; !evolution && seed <= 20; seed += 1) {
      evolution = createUpgradeCandidateList([weapon], [], 100, new DeterministicRng(seed), new Set(), 100, {}, { maxWeapons: 1, maxSupports: 0, weaponSlots: [], supportSlots: [] })
        .find((candidate) => candidate.id.includes(':evolution:'));
    }
    expect(evolution).toBeDefined();
    expect(evolution?.targetInstanceId).toBe(weapon.instanceId);
    expect(applyUpgradeCandidate(evolution!, [weapon], [], () => undefined)).toBe(true);
    expect(weapon.level).toBe(8);
    expect(weapon.evolutionId).toBe('needle-volley');
    expect(weapon.evolutionDefinition?.name).toBe('多連装針砲');
    expect(createUpgradeCandidateList([weapon], [], 100, new DeterministicRng(1), new Set(), 100, {}, { maxWeapons: 1, maxSupports: 0, weaponSlots: [], supportSlots: [] }).some((candidate) => candidate.id.includes(':evolution:'))).toBe(false);
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

  it('does not strand a run when a normal choice would consume the last ordinary growth', () => {
    const weapon = new Weapon('needle', 0);
    weapon.level = 4;
    weapon.branch = 'spread';
    weapon.precisionBonus = 2;
    const candidates = createUpgradeCandidateList([weapon], [], 100, new DeterministicRng(8), new Set());
    const finalBranch = candidates.find((candidate) => candidate.id.endsWith(':5'));
    const newItem = candidates.find((candidate) => !candidate.isExisting);
    expect(finalBranch).toBeDefined();
    expect(newItem).toBeDefined();
    expect(wouldStrandNewItems(finalBranch!, [weapon], [], 100, 100, new Set())).toBe(false);
    expect(wouldStrandNewItems(newItem!, [weapon], [], 100, 100, new Set())).toBe(false);
  });

  it('keeps the last ordinary support upgrade and fills the rest with different continuous effects', () => {
    const weapons = [new Weapon('needle', 0), new Weapon('ray', 1), new Weapon('cluster', 2)];
    for (const weapon of weapons) {
      weapon.level = weapon.definition.maxLevel;
      weapon.precisionBonus = 2;
    }
    const supports = [new SupportModule('output', 0), new SupportModule('rhythm', 1), new SupportModule('brake', 2)];
    supports[0]!.level = 1;
    supports[1]!.level = supports[1]!.definition.maxLevel;
    supports[2]!.level = supports[2]!.definition.maxLevel;
    const candidates = createUpgradeCandidateList(weapons, supports, 90, new DeterministicRng(12), new Set());
    expect(candidates).toHaveLength(3);
    expect(candidates.some((candidate) => candidate.id === 'support:output:level')).toBe(true);
    expect(candidates.filter((candidate) => candidate.kind === 'continuous')).toHaveLength(2);
  });

  it('fills two ordinary choices with one continuous choice', () => {
    const weapons = [new Weapon('needle', 0), new Weapon('ray', 1), new Weapon('cluster', 2)];
    weapons[0]!.level = weapons[0]!.definition.maxLevel;
    weapons[0]!.precisionBonus = 2;
    weapons[1]!.level = weapons[1]!.definition.maxLevel;
    weapons[1]!.precisionBonus = 2;
    weapons[2]!.level = 4;
    weapons[2]!.precisionBonus = 2;
    const supports = [new SupportModule('output', 0), new SupportModule('rhythm', 1), new SupportModule('brake', 2)];
    for (const support of supports) support.level = support.definition.maxLevel;
    const candidates = createUpgradeCandidateList(weapons, supports, 100, new DeterministicRng(3), new Set());
    expect(candidates).toHaveLength(3);
    expect(candidates.filter((candidate) => candidate.kind !== 'continuous')).toHaveLength(2);
    expect(candidates.filter((candidate) => candidate.kind === 'continuous')).toHaveLength(1);
  });

  it('keeps the continuous exits after all ordinary choices are excluded', () => {
    const weapons = [new Weapon('needle', 0), new Weapon('ray', 1), new Weapon('cluster', 2)];
    weapons[0]!.level = weapons[0]!.definition.maxLevel;
    weapons[0]!.precisionBonus = 2;
    weapons[1]!.level = weapons[1]!.definition.maxLevel;
    weapons[1]!.precisionBonus = 2;
    weapons[2]!.level = 4;
    weapons[2]!.precisionBonus = 2;
    const supports = [new SupportModule('output', 0), new SupportModule('rhythm', 1), new SupportModule('brake', 2)];
    for (const support of supports) support.level = support.definition.maxLevel;
    const first = createUpgradeCandidateList(weapons, supports, 100, new DeterministicRng(3), new Set());
    const ordinaryIds = first.filter((candidate) => candidate.canBan !== false).map((candidate) => candidate.id);
    const candidates = createUpgradeCandidateList(weapons, supports, 100, new DeterministicRng(3), new Set(ordinaryIds));
    expect(candidates).toHaveLength(3);
    expect(candidates.every((candidate) => candidate.kind === 'continuous')).toBe(true);
  });

  it('applies continuous effects through a single explicit callback', () => {
    const applied: string[] = [];
    const weapons = [new Weapon('needle', 0), new Weapon('ray', 1), new Weapon('cluster', 2)];
    const supports = [new SupportModule('output', 0), new SupportModule('rhythm', 1), new SupportModule('brake', 2)];
    for (const weapon of weapons) { weapon.level = weapon.definition.maxLevel; weapon.precisionBonus = 2; }
    for (const support of supports) support.level = support.definition.maxLevel;
    const candidates = createUpgradeCandidateList(weapons, supports, 100, new DeterministicRng(1), new Set());
    for (const candidate of candidates.filter((item) => item.kind === 'continuous')) {
      expect(applyUpgradeCandidate(candidate, [], [], () => undefined, { onContinuous: (id) => applied.push(id) })).toBe(true);
    }
    expect(applied).toEqual(['polish', 'armor', 'parts']);
  });

  it('retries a blocked candidate draw only after experience increases', () => {
    expect(shouldRetryUpgradeDraw(25, null)).toBe(true);
    expect(shouldRetryUpgradeDraw(25, 25)).toBe(false);
    expect(shouldRetryUpgradeDraw(29, 25)).toBe(true);
  });
});
