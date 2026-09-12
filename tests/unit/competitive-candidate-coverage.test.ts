import { describe, expect, it } from 'vitest';
import { WEAPON_ORDER } from '../../src/data/weapons';
import { SUPPORT_ORDER } from '../../src/data/supports';
import { Weapon } from '../../src/game/entities/Weapon';
import { SupportModule } from '../../src/game/entities/SupportModule';
import { DeterministicRng } from '../../src/game/systems/SpawnDirector';
import { createUpgradeCandidateList } from '../../src/game/systems/UpgradeSystem';

describe('competitive content candidate reachability, distinct from unique mechanics acceptance', () => {
  it('draws all 49 non-starting weapons and all 20 supports across deterministic fresh-run seeds', () => {
    const seenWeapons = new Set<string>(['needle']);
    const seenSupports = new Set<string>();
    const draws = new Set<string>();
    for (let seed = 1; seed <= 2048; seed += 1) {
      const draw = createUpgradeCandidateList([new Weapon('needle', 0)], [], 100, new DeterministicRng(seed), new Set(), 100, {}, { competitive: true, enableReplacements: true });
      expect(draw).toHaveLength(3);
      expect(new Set(draw.map((candidate) => candidate.id)).size).toBe(3);
      for (const candidate of draw.filter((item) => item.id.endsWith(':new'))) {
        if (candidate.kind === 'weapon') seenWeapons.add(candidate.targetId);
        if (candidate.kind === 'support') seenSupports.add(candidate.targetId);
      }
      draws.add(draw.map((candidate) => candidate.id).join('|'));
    }
    expect([...seenWeapons].sort()).toEqual([...WEAPON_ORDER].sort());
    expect([...seenSupports].sort()).toEqual([...SUPPORT_ORDER].sort());
    expect(draws.size).toBeGreaterThan(50);
  });

  it('still draws both kinds of replacements after all 18 faces fill, without rewarding profile parts', () => {
    const weapons = WEAPON_ORDER.slice(0, 9).map((id, slot) => new Weapon(id, slot));
    const supports = SUPPORT_ORDER.slice(0, 9).map((id, slot) => new SupportModule(id, slot));
    const seen = new Set<string>();
    for (let seed = 1; seed <= 512; seed += 1) {
      const draw = createUpgradeCandidateList(weapons, supports, 100, new DeterministicRng(seed), new Set(), 100, {}, {
        competitive: true, enableReplacements: true, maxWeapons: 9, maxSupports: 9,
      });
      expect(draw).toHaveLength(3);
      expect(draw.some((candidate) => candidate.id === 'continuous:parts')).toBe(false);
      for (const candidate of draw.filter((item) => item.id.endsWith(':replace'))) {
        seen.add(candidate.kind);
        expect(candidate.replacementSlots?.length).toBeGreaterThan(0);
        expect(candidate.replacementTargets?.every((target) => target.id !== candidate.targetId)).toBe(true);
      }
    }
    expect([...seen].sort()).toEqual(['support', 'weapon']);
  });
});
