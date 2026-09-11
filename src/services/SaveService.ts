import { STAGE_ORDER } from '../data/stages';
import { ENEMY_ORDER } from '../data/enemies';
import { RESEARCH } from '../data/research';
import { SUPPORT_ORDER } from '../data/supports';
import { WEAPON_ORDER } from '../data/weapons';
import {
  createDefaultSave,
  DAMAGED_SAVE_KEY,
  LEGACY_SAVE_KEY,
  PREVIOUS_SAVE_KEY,
  SAVE_KEY,
  SAVE_VERSION,
  type SaveData,
  type ResearchId,
  type StageRecord,
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

export interface SaveMutationResult {
  data: SaveData;
  persisted: boolean;
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
  // The ranking contract allows up to 20 user-visible characters. Keep the
  // same validation for local saves so a name can be used for an optional
  // ranking start without silently truncating it.
  if (typeof value !== 'string' || [...value.trim()].length < 1 || [...value.trim()].length > 20) return false;
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

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
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

function isSequentialStageUnlocks(value: unknown): value is StageId[] {
  return Array.isArray(value)
    && value.length > 0
    && value.length <= STAGE_ORDER.length
    && value.every((item, index) => item === STAGE_ORDER[index]);
}

function isResearchLevels(value: unknown): value is Partial<Record<ResearchId, number>> {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([id, level]) => {
    if (!Object.prototype.hasOwnProperty.call(RESEARCH, id) || !isCounter(level)) return false;
    return level <= RESEARCH[id as ResearchId].maxLevel;
  });
}

function isRuleVersions(value: unknown): value is SaveData['records']['ruleVersions'] {
  if (!isRecord(value)) return false;
  return Object.values(value).every((item) => {
    if (!isRecord(item) || !isCounter(item.endlessBest) || !isRecord(item.stageBest)) return false;
    return Object.entries(item.stageBest).every(([stageId, record]) => STAGE_ORDER.includes(stageId as StageId) && isStageRecord(record));
  });
}

function isValidSaveShape(value: Record<string, unknown>, version: 2 | 3): boolean {
  if (value.version !== version || !isRecord(value.profile) || !isStoredName(value.profile.name)) return false;
  if (!isRecord(value.progress) || !isSequentialStageUnlocks(value.progress.unlockedStages) || !isCounter(value.progress.parts) || !isResearchLevels(value.progress.researchLevels)) return false;
  if (!isRecord(value.records) || !isRecord(value.records.stageBest) || !Object.values(value.records.stageBest).every((item) => isStageRecord(item)) || !isCounter(value.records.endlessBest)) return false;
  if (!isNumberRecord(value.records.enemyKills) || !isNumberRecord(value.records.weaponBestDamage) || !isRecord(value.records.sectorDamage) || !Object.values(value.records.sectorDamage).every((item) => isSectorRecord(item))) return false;
  if (!isRecord(value.settings) || !isCounter(value.settings.audio) || value.settings.audio > 100 || !isCounter(value.settings.music) || value.settings.music > 100) return false;
  if (!['standard', 'low', 'minimum'].includes(value.settings.effects as string)) return false;
  if (typeof value.settings.screenShake !== 'boolean' || typeof value.settings.reducedMotion !== 'boolean') return false;
  if (!['standard', 'strong'].includes(value.settings.aimAssist as string)) return false;
  if (!isRecord(value.statistics) || !isCounter(value.statistics.playCount) || !isCounter(value.statistics.clearCount) || !isCounter(value.statistics.totalKills) || !isNumberRecord(value.statistics.weaponUsage) || !isNumberRecord(value.statistics.supportUsage)) return false;
  if (!isRecord(value.statistics.controlSeconds) || !isFraction(value.statistics.controlSeconds.slowed) || !isFraction(value.statistics.controlSeconds.pushed) || !isFraction(value.statistics.controlSeconds.pulled)) return false;
  return isTimestamp(value.updatedAt);
}

function isValidSave(value: unknown): value is SaveData {
  if (!isRecord(value) || !isValidSaveShape(value, SAVE_VERSION)) return false;
  const records = value.records;
  if (!isRecord(records) || !isRuleVersions(records.ruleVersions)) return false;
  if (!isRecord(value.migration) || ![1, 2, 3].includes(value.migration.sourceVersion as number) || !isTimestamp(value.migration.migratedAt)) return false;
  return true;
}

function copyRuleVersions(value: unknown): SaveData['records']['ruleVersions'] {
  if (!isRuleVersions(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([version, record]) => [version, {
    endlessBest: record.endlessBest,
    stageBest: Object.fromEntries(Object.entries(record.stageBest).map(([stageId, stage]) => [stageId, { ...stage }])),
  }])) as SaveData['records']['ruleVersions'];
}

function migrateLegacyV2(value: Record<string, unknown>): SaveData | null {
  if (!isValidSaveShape(value, 2)) return null;
  const records = value.records as Record<string, unknown>;
  const migrated = createDefaultSave();
  migrated.profile = { name: (value.profile as { name: string }).name };
  migrated.progress = {
    unlockedStages: [...(value.progress as { unlockedStages: StageId[] }).unlockedStages],
    parts: (value.progress as { parts: number }).parts,
    researchLevels: { ...(value.progress as { researchLevels: SaveData['progress']['researchLevels'] }).researchLevels },
  };
  migrated.records = {
    stageBest: Object.fromEntries(Object.entries(records.stageBest as Record<string, unknown>).map(([id, stage]) => [id, { ...(stage as StageRecord) }])) as SaveData['records']['stageBest'],
    endlessBest: records.endlessBest as number,
    enemyKills: copyNumberRecord(records.enemyKills) as SaveData['records']['enemyKills'],
    weaponBestDamage: copyNumberRecord(records.weaponBestDamage) as SaveData['records']['weaponBestDamage'],
    sectorDamage: Object.fromEntries(Object.entries(records.sectorDamage as Record<string, unknown>).map(([id, sector]) => [id, [...(sector as number[])]])) as SaveData['records']['sectorDamage'],
    ruleVersions: copyRuleVersions(records.ruleVersions),
  };
  migrated.settings = { ...(value.settings as SaveData['settings']) };
  migrated.statistics = {
    ...(value.statistics as SaveData['statistics']),
    controlSeconds: { ...(value.statistics as SaveData['statistics']).controlSeconds },
    weaponUsage: { ...(value.statistics as SaveData['statistics']).weaponUsage },
    supportUsage: { ...(value.statistics as SaveData['statistics']).supportUsage },
  };
  migrated.migration = { sourceVersion: 2, migratedAt: new Date().toISOString() };
  migrated.updatedAt = new Date().toISOString();
  return migrated;
}

function copyNumberRecord(value: unknown): Record<string, number> {
  return isNumberRecord(value) ? { ...value } : {};
}

function migrateLegacyV1(value: Record<string, unknown>): SaveData | null {
  if (value.version !== 1 || !isRecord(value.profile) || !isName(value.profile.name)) return null;
  const migrated = createDefaultSave();
  migrated.profile.name = value.profile.name;
  if (value.progress !== undefined) {
    if (!isRecord(value.progress)) return null;
    if (value.progress.unlockedStages !== undefined && !isSequentialStageUnlocks(value.progress.unlockedStages)) return null;
    if (value.progress.researchLevels !== undefined && !isResearchLevels(value.progress.researchLevels)) return null;
    if (value.progress.parts !== undefined && !isCounter(value.progress.parts)) return null;
    if (isCounter(value.progress.parts)) migrated.progress.parts = value.progress.parts;
    if (isSequentialStageUnlocks(value.progress.unlockedStages)) migrated.progress.unlockedStages = [...value.progress.unlockedStages];
    if (isResearchLevels(value.progress.researchLevels)) migrated.progress.researchLevels = { ...value.progress.researchLevels };
  }
  if (value.records !== undefined) {
    if (!isRecord(value.records)) return null;
    if (value.records.endlessBest !== undefined && !isCounter(value.records.endlessBest)) return null;
    if (isCounter(value.records.endlessBest)) migrated.records.endlessBest = value.records.endlessBest;
    if (value.records.stageBest !== undefined) {
      if (!isRecord(value.records.stageBest)) return null;
      for (const [stageId, record] of Object.entries(value.records.stageBest)) {
        if (!STAGE_ORDER.includes(stageId as StageId)) continue;
        if (!isStageRecord(record)) return null;
        migrated.records.stageBest[stageId as StageId] = { ...record };
      }
    }
    if (value.records.enemyKills !== undefined && !isNumberRecord(value.records.enemyKills)) return null;
    if (value.records.weaponBestDamage !== undefined && !isNumberRecord(value.records.weaponBestDamage)) return null;
    if (value.records.sectorDamage !== undefined && (!isRecord(value.records.sectorDamage) || !Object.values(value.records.sectorDamage).every((item) => isSectorRecord(item)))) return null;
    if (isNumberRecord(value.records.enemyKills)) migrated.records.enemyKills = { ...value.records.enemyKills } as SaveData['records']['enemyKills'];
    if (isNumberRecord(value.records.weaponBestDamage)) migrated.records.weaponBestDamage = { ...value.records.weaponBestDamage } as SaveData['records']['weaponBestDamage'];
    if (isRecord(value.records.sectorDamage)) migrated.records.sectorDamage = { ...value.records.sectorDamage } as SaveData['records']['sectorDamage'];
  }
  if (value.settings !== undefined) {
    if (!isRecord(value.settings)) return null;
    if (value.settings.audio !== undefined && (!isCounter(value.settings.audio) || value.settings.audio > 100)) return null;
    if (value.settings.music !== undefined && (!isCounter(value.settings.music) || value.settings.music > 100)) return null;
    if (value.settings.effects !== undefined && !['standard', 'low', 'minimum'].includes(value.settings.effects as string)) return null;
    if (value.settings.screenShake !== undefined && typeof value.settings.screenShake !== 'boolean') return null;
    if (value.settings.reducedMotion !== undefined && typeof value.settings.reducedMotion !== 'boolean') return null;
    if (value.settings.aimAssist !== undefined && value.settings.aimAssist !== 'standard' && value.settings.aimAssist !== 'strong') return null;
    if (isCounter(value.settings.audio)) migrated.settings.audio = value.settings.audio;
    if (isCounter(value.settings.music)) migrated.settings.music = value.settings.music;
    if (value.settings.effects === 'standard' || value.settings.effects === 'low' || value.settings.effects === 'minimum') migrated.settings.effects = value.settings.effects;
    if (typeof value.settings.screenShake === 'boolean') migrated.settings.screenShake = value.settings.screenShake;
    if (typeof value.settings.reducedMotion === 'boolean') migrated.settings.reducedMotion = value.settings.reducedMotion;
    if (value.settings.aimAssist === 'standard' || value.settings.aimAssist === 'strong') migrated.settings.aimAssist = value.settings.aimAssist;
  }
  if (value.statistics !== undefined) {
    if (!isRecord(value.statistics)) return null;
    for (const counter of [value.statistics.playCount, value.statistics.clearCount, value.statistics.totalKills]) {
      if (counter !== undefined && !isCounter(counter)) return null;
    }
    if (value.statistics.weaponUsage !== undefined && !isNumberRecord(value.statistics.weaponUsage)) return null;
    if (value.statistics.supportUsage !== undefined && !isNumberRecord(value.statistics.supportUsage)) return null;
    if (value.statistics.controlSeconds !== undefined && (!isRecord(value.statistics.controlSeconds)
      || !isFraction(value.statistics.controlSeconds.slowed)
      || !isFraction(value.statistics.controlSeconds.pushed)
      || !isFraction(value.statistics.controlSeconds.pulled))) return null;
    if (isCounter(value.statistics.playCount)) migrated.statistics.playCount = value.statistics.playCount;
    if (isCounter(value.statistics.clearCount)) migrated.statistics.clearCount = value.statistics.clearCount;
    if (isCounter(value.statistics.totalKills)) migrated.statistics.totalKills = value.statistics.totalKills;
    if (isNumberRecord(value.statistics.weaponUsage)) migrated.statistics.weaponUsage = copyNumberRecord(value.statistics.weaponUsage) as Partial<Record<WeaponId, number>>;
    if (isNumberRecord(value.statistics.supportUsage)) migrated.statistics.supportUsage = copyNumberRecord(value.statistics.supportUsage) as Partial<Record<SupportId, number>>;
    if (isRecord(value.statistics.controlSeconds)) migrated.statistics.controlSeconds = {
      slowed: value.statistics.controlSeconds.slowed as number,
      pushed: value.statistics.controlSeconds.pushed as number,
      pulled: value.statistics.controlSeconds.pulled as number,
    };
  }
  migrated.migration = { sourceVersion: 1, migratedAt: new Date().toISOString() };
  migrated.updatedAt = new Date().toISOString();
  return migrated;
}

export function migrateSave(value: unknown): SaveData | null {
  if (!isRecord(value)) return null;
  if (isValidSave(value)) return value;
  const v2 = migrateLegacyV2(value);
  if (v2) return v2;
  const legacy = migrateLegacyV1(value);
  if (legacy) return legacy;

  // The first prototype stored only a profile name and a few counters.
  if (value.version === undefined && isRecord(value.profile) && isName(value.profile.name)) {
    if (value.statistics !== undefined && !isRecord(value.statistics)) return null;
    if (isRecord(value.statistics) && value.statistics.playCount !== undefined && !isCounter(value.statistics.playCount)) return null;
    if (isRecord(value.statistics) && value.statistics.totalKills !== undefined && !isCounter(value.statistics.totalKills)) return null;
    const migrated = createDefaultSave();
    migrated.profile.name = value.profile.name.trim();
    if (isRecord(value.statistics) && isCounter(value.statistics.playCount)) migrated.statistics.playCount = value.statistics.playCount;
    if (isRecord(value.statistics) && isCounter(value.statistics.totalKills)) migrated.statistics.totalKills = value.statistics.totalKills;
    migrated.migration = { sourceVersion: 1, migratedAt: new Date().toISOString() };
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
    const sources: Array<{ key: string; raw: string | null }> = [];
    try {
      for (const key of [SAVE_KEY, PREVIOUS_SAVE_KEY, LEGACY_SAVE_KEY]) sources.push({ key, raw: this.storage.getItem(key) });
    } catch {
      return { data: fallback, recovered: true, message: '保存領域を読み込めなかったため、初期状態で開始しました。' };
    }
    let recovered = false;
    for (const source of sources) {
      if (!source.raw) continue;
      try {
        const parsed: unknown = JSON.parse(source.raw);
        const migrated = migrateSave(parsed);
        if (!migrated) throw new Error('保存形式が不正です。');
        if (source.key !== SAVE_KEY || parsed !== migrated || migrated.version !== SAVE_VERSION) this.persist(migrated);
        return {
          data: migrated,
          recovered,
          message: recovered ? '新しい保存データを読み込めなかったため、以前の保存から復元しました。' : '',
        };
      } catch {
        recovered = true;
        try { this.storage.setItem(DAMAGED_SAVE_KEY, source.raw); } catch { /* Storage may be full or unavailable. */ }
      }
    }
    return { data: fallback, recovered, message: recovered ? '保存データを読み込めなかったため、初期状態で開始しました。' : '' };
  }

  public persist(data: SaveData): boolean {
    if (!this.storage) return false;
    try {
      const current: SaveData = {
        ...data,
        version: SAVE_VERSION,
        migration: data.migration ?? { sourceVersion: SAVE_VERSION, migratedAt: new Date().toISOString() },
        updatedAt: new Date().toISOString(),
      };
      if (!isValidSave(current)) return false;
      const canonical = JSON.stringify(current);
      this.storage.setItem(SAVE_KEY, canonical);
      const readBack = this.storage.getItem(SAVE_KEY);
      if (readBack !== canonical || !readBack || !isValidSave(JSON.parse(readBack))) return false;
      // Keep a deliberately marked v2-compatible mirror while old deployed
      // clients still read the previous key. It is never preferred on load.
      const mirror = JSON.stringify({ ...current, version: 2 });
      this.storage.setItem(PREVIOUS_SAVE_KEY, mirror);
      return true;
    } catch {
      // Storage may be unavailable or full. Play can continue in memory.
      return false;
    }
  }

  public damagedJson(): string | null {
    try { return this.storage?.getItem(DAMAGED_SAVE_KEY) ?? null; } catch { return null; }
  }

  public exportJson(data: SaveData): string {
    return JSON.stringify(data, null, 2);
  }

  public validateImport(raw: string): SaveData | null {
    try {
      const migrated = migrateSave(JSON.parse(raw));
      return migrated && isName(migrated.profile.name) ? migrated : null;
    } catch {
      return null;
    }
  }

  public importJson(raw: string): SaveMutationResult {
    const next = this.validateImport(raw);
    if (!next) throw new Error('読み込めるカコマレの保存データではありません。');
    return { data: next, persisted: this.persist(next) };
  }

  public reset(): SaveMutationResult {
    const next = createDefaultSave();
    return { data: next, persisted: this.persist(next) };
  }
}

export const SAVE_CONTENT_KEYS = {
  enemies: ENEMY_ORDER,
  supports: SUPPORT_ORDER,
  weapons: WEAPON_ORDER,
} as const;
