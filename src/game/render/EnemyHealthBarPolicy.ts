import type { EnemySnapshot } from '../../types/game';

const IMPORTANT_ENEMY_TYPES: ReadonlySet<EnemySnapshot['type']> = new Set(['shell', 'lattice', 'guard', 'spore', 'marker', 'dropper', 'phase']);

/**
 * Shield hits are a separate resource from HP and shell armour. Keep the
 * capacities next to the render policy so a segmented gauge cannot silently
 * use a guessed total when a new shielded enemy is added.
 */
const SHIELD_HIT_CAPACITY: Readonly<Partial<Record<EnemySnapshot['type'], number>>> = {
  lattice: 8,
  guard: 4,
};

type HealthBarSubject = Pick<EnemySnapshot, 'type' | 'isBoss' | 'hp' | 'maxHp'>;

export interface ShieldGaugeState {
  /** The number of shield-hit segments for this enemy type. */
  total: number;
  /** Clamped integer count of segments that remain. */
  remaining: number;
}

/**
 * Keep the small common enemies readable without removing useful health data.
 * Special enemies and bosses keep their bars even while undamaged because
 * their mechanics make their remaining health important to the player.
 */
export function shouldDrawHealthBar(enemy: HealthBarSubject): boolean {
  return enemy.isBoss || enemy.hp < enemy.maxHp || IMPORTANT_ENEMY_TYPES.has(enemy.type);
}

/**
 * Return the visible shield-hit state without treating arbitrary `shieldHits`
 * values on non-shield enemies as armour. A zero remaining value is retained
 * so the renderer can leave a clearly empty track after the shield breaks.
 */
export function shieldGaugeState(enemy: Pick<EnemySnapshot, 'type' | 'shieldHits'>): ShieldGaugeState {
  const total = SHIELD_HIT_CAPACITY[enemy.type] ?? 0;
  const shieldHits = Number.isFinite(enemy.shieldHits) ? Math.floor(enemy.shieldHits) : 0;
  return {
    total,
    remaining: total > 0 ? Math.max(0, Math.min(total, shieldHits)) : 0,
  };
}
