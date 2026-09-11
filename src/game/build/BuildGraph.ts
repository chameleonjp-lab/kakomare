import type { BuildConnection, BuildGraphSnapshot, BuildLayer, BuildNode, BuildNodeId, BuildNodeKind } from '../../types/build';
import { MAX_DEVICE_SLOT_COUNT, SLOTS_PER_LAYER, layerForSlot, nodeIdForSlot } from '../deviceLayout';

const LAYERS: BuildLayer[] = [1, 2, 3];
const DEVICE_RADIUS_BY_LAYER: Record<BuildLayer, number> = { 1: 118, 2: 206, 3: 294 };

/**
 * Deterministic placement graph for the six initial faces and two future
 * concentric layers. The graph owns unlock/occupancy state; the combat
 * entities keep their own mutable level and cooldown state.
 */
export class BuildGraph {
  private readonly nodeList: BuildNode[];
  private readonly occupied = new Map<BuildNodeId, string>();
  private _unlockedLayer: BuildLayer = 1;

  public constructor(initialLayer: BuildLayer = 1) {
    this.nodeList = createNodes();
    this.setUnlockedLayer(initialLayer);
  }

  public get unlockedLayer(): BuildLayer { return this._unlockedLayer; }

  public get nodes(): readonly BuildNode[] {
    return this.nodeList.map((node) => ({ ...node }));
  }

  public get maxSlot(): number { return MAX_DEVICE_SLOT_COUNT - 1; }

  public canUnlockLayer(layer: BuildLayer): boolean {
    return layer > this._unlockedLayer && layer <= 3 && layer === this._unlockedLayer + 1;
  }

  public unlockLayer(layer: BuildLayer): boolean {
    if (!this.canUnlockLayer(layer)) return false;
    this._unlockedLayer = layer;
    this.refreshUnlockFlags();
    return true;
  }

  public unlockNextLayer(): BuildLayer | null {
    if (this._unlockedLayer >= 3) return null;
    const next = (this._unlockedLayer + 1) as BuildLayer;
    return this.unlockLayer(next) ? next : null;
  }

  public isNodeUnlocked(nodeId: BuildNodeId): boolean {
    return this.nodeList.find((node) => node.nodeId === nodeId)?.unlocked ?? false;
  }

  public node(nodeId: BuildNodeId): BuildNode | undefined {
    const found = this.nodeList.find((item) => item.nodeId === nodeId);
    return found ? { ...found } : undefined;
  }

  public nodeFor(kind: BuildNodeKind, slot: number): BuildNode | undefined {
    if (layerForSlot(slot) === null) return undefined;
    const nodeId = nodeIdForSlot(kind, slot);
    return this.node(nodeId);
  }

  public unlockedSlots(kind: BuildNodeKind): number[] {
    return this.nodeList
      .filter((node) => node.kind === kind && node.unlocked)
      .map((node) => node.slot);
  }

  public availableSlots(kind: BuildNodeKind): number[] {
    return this.nodeList
      .filter((node) => node.kind === kind && node.unlocked && !this.occupied.has(node.nodeId))
      .map((node) => node.slot);
  }

  public install(instanceId: string, kind: BuildNodeKind, slot: number): boolean {
    if (!instanceId || !Number.isInteger(slot)) return false;
    const node = this.nodeFor(kind, slot);
    if (!node || !node.unlocked || this.occupied.has(node.nodeId)) return false;
    if ([...this.occupied.values()].includes(instanceId)) return false;
    this.occupied.set(node.nodeId, instanceId);
    return true;
  }

  public remove(kind: BuildNodeKind, slot: number, instanceId?: string): boolean {
    const node = this.nodeFor(kind, slot);
    if (!node) return false;
    const current = this.occupied.get(node.nodeId);
    if (!current || (instanceId !== undefined && current !== instanceId)) return false;
    this.occupied.delete(node.nodeId);
    return true;
  }

  public move(instanceId: string, kind: BuildNodeKind, fromSlot: number, toSlot: number): boolean {
    const from = this.nodeFor(kind, fromSlot);
    if (!from || this.occupied.get(from.nodeId) !== instanceId) return false;
    const to = this.nodeFor(kind, toSlot);
    if (!to || !to.unlocked || (to.nodeId !== from.nodeId && this.occupied.has(to.nodeId))) return false;
    if (to.nodeId === from.nodeId) return true;
    this.occupied.set(to.nodeId, instanceId);
    this.occupied.delete(from.nodeId);
    return true;
  }

  /** Move two installed copies atomically without exposing an empty face. */
  public swap(firstInstanceId: string, secondInstanceId: string, kind: BuildNodeKind): boolean {
    if (!firstInstanceId || !secondInstanceId || firstInstanceId === secondInstanceId) return false;
    const firstNode = this.nodeList.find((node) => node.kind === kind && this.occupied.get(node.nodeId) === firstInstanceId);
    const secondNode = this.nodeList.find((node) => node.kind === kind && this.occupied.get(node.nodeId) === secondInstanceId);
    if (!firstNode || !secondNode || !firstNode.unlocked || !secondNode.unlocked) return false;
    this.occupied.set(firstNode.nodeId, secondInstanceId);
    this.occupied.set(secondNode.nodeId, firstInstanceId);
    return true;
  }

  public instanceAt(kind: BuildNodeKind, slot: number): string | null {
    const node = this.nodeFor(kind, slot);
    return node ? this.occupied.get(node.nodeId) ?? null : null;
  }

  public connectedWeaponNodeIds(supportNodeId: BuildNodeId): [BuildNodeId, BuildNodeId] | null {
    const support = this.node(supportNodeId);
    if (!support || support.kind !== 'support') return null;
    const firstSector = support.sector;
    const secondSector = (support.sector + 1) % SLOTS_PER_LAYER;
    const base = (support.layer - 1) * SLOTS_PER_LAYER;
    return [nodeIdForSlot('weapon', base + firstSector), nodeIdForSlot('weapon', base + secondSector)];
  }

  public connections(): BuildConnection[] {
    return this.nodeList
      .filter((node) => node.kind === 'support' && node.unlocked)
      .map((node) => ({ supportNodeId: node.nodeId, weaponNodeIds: this.connectedWeaponNodeIds(node.nodeId)! }));
  }

  public snapshot(): BuildGraphSnapshot {
    return {
      unlockedLayer: this._unlockedLayer,
      nodes: this.nodeList.map((node) => ({ ...node, occupiedInstanceId: this.occupied.get(node.nodeId) ?? null })),
      connections: this.connections(),
    };
  }

  /** Restore unlocks and occupancy from a validated run checkpoint. */
  public restore(snapshot: BuildGraphSnapshot): boolean {
    if (!snapshot || ![1, 2, 3].includes(snapshot.unlockedLayer) || !Array.isArray(snapshot.nodes)) return false;
    const nextOccupied = new Map<BuildNodeId, string>();
    for (const node of snapshot.nodes) {
      if (!node.occupiedInstanceId) continue;
      const local = this.node(node.nodeId);
      if (!local || local.kind !== node.kind || local.slot !== node.slot || local.layer !== node.layer || node.layer > snapshot.unlockedLayer
        || !node.occupiedInstanceId || nextOccupied.has(node.nodeId) || [...nextOccupied.values()].includes(node.occupiedInstanceId)) return false;
      nextOccupied.set(node.nodeId, node.occupiedInstanceId);
    }
    this.setUnlockedLayer(snapshot.unlockedLayer);
    this.occupied.clear();
    for (const [nodeId, instanceId] of nextOccupied) this.occupied.set(nodeId, instanceId);
    return true;
  }

  /** Reset occupancy while preserving the chosen layer unlock. */
  public clearDevices(): void { this.occupied.clear(); }

  private setUnlockedLayer(layer: BuildLayer): void {
    if (!LAYERS.includes(layer)) return;
    this._unlockedLayer = layer;
    this.refreshUnlockFlags();
  }

  private refreshUnlockFlags(): void {
    for (const node of this.nodeList) node.unlocked = node.layer <= this._unlockedLayer;
  }
}

function createNodes(): BuildNode[] {
  const nodes: BuildNode[] = [];
  for (const layer of LAYERS) {
    const baseSlot = (layer - 1) * SLOTS_PER_LAYER;
    const radius = DEVICE_RADIUS_BY_LAYER[layer];
    for (const kind of ['weapon', 'support'] as const) {
      for (let sector = 0; sector < SLOTS_PER_LAYER; sector += 1) {
        const slot = baseSlot + sector;
        const angle = -Math.PI / 2 + sector * Math.PI * 2 / SLOTS_PER_LAYER + (kind === 'support' ? Math.PI / 3 : 0);
        const parentLayer = layer === 1 ? null : (layer - 1) as BuildLayer;
        const parentNodeId = parentLayer === null ? null : nodeIdForSlot(kind, (parentLayer - 1) * SLOTS_PER_LAYER + sector);
        nodes.push({
          nodeId: nodeIdForSlot(kind, slot),
          kind,
          layer,
          sector,
          slot,
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          parentNodeId,
          unlocked: layer === 1,
        });
      }
    }
  }
  return nodes;
}
