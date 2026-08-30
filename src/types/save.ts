import type { StageId, SupportId, WeaponId } from './content';

export interface StageRecord {
  bestScore: number;
  bestCore: number;
  bestTime: number;
}

export interface SaveData {
  version: 1;
  profile: { name: string };
  progress: {
    unlockedStages: StageId[];
    parts: number;
    researchLevels: Record<string, number>;
  };
  records: {
    stageBest: Partial<Record<StageId, StageRecord>>;
    endlessBest: number;
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
  };
  updatedAt: string;
}

export const SAVE_KEY = 'kakomare-save-v1';
export const DAMAGED_SAVE_KEY = 'kakomare-damaged-save';

export function createDefaultSave(): SaveData {
  return {
    version: 1,
    profile: { name: '' },
    progress: { unlockedStages: ['stage-1'], parts: 0, researchLevels: {} },
    records: { stageBest: {}, endlessBest: 0 },
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
    },
    updatedAt: new Date(0).toISOString(),
  };
}
