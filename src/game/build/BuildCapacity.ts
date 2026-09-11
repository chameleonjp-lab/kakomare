import type { BuildLayer, BuildNodeKind, CapacitySnapshot } from '../../types/build';

export const BUILD_CAPACITY_BY_LAYER: Readonly<Record<BuildLayer, number>> = { 1: 6, 2: 12, 3: 18 };

interface Allocation { cost: number; kind: BuildNodeKind; }

/**
 * Tracks simultaneous active build cost independently from the number of
 * visible placement nodes. This leaves room for later evolution costs.
 */
export class BuildCapacity {
  private _unlockedLayer: BuildLayer = 1;
  private readonly allocations = new Map<string, Allocation>();

  public constructor(initialLayer: BuildLayer = 1) {
    this._unlockedLayer = initialLayer;
  }

  public get unlockedLayer(): BuildLayer { return this._unlockedLayer; }
  public get maximum(): number { return BUILD_CAPACITY_BY_LAYER[this._unlockedLayer]; }
  public get used(): number { return [...this.allocations.values()].reduce((sum, allocation) => sum + allocation.cost, 0); }
  public get remaining(): number { return Math.max(0, this.maximum - this.used); }

  public canUnlockLayer(layer: BuildLayer): boolean {
    return layer === this._unlockedLayer + 1 && layer <= 3;
  }

  public unlockLayer(layer: BuildLayer): boolean {
    if (!this.canUnlockLayer(layer)) return false;
    this._unlockedLayer = layer;
    return true;
  }

  public canFit(cost: number, replacingInstanceId?: string): boolean {
    if (!Number.isFinite(cost) || cost <= 0) return false;
    const replaced = replacingInstanceId ? this.allocations.get(replacingInstanceId)?.cost ?? 0 : 0;
    return this.used - replaced + cost <= this.maximum;
  }

  public reserve(instanceId: string, kind: BuildNodeKind, cost = 1): boolean {
    if (!instanceId || this.allocations.has(instanceId) || !Number.isInteger(cost) || cost <= 0 || !this.canFit(cost)) return false;
    this.allocations.set(instanceId, { cost, kind });
    return true;
  }

  public release(instanceId: string): boolean { return this.allocations.delete(instanceId); }

  public allocation(instanceId: string): { cost: number; kind: BuildNodeKind } | undefined {
    const allocation = this.allocations.get(instanceId);
    return allocation ? { ...allocation } : undefined;
  }

  public snapshot(): CapacitySnapshot {
    return {
      maximum: this.maximum,
      used: this.used,
      remaining: this.remaining,
      unlockedLayer: this._unlockedLayer,
      allocations: [...this.allocations.entries()].map(([instanceId, allocation]) => ({ instanceId, ...allocation })),
    };
  }
}
