import { describe, expect, it } from 'vitest';
import { BuildCapacity } from '../../src/game/build/BuildCapacity';
import { BuildGraph } from '../../src/game/build/BuildGraph';
import { ArenaGeometry } from '../../src/game/systems/ArenaGeometry';
import { createCompetitiveRandomStreams } from '../../src/game/systems/RandomStreams';
import { InputRecorder } from '../../src/game/systems/InputRecorder';
import { effectiveWeaponStats } from '../../src/game/systems/CombatStats';
import { Weapon } from '../../src/game/entities/Weapon';
import { SupportModule } from '../../src/game/entities/SupportModule';
import { createUpgradeCandidateList } from '../../src/game/systems/UpgradeSystem';
import { DeterministicRng } from '../../src/game/systems/SpawnDirector';

describe('V2 competitive foundation', () => {
  it('starts with six faces, keeps support connections in-layer, and unlocks 12 then 18 faces', () => {
    const graph = new BuildGraph();
    expect(graph.unlockedSlots('weapon')).toEqual([0, 1, 2]);
    expect(graph.unlockedSlots('support')).toEqual([0, 1, 2]);
    expect(graph.connections()).toHaveLength(3);
    expect(graph.connectedWeaponNodeIds('support-l1-s2')).toEqual(['weapon-l1-s2', 'weapon-l1-s0']);
    expect(graph.install('needle-a', 'weapon', 0)).toBe(true);
    expect(graph.install('ray-a', 'weapon', 3)).toBe(false);
    expect(graph.unlockLayer(2)).toBe(true);
    expect(graph.unlockedSlots('weapon')).toEqual([0, 1, 2, 3, 4, 5]);
    expect(graph.install('ray-a', 'weapon', 3)).toBe(true);
    expect(graph.unlockLayer(3)).toBe(true);
    expect(graph.unlockedSlots('support')).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(graph.install('output-a', 'support', 7)).toBe(true);
    expect(graph.instanceAt('support', 7)).toBe('output-a');
    expect(graph.move('output-a', 'support', 7, 8)).toBe(true);
    expect(graph.instanceAt('support', 7)).toBeNull();
    expect(graph.instanceAt('support', 8)).toBe('output-a');
    expect(graph.nodeFor('weapon', 99)).toBeUndefined();
  });

  it('keeps capacity separate from visible placement and prevents over-allocation', () => {
    const capacity = new BuildCapacity();
    expect(capacity.maximum).toBe(6);
    expect(capacity.reserve('w1', 'weapon', 1)).toBe(true);
    expect(capacity.reserve('s1', 'support', 2)).toBe(true);
    expect(capacity.used).toBe(3);
    expect(capacity.canFit(4)).toBe(false);
    expect(capacity.unlockLayer(2)).toBe(true);
    expect(capacity.maximum).toBe(12);
    expect(capacity.reserve('evolution-1', 'weapon', 3)).toBe(true);
    expect(capacity.release('s1')).toBe(true);
    expect(capacity.snapshot().allocations.map((item) => item.instanceId)).toEqual(['w1', 'evolution-1']);
  });

  it('uses independent purpose streams so candidate draws cannot move enemy randomness', () => {
    const baseline = createCompetitiveRandomStreams(12345);
    const firstEnemy = baseline.enemySpawn.next();
    const secondEnemy = baseline.enemySpawn.next();
    const isolated = createCompetitiveRandomStreams(12345);
    expect(isolated.enemySpawn.next()).toBe(firstEnemy);
    for (let index = 0; index < 100; index += 1) isolated.candidateDraw.next();
    expect(isolated.enemySpawn.next()).toBe(secondEnemy);
    expect(isolated.seeds['enemy-spawn']).not.toBe(isolated.seeds['candidate-draw']);
  });

  it('normalizes verification inputs without truncating the event ledger', () => {
    const recorder = new InputRecorder();
    expect(recorder.record({ kind: 'aim', tick: 3, angle: 3 * Math.PI })).toBe(true);
    expect(recorder.record({ kind: 'upgrade', tick: 3, selectionId: 2, candidateId: 'weapon:ray:new', placementSlot: 4 })).toBe(true);
    expect(recorder.record({ kind: 'pause', tick: 4 })).toBe(true);
    expect(recorder.record({ kind: 'resume', tick: 2 })).toBe(false);
    expect(recorder.snapshot()).toEqual([
      { kind: 'aim', tick: 3, angle: -Math.PI },
      { kind: 'upgrade', tick: 3, selectionId: 2, candidateId: 'weapon:ray:new', placementSlot: 4 },
      { kind: 'pause', tick: 4 },
    ]);
  });

  it('uses one effective-stat calculation path for weapon and support values', () => {
    const weapon = new Weapon('needle', 0, 'weapon-test');
    const support = new SupportModule('output', 0, 'support-test');
    support.level = 3;
    const stats = effectiveWeaponStats(weapon, [support], 1, 1, 2);
    expect(stats.damage).toBeCloseTo(8 * 1.04 * 1.2);
    expect(stats.cooldown).toBeCloseTo(0.16);
    expect(stats.range).toBeCloseTo(560);
  });

  it('derives device origins from placement layers and reflects at the active boundary', () => {
    const geometry = new ArenaGeometry();
    const layerOne = geometry.weaponOrigin({ kind: 'weapon', layer: 1, sector: 0 });
    const layerThree = geometry.weaponOrigin({ kind: 'weapon', layer: 3, sector: 0 });
    expect(Math.hypot(layerOne.x, layerOne.y)).toBeCloseTo(118);
    expect(Math.hypot(layerThree.x, layerThree.y)).toBeCloseTo(294);
    const reflected = geometry.reflect({ x: 326, y: 0 }, { x: 10, y: 4 }, 1);
    expect(reflected?.position.x).toBeCloseTo(324);
    expect(reflected?.velocity.x).toBeCloseTo(-10);
    expect(reflected?.velocity.y).toBeCloseTo(4);
    expect(geometry.reflect({ x: 200, y: 0 }, { x: 10, y: 0 }, 1)).toBeNull();
  });

  it('keeps expansion candidates explicit and does not add design-only catalog entries', () => {
    const expansion = {
      id: 'build:expand:2', kind: 'expansion', targetId: 'layer-2', title: '第2層を開く', description: '',
      before: '配置層 1', after: '配置層 2 / 容量 12', role: '配置拡張', isExisting: true, expansionLayer: 2,
    } as const;
    const candidates = createUpgradeCandidateList(
      [new Weapon('needle', 0)], [], 100, new DeterministicRng(7), new Set(), 100, {},
      { weaponSlots: [1, 2], supportSlots: [0, 1, 2], maxWeapons: 3, maxSupports: 3, expansionCandidates: [expansion] },
    );
    expect(candidates.some((candidate) => candidate.id === 'build:expand:2')).toBe(true);
    expect(candidates.every((candidate) => candidate.kind !== 'expansion' || candidate.isExisting)).toBe(true);
  });
});
