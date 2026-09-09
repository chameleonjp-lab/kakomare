import type { BossId, EnemyId, StageId, SupportId, WeaponBranch, WeaponFinalBranch, WeaponId } from './content';

export interface Point {
  x: number;
  y: number;
}

export interface EnemySnapshot {
  id: number;
  type: EnemyId | BossId;
  x: number;
  y: number;
  distanceToCore: number;
  hitRadius: number;
  hp: number;
  maxHp: number;
  shieldHits: number;
  isBoss: boolean;
  invulnerable: boolean;
  telegraph: boolean;
  telegraphPhase?: number;
  slowFactor: number;
  shieldRotation?: number;
}

export interface ProjectileSnapshot {
  id: number;
  kind: 'needle' | 'cluster' | 'disc' | 'enemy';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  damage: number;
  life: number;
  maxLife: number;
  piercing: number;
  enemyProjectile: boolean;
  bounces: number;
  sourceWeaponId: WeaponId | null;
}

export interface WeaponSnapshot {
  id: WeaponId;
  /** Persisted face number; acquisition order is not a placement contract. */
  slot: number;
  level: number;
  damageDealt: number;
  branch: WeaponBranch | null;
  finalBranch: WeaponFinalBranch | null;
}

export interface SupportSnapshot {
  id: SupportId;
  level: number;
  slot: number;
}

export interface BattleSnapshot {
  elapsed: number;
  /** Stage timing is carried with the snapshot so the HUD cannot drift from
   * the active stage when a run is restarted or resumed. */
  timeLimit: number;
  isEndless: boolean;
  core: number;
  maxCore: number;
  level: number;
  experience: number;
  nextExperience: number;
  pendingUpgrades: number;
  score: number;
  kills: number;
  enemies: EnemySnapshot[];
  projectiles: ProjectileSnapshot[];
  weapons: WeaponSnapshot[];
  supports: SupportSnapshot[];
  aimAngle: number;
  manualAim: boolean;
  bossActive: boolean;
  bossDefeated: boolean;
  sectorDamage: number[];
  effectsLevel: 'standard' | 'low' | 'minimum';
}

export interface UpgradeCandidate {
  id: string;
  kind: 'weapon' | 'support' | 'repair' | 'continuous';
  targetId: WeaponId | SupportId | 'core' | 'polish' | 'armor' | 'parts';
  title: string;
  description: string;
  before: string;
  after: string;
  role: string;
  isExisting: boolean;
  details?: string;
  requiresNewItemFirst?: boolean;
  placementSlots?: number[];
  placementSlot?: number;
  /** Continuous safety-net upgrades remain obtainable and cannot be banned. */
  canBan?: boolean;
}

export interface UpgradePayload {
  phase?: 'selection' | 'break';
  selectionId: number;
  candidates: UpgradeCandidate[];
  rerollsLeft: number;
  bansLeft: number;
  pendingCount: number;
  choicesSinceBreak: number;
}

export interface BattleResult {
  stageId: StageId;
  outcome: 'victory' | 'defeat';
  score: number;
  survivalTime: number;
  coreRemaining: number;
  kills: number;
  bossDefeated: boolean;
  bossesDefeated: number;
  bossId: BossId;
  partsEarned: number;
  weaponDamage: Partial<Record<WeaponId, number>>;
  supportUsage: Partial<Record<SupportId, number>>;
  enemyKills: Partial<Record<EnemyId, number>>;
  sectorDamage: number[];
  controlSeconds: { slowed: number; pushed: number; pulled: number };
  mainCause: string;
  upgrades: string[];
  branches: string[];
  runSeed: number;
  newUnlock: StageId | null;
  retired: boolean;
}

export interface BattleCallbacks {
  onSnapshot: (snapshot: BattleSnapshot) => void;
  onUpgrade: (payload: UpgradePayload) => void;
  onFinish: (result: BattleResult) => void;
  onStatus: (message: string) => void;
  /** Optional low-volume cues emitted by actual weapon/kill events. */
  onAudioCue?: (cue: 'shot' | 'heavy' | 'defeat') => void;
  onPauseRequest: () => void;
}
