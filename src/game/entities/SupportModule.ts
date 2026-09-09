import { SUPPORTS } from '../../data/supports';
import type { SupportId } from '../../types/content';
import { adjacentWeaponSlots } from '../deviceLayout';

export const SUPPORT_EFFECT_CAPS: Record<SupportId, { primary: number; secondary: number }> = {
  output: { primary: 0.4, secondary: 0.4 },
  rhythm: { primary: 0.3, secondary: 0.3 },
  branch: { primary: Number.POSITIVE_INFINITY, secondary: Number.POSITIVE_INFINITY },
  // The documented range cap is 35%. Projectile speed has no lower cap and
  // can reach the sum of the two adjacent level-three modules (22% + 22%).
  // Keeping the two values separate prevents the range cap from silently
  // discarding a valid speed bonus.
  focus: { primary: 0.35, secondary: 0.44 },
  observe: { primary: 0.45, secondary: 0.45 },
  brake: { primary: 0.45, secondary: 0.45 },
};

export class SupportModule {
  public readonly id: SupportId;
  public level = 1;
  public readonly slot: number;

  public constructor(id: SupportId, slot: number) {
    this.id = id;
    this.slot = slot;
  }

  public get definition() {
    return SUPPORTS[this.id];
  }

  public get value() {
    return this.definition.levels[this.level - 1].value;
  }

  public get secondaryValue() {
    return this.definition.levels[this.level - 1].secondaryValue ?? this.value;
  }

  public affectsWeaponSlot(weaponSlot: number): boolean {
    return adjacentWeaponSlots(this.slot).includes(weaponSlot as 0 | 1 | 2);
  }
}

export function supportEffectsFor(supports: SupportModule[], id: SupportId, weaponSlot: number): { primary: number; secondary: number } {
  const matching = supports.filter((support) => support.id === id && support.affectsWeaponSlot(weaponSlot));
  // Branch values are shot intervals (6 → 5 → 4), not bonuses. Adding two
  // intervals would perversely make a second branch module weaker, so use the
  // shortest connected interval and keep the one extra activation contract.
  if (id === 'branch') {
    const interval = matching.reduce((shortest, support) => Math.min(shortest, support.value), Number.POSITIVE_INFINITY);
    return Number.isFinite(interval) ? { primary: interval, secondary: interval } : { primary: 0, secondary: 0 };
  }
  const total = matching.reduce((sum, support) => ({ primary: sum.primary + support.value, secondary: sum.secondary + support.secondaryValue }), { primary: 0, secondary: 0 });
  const caps = SUPPORT_EFFECT_CAPS[id];
  return { primary: Math.min(caps.primary, total.primary), secondary: Math.min(caps.secondary, total.secondary) };
}
