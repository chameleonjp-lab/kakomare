import type { BossId, EnemyId, StageId, SupportId, WeaponId } from './content';

export type ResearchId =
  | 'core-health'
  | 'part-yield'
  | 'weapon-power'
  | 'projectile-speed'
  | 'reroll'
  | 'ban'
  | 'candidate-details'
  | 'enemy-records'
  | 'weapon-records'
  | 'sector-records';

export interface StageRecord {
  bestScore: number;
  bestCore: number;
  bestTime: number;
}

export interface SaveData {
  /** Current progression save schema. Run snapshots use a separate schema. */
  version: 3;
  profile: { name: string };
  progress: {
    unlockedStages: StageId[];
    parts: number;
    researchLevels: Partial<Record<ResearchId, number>>;
  };
  records: {
    stageBest: Partial<Record<StageId, StageRecord>>;
    endlessBest: number;
    enemyKills: Partial<Record<EnemyId | BossId, number>>;
    weaponBestDamage: Partial<Record<WeaponId, number>>;
    sectorDamage: Partial<Record<StageId, number[]>>;
    /** Best records are kept per ruleset so a rules update never overwrites
     * an older competitive result. */
    ruleVersions: Record<string, { endlessBest: number; stageBest: Partial<Record<StageId, StageRecord>> }>;
  };
  settings: {
    audio: number;
    music: number;
    effects: 'standard' | 'low' | 'minimum';
    screenShake: boolean;
    reducedMotion: boolean;
    aimAssist: 'standard' | 'strong';
  };
  statistics: {
    playCount: number;
    clearCount: number;
    totalKills: number;
    weaponUsage: Partial<Record<WeaponId, number>>;
    supportUsage: Partial<Record<SupportId, number>>;
    controlSeconds: { slowed: number; pushed: number; pulled: number };
  };
  migration: { sourceVersion: 1 | 2 | 3; migratedAt: string };
  updatedAt: string;
}

export const SAVE_KEY = 'kakomare-save-v3';
/** Read-only compatibility mirror for older clients and explicit v2 exports. */
export const PREVIOUS_SAVE_KEY = 'kakomare-save-v2';
export const LEGACY_SAVE_KEY = 'kakomare-save-v1';
export const DAMAGED_SAVE_KEY = 'kakomare-damaged-save';
export const SAVE_VERSION = 3 as const;

export function createDefaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    profile: { name: '' },
    progress: { unlockedStages: ['stage-1'], parts: 0, researchLevels: {} },
    records: { stageBest: {}, endlessBest: 0, enemyKills: {}, weaponBestDamage: {}, sectorDamage: {}, ruleVersions: {} },
    settings: {
      audio: 70,
      music: 35,
      effects: 'standard',
      screenShake: true,
      reducedMotion: false,
      aimAssist: 'standard',
    },
    statistics: {
      playCount: 0,
      clearCount: 0,
      totalKills: 0,
      weaponUsage: {},
      supportUsage: {},
      controlSeconds: { slowed: 0, pushed: 0, pulled: 0 },
    },
    migration: { sourceVersion: SAVE_VERSION, migratedAt: new Date(0).toISOString() },
    updatedAt: new Date(0).toISOString(),
  };
}
