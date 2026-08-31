import { describe, expect, it } from 'vitest';
import { SupportModule } from '../../src/game/entities/SupportModule';
import { Weapon } from '../../src/game/entities/Weapon';
import { applyUpgradeCandidate, createUpgradeCandidateList } from '../../src/game/systems/UpgradeSystem';
import { DeterministicRng } from '../../src/game/systems/SpawnDirector';

describe('UpgradeSystem', () => {
  it('offers three unique candidates with at least two related to the current build', () => {
    const weapons = [new Weapon('needle', 0)];
    const candidates = createUpgradeCandidateList(weapons, [], 100, new DeterministicRng(4), new Set());
    expect(candidates).toHaveLength(3);
    expect(new Set(candidates.map((candidate) => candidate.id)).size).toBe(3);
    expect(candidates.filter((candidate) => candidate.isExisting)).toHaveLength(2);
  });

  it('does not offer a new item when the corresponding slots are full', () => {
    const weapons = [new Weapon('needle', 0), new Weapon('ray', 1), new Weapon('cluster', 2)];
    const supports = [new SupportModule('output', 0), new SupportModule('rhythm', 1), new SupportModule('brake', 2)];
    const candidates = createUpgradeCandidateList(weapons, supports, 100, new DeterministicRng(9), new Set());
    expect(candidates.every((candidate) => !candidate.id.endsWith(':new'))).toBe(true);
  });

  it('applies a focus upgrade and a new support without relying on a second tap', () => {
    const weapons = [new Weapon('needle', 0)];
    const supports: SupportModule[] = [];
    applyUpgradeCandidate({ id: 'weapon:needle:focus', kind: 'weapon', targetId: 'needle', title: '照準', description: '', before: '', after: '', role: '', isExisting: true }, weapons, supports, () => undefined);
    expect(weapons[0]?.precisionBonus).toBe(1);
    applyUpgradeCandidate({ id: 'support:output:new', kind: 'support', targetId: 'output', title: '出力', description: '', before: '', after: '', role: '', isExisting: false }, weapons, supports, () => undefined);
    expect(supports).toHaveLength(1);
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
});
