export type StageId = 'stage-1' | 'stage-2' | 'stage-3' | 'endless';

/** Runtime V3 weapon set.  The expansion catalogue keeps the remaining 38
 * designs separate, so adding an id here means it is intentionally playable
 * and eligible for in-run acquisition. */
export type WeaponId =
  | 'needle' | 'ray' | 'cluster' | 'repulse' | 'chain' | 'orbit' | 'disc' | 'gravity'
  | 'grid' | 'mine' | 'lance' | 'drone'
  | 'prism' | 'mortar' | 'ribbon' | 'shockwave' | 'barrage' | 'anchor' | 'flare'
  | 'cutter' | 'beacon' | 'nova' | 'harpoon' | 'vortex' | 'ward';
export type SupportId = 'output' | 'rhythm' | 'branch' | 'focus' | 'observe' | 'brake' | 'relay' | 'repair';
export type EnemyId = 'shard' | 'runner' | 'shell' | 'lattice' | 'spore' | 'marker' | 'dropper' | 'phase' | 'charger' | 'guard' | 'repair' | 'factory';
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
  | 'collapse'
  | 'narrow'
  | 'multi-direction'
  | 'near'
  | 'remote'
  | 'shatter';

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
  /** Minimum charge time used by蓄圧槍; ignored by other attack modes. */
  chargeTime?: number;
}

export interface WeaponEvolutionDefinition {
  id: string;
  name: string;
  description: string;
  /** Optional final-branch adjustments are kept additive to the unique path. */
  damageMultiplier?: number;
  cooldownMultiplier?: number;
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
  /** A level-eight, one-time form change.  This is not another basic weapon. */
  evolutions: WeaponEvolutionDefinition[];
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
  shieldHalfAngle?: number;
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
