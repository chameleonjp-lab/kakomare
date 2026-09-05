import { Core } from '../entities/Core';
import { Enemy } from '../entities/Enemy';

export interface DamageResult {
  amount: number;
  blocked: boolean;
  destroyed: boolean;
}

export function applyDamage(enemy: Enemy, amount: number, elapsed: number, attackAngle = 0): DamageResult {
  const result = enemy.damage(amount, elapsed, attackAngle);
  return { amount: result.dealt, blocked: result.blocked, destroyed: result.destroyed };
}

export function applyContactDamage(core: Core, enemy: Enemy): number {
  // Bosses stop on the inner ring and use their own special attacks. They are
  // never allowed to become an invisible contact-damage source at the core.
  if (!enemy.active || enemy.isBoss) return 0;
  enemy.active = false;
  return core.damage(enemy.contactDamage);
}
