import { STAGE_ORDER } from '../data/stages';
import { ENEMY_ORDER } from '../data/enemies';
import { SUPPORT_ORDER } from '../data/supports';
import { WEAPON_ORDER } from '../data/weapons';
import {
  createDefaultSave,
  DAMAGED_SAVE_KEY,
  LEGACY_SAVE_KEY,
  SAVE_KEY,
  type SaveData,
  type ResearchId,
} from '../types/save';
import type { StageId, SupportId, WeaponId } from '../types/content';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LoadResult {
  data: SaveData;
  recovered: boolean;
  message: string;
}

function getStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isName(value: unknown): value is string {
  if (typeof value !== 'string' || [...value.trim()].length < 1 || [...value.trim()].length > 12) return false;
  return ![...value].some((char) => { const code = char.codePointAt(0) ?? 0; return code <= 0x1f || code === 0x7f; });
}

function isStoredName(value: unknown): value is string {
  return value === '' || isName(value);
}

function isCounter(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isInteger(value);
}

function isFraction(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((item) => isFraction(item));
}

function isStageRecord(value: unknown): value is { bestScore: number; bestCore: number; bestTime: number } {
  return isRecord(value) && isCounter(value.bestScore) && isCounter(value.bestCore) && isFraction(value.bestTime);
}

function isSectorRecord(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 6 && value.every((item) => isFraction(item));
}

function hasOnlyKnownValues<T extends string>(value: unknown, known: readonly T[]): value is T[] {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && known.includes(item as T));
}

function isValidSave(value: unknown): value is SaveData {
  if (!isRecord(value) || value.version !== 2 || !isRecord(value.profile) || !isStoredName(value.profile.name)) return false;
  if (!isRecord(value.progress) || !hasOnlyKnownValues(value.progress.unlockedStages, STAGE_ORDER) || !isCounter(value.progress.parts) || !isNumberRecord(value.progress.researchLevels)) return false;
  if (!isRecord(value.records) || !isRecord(value.records.stageBest) || !Object.values(value.records.stageBest).every((item) => isStageRecord(item)) || !isCounter(value.records.endlessBest)) return false;
  if (!isNumberRecord(value.records.enemyKills) || !isNumberRecord(value.records.weaponBestDamage) || !isRecord(value.records.sectorDamage) || !Object.values(value.records.sectorDamage).every((item) => isSectorRecord(item))) return false;
  if (!isRecord(value.settings) || !isCounter(value.settings.audio) || value.settings.audio > 100 || !isCounter(value.settings.music) || value.settings.music > 100) return false;
  if (!['standard', 'low', 'minimum'].includes(value.settings.effects as string)) return false;
  if (typeof value.settings.screenShake !== 'boolean' || typeof value.settings.reducedMotion !== 'boolean') return false;
  if (!['standard', 'strong'].includes(value.settings.aimAssist as string)) return false;
  if (!isRecord(value.statistics) || !isCounter(value.statistics.playCount) || !isCounter(value.statistics.clearCount) || !isCounter(value.statistics.totalKills) || !isNumberRecord(value.statistics.weaponUsage) || !isNumberRecord(value.statistics.supportUsage)) return false;
  if (!isRecord(value.statistics.controlSeconds) || !isFraction(value.statistics.controlSeconds.slowed) || !isFraction(value.statistics.controlSeconds.pushed) || !isFraction(value.statistics.controlSeconds.pulled)) return false;
  return typeof value.updatedAt === 'string';
}

function cleanNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function cleanCounter(value: unknown, fallback = 0): number {
  const number = cleanNumber(value, fallback);
  return Math.floor(number);
}

function copyNumberRecord(value: unknown): Record<string, number> {
  return isNumberRecord(value) ? { ...value } : {};
}

function migrateLegacyV1(value: Record<string, unknown>): SaveData | null {
  if (value.version !== 1 || !isRecord(value.profile) || !isName(value.profile.name)) return null;
  const migrated = createDefaultSave();
  migrated.profile.name = value.profile.name;
  if (isRecord(value.progress)) {
    migrated.progress.parts = cleanCounter(value.progress.parts);
    if (hasOnlyKnownValues(value.progress.unlockedStages, STAGE_ORDER)) migrated.progress.unlockedStages = [...value.progress.unlockedStages];
    migrated.progress.researchLevels = copyNumberRecord(value.progress.researchLevels) as Partial<Record<ResearchId, number>>;
  }
  if (isRecord(value.records)) {
    migrated.records.endlessBest = cleanCounter(value.records.endlessBest);
    if (isRecord(value.records.stageBest)) {
      for (const [stageId, record] of Object.entries(value.records.stageBest)) if (STAGE_ORDER.includes(stageId as StageId) && isStageRecord(record)) migrated.records.stageBest[stageId as StageId] = { ...record };
    }
  }
  if (isRecord(value.settings)) {
    migrated.settings.audio = Math.min(100, cleanCounter(value.settings.audio, 70));
    migrated.settings.music = Math.min(100, cleanCounter(value.settings.music, 35));
    if (['standard', 'low', 'minimum'].includes(value.settings.effects as string)) migrated.settings.effects = value.settings.effects as SaveData['settings']['effects'];
    if (typeof value.settings.screenShake === 'boolean') migrated.settings.screenShake = value.settings.screenShake;
    if (typeof value.settings.reducedMotion === 'boolean') migrated.settings.reducedMotion = value.settings.reducedMotion;
    if (value.settings.aimAssist === 'standard' || value.settings.aimAssist === 'strong') migrated.settings.aimAssist = value.settings.aimAssist;
  }
  if (isRecord(value.statistics)) {
    migrated.statistics.playCount = cleanCounter(value.statistics.playCount);
    migrated.statistics.clearCount = cleanCounter(value.statistics.clearCount);
    migrated.statistics.totalKills = cleanCounter(value.statistics.totalKills);
    migrated.statistics.weaponUsage = copyNumberRecord(value.statistics.weaponUsage) as Partial<Record<WeaponId, number>>;
    migrated.statistics.supportUsage = copyNumberRecord(value.statistics.supportUsage) as Partial<Record<SupportId, number>>;
  }
  migrated.updatedAt = new Date().toISOString();
  return migrated;
}

export function migrateSave(value: unknown): SaveData | null {
  if (!isRecord(value)) return null;
  if (isValidSave(value)) return value;
  const legacy = migrateLegacyV1(value);
  if (legacy) return legacy;

  // The first prototype stored only a profile name and a few counters.
  if (value.version === undefined && isRecord(value.profile) && isName(value.profile.name)) {
    const migrated = createDefaultSave();
    migrated.profile.name = value.profile.name.trim();
    migrated.statistics.playCount = cleanCounter(isRecord(value.statistics) ? value.statistics.playCount : undefined);
    migrated.statistics.totalKills = cleanCounter(isRecord(value.statistics) ? value.statistics.totalKills : undefined);
    migrated.updatedAt = new Date().toISOString();
    return migrated;
  }
  return null;
}

export class SaveService {
  private readonly storage: StorageLike | null;

  public constructor(storage: StorageLike | null = getStorage()) {
    this.storage = storage;
  }

  public load(): LoadResult {
    const fallback = createDefaultSave();
    if (!this.storage) return { data: fallback, recovered: false, message: '' };
    const raw = this.storage.getItem(SAVE_KEY) ?? this.storage.getItem(LEGACY_SAVE_KEY);
    if (!raw) return { data: fallback, recovered: false, message: '' };
    try {
      const parsed: unknown = JSON.parse(raw);
      const migrated = migrateSave(parsed);
      if (!migrated) throw new Error('保存形式が不正です。');
      if (parsed !== migrated || this.storage.getItem(SAVE_KEY) === null) this.persist(migrated);
      return { data: migrated, recovered: false, message: '' };
    } catch {
      try { this.storage.setItem(DAMAGED_SAVE_KEY, raw); } catch { /* Storage may be full or unavailable. */ }
      return { data: fallback, recovered: true, message: '保存データを読み込めなかったため、初期状態で開始しました。' };
    }
  }

  public persist(data: SaveData): void {
    if (!this.storage) return;
    this.storage.setItem(SAVE_KEY, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }));
  }

  public exportJson(data: SaveData): string {
    return JSON.stringify(data, null, 2);
  }

  public validateImport(raw: string): SaveData | null {
    try { return migrateSave(JSON.parse(raw)); } catch { return null; }
  }

  public importJson(raw: string): SaveData {
    const next = this.validateImport(raw);
    if (!next) throw new Error('読み込めるカコマレの保存データではありません。');
    this.persist(next);
    return next;
  }

  public reset(): SaveData {
    const next = createDefaultSave();
    this.persist(next);
    return next;
  }
}

export const SAVE_CONTENT_KEYS = {
  enemies: ENEMY_ORDER,
  supports: SUPPORT_ORDER,
  weapons: WEAPON_ORDER,
} as const;
