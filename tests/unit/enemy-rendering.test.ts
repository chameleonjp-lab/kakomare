import { describe, expect, it } from 'vitest';
import { Enemy } from '../../src/game/entities/Enemy';
import { shouldDrawHealthBar } from '../../src/game/render/EnemyHealthBarPolicy';

describe('enemy health bar policy', () => {
  it('hides full bars for common small enemies', () => {
    expect(shouldDrawHealthBar(new Enemy(1, 'shard', 0, 300).snapshot({ x: 0, y: 0 }))).toBe(false);
    expect(shouldDrawHealthBar(new Enemy(2, 'runner', 0, 300).snapshot({ x: 0, y: 0 }))).toBe(false);
  });

  it('keeps full bars for enemies whose mechanics need health feedback', () => {
    for (const [index, type] of (['shell', 'lattice', 'spore', 'marker', 'dropper', 'phase'] as const).entries()) {
      expect(shouldDrawHealthBar(new Enemy(index + 1, type, 0, 300).snapshot({ x: 0, y: 0 }))).toBe(true);
    }
  });

  it('shows a common enemy bar after it takes damage', () => {
    const enemy = new Enemy(1, 'shard', 0, 300);
    enemy.damage(1, 0);
    expect(shouldDrawHealthBar(enemy.snapshot({ x: 0, y: 0 }))).toBe(true);
  });

  it('always shows a boss bar', () => {
    const boss = new Enemy(1, 'echo', 0, 196);
    boss.hp = 1;
    expect(shouldDrawHealthBar(boss.snapshot({ x: 0, y: 0 }))).toBe(true);
  });
});
