import { describe, expect, it } from 'vitest';
import { Enemy } from '../../src/game/entities/Enemy';

describe('special enemy rules', () => {
  it('limits the outer shell to 24 damage per hit', () => {
    const enemy = new Enemy(1, 'shell', 0, 300);
    expect(enemy.damage(100, 0).dealt).toBe(24);
  });

  it('makes the phase enemy invulnerable only during its defined window', () => {
    const enemy = new Enemy(1, 'phase', 0, 300);
    enemy.update(0.6, 0.7, { x: 0, y: 0 }, 1);
    expect(enemy.invulnerable).toBe(false);
    enemy.update(0.25, 1.0, { x: 0, y: 0 }, 1);
    expect(enemy.invulnerable).toBe(true);
    expect(enemy.damage(100, 1).blocked).toBe(true);
  });

  it('never pulls a normal enemy inside the 180px safety distance', () => {
    const enemy = new Enemy(1, 'shard', 0, 220);
    enemy.applyPull(0, 0, 100, 1, 180);
    expect(Math.hypot(enemy.x, enemy.y)).toBeGreaterThanOrEqual(180);
  });

  it('shows the dropper warning throughout its full 1.1-second firing delay', () => {
    const enemy = new Enemy(1, 'dropper', 0, 250);
    enemy.update(0.01, 0.01, { x: 0, y: 0 }, 1);
    expect(enemy.telegraph).toBe(true);
    enemy.update(0.89, 0.9, { x: 0, y: 0 }, 1);
    expect(enemy.telegraph).toBe(true);
    enemy.update(0.21, 1.11, { x: 0, y: 0 }, 1);
    expect(enemy.shotCooldown).toBeLessThanOrEqual(0);
  });
});
