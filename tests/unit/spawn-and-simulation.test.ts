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
  let maxActive = 0;
  const duration = stageId === 'stage-1' ? 180 : stageId === 'stage-2' ? 210 : 240;
  for (let index = 0; index < duration * 2; index += 1) {
    const elapsed = index / 2;
    const requests: SpawnRequest[] = [];
    director.update(0.5, elapsed, active.length, (request) => requests.push(request));
    for (const request of requests) {
      types.add(request.type);
      active.push(new Enemy(index + active.length + 1, request.type, request.angle, 330, 1 + elapsed * STAGES[stageId].difficultyFactor));
    }
    for (const enemy of active) if (enemy.active && enemy.update(0.5, elapsed, { x: 0, y: 0 }, 1)) enemy.active = false;
    for (let enemyIndex = active.length - 1; enemyIndex >= 0; enemyIndex -= 1) if (!active[enemyIndex]?.active) active.splice(enemyIndex, 1);
    maxActive = Math.max(maxActive, active.length);
  }
  return { emitted: types.size, maxActive, types };
}

describe('spawn director and long simulations', () => {
  it('uses stage-specific waves and spawns the matching boss', () => {
    const stage2 = new SpawnDirector('stage-2', 22);
    expect(stage2.shouldSpawnBoss(STAGES['stage-2'].bossAt - 0.1)).toBe(false);
    expect(stage2.shouldSpawnBoss(STAGES['stage-2'].bossAt)).toBe(true);
    const endless = new SpawnDirector('endless', 23);
    expect(endless.shouldSpawnBoss(300)).toBe(true);
    expect(endless.shouldSpawnBoss(599.9)).toBe(false);
    expect(endless.shouldSpawnBoss(600)).toBe(true);
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
