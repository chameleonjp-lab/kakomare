import { describe, expect, it } from 'vitest';
import { Core } from '../../src/game/entities/Core';
import { Enemy } from '../../src/game/entities/Enemy';
import { applyContactDamage, applyDamage } from '../../src/game/systems/DamageSystem';

describe('damage rules', () => {
  it('counts each lattice shield hit before body damage', () => {
    const enemy = new Enemy(1, 'lattice', 0, 100);
    for (let index = 0; index < 8; index += 1) expect(applyDamage(enemy, 100, 0).blocked).toBe(true);
    expect(enemy.shieldHits).toBe(0);
    const result = applyDamage(enemy, 10, 0);
    expect(result.amount).toBe(10);
  });

  it('applies contact damage once and removes the enemy', () => {
    const core = new Core(100);
    const enemy = new Enemy(1, 'shard', 0, 52);
    expect(applyContactDamage(core, enemy)).toBe(5);
    expect(applyContactDamage(core, enemy)).toBe(0);
    expect(core.health).toBe(95);
  });
});
