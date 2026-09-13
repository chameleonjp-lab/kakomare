import type { SupportId } from '../../types/content';
import { SupportModule, supportEffectsFor } from '../entities/SupportModule';
import { Weapon } from '../entities/Weapon';

export interface EffectiveWeaponStats {
  damage: number;
  cooldown: number;
  range: number;
  projectileSpeed: number | null;
  outputBonus: number;
  /** Additional damage from a connected vector while manual aiming. */
  vectorBonus: number;
  rangeBonus: number;
  speedBonus: number;
  intervalBonus: number;
}

/** One calculation path for HUD previews and the live combat system. */
export function effectiveWeaponStats(
  weapon: Weapon,
  supports: readonly SupportModule[],
  baseDamageMultiplier = 1,
  projectileSpeedMultiplier = 1,
  polishStacks = 0,
  manualAim = false,
): EffectiveWeaponStats {
  const veilPenalty = supportEffectsFor(supports, 'veil', weapon.slot).secondary;
  // Veil's weapon penalty is intentionally allowed to remain negative when
  // no output/relay support offsets it. Clamping after subtraction silently
  // removed the documented trade-off from otherwise unboosted weapons.
  const outputBonus = Math.min(0.4,
    supportEffectsFor(supports, 'output', weapon.slot).primary
    + supportEffectsFor(supports, 'relay', weapon.slot).primary,
  ) - veilPenalty;
  const vectorBonus = manualAim ? supportEffectsFor(supports, 'vector', weapon.slot).primary : 0;
  const intervalBonus = supportEffectsFor(supports, 'rhythm', weapon.slot).primary;
  const rangeBonus = supportEffectsFor(supports, 'focus', weapon.slot).primary;
  const speedBonus = supportEffectsFor(supports, 'focus', weapon.slot).secondary;
  // 蓄勢環の一次値は段階数なので、ゲーム内表示の秒数へ変換する。
  // 蓄圧槍の通常のため時間判定だけでなく、定常発射の待機間隔にも
  // 同じ短縮を通す。ほかの武器の発射間隔や蓄積には影響させない。
  const reserveReduction = weapon.id === 'lance'
    ? Math.min(0.24, supportEffectsFor(supports, 'reserve', weapon.slot).primary * 0.08)
    : 0;
  const levelStats = weapon.stats;
  const baseCooldown = levelStats.cooldown * weapon.cooldownMultiplier * Math.max(0.7, 1 - intervalBonus);
  return {
    damage: levelStats.damage * (1 + Math.max(0, polishStacks) * 0.02) * weapon.damageMultiplier * (1 + outputBonus + vectorBonus) * baseDamageMultiplier,
    cooldown: Math.max(0.25, baseCooldown - reserveReduction),
    range: levelStats.range * (1 + rangeBonus),
    projectileSpeed: levelStats.projectileSpeed === undefined ? null : levelStats.projectileSpeed * projectileSpeedMultiplier * (1 + speedBonus),
    outputBonus,
    vectorBonus,
    rangeBonus,
    speedBonus,
    intervalBonus,
  };
}

/** Return the common support values needed by later synergy code. */
export function effectiveSupportValue(supports: readonly SupportModule[], id: SupportId, weaponSlot: number): { primary: number; secondary: number } {
  return supportEffectsFor(supports, id, weaponSlot);
}
