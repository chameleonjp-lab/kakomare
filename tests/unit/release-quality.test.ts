import { describe, expect, it } from 'vitest';
import { STAGES } from '../../src/data/stages';
import { Enemy } from '../../src/game/entities/Enemy';
import { EnemyPool } from '../../src/game/pools/EnemyPool';
import { ParticlePool } from '../../src/game/pools/ParticlePool';
import { ProjectilePool } from '../../src/game/pools/ProjectilePool';
import { SpawnDirector, type SpawnRequest } from '../../src/game/systems/SpawnDirector';
import { EffectBudget } from '../../src/game/systems/EffectBudget';

describe('release-quality budgets', () => {
  it('never exceeds a lowered particle limit', () => {
    const pool = new ParticlePool();
    for (let index = 0; index < 12; index += 1) pool.emit(index, index, 0xffffff, 1, 4);
    expect(pool.active()).toHaveLength(4);
  });

  it('reuses enemy and projectile pools across 100 restart cycles', () => {
    const enemies = new EnemyPool();
    const projectiles = new ProjectilePool();
    for (let cycle = 0; cycle < 100; cycle += 1) {
      const enemy = enemies.acquire('shard', cycle, 330, 1);
      enemy.active = false;
      enemies.clear();
      const projectile = projectiles.acquire({ kind: 'needle', x: 0, y: 0, vx: 1, vy: 0, radius: 6, damage: 1, life: 1, piercing: 0 });
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
    for (let index = 0; index < 180; index += 1) budget.sample(24, index / 60);
    expect(budget.adaptiveEffectsLevel).toBe('low');
    for (let index = 180; index < 360; index += 1) budget.sample(40, index / 60);
    expect(budget.adaptiveEffectsLevel).toBe('minimum');
    for (let index = 360; index < 2_400; index += 1) budget.sample(5, index / 60);
    expect(budget.adaptiveEffectsLevel).toBe('standard');
  });

  it('respects the explicit minimum setting and reduced-motion preference', () => {
    const minimum = new EffectBudget('minimum');
    const reduced = new EffectBudget('standard');
    for (let index = 0; index < 2_400; index += 1) {
      minimum.sample(45, index / 60);
      reduced.sample(45, index / 60, true);
    }
    expect(minimum.effectsLevel).toBe('minimum');
    expect(reduced.effectsLevel).toBe('standard');
  });
});
