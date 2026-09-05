import { SUPPORTS } from '../../data/supports';
import type { SupportId } from '../../types/content';

export const SUPPORT_EFFECT_CAPS: Record<SupportId, { primary: number; secondary: number }> = {
  output: { primary: 0.4, secondary: 0.4 },
  rhythm: { primary: 0.3, secondary: 0.3 },
  branch: { primary: Number.POSITIVE_INFINITY, secondary: Number.POSITIVE_INFINITY },
  focus: { primary: 0.35, secondary: 0.35 },
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
    return this.slot === weaponSlot || (this.slot + 1) % 3 === weaponSlot;
  }
}

export function supportEffectsFor(supports: SupportModule[], id: SupportId, weaponSlot: number): { primary: number; secondary: number } {
  const total = supports
    .filter((support) => support.id === id && support.affectsWeaponSlot(weaponSlot))
    .reduce((sum, support) => ({ primary: sum.primary + support.value, secondary: sum.secondary + support.secondaryValue }), { primary: 0, secondary: 0 });
  const caps = SUPPORT_EFFECT_CAPS[id];
  return { primary: Math.min(caps.primary, total.primary), secondary: Math.min(caps.secondary, total.secondary) };
}
