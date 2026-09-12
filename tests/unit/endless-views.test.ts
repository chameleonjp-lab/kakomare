import { describe, expect, it } from 'vitest';
import { topContributingWeapons, usedSupportIds } from '../../src/ui/ResultView';
import type { BattleResult } from '../../src/types/game';

function result(overrides: Partial<BattleResult> = {}): BattleResult {
  return {
    stageId: 'endless',
    outcome: 'defeat',
    score: 120,
    survivalTime: 12,
    coreRemaining: 8,
    kills: 3,
    bossDefeated: false,
    bossesDefeated: 0,
    bossId: 'echo',
    partsEarned: 20,
    weaponDamage: {},
    supportUsage: {},
    enemyKills: {},
    sectorDamage: [0, 0, 0, 0, 0, 0],
    controlSeconds: { slowed: 0, pushed: 0, pulled: 0 },
    mainCause: '確認',
    upgrades: [],
    branches: [],
    runSeed: 4,
    newUnlock: null,
    retired: false,
    ...overrides,
  };
}

describe('endless result summaries', () => {
  it('sorts weapon types by contribution and caps the visible list at three', () => {
    const summary = topContributingWeapons(result({
      weaponDamage: { needle: 80, ray: 240, cluster: 120, repulse: 60, chain: 0 },
      weaponInstances: [
        { id: 'needle', instanceId: 'weapon-old-1', nodeId: 'weapon-node-1', slot: 0, level: 1, damageDealt: 80, branch: null, finalBranch: null, evolutionId: null },
      ],
    }));
    expect(summary).toEqual([
      { id: 'ray', damage: 240 },
      { id: 'cluster', damage: 120 },
      { id: 'needle', damage: 80 },
    ]);
    expect(summary).not.toContainEqual(expect.objectContaining({ id: 'repulse' }));
  });

  it('uses stable weapon-order ties and never exposes instance identity', () => {
    const summary = topContributingWeapons(result({ weaponDamage: { ray: 50, needle: 50, cluster: 10 } }));
    expect(summary.map((entry) => entry.id)).toEqual(['needle', 'ray', 'cluster']);
    expect(summary.every((entry) => !entry.id.includes('weapon-'))).toBe(true);
  });

  it('returns only supports recorded as used', () => {
    expect(usedSupportIds(result({ supportUsage: { output: 2, repair: 1, pulse: 0, veil: -1 } }))).toEqual(['output', 'repair']);
  });
});
