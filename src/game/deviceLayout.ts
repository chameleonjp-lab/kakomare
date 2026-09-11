import type { BuildNodeId } from '../types/build';

/** Number of weapon faces and matching support faces in one layer. */
export const DEVICE_SLOT_COUNT = 3;
export const SLOTS_PER_LAYER = DEVICE_SLOT_COUNT;
export const MAX_BUILD_LAYER = 3;
export const MAX_DEVICE_SLOT_COUNT = DEVICE_SLOT_COUNT * MAX_BUILD_LAYER;

export type DeviceKind = 'weapon' | 'support';

export function layerForSlot(slot: number): number | null {
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_DEVICE_SLOT_COUNT) return null;
  return Math.floor(slot / SLOTS_PER_LAYER) + 1;
}

export function sectorForSlot(slot: number): number | null {
  if (layerForSlot(slot) === null) return null;
  return ((slot % SLOTS_PER_LAYER) + SLOTS_PER_LAYER) % SLOTS_PER_LAYER;
}

export function nodeIdForSlot(kind: DeviceKind, slot: number): BuildNodeId {
  const layer = layerForSlot(slot) ?? 1;
  const sector = sectorForSlot(slot) ?? 0;
  return `${kind}-l${layer}-s${sector}` as BuildNodeId;
}

/**
 * Look up an item by its persisted face number.  Arrays are intentionally not
 * used as the source of placement: acquisition order can differ from the
 * selected face.
 */
export function itemAtSlot<T extends { slot: number }>(items: readonly T[], slot: number): T | undefined {
  if (!Number.isInteger(slot) || slot < 0 || slot >= DEVICE_SLOT_COUNT) return undefined;
  return items.find((item) => item.slot === slot);
}

/** Look up a face in the expanded 6→12→18-slot address space. */
export function itemAtExpandedSlot<T extends { slot: number }>(items: readonly T[], slot: number): T | undefined {
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_DEVICE_SLOT_COUNT) return undefined;
  return items.find((item) => item.slot === slot);
}

export function slotsForLayer(layer: number): number[] {
  if (!Number.isInteger(layer) || layer < 1 || layer > MAX_BUILD_LAYER) return [];
  const first = (layer - 1) * SLOTS_PER_LAYER;
  return Array.from({ length: SLOTS_PER_LAYER }, (_, index) => first + index);
}

/** Return a sparse, face-ordered view while preserving empty faces. */
export function itemsBySlot<T extends { slot: number }>(items: readonly T[]): Array<T | undefined> {
  return Array.from({ length: DEVICE_SLOT_COUNT }, (_, slot) => itemAtSlot(items, slot));
}

/** The two weapon faces affected by a support on the same face. */
export function adjacentWeaponSlots(supportSlot: number): [number, number] {
  const layer = layerForSlot(supportSlot) ?? 1;
  const sector = sectorForSlot(supportSlot) ?? 0;
  const base = (layer - 1) * SLOTS_PER_LAYER;
  return [base + sector, base + (sector + 1) % SLOTS_PER_LAYER];
}
