import { describe, expect, it } from 'vitest';
import { BuildGraph } from '../../src/game/build/BuildGraph';
import { placementLabel, placementNodes } from '../../src/ui/PlacementPreview';
import type { BattleSnapshot } from '../../src/types/game';

describe('placement preview uses combat coordinates and stable slot labels', () => {
  it('defaults to the six initially available nodes', () => {
    expect(placementNodes(null)).toHaveLength(6);
    expect(placementLabel('weapon', 0)).toBe('武器面1（内側・上）');
    expect(placementLabel('support', 0)).toBe('補助面1（内側・右上）');
  });
  it('keeps all expanded numbered faces at their combat positions even if acquisition order differs', () => {
    const graph = new BuildGraph(3);
    graph.install('later', 'weapon', 8);
    graph.install('first', 'weapon', 0);
    const snapshot = { build: { graph: graph.snapshot() } } as BattleSnapshot;
    const nodes = placementNodes(snapshot);
    expect(nodes).toHaveLength(18);
    for (const node of nodes) {
      expect({ x: node.x, y: node.y }).toEqual({ x: graph.nodeFor(node.kind, node.slot)!.x, y: graph.nodeFor(node.kind, node.slot)!.y });
    }
    expect(placementLabel('weapon', 8)).toBe('武器面9（外側・左下）');
    expect(placementLabel('support', 4)).toBe('補助面5（中側・下）');
  });
});
