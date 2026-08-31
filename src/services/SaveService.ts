import {
  createDefaultSave,
  DAMAGED_SAVE_KEY,
  SAVE_KEY,
  type SaveData,
} from '../types/save';

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
  if (value === '') return true;
  return isName(value);
}

function isCounter(value: unknown): value is number {
  return isFiniteNonNegative(value) && Number.isInteger(value);
}

function isValidSave(value: unknown): value is SaveData {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.profile) || !isStoredName(value.profile.name)) return false;
  if (!isRecord(value.progress) || !Array.isArray(value.progress.unlockedStages) || value.progress.unlockedStages.length < 1 || !value.progress.unlockedStages.every((stage) => stage === 'stage-1') || !isCounter(value.progress.parts) || !isRecord(value.progress.researchLevels)) return false;
  if (!isRecord(value.records) || !isRecord(value.records.stageBest) || !isCounter(value.records.endlessBest)) return false;
  if (!isRecord(value.settings) || !isCounter(value.settings.audio) || value.settings.audio > 100 || !isCounter(value.settings.music) || value.settings.music > 100) return false;
  if (!['standard', 'low', 'minimum'].includes(value.settings.effects as string)) return false;
  if (typeof value.settings.screenShake !== 'boolean' || typeof value.settings.reducedMotion !== 'boolean') return false;
  if (!['standard', 'strong'].includes(value.settings.aimAssist as string)) return false;
  if (!isRecord(value.statistics) || !isCounter(value.statistics.playCount) || !isCounter(value.statistics.clearCount) || !isCounter(value.statistics.totalKills) || !isRecord(value.statistics.weaponUsage) || !isRecord(value.statistics.supportUsage)) return false;
  return typeof value.updatedAt === 'string';
}

function cleanNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function migrateSave(value: unknown): SaveData | null {
  if (!isRecord(value)) return null;
  if (value.version === 1 && isValidSave(value)) return value;

  // The first prototype stored only a profile name and a few counters.
  // It is deliberately narrow: malformed values are rejected instead of guessed.
  if (value.version === undefined && isRecord(value.profile) && isName(value.profile.name)) {
    const migrated = createDefaultSave();
    migrated.profile.name = value.profile.name.trim();
    migrated.statistics.playCount = cleanNumber(isRecord(value.statistics) ? value.statistics.playCount : undefined, 0);
    migrated.statistics.totalKills = cleanNumber(isRecord(value.statistics) ? value.statistics.totalKills : undefined, 0);
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
    const raw = this.storage.getItem(SAVE_KEY);
    if (!raw) return { data: fallback, recovered: false, message: '' };
    try {
      const parsed: unknown = JSON.parse(raw);
      const migrated = migrateSave(parsed);
      if (!migrated) throw new Error('保存形式が不正です。');
      if (parsed !== migrated) this.persist(migrated);
      return { data: migrated, recovered: false, message: '' };
    } catch {
      try {
        this.storage.setItem(DAMAGED_SAVE_KEY, raw);
      } catch {
        // Storage may be full or unavailable. The app can still start safely.
      }
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
    try {
      return migrateSave(JSON.parse(raw));
    } catch {
      return null;
    }
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
