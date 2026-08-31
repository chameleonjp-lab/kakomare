export type StageId = 'stage-1';

export type WeaponId = 'needle' | 'ray' | 'cluster' | 'repulse';
export type SupportId = 'output' | 'rhythm' | 'brake';
export type EnemyId = 'shard' | 'runner' | 'lattice' | 'spore';
export type BossId = 'crown';

export interface WeaponStats {
  damage: number;
  cooldown: number;
  range: number;
  width?: number;
  pierce?: number;
  projectileSpeed?: number;
  count?: number;
  radius?: number;
  pushDistance?: number;
}

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  shortName: string;
  description: string;
  role: string;
  color: number;
  maxLevel: number;
  levels: WeaponStats[];
}

export interface SupportDefinition {
  id: SupportId;
  name: string;
  description: string;
  role: string;
  color: number;
  maxLevel: number;
  levels: Array<{ value: number; label: string }>;
}

export interface EnemyDefinition {
  id: EnemyId;
  name: string;
  description: string;
  hp: number;
  speed: number;
  contactDamage: number;
  threatCost: number;
  color: number;
}

export interface BossDefinition {
  id: BossId;
  name: string;
  description: string;
  hp: number;
  speed: number;
  contactDamage: number;
  color: number;
}

export interface StageDefinition {
  id: StageId;
  name: string;
  timeLimit: number;
  description: string;
  enemies: EnemyId[];
  boss: BossId;
  clearBonus: number;
}
