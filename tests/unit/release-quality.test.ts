import { describe, expect, it } from 'vitest';
import { STAGES } from '../../src/data/stages';
import { Enemy } from '../../src/game/entities/Enemy';
import { EnemyPool } from '../../src/game/pools/EnemyPool';
import { ParticlePool } from '../../src/game/pools/ParticlePool';
import { ProjectilePool } from '../../src/game/pools/ProjectilePool';
import { SpawnDirector, type SpawnRequest } from '../../src/game/systems/SpawnDirector';
import { EffectBudget, selectVisibleEntities } from '../../src/game/systems/EffectBudget';

describe('release-quality budgets', () => {
  it('limits only the rendered selection while retaining highest-priority entities', () => {
    const simulated = Array.from({ length: 180 }, (_, id) => ({ id, danger: id % 17 === 0 }));
    const visible = selectVisibleEntities(simulated, 140, (first, second) => Number(second.danger) - Number(first.danger) || first.id - second.id);
    expect(simulated).toHaveLength(180);
    expect(visible).toHaveLength(140);
    expect(visible.filter((item) => item.danger)).toHaveLength(simulated.filter((item) => item.danger).length);
  });
  function sampleFor(budget: EffectBudget, frameMs: number, start: number, duration: number, rate = 60): number {
    const frames = Math.ceil(duration * rate);
    for (let index = 0; index <= frames; index += 1) budget.sample(frameMs, start + index / rate);
    return start + frames / rate;
  }

  it('never exceeds a lowered particle limit', () => {
    const pool = new ParticlePool();
    for (let index = 0; index < 12; index += 1) pool.emit(index, index, 0xffffff, 1, 4);
    expect(pool.active()).toHaveLength(4);
  });

  it('reuses particle objects after they expire', () => {
    const pool = new ParticlePool();
    pool.emit(1, 2, 0xffffff, 0.1, 4);
    const first = pool.active()[0];
    pool.update(0.2);
    pool.emit(9, 8, 0x000000, 0.3, 4);
    expect(pool.active()[0]).toBe(first);
    expect(pool.size).toBe(1);
    expect(first).toMatchObject({ x: 9, y: 8, color: 0x000000, life: 0.3 });
  });

  it('reuses enemy and projectile pools across 100 restart cycles', () => {
    const enemies = new EnemyPool();
    const projectiles = new ProjectilePool();
    let firstEnemy: Enemy | null = null;
    let firstProjectile: ReturnType<ProjectilePool['acquire']> | null = null;
    let previousEnemyId = 0;
    for (let cycle = 0; cycle < 100; cycle += 1) {
      const enemy = enemies.acquire('shard', cycle, 330, 1);
      const projectile = projectiles.acquire({ kind: 'needle', x: cycle, y: 0, vx: 1, vy: 0, radius: 6, damage: cycle + 1, life: 1, piercing: 0 });
      expect(enemy.id).toBeGreaterThan(previousEnemyId);
      previousEnemyId = enemy.id;
      if (cycle === 0) {
        firstEnemy = enemy;
        firstProjectile = projectile;
      } else {
        expect(enemy).toBe(firstEnemy);
        expect(projectile).toBe(firstProjectile);
        expect(enemy.active).toBe(true);
        expect(projectile.active).toBe(true);
        expect(projectile.hitAt.size).toBe(0);
      }
      projectile.hitAt.set(999, cycle);
      enemy.active = false;
      enemies.clear();
      projectile.active = false;
      projectiles.clear();
    }
    expect(enemies.size).toBe(1);
    expect(projectiles.size).toBe(1);
    expect(enemies.active()).toHaveLength(0);
    expect(projectiles.active()).toHaveLength(0);
  });

  it('keeps an endless-mode spawn simulation bounded for 30 minutes', () => {
    const director = new SpawnDirector('endless', 31);
    const active: Enemy[] = [];
    let nextId = 1;
    let maxActive = 0;
    for (let frame = 0; frame < 1_800 * 60; frame += 1) {
      const elapsed = frame / 60;
      const requests: SpawnRequest[] = [];
      director.update(1 / 60, elapsed, active.length, (request) => requests.push(request));
      for (const request of requests) active.push(new Enemy(nextId++, request.type, request.angle, 330));
      for (const enemy of active) if (enemy.update(1 / 60, elapsed, { x: 0, y: 0 }, 1)) enemy.active = false;
      for (let index = active.length - 1; index >= 0; index -= 1) if (!active[index]?.active) active.splice(index, 1);
      maxActive = Math.max(maxActive, active.length);
    }
    expect(maxActive).toBeLessThanOrEqual(STAGES.endless.enemyLimit);
    expect(Number.isFinite(maxActive)).toBe(true);
  });

  it('adapts effects downward and recovers after sustained stable frames', () => {
    const budget = new EffectBudget('standard');
    let elapsed = sampleFor(budget, 24, 0, 2.1);
    expect(budget.adaptiveEffectsLevel).toBe('low');
    elapsed = sampleFor(budget, 40, elapsed + 1 / 60, 4);
    expect(budget.adaptiveEffectsLevel).toBe('minimum');
    sampleFor(budget, 5, elapsed + 1 / 60, 25);
    expect(budget.adaptiveEffectsLevel).toBe('standard');
  });

  it.each([30, 60, 120])('uses elapsed time rather than sample count at %i Hz', (rate) => {
    const budget = new EffectBudget('standard');
    sampleFor(budget, 24, 0, 2.1, rate);
    expect(budget.adaptiveEffectsLevel).toBe('low');
  });

  it('keeps automatic adaptation independent from reduced-motion rendering', () => {
    const budget = new EffectBudget('standard');
    sampleFor(budget, 45, 0, 1.1);
    expect(budget.adaptiveEffectsLevel).toBe('minimum');
  });

  it('respects the explicit minimum setting while its adaptive state recovers', () => {
    const minimum = new EffectBudget('minimum');
    const elapsed = sampleFor(minimum, 45, 0, 1.1);
    sampleFor(minimum, 5, elapsed + 1 / 60, 25);
    expect(minimum.effectsLevel).toBe('minimum');
    expect(minimum.adaptiveEffectsLevel).toBe('standard');
  });

  it('caps the device pixel ratio at two and lowers it to 1.5 under heavy load', () => {
    const budget = new EffectBudget('standard');
    expect(budget.pixelRatio(3)).toBe(2);
    expect(budget.pixelRatio(1)).toBe(1);
    sampleFor(budget, 45, 0, 1.1);
    expect(budget.pixelRatio(3)).toBe(1.5);
    expect(budget.pixelRatio(1)).toBe(1);
  });
});
