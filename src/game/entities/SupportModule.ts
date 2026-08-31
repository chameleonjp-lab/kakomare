import { SUPPORTS } from '../../data/supports';
import type { SupportId } from '../../types/content';

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
  return supports
    .filter((support) => support.id === id && support.affectsWeaponSlot(weaponSlot))
    .reduce((sum, support) => ({ primary: sum.primary + support.value, secondary: sum.secondary + support.secondaryValue }), { primary: 0, secondary: 0 });
}
