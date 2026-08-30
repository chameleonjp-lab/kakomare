import { Core } from '../entities/Core';
import { Enemy } from '../entities/Enemy';

export interface DamageResult {
  amount: number;
  blocked: boolean;
  destroyed: boolean;
}

export function applyDamage(enemy: Enemy, amount: number, elapsed: number): DamageResult {
  const result = enemy.damage(amount, elapsed);
  return { amount: result.dealt, blocked: result.blocked, destroyed: result.destroyed };
}

export function applyContactDamage(core: Core, enemy: Enemy): number {
  if (!enemy.active || enemy.isBoss && enemy.radius > 52) return 0;
  enemy.active = false;
  return core.damage(enemy.contactDamage);
}
