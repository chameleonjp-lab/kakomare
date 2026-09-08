/** Number of weapon faces and matching support faces around the core. */
export const DEVICE_SLOT_COUNT = 3;

/**
 * Look up an item by its persisted face number.  Arrays are intentionally not
 * used as the source of placement: acquisition order can differ from the
 * selected face.
 */
export function itemAtSlot<T extends { slot: number }>(items: readonly T[], slot: number): T | undefined {
  if (!Number.isInteger(slot) || slot < 0 || slot >= DEVICE_SLOT_COUNT) return undefined;
  return items.find((item) => item.slot === slot);
}

/** Return a sparse, face-ordered view while preserving empty faces. */
export function itemsBySlot<T extends { slot: number }>(items: readonly T[]): Array<T | undefined> {
  return Array.from({ length: DEVICE_SLOT_COUNT }, (_, slot) => itemAtSlot(items, slot));
}

/** The two weapon faces affected by a support on the same face. */
export function adjacentWeaponSlots(supportSlot: number): [number, number] {
  const normalized = ((supportSlot % DEVICE_SLOT_COUNT) + DEVICE_SLOT_COUNT) % DEVICE_SLOT_COUNT;
  return [normalized, (normalized + 1) % DEVICE_SLOT_COUNT];
}

