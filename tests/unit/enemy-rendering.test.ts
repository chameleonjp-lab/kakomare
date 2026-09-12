import { describe, expect, it, vi } from 'vitest';

// EnemyRenderer only needs Phaser's Graphics type at runtime. Mock the module
// so this unit test can exercise the actual draw path in a Node environment.
vi.mock('phaser', () => ({
  default: {
    Geom: {
      Point: class Point {
        public constructor(public x: number, public y: number) {}
      },
    },
  },
}));

import { Enemy } from '../../src/game/entities/Enemy';
import { drawEnemy } from '../../src/game/render/EnemyRenderer';
import { shieldGaugeState, shouldDrawHealthBar } from '../../src/game/render/EnemyHealthBarPolicy';

interface GraphicsCall { method: string; args: unknown[] }

/** Small Graphics double: drawEnemy only needs these path/style primitives. */
function graphicsDouble(): { calls: GraphicsCall[]; graphics: Record<string, (...args: unknown[]) => void> } {
  const calls: GraphicsCall[] = [];
  const methods = ['fillStyle', 'fillRect', 'fillCircle', 'lineStyle', 'strokeCircle', 'lineBetween', 'beginPath', 'arc', 'strokePath', 'moveTo', 'lineTo', 'closePath', 'fillPath', 'strokeRect'];
  const graphics = Object.fromEntries(methods.map((method) => [method, (...args: unknown[]) => { calls.push({ method, args }); }])) as Record<string, (...args: unknown[]) => void>;
  return { calls, graphics };
}

describe('enemy health bar policy', () => {
  it('hides full bars for common small enemies', () => {
    expect(shouldDrawHealthBar(new Enemy(1, 'shard', 0, 300).snapshot({ x: 0, y: 0 }))).toBe(false);
    expect(shouldDrawHealthBar(new Enemy(2, 'runner', 0, 300).snapshot({ x: 0, y: 0 }))).toBe(false);
  });

  it('keeps full bars for enemies whose mechanics need health feedback', () => {
    for (const [index, type] of (['shell', 'lattice', 'guard', 'spore', 'marker', 'dropper', 'phase'] as const).entries()) {
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

  it('exposes a readable state cue for telegraph, invulnerability, and slow', () => {
    const phase = new Enemy(1, 'phase', 0, 300);
    phase.update(0.7, 0.7, { x: 0, y: 0 }, 1);
    expect(phase.snapshot({ x: 0, y: 0 }, 0.7).state).toBe('telegraph');
    phase.update(0.3, 1.0, { x: 0, y: 0 }, 1);
    expect(phase.snapshot({ x: 0, y: 0 }, 1.0).state).toBe('invulnerable');
    const shard = new Enemy(2, 'shard', 0, 300);
    shard.applySlow(0, 2);
    expect(shard.snapshot({ x: 0, y: 0 }, 1).state).toBe('slowed');
  });

  it('keeps shield hits separate from HP and shell armour', () => {
    expect(shieldGaugeState({ type: 'lattice', shieldHits: 5 })).toEqual({ total: 8, remaining: 5 });
    expect(shieldGaugeState({ type: 'guard', shieldHits: 1 })).toEqual({ total: 4, remaining: 1 });
    expect(shieldGaugeState({ type: 'shell', shieldHits: 4 })).toEqual({ total: 0, remaining: 0 });
    expect(shieldGaugeState({ type: 'lattice', shieldHits: 99 })).toEqual({ total: 8, remaining: 8 });
  });

  it('renders one active segment per remaining lattice shield hit', () => {
    const { calls, graphics } = graphicsDouble();
    const enemy = new Enemy(1, 'lattice', 0, 300);
    enemy.shieldHits = 3;
    drawEnemy(graphics as never, enemy.snapshot({ x: 0, y: 0 } as never), 0, 0);
    const arcs = calls.filter((call) => call.method === 'arc');
    expect(arcs).toHaveLength(11); // eight dark track segments plus three active segments
    expect(calls.filter((call) => call.method === 'lineStyle' && call.args[1] === 0xa78bfa && call.args[2] === 1)).toHaveLength(1);

    const spent = graphicsDouble();
    enemy.shieldHits = 0;
    drawEnemy(spent.graphics as never, enemy.snapshot({ x: 0, y: 0 } as never), 0, 0);
    expect(spent.calls.filter((call) => call.method === 'arc')).toHaveLength(8); // the empty track remains readable
    expect(spent.calls.some((call) => call.method === 'lineStyle' && call.args[1] === 0xa78bfa)).toBe(false);
  });
});
