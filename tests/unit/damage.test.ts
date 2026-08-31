import { describe, expect, it } from 'vitest';
import { Core } from '../../src/game/entities/Core';
import { Enemy } from '../../src/game/entities/Enemy';
import { Projectile } from '../../src/game/entities/Projectile';
import { applyContactDamage, applyDamage } from '../../src/game/systems/DamageSystem';
import { collideEnemyProjectiles, collideProjectiles } from '../../src/game/systems/CollisionSystem';

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

  it('reports only remaining health when a hit overkills an enemy', () => {
    const enemy = new Enemy(1, 'shard', 0, 100);
    expect(applyDamage(enemy, 1_000, 0).amount).toBe(enemy.maxHp);
  });

  it('lets a friendly projectile destroy a hostile projectile', () => {
    const friendly = new Projectile({ id: 1, kind: 'needle', x: 20, y: 20, vx: 1, vy: 0, radius: 6, damage: 8, life: 1, piercing: 0 });
    const hostile = new Projectile({ id: 2, kind: 'enemy', x: 25, y: 20, vx: -1, vy: 0, radius: 8, damage: 10, life: 1, piercing: 0, enemyProjectile: true });
    expect(collideEnemyProjectiles([friendly, hostile])).toHaveLength(1);
    expect(friendly.active).toBe(false);
    expect(hostile.active).toBe(false);
  });

  it('checks only nearby spatial cells instead of every projectile-enemy pair', () => {
    const enemies = Array.from({ length: 100 }, (_, index) => {
      const enemy = new Enemy(index + 1, 'shard', 0, 100);
      enemy.x = index * 1_000;
      enemy.y = 0;
      return enemy;
    });
    const projectiles = Array.from({ length: 100 }, (_, index) => new Projectile({
      id: index + 1,
      kind: 'needle',
      x: index * 1_000,
      y: 0,
      vx: 1,
      vy: 0,
      radius: 6,
      damage: 100,
      life: 1,
      piercing: 0,
    }));
    const diagnostics = { candidateChecks: 0 };
    expect(collideProjectiles(projectiles, enemies, 0, (projectile) => projectile.damage, diagnostics)).toHaveLength(100);
    expect(diagnostics.candidateChecks).toBeLessThan(500);
  });

  it('stops queued projectile damage after a finishing boss collision', () => {
    const boss = new Enemy(1, 'crown', 0, 100);
    const laterEnemy = new Enemy(2, 'shard', 0, 100);
    boss.hp = 1;
    const projectile = new Projectile({ id: 3, kind: 'needle', x: 100, y: 0, vx: Math.cos(0.5), vy: Math.sin(0.5), radius: 6, damage: 100, life: 1, piercing: 2 });
    const events = collideProjectiles(
      [projectile],
      [boss, laterEnemy],
      0,
      () => 100,
      undefined,
      (event) => event.destroyed && event.enemy.isBoss,
    );
    expect(events).toHaveLength(1);
    expect(boss.active).toBe(false);
    expect(laterEnemy.hp).toBe(laterEnemy.maxHp);
  });
});
