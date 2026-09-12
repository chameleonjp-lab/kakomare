import { BuildGraph } from '../game/build/BuildGraph';
import type { BuildNode, BuildNodeKind } from '../types/build';
import type { BattleSnapshot } from '../types/game';
import { element } from './viewUtils';

/** Use the same node coordinates as combat, not acquisition order or a second layout. */
export function placementNodes(snapshot: BattleSnapshot | null): BuildNode[] {
  return (snapshot?.build?.graph.nodes ?? new BuildGraph().snapshot().nodes).filter((node) => node.unlocked);
}

export function placementLabel(kind: BuildNodeKind, slot: number): string {
  const directions = kind === 'weapon' ? ['上', '右下', '左下'] : ['右上', '下', '左上'];
  const rings = ['内側', '中側', '外側'];
  return `${kind === 'weapon' ? '武器' : '補助'}面${slot + 1}（${rings[Math.floor(slot / 3)]}・${directions[slot % 3]}）`;
}

export interface PlacementPreviewOptions {
  kind?: BuildNodeKind;
  slots?: readonly number[];
  selectedSlot?: number;
}

/** Read-only map. Large named buttons below it perform the actual selection. */
export function createPlacementPreview(snapshot: BattleSnapshot | null, options: PlacementPreviewOptions = {}): HTMLElement {
  const figure = element('figure', 'placement-preview');
  figure.dataset.testid = 'placement-preview';
  const caption = element('figcaption', 'placement-caption', '戦場と同じ向きの配置見本');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '-360 -360 720 720');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', '中央がコア。武器は上・右下・左下、補助は右上・下・左上。番号は内側から外側へ増えます。');
  const nodes = placementNodes(snapshot);
  const extent = Math.max(180, ...nodes.map((node) => Math.max(Math.abs(node.x), Math.abs(node.y)) + 60));
  svg.setAttribute('viewBox', `${-extent} ${-extent} ${extent * 2} ${extent * 2}`);
  const graph = snapshot?.build?.graph ?? new BuildGraph().snapshot();
  for (const connection of graph.connections) {
    const support = nodes.find((node) => node.nodeId === connection.supportNodeId);
    if (!support) continue;
    for (const id of connection.weaponNodeIds) {
      const weapon = nodes.find((node) => node.nodeId === id);
      if (!weapon) continue;
      const line = document.createElementNS(svg.namespaceURI, 'line');
      line.setAttribute('x1', String(support.x)); line.setAttribute('y1', String(support.y));
      line.setAttribute('x2', String(weapon.x)); line.setAttribute('y2', String(weapon.y));
      line.setAttribute('class', 'placement-connection');
      svg.append(line);
    }
  }
  for (const node of nodes) {
    const spoke = document.createElementNS(svg.namespaceURI, 'line');
    spoke.setAttribute('x1', '0'); spoke.setAttribute('y1', '0');
    spoke.setAttribute('x2', String(node.x)); spoke.setAttribute('y2', String(node.y));
    spoke.setAttribute('class', 'placement-spoke');
    svg.append(spoke);
  }
  for (const node of nodes) {
    const group = document.createElementNS(svg.namespaceURI, 'g');
    const allowed = options.kind === undefined || (node.kind === options.kind && (options.slots === undefined || options.slots.includes(node.slot)));
    group.setAttribute('class', `placement-node placement-${node.kind}${allowed ? ' placement-available' : ''}${options.kind === node.kind && options.selectedSlot === node.slot ? ' placement-selected' : ''}`);
    group.setAttribute('data-kind', node.kind);
    group.setAttribute('data-slot', String(node.slot));
    group.setAttribute('transform', `translate(${node.x} ${node.y})`);
    const box = document.createElementNS(svg.namespaceURI, 'rect');
    box.setAttribute('x', '-42'); box.setAttribute('y', '-26'); box.setAttribute('width', '84'); box.setAttribute('height', '52'); box.setAttribute('rx', node.kind === 'weapon' ? '8' : '24');
    const text = document.createElementNS(svg.namespaceURI, 'text');
    text.setAttribute('text-anchor', 'middle'); text.setAttribute('y', '8');
    text.textContent = `${node.kind === 'weapon' ? '武' : '補'}${node.slot + 1}`;
    const title = document.createElementNS(svg.namespaceURI, 'title');
    title.textContent = placementLabel(node.kind, node.slot);
    group.append(title, box, text); svg.append(group);
  }
  const core = document.createElementNS(svg.namespaceURI, 'text');
  core.setAttribute('text-anchor', 'middle'); core.setAttribute('y', '8'); core.setAttribute('class', 'placement-core'); core.textContent = 'コア';
  svg.append(core);
  figure.append(caption, svg, element('p', 'placement-legend', '青い四角「武」＝武器／金色の丸「補」＝補助。金色の線は左右の接続先です。配置は下の大きなボタンで選びます。'));
  return figure;
}
