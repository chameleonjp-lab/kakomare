import type { Point } from './game';

/** The three concentric placement layers used by the V2 build foundation. */
export type BuildLayer = 1 | 2 | 3;

export type BuildNodeKind = 'weapon' | 'support';

export type BuildNodeId = `${BuildNodeKind}-l${BuildLayer}-s${number}`;

export interface BuildNode extends Point {
  nodeId: BuildNodeId;
  kind: BuildNodeKind;
  layer: BuildLayer;
  /** Sector within a layer. There are three sectors per device kind. */
  sector: number;
  /** Stable placement slot used by the current combat code. */
  slot: number;
  parentNodeId: BuildNodeId | null;
  unlocked: boolean;
}

export interface BuildConnection {
  supportNodeId: BuildNodeId;
  weaponNodeIds: [BuildNodeId, BuildNodeId];
}

export interface BuildNodeSnapshot extends BuildNode {
  occupiedInstanceId: string | null;
}

export interface BuildGraphSnapshot {
  unlockedLayer: BuildLayer;
  nodes: BuildNodeSnapshot[];
  connections: BuildConnection[];
}

export interface CapacitySnapshot {
  maximum: number;
  used: number;
  remaining: number;
  unlockedLayer: BuildLayer;
  allocations: Array<{ instanceId: string; cost: number; kind: BuildNodeKind }>;
}

