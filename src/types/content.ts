export type StageId = 'stage-1' | 'stage-2' | 'stage-3' | 'endless';

export type WeaponId = 'needle' | 'ray' | 'cluster' | 'repulse' | 'chain' | 'orbit' | 'disc' | 'gravity';
export type SupportId = 'output' | 'rhythm' | 'branch' | 'focus' | 'observe' | 'brake';
export type EnemyId = 'shard' | 'runner' | 'shell' | 'lattice' | 'spore' | 'marker' | 'dropper' | 'phase';
export type BossId = 'crown' | 'designer' | 'echo';

export type ContentId = WeaponId | SupportId | EnemyId | BossId;

export type WeaponBranch =
  | 'spread'
  | 'piercing'
  | 'wide'
  | 'reflect'
  | 'chain'
  | 'burst'
  | 'split'
  | 'residue'
  | 'many'
  | 'outer'
  | 'echo'
  | 'trail'
  | 'strong-push'
  | 'delayed'
  | 'long'
  | 'collapse';

export type WeaponFinalBranch = 'power' | 'tempo';

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
  chainCount?: number;
  bounceCount?: number;
  orbitRadius?: number;
  orbitSpeed?: number;
  bladeLength?: number;
  hitCooldown?: number;
  duration?: number;
  pullRadius?: number;
  pullStrength?: number;
  safeDistance?: number;
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
  branches: Array<{
    id: WeaponBranch | WeaponFinalBranch;
    name: string;
    description: string;
    atLevel: 3 | 5;
    damageMultiplier?: number;
    cooldownMultiplier?: number;
  }>;
}

export interface SupportDefinition {
  id: SupportId;
  name: string;
  description: string;
  role: string;
  color: number;
  maxLevel: number;
  levels: Array<{ value: number; secondaryValue?: number; label: string }>;
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
  hitRadius?: number;
}

export interface BossDefinition {
  id: BossId;
  name: string;
  description: string;
  hp: number;
  speed: number;
  color: number;
  hitRadius?: number;
  pressure?: {
    interval: number;
    telegraph: number;
    damage: number;
    speed: number;
    life: number;
  };
}

export interface StageDefinition {
  id: StageId;
  name: string;
  timeLimit: number;
  description: string;
  enemies: EnemyId[];
  boss: BossId;
  clearBonus: number;
  budgetBase: number;
  budgetRise: number;
  enemyLimit: number;
  bossAt: number;
  difficultyFactor: number;
  isEndless?: boolean;
}
