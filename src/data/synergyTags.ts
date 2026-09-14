import type { SupportId, WeaponId } from '../types/content';

/**
 * Shared labels for choosing a support by the behaviour it improves.  The
 * label is intentionally independent from a weapon/support's own colour so
 * the same colour and text can be matched on both upgrade cards.
 */
export type SynergyTagId =
  | 'power'
  | 'speed'
  | 'range'
  | 'target'
  | 'control'
  | 'shield'
  | 'status'
  | 'defense'
  | 'field'
  | 'aim'
  | 'area'
  | 'charge'
  | 'orbit';

export interface SynergyTagDefinition {
  id: SynergyTagId;
  label: string;
  color: string;
  description: string;
}

export const SYNERGY_TAGS: Record<SynergyTagId, SynergyTagDefinition> = {
  power: { id: 'power', label: '威力', color: '#ffbe5c', description: '出力環・継電環・背水環・指向環と相性がよい' },
  speed: { id: 'speed', label: '連射', color: '#63d7e6', description: '律動環・分岐環と相性がよい' },
  range: { id: 'range', label: '射程', color: '#78a8ff', description: '収束環と相性がよい' },
  target: { id: 'target', label: '特殊敵', color: '#f4e285', description: '観測環・触媒環と相性がよい' },
  control: { id: 'control', label: '制御', color: '#76e6a7', description: '制動環・導電環と相性がよい' },
  shield: { id: 'shield', label: '盾', color: '#f97316', description: '破砕環・格子環と相性がよい' },
  status: { id: 'status', label: '状態', color: '#fb7185', description: '誘爆環・導電環・触媒環と相性がよい' },
  defense: { id: 'defense', label: '防衛', color: '#9be7ff', description: '整備環・薄幕環・格子環と相性がよい' },
  field: { id: 'field', label: '設置', color: '#94a3b8', description: '定着環と相性がよい' },
  aim: { id: 'aim', label: '手動照準', color: '#60a5fa', description: '指向環と相性がよい' },
  area: { id: 'area', label: '範囲', color: '#f59e0b', description: '脈動環・誘爆環と相性がよい' },
  charge: { id: 'charge', label: '蓄圧', color: '#eab308', description: '蓄勢環と相性がよい' },
  orbit: { id: 'orbit', label: '軌道', color: '#34d399', description: '軌道環と相性がよい' },
};

/** Weapon traits that are useful when deciding which supports to connect. */
export const WEAPON_SYNERGY_TAGS: Record<WeaponId, readonly SynergyTagId[]> = {
  needle: ['speed', 'shield', 'aim'],
  ray: ['range', 'shield', 'aim'],
  cluster: ['area', 'range', 'control'],
  repulse: ['defense', 'control', 'area'],
  chain: ['speed', 'area', 'control'],
  orbit: ['defense', 'orbit', 'control'],
  disc: ['orbit', 'speed', 'range'],
  gravity: ['field', 'control', 'area'],
  grid: ['defense', 'shield', 'aim'],
  mine: ['field', 'area', 'defense'],
  lance: ['charge', 'shield', 'range'],
  drone: ['field', 'orbit', 'speed'],
  prism: ['speed', 'aim', 'area'],
  mortar: ['power', 'area', 'aim'],
  ribbon: ['range', 'aim'],
  shockwave: ['area', 'speed', 'aim'],
  barrage: ['speed', 'area', 'aim'],
  anchor: ['range', 'aim', 'power'],
  flare: ['status', 'target', 'aim'],
  cutter: ['shield', 'speed', 'aim'],
  beacon: ['status', 'target', 'aim'],
  nova: ['power', 'area', 'aim'],
  harpoon: ['shield', 'speed', 'aim'],
  vortex: ['area', 'speed', 'aim'],
  ward: ['defense', 'target', 'aim'],
  fan: ['speed', 'area', 'aim'],
  swell: ['area', 'speed', 'aim'],
  seeker: ['speed', 'range', 'aim'],
  drill: ['power', 'shield', 'aim'],
  mist: ['control', 'area', 'status'],
  spark: ['speed', 'area', 'aim'],
  coil: ['range', 'speed', 'aim'],
  bloom: ['area', 'speed', 'aim'],
  shuttle: ['orbit', 'speed', 'aim'],
  siphon: ['control', 'area', 'status'],
  mirror: ['orbit', 'speed', 'aim'],
  stasis: ['control', 'area', 'status'],
  quake: ['power', 'area', 'aim'],
  spoke: ['speed', 'area', 'aim'],
  hollow: ['area', 'power', 'aim'],
  snare: ['control', 'area', 'status'],
  chime: ['speed', 'area', 'aim'],
  thunder: ['power', 'area', 'aim'],
  frost: ['control', 'area', 'status'],
  swarm: ['speed', 'area', 'aim'],
  counter: ['defense', 'target', 'aim'],
  dive: ['shield', 'speed', 'aim'],
  axis: ['speed', 'area', 'aim'],
  seed: ['range', 'target', 'aim'],
  requiem: ['power', 'shield', 'aim'],
};

/** Tags shown on support cards use the same vocabulary as weapon cards. */
export const SUPPORT_SYNERGY_TAGS: Record<SupportId, readonly SynergyTagId[]> = {
  output: ['power'],
  rhythm: ['speed'],
  branch: ['speed'],
  focus: ['range'],
  observe: ['target'],
  brake: ['control'],
  relay: ['power'],
  repair: ['defense'],
  shatter: ['shield'],
  conductive: ['control', 'status'],
  ignite: ['status', 'area'],
  brink: ['power'],
  anchor: ['field'],
  veil: ['defense'],
  vector: ['aim', 'power'],
  pulse: ['area'],
  reserve: ['charge'],
  lattice: ['defense', 'shield'],
  orbit: ['orbit'],
  catalyst: ['status', 'target'],
};

export function synergyTagDefinitions(ids: readonly SynergyTagId[]): SynergyTagDefinition[] {
  return ids.map((id) => SYNERGY_TAGS[id]);
}

export function weaponSynergyTags(id: WeaponId): SynergyTagDefinition[] {
  return synergyTagDefinitions(WEAPON_SYNERGY_TAGS[id]);
}

export function supportSynergyTags(id: SupportId): SynergyTagDefinition[] {
  return synergyTagDefinitions(SUPPORT_SYNERGY_TAGS[id]);
}
