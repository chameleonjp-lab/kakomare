import type { EnemySnapshot } from '../../types/game';

const IMPORTANT_ENEMY_TYPES: ReadonlySet<EnemySnapshot['type']> = new Set(['shell', 'lattice', 'spore', 'marker', 'dropper', 'phase']);

type HealthBarSubject = Pick<EnemySnapshot, 'type' | 'isBoss' | 'hp' | 'maxHp'>;

/**
 * Keep the small common enemies readable without removing useful health data.
 * Special enemies and bosses keep their bars even while undamaged because
 * their mechanics make their remaining health important to the player.
 */
export function shouldDrawHealthBar(enemy: HealthBarSubject): boolean {
  return enemy.isBoss || enemy.hp < enemy.maxHp || IMPORTANT_ENEMY_TYPES.has(enemy.type);
}
