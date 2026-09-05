import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../../src/data/enemies';
import { STAGES } from '../../src/data/stages';
import { Core } from '../../src/game/entities/Core';
import { Enemy } from '../../src/game/entities/Enemy';
import { Weapon } from '../../src/game/entities/Weapon';
import { applyContactDamage, applyDamage } from '../../src/game/systems/DamageSystem';
import { FixedStepClock } from '../../src/game/systems/FixedStepClock';
import { RunRecorder } from '../../src/game/systems/RunRecorder';
import { SpawnDirector } from '../../src/game/systems/SpawnDirector';
import type { BattleResult } from '../../src/types/game';

interface HeadlessBattleMetrics {
  outcome: BattleResult['outcome'];
  shots: number;
  kills: number;
  core: number;
  score: number;
  bossActions: number;
}

interface EnemyPosition {
  id: number;
  type: string;
  x: number;
  y: number;
  distanceToCore: number;
}

function simulateHeadlessBattle(drawRate: number): HeadlessBattleMetrics {
  const clock = new FixedStepClock();
  const director = new SpawnDirector('stage-1', 41_337);
  const core = new Core(10_000);
  const weapon = new Weapon('needle', 0);
  const recorder = new RunRecorder('stage-1', 'crown', 41_337);
  const enemies: Enemy[] = [];
  let nextEnemyId = 1;
  let elapsed = 0;
  let bossActions = 0;
  let outcome: BattleResult['outcome'] | null = null;

  const step = (seconds: number): void => {
    if (outcome) return;
    elapsed += seconds;
    director.update(seconds, elapsed, enemies.filter((enemy) => enemy.active).length, (request) => {
      enemies.push(new Enemy(nextEnemyId, request.type, request.angle, 330, 1 + elapsed * STAGES['stage-1'].difficultyFactor));
      nextEnemyId += 1;
    });
    if (director.requestBossSpawn(elapsed) && !enemies.some((enemy) => enemy.active && enemy.isBoss)) {
      enemies.push(new Enemy(nextEnemyId, 'crown', 0, 370, 1 + elapsed * STAGES['stage-1'].difficultyFactor));
      nextEnemyId += 1;
      director.confirmBossSpawn();
    }

    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const reachedCore = enemy.update(seconds, elapsed, { x: 0, y: 0 }, 1);
      if (reachedCore) applyContactDamage(core, enemy);
    }
    if (core.health <= 0) {
      outcome = 'defeat';
      return;
    }

    const boss = enemies.find((enemy) => enemy.active && enemy.isBoss);
    if (boss) {
      const wavesDue = Math.min(3, Math.floor((1 - boss.hp / boss.maxHp + 1e-9) / 0.3));
      if (wavesDue > bossActions) bossActions += 1;
    }

    if (weapon.advance(seconds, 1)) {
      const target = boss ?? enemies
        .filter((enemy) => enemy.active && !enemy.isBoss)
        .sort((left, right) => left.distanceToCore - right.distanceToCore || left.id - right.id)[0];
      if (target) {
        const attackAngle = target.isBoss ? target.shieldRotation + 0.5 : Math.atan2(target.y, target.x);
        const result = applyDamage(target, target.isBoss ? 60 : weapon.stats.damage, elapsed, attackAngle);
        recorder.recordWeaponDamage('needle', result.amount);
        if (result.destroyed && target.isBoss) {
          recorder.bossDefeated = true;
          recorder.bossesDefeated += 1;
          recorder.score += 2_000 + STAGES['stage-1'].clearBonus;
          outcome = 'victory';
        } else if (result.destroyed) {
          recorder.kills += 1;
          recorder.recordEnemyKill(target.type as keyof typeof ENEMIES);
          recorder.score += 10 * (1 + ENEMIES[target.type as keyof typeof ENEMIES].threatCost);
        }
      }
    }
    recorder.survivalTime = elapsed;
  };

  for (let frame = 0; frame < drawRate * STAGES['stage-1'].timeLimit; frame += 1) clock.advance(1 / drawRate, step);
  const finalOutcome = outcome ?? 'defeat';
  const result = recorder.result(finalOutcome, core.health, 0);
  return {
    outcome: finalOutcome,
    shots: weapon.shotsFired,
    kills: recorder.kills,
    core: core.health,
    score: result.score,
    bossActions,
  };
}

function simulateEnemyPositions(drawRate: number): EnemyPosition[] {
  const clock = new FixedStepClock();
  const director = new SpawnDirector('stage-1', 90_211);
  const enemies: Enemy[] = [];
  let nextEnemyId = 1;
  let elapsed = 0;
  const step = (seconds: number): void => {
    elapsed += seconds;
    if (director.requestBossSpawn(elapsed) && !enemies.some((enemy) => enemy.active && enemy.isBoss)) {
      enemies.push(new Enemy(nextEnemyId, 'crown', 0, 370, 1 + elapsed * STAGES['stage-1'].difficultyFactor));
      nextEnemyId += 1;
      director.confirmBossSpawn();
    }
    director.update(seconds, elapsed, enemies.filter((enemy) => enemy.active).length, (request) => {
      enemies.push(new Enemy(nextEnemyId, request.type, request.angle, 330, 1 + elapsed * STAGES['stage-1'].difficultyFactor));
      nextEnemyId += 1;
    });
    for (const enemy of enemies) {
      if (enemy.active && enemy.update(seconds, elapsed, { x: 0, y: 0 }, 1)) enemy.active = false;
    }
  };
  for (let frame = 0; frame < drawRate * 180; frame += 1) clock.advance(1 / drawRate, step);
  return enemies
    .filter((enemy) => enemy.active)
    .map((enemy) => ({ id: enemy.id, type: enemy.type, x: enemy.x, y: enemy.y, distanceToCore: enemy.distanceToCore }))
    .sort((left, right) => left.id - right.id);
}

describe('FixedStepClock', () => {
  const simulate = (drawRate: number, seconds: number): { steps: number; simulationSeconds: number } => {
    const clock = new FixedStepClock();
    let steps = 0;
    const frame = 1 / drawRate;
    for (let frameIndex = 0; frameIndex < drawRate * seconds; frameIndex += 1) {
      clock.advance(frame, () => { steps += 1; });
    }
    return { steps, simulationSeconds: clock.getSimulationSeconds() };
  };

  it.each([60, 90, 120, 165])('uses exactly 60 simulation steps per second at %i Hz', (drawRate) => {
    const result = simulate(drawRate, 210);
    expect(result.steps).toBe(210 * 60);
    expect(result.simulationSeconds).toBe(210);
  });

  it('does not accumulate per-frame rounding drift during a long run', () => {
    const expectedSteps = 30 * 60 * 60;
    const results = [60, 90, 120, 165].map((drawRate) => simulate(drawRate, 30 * 60));
    expect(results.map((result) => result.steps)).toEqual([expectedSteps, expectedSteps, expectedSteps, expectedSteps]);
    expect(results.map((result) => result.simulationSeconds)).toEqual([30 * 60, 30 * 60, 30 * 60, 30 * 60]);
  });

  it('keeps battle outcomes and counters identical across render rates', () => {
    const expected = simulateHeadlessBattle(60);
    expect(expected.outcome).toBe('victory');
    expect(expected.shots).toBeGreaterThan(0);
    expect(expected.kills).toBeGreaterThan(0);
    expect(expected.core).toBeGreaterThan(0);
    expect(expected.core).toBeLessThan(10_000);
    expect(expected.score).toBeGreaterThan(0);
    expect(expected.bossActions).toBeGreaterThan(0);
    for (const drawRate of [30, 90, 120, 165]) expect(simulateHeadlessBattle(drawRate)).toEqual(expected);
  });

  it('keeps enemy positions identical at 180 seconds across render rates', () => {
    const expected = simulateEnemyPositions(60);
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.some((enemy) => enemy.type === 'crown')).toBe(true);
    for (const drawRate of [30, 90, 120, 165]) expect(simulateEnemyPositions(drawRate)).toEqual(expected);
  });

  it('limits catch-up work to five steps and drops excessive lag', () => {
    const clock = new FixedStepClock();
    let steps = 0;
    const consumed = clock.advance(1, () => { steps += 1; });
    expect(consumed).toBe(5);
    expect(steps).toBe(5);
    expect(clock.advance(0, () => { steps += 1; })).toBe(0);
  });
});
