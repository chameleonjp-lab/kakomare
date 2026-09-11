import { SUPPORTS } from '../../data/supports';
import type { SupportId } from '../../types/content';
import { adjacentWeaponSlots, layerForSlot, nodeIdForSlot, sectorForSlot } from '../deviceLayout';

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
  // Relay is intentionally a small additive bridge rather than a second
  // global output multiplier. Its extra target is resolved by the placement
  // rule below and is capped like the other additive effects.
  relay: { primary: 0.3, secondary: 0.3 },
  // Repair is a conditional count/value, not a damage stat. The value is
  // consumed by the event that actually intercepts or controls an attack.
  repair: { primary: 9, secondary: 9 },
  shatter: { primary: 0.45, secondary: 6 },
  conductive: { primary: 0.35, secondary: 3 },
  ignite: { primary: 0.45, secondary: 60 },
  brink: { primary: 0.18, secondary: 0.18 },
  anchor: { primary: 0.35, secondary: 1.5 },
  veil: { primary: 0.2, secondary: 0.08 },
  vector: { primary: 0.35, secondary: 0.35 },
  pulse: { primary: 0.42, secondary: 2 },
  reserve: { primary: 3, secondary: 0.22 },
  lattice: { primary: 3, secondary: 3 },
  orbit: { primary: 0.35, secondary: 0.35 },
  catalyst: { primary: 0.45, secondary: 1 },
};

export class SupportModule {
  public readonly id: SupportId;
  /** Stable identity of this installed copy; support type is not an identity. */
  public readonly instanceId: string;
  public level = 1;
  public slot: number;

  public constructor(id: SupportId, slot: number, instanceId?: string) {
    this.id = id;
    this.slot = slot;
    // Keep the default stable across seeded runs; a persisted ID is used when
    // a later build workflow needs to move or replace an existing instance.
    this.instanceId = instanceId ?? `support-${id}-s${slot}`;
  }

  public get nodeId() { return nodeIdForSlot('support', this.slot); }

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
    return supportWeaponSlots(this.id, this.slot).includes(weaponSlot);
  }
}

/** Resolve the visible connection contract in one place for combat and UI. */
export function supportWeaponSlots(id: SupportId, supportSlot: number): number[] {
  const adjacent = adjacentWeaponSlots(supportSlot);
  if (id !== 'relay') return adjacent;
  const layer = layerForSlot(supportSlot);
  const sector = sectorForSlot(supportSlot);
  if (layer === null || sector === null || layer <= 1) return adjacent;
  // A relay can reach the matching sector of the immediately inner layer,
  // but never chains through another relay. This keeps the bridge finite and
  // makes the drawn connection equal to the calculation target.
  return [...adjacent, (layer - 2) * 3 + sector];
}

export function supportEffectsFor(supports: readonly SupportModule[], id: SupportId, weaponSlot: number): { primary: number; secondary: number } {
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
