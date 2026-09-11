import { describe, expect, it } from 'vitest';
import { RunSaveService, validateRunSave } from '../../src/services/RunSaveService';
import { RUN_DAMAGED_SAVE_KEY, RUN_SAVE_KEY, RUN_SAVE_TEMP_KEY, type RunSaveEnvelope } from '../../src/types/runSave';
import type { StorageLike } from '../../src/services/SaveService';
import { BuildGraph } from '../../src/game/build/BuildGraph';
import { BuildCapacity } from '../../src/game/build/BuildCapacity';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.values.set(key, value); }
  public removeItem(key: string): void { this.values.delete(key); }
}

function checkpoint(): RunSaveEnvelope {
  return {
    version: 3,
    runId: 'run-checkpoint-1',
    runSeed: 1234,
    stageId: 'endless',
    ruleVersion: 'expansion-v5-runtime',
    contentVersion: 'catalog-v5',
    competitive: true,
    phase: 'paused',
    savedAt: '2026-09-11T00:00:00.000Z',
    tick: 60,
    snapshot: {
      elapsed: 1,
      timeLimit: 0,
      isEndless: true,
      core: 96,
      maxCore: 100,
      level: 2,
      experience: 3,
      nextExperience: 34,
      pendingUpgrades: 0,
      pendingUpgradeSelectionId: null,
      score: 120,
      kills: 4,
      enemies: [],
      projectiles: [],
      weapons: [{ id: 'needle', instanceId: 'weapon-needle-s0', nodeId: 'weapon-l1-s0', slot: 0, level: 2, damageDealt: 42, branch: null, finalBranch: null, evolutionId: null, cooldownRemaining: 0.1, precisionBonus: 0, shotsFired: 2 }],
      supports: [],
      aimAngle: -Math.PI / 2,
      manualAim: false,
      bossActive: false,
      bossDefeated: false,
      sectorDamage: [0, 0, 0, 0, 0, 0],
      effectsLevel: 'standard',
    },
    inputLog: [{ kind: 'aim', tick: 60, angle: 0 }],
    randomState: { 'enemy-spawn': 3, 'candidate-draw': 4, 'combat-effect': 5, presentation: 6 },
    rankingSession: {
      startId: 'start-checkpoint-1',
      playId: 'play-checkpoint-1',
      displayName: '競技者',
      gameSlug: 'kakomare_endless',
      clientVersion: 'kakomare-web-v6',
      ruleVersion: 'expansion-v5-runtime',
      startedAt: '2026-09-11T00:00:00.000Z',
    },
    spawnState: { budget: 1 },
  };
}

describe('RunSaveService', () => {
  it('round trips a v3 safe-boundary checkpoint and isolates loaded data', () => {
    const storage = new MemoryStorage();
    const service = new RunSaveService(storage);
    const source = checkpoint();
    expect(service.persist(source)).toBe(true);
    expect(storage.getItem(RUN_SAVE_TEMP_KEY)).toBeNull();
    const loaded = service.load();
    expect(loaded).toMatchObject({ recovered: false, data: { runId: source.runId, phase: 'paused' } });
    loaded.data!.snapshot.weapons[0]!.level = 8;
    expect(service.load().data!.snapshot.weapons[0]!.level).toBe(2);
    expect(service.hasSavedRun()).toBe(true);
  });

  it('recovers a write-ahead temporary checkpoint when the canonical value is damaged', () => {
    const storage = new MemoryStorage();
    const source = checkpoint();
    storage.setItem(RUN_SAVE_KEY, '{broken');
    storage.setItem(RUN_SAVE_TEMP_KEY, JSON.stringify(source));
    const loaded = new RunSaveService(storage).load();
    expect(loaded.data?.runId).toBe(source.runId);
    expect(loaded.recovered).toBe(true);
    expect(storage.getItem(RUN_DAMAGED_SAVE_KEY)).toBe('{broken');
    expect(storage.getItem(RUN_SAVE_KEY)).toContain(source.runId);

    const newer = structuredClone(source);
    newer.tick = 120;
    newer.savedAt = '2026-09-11T00:00:02.000Z';
    storage.setItem(RUN_SAVE_KEY, JSON.stringify(source));
    storage.setItem(RUN_SAVE_TEMP_KEY, JSON.stringify(newer));
    const preferred = new RunSaveService(storage).load();
    expect(preferred.data?.tick).toBe(120);
    expect(preferred.recovered).toBe(true);
    expect(storage.getItem(RUN_SAVE_TEMP_KEY)).toBeNull();

    storage.removeItem(RUN_SAVE_KEY);
    storage.setItem(RUN_SAVE_TEMP_KEY, JSON.stringify(newer));
    const temporaryOnly = new RunSaveService(storage).load();
    expect(temporaryOnly.data?.tick).toBe(120);
    expect(temporaryOnly.recovered).toBe(true);
  });

  it('rejects malformed nested input instead of throwing', () => {
    const source = checkpoint() as unknown as Record<string, unknown>;
    source.inputLog = [{ kind: 'upgrade', tick: 1, selectionId: 1, candidateId: 42 }];
    expect(validateRunSave(source)).toBeNull();
    source.inputLog = [{ kind: 'unknown', tick: 1 }];
    expect(validateRunSave(source)).toBeNull();
  });

  it('rejects unsafe random state and malformed runtime containers before restore', () => {
    const source = checkpoint() as unknown as Record<string, unknown>;
    source.randomState = { 'enemy-spawn': 0x1_0000_0000, 'candidate-draw': 4, 'combat-effect': 5, presentation: 6 };
    expect(validateRunSave(source)).toBeNull();
    source.randomState = { 'enemy-spawn': 3, 'candidate-draw': 4, 'combat-effect': 5, presentation: 6 };
    source.runtimeState = { gravityFields: [null] };
    expect(validateRunSave(source)).toBeNull();
    source.runtimeState = undefined;
    source.inputLog = new Array(100_001);
    expect(validateRunSave(source)).toBeNull();
  });

  it('accepts a complete build graph and rejects duplicate or rewired nodes', () => {
    const source = checkpoint();
    const graph = new BuildGraph();
    const capacity = new BuildCapacity();
    expect(graph.install('weapon-needle-s0', 'weapon', 0)).toBe(true);
    expect(capacity.reserve('weapon-needle-s0', 'weapon')).toBe(true);
    source.snapshot.build = { unlockedLayer: 1, graph: graph.snapshot(), capacity: capacity.snapshot() };
    expect(validateRunSave(source)).not.toBeNull();

    const duplicate = structuredClone(source) as RunSaveEnvelope;
    duplicate.snapshot.build!.graph.nodes[1]!.nodeId = duplicate.snapshot.build!.graph.nodes[0]!.nodeId;
    expect(validateRunSave(duplicate)).toBeNull();

    const rewired = structuredClone(source) as RunSaveEnvelope;
    rewired.snapshot.build!.graph.nodes.find((node) => node.nodeId === 'weapon-l2-s0')!.parentNodeId = 'weapon-l1-s1';
    expect(validateRunSave(rewired)).toBeNull();
  });

  it('retains fractional pending split angles and rejects malformed runtime maps', () => {
    const source = checkpoint();
    source.runtimeState = {
      lastEnemyNotice: '',
      pendingSporeSplits: [0.25, -1.5],
      lanceCharge: [['weapon-needle-s0', 0.4]],
      targetLocks: [['weapon-needle-s0', 4]],
      clock: { accumulatorTicks: 3000, totalSteps: 60 },
    };
    expect(validateRunSave(source)).not.toBeNull();
    const malformed = structuredClone(source) as RunSaveEnvelope;
    (malformed.runtimeState as Record<string, unknown>).targetLocks = [['weapon-needle-s0', 1.5]];
    expect(validateRunSave(malformed)).toBeNull();
  });

  it('requires the saved upgrade payload when a checkpoint resumes into selection', () => {
    const source = checkpoint() as unknown as Record<string, unknown>;
    source.phase = 'upgrade';
    expect(validateRunSave(source)).toBeNull();
  });

  it('rejects projectiles whose source is not present in the saved build', () => {
    const source = checkpoint();
    source.snapshot.projectiles = [{
      id: 1,
      kind: 'needle',
      x: 0,
      y: 0,
      vx: 1,
      vy: 0,
      radius: 2,
      damage: 8,
      life: 1,
      maxLife: 1,
      piercing: 0,
      enemyProjectile: false,
      bounces: 0,
      sourceWeaponId: 'not-a-weapon' as never,
      sourceWeaponInstanceId: 'weapon-needle-s0',
      boundaryRadius: 325,
    }];
    expect(validateRunSave(source)).toBeNull();
  });
});
