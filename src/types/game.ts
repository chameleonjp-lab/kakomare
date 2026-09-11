import type { BossId, EnemyId, StageId, SupportId, WeaponBranch, WeaponFinalBranch, WeaponId } from './content';
import type { BuildGraphSnapshot, CapacitySnapshot, BuildLayer } from './build';
import type { NormalizedRunInput } from '../game/systems/InputRecorder';

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
  /** Time-bounded status markers used by conditional support effects. */
  marked?: boolean;
  burning?: boolean;
  /** A non-colour status cue for telegraph/invulnerable/slow readability. */
  state?: 'normal' | 'telegraph' | 'invulnerable' | 'slowed' | 'shielded';
}

export interface ProjectileSnapshot {
  id: number;
  kind: 'needle' | 'cluster' | 'disc' | 'lance' | 'grid' | 'drone' | 'enemy';
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
  sourceWeaponInstanceId: string | null;
  boundaryRadius: number;
}

export interface WeaponSnapshot {
  id: WeaponId;
  instanceId: string;
  nodeId: string;
  /** Persisted face number; acquisition order is not a placement contract. */
  slot: number;
  level: number;
  damageDealt: number;
  branch: WeaponBranch | null;
  finalBranch: WeaponFinalBranch | null;
  evolutionId: string | null;
  evolutionName?: string;
}

export interface SupportSnapshot {
  id: SupportId;
  instanceId: string;
  nodeId: string;
  level: number;
  slot: number;
}

export interface BuildSnapshot {
  unlockedLayer: BuildLayer;
  graph: BuildGraphSnapshot;
  capacity: CapacitySnapshot;
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
  /** The deferred break token; null when the HUD must not request a choice. */
  pendingUpgradeSelectionId: number | null;
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
  /** V2 build state is emitted with every live snapshot; optional for legacy fixtures. */
  build?: BuildSnapshot;
}

export interface UpgradeCandidate {
  id: string;
  kind: 'weapon' | 'support' | 'repair' | 'continuous' | 'expansion';
  targetId: WeaponId | SupportId | 'core' | 'polish' | 'armor' | 'parts' | 'layer-2' | 'layer-3';
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
  /** Layer unlock candidates are applied through the build graph callback. */
  expansionLayer?: BuildLayer;
  /** Optional installed-copy target used once duplicate weapon/support types exist. */
  targetInstanceId?: string;
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
  ruleVersion?: string;
  inputLog?: NormalizedRunInput[];
  weaponInstanceDamage?: Record<string, number>;
  /** V3 event counts keep interception, deployment, and detonation distinct
   * from damage so support contributions are not inferred from raw damage. */
  weaponEvents?: Partial<Record<WeaponId, { shots: number; intercepts: number; detonations: number }>>;
  build?: BuildSnapshot;
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
