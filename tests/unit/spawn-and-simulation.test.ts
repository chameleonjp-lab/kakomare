import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../../src/data/enemies';
import { STAGES } from '../../src/data/stages';
import { Enemy } from '../../src/game/entities/Enemy';
import { DeterministicRng, SpawnDirector, seedFromStage, type SpawnRequest } from '../../src/game/systems/SpawnDirector';
import type { EnemyId, StageId } from '../../src/types/content';

function runSpawnSimulation(stageId: StageId, run: number): { emitted: number; maxActive: number; types: Set<EnemyId> } {
  const director = new SpawnDirector(stageId, seedFromStage(stageId, 1_000 + run, run));
  const active: Enemy[] = [];
  const types = new Set<EnemyId>();
  let emitted = 0;
  let maxActive = 0;
  const duration = stageId === 'stage-1' ? 180 : stageId === 'stage-2' ? 210 : 240;
  for (let index = 0; index < duration * 2; index += 1) {
    const elapsed = index / 2;
    const requests: SpawnRequest[] = [];
    director.update(0.5, elapsed, active.length, (request) => requests.push(request));
    for (const request of requests) {
      emitted += 1;
      types.add(request.type);
      active.push(new Enemy(index + active.length + 1, request.type, request.angle, 330, 1 + elapsed * STAGES[stageId].difficultyFactor));
    }
    for (const enemy of active) if (enemy.active && enemy.update(0.5, elapsed, { x: 0, y: 0 }, 1)) enemy.active = false;
    for (let enemyIndex = active.length - 1; enemyIndex >= 0; enemyIndex -= 1) if (!active[enemyIndex]?.active) active.splice(enemyIndex, 1);
    maxActive = Math.max(maxActive, active.length);
  }
  return { emitted, maxActive, types };
}

function spawnSequence(stageId: StageId, frameSeconds: number, duration: number): EnemyId[] {
  const director = new SpawnDirector(stageId, 7_319);
  const sequence: EnemyId[] = [];
  let elapsed = 0;
  while (elapsed + 1e-9 < duration) {
    const seconds = Math.min(frameSeconds, duration - elapsed);
    elapsed += seconds;
    director.update(seconds, elapsed, 0, (request) => sequence.push(request.type));
  }
  return sequence;
}

describe('spawn director and long simulations', () => {
  it('uses stage-specific waves and spawns the matching boss', () => {
    const stage2 = new SpawnDirector('stage-2', 22);
    expect(stage2.requestBossSpawn(STAGES['stage-2'].bossAt - 0.1)).toBe(false);
    expect(stage2.requestBossSpawn(STAGES['stage-2'].bossAt)).toBe(true);
    expect(stage2.bossSpawned).toBe(false);
    expect(stage2.requestBossSpawn(STAGES['stage-2'].bossAt + 5)).toBe(true);
    stage2.confirmBossSpawn();
    expect(stage2.bossSpawned).toBe(true);
    expect(stage2.requestBossSpawn(STAGES['stage-2'].bossAt + 10)).toBe(false);
    const endless = new SpawnDirector('endless', 23);
    expect(endless.requestBossSpawn(300)).toBe(true);
    expect(endless.requestBossSpawn(599.9)).toBe(true);
    endless.confirmBossSpawn();
    expect(endless.requestBossSpawn(599.9)).toBe(false);
    expect(endless.requestBossSpawn(600)).toBe(true);
    endless.confirmBossSpawn();
    expect(endless.requestBossSpawn(600)).toBe(false);
  });

  it('reserves an endless-mode slot so a pending boss cannot be starved by normal spawns', () => {
    const director = new SpawnDirector('endless', 29);
    const blocked: SpawnRequest[] = [];
    director.update(10, 10, STAGES.endless.enemyLimit - 1, (request) => blocked.push(request), 1);
    expect(blocked).toEqual([]);

    const released: SpawnRequest[] = [];
    director.update(1 / 60, 10 + 1 / 60, STAGES.endless.enemyLimit - 2, (request) => released.push(request), 1);
    expect(released).toHaveLength(1);
  });

  it('raises the special-enemy share after fifteen minutes', () => {
    const director = new SpawnDirector('endless', 7_733);
    const late: EnemyId[] = [];
    for (let elapsed = 0.5; elapsed <= 1_200; elapsed += 0.5) {
      director.update(0.5, elapsed, 0, (request) => { if (elapsed >= 900) late.push(request.type); });
    }
    const specialIds = new Set<EnemyId>(['shell', 'lattice', 'spore', 'marker', 'dropper', 'phase']);
    const specialCount = late.filter((id) => specialIds.has(id)).length;
    expect(late.length).toBeGreaterThan(100);
    expect(specialCount / late.length).toBeGreaterThan(0.75);
    for (const id of specialIds) expect(late).toContain(id);
  });

  it('keeps expensive enemies pending and emits every stage enemy at production timing', () => {
    for (const stageId of ['stage-1', 'stage-2', 'stage-3'] as const) {
      const sequence = spawnSequence(stageId, 1 / 60, STAGES[stageId].timeLimit);
      const emitted = new Set(sequence);
      for (const type of STAGES[stageId].enemies) expect(emitted.has(type), `${stageId} did not emit ${type}`).toBe(true);
      expect(sequence.some((type) => ENEMIES[type].threatCost > 1)).toBe(true);
    }
  });

  it('chooses the same enemy sequence for different caller update widths', () => {
    const expected = spawnSequence('stage-3', 1 / 60, STAGES['stage-3'].timeLimit);
    expect(spawnSequence('stage-3', 1 / 165, STAGES['stage-3'].timeLimit)).toEqual(expected);
    expect(spawnSequence('stage-3', 1 / 120, STAGES['stage-3'].timeLimit)).toEqual(expected);
    expect(spawnSequence('stage-3', 1 / 30, STAGES['stage-3'].timeLimit)).toEqual(expected);
    expect(spawnSequence('stage-3', 0.5, STAGES['stage-3'].timeLimit)).toEqual(expected);
  });

  it('keeps every normal stage stable for 100 deterministic runs', () => {
    for (const stageId of ['stage-1', 'stage-2', 'stage-3'] as const) {
      const runs = Array.from({ length: 100 }, (_, run) => runSpawnSimulation(stageId, run));
      expect(runs.every((result) => Number.isFinite(result.maxActive) && result.maxActive <= STAGES[stageId].enemyLimit)).toBe(true);
      expect(runs.reduce((sum, result) => sum + result.emitted, 0)).toBeGreaterThan(0);
      const allTypes = new Set(runs.flatMap((result) => [...result.types]));
      for (const type of STAGES[stageId].enemies) expect(allTypes.has(type)).toBe(true);
    }
  });

  it('keeps deterministic random choices inside the same content registry', () => {
    const rng = new DeterministicRng(4);
    const values = Array.from({ length: 32 }, () => rng.pick(Object.keys(ENEMIES) as EnemyId[]));
    expect(values.every((id) => id in ENEMIES)).toBe(true);
  });
});
