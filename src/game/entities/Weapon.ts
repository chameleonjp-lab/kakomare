import { WEAPONS } from '../../data/weapons';
import type { WeaponBranch, WeaponFinalBranch, WeaponId } from '../../types/content';
import { nodeIdForSlot } from '../deviceLayout';

export class Weapon {
  public readonly id: WeaponId;
  /** Stable identity of this installed copy; weapon type is not an identity. */
  public readonly instanceId: string;
  public level = 1;
  public cooldown = 0;
  public damageDealt = 0;
  public precisionBonus = 0;
  public branch: WeaponBranch | null = null;
  public finalBranch: WeaponFinalBranch | null = null;
  /** One-time Lv8 form; kept separate from the two normal branch choices. */
  public evolutionId: string | null = null;
  public shotsFired = 0;
  public slot: number;

  public constructor(id: WeaponId, slot: number, instanceId?: string) {
    this.id = id;
    this.slot = slot;
    // The face is part of the installation identity for the current runtime.
    // Callers that support replacement or replay may provide a persisted ID;
    // the deterministic fallback keeps identical seeded runs comparable.
    this.instanceId = instanceId ?? `weapon-${id}-s${slot}`;
  }

  public get nodeId() { return nodeIdForSlot('weapon', this.slot); }

  public get definition() {
    return WEAPONS[this.id];
  }

  public get stats() {
    return this.definition.levels[this.level - 1];
  }

  /** Baseline projectile pierce is the number of extra victims after the first hit. */
  public get basePiercing(): number {
    const value = this.stats.pierce ?? 0;
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }

  public get needlePiercing(): number {
    // Spread is the multi-direction choice and intentionally does not carry
    // the level-based pierce budget. Only an explicitly selected piercing
    // branch can make a needle pass through more than its first target.
    return this.branch === 'spread' ? 0 : this.basePiercing + (this.branch === 'piercing' ? 2 : 0);
  }

  public get damageMultiplier(): number {
    return (1 + this.precisionBonus * 0.06)
      * (this.finalBranchDefinition?.damageMultiplier ?? 1)
      * (this.evolutionDefinition?.damageMultiplier ?? 1);
  }

  public get cooldownMultiplier(): number {
    return (this.finalBranchDefinition?.cooldownMultiplier ?? 1) * (this.evolutionDefinition?.cooldownMultiplier ?? 1);
  }

  public get branchDefinition() {
    return this.definition.branches.find((branch) => branch.atLevel === 3 && branch.id === this.branch);
  }

  public get finalBranchDefinition() {
    return this.definition.branches.find((branch) => branch.atLevel === 5 && branch.id === this.finalBranch);
  }

  public get evolutionDefinition() {
    return this.definition.evolutions.find((evolution) => evolution.id === this.evolutionId);
  }

  public advance(seconds: number, intervalMultiplier: number): boolean {
    this.cooldown -= seconds;
    if (this.cooldown > 0) return false;
    this.cooldown += this.stats.cooldown * intervalMultiplier * this.cooldownMultiplier;
    this.shotsFired += 1;
    return true;
  }
}
