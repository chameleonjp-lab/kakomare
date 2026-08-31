import { WEAPONS } from '../../data/weapons';
import type { WeaponBranch, WeaponId } from '../../types/content';

export class Weapon {
  public readonly id: WeaponId;
  public level = 1;
  public cooldown = 0;
  public damageDealt = 0;
  public precisionBonus = 0;
  public branch: WeaponBranch | null = null;
  public shotsFired = 0;
  public slot: number;

  public constructor(id: WeaponId, slot: number) {
    this.id = id;
    this.slot = slot;
  }

  public get definition() {
    return WEAPONS[this.id];
  }

  public get stats() {
    return this.definition.levels[this.level - 1];
  }

  public get damageMultiplier(): number {
    return 1 + this.precisionBonus * 0.06;
  }

  public get branchDefinition() {
    return this.definition.branches.find((branch) => branch.id === this.branch);
  }

  public advance(seconds: number, intervalMultiplier: number): boolean {
    this.cooldown -= seconds;
    if (this.cooldown > 0) return false;
    this.cooldown += this.stats.cooldown * intervalMultiplier;
    this.shotsFired += 1;
    return true;
  }
}
