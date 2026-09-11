import type { StorageLike } from './SaveService';
import { STAGE_ORDER } from '../data/stages';

export const RESULT_LEDGER_KEY = 'kakomare-result-ledger-v1';

export interface SettledResult {
  resultId: string;
  playId: string | null;
  stageId: string;
  outcome: 'victory' | 'defeat';
  retired: boolean;
  score: number;
  partsEarned: number;
  settledAt: string;
}

export interface SettlementResult {
  accepted: boolean;
  entry: SettledResult;
}

function getStorage(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isEntry(value: unknown): value is SettledResult {
  return isRecord(value)
    && typeof value.resultId === 'string'
    && (value.playId === null || typeof value.playId === 'string')
    && typeof value.stageId === 'string' && STAGE_ORDER.includes(value.stageId as typeof STAGE_ORDER[number])
    && (value.outcome === 'victory' || value.outcome === 'defeat')
    && typeof value.retired === 'boolean'
    && typeof value.score === 'number' && Number.isSafeInteger(value.score) && value.score >= 0
    && typeof value.partsEarned === 'number' && Number.isSafeInteger(value.partsEarned) && value.partsEarned >= 0
    && typeof value.settledAt === 'string' && Number.isFinite(Date.parse(value.settledAt));
}

function readEntries(storage: StorageLike | null): SettledResult[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(RESULT_LEDGER_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).map((entry) => ({ ...entry }));
  } catch { return []; }
}

export class ResultLedger {
  private readonly storage: StorageLike | null;
  private entries: SettledResult[];

  public constructor(storage: StorageLike | null = getStorage()) {
    this.storage = storage;
    this.entries = readEntries(storage);
  }

  public has(resultId: string): boolean { return this.entries.some((entry) => entry.resultId === resultId); }

  public settle(entry: Omit<SettledResult, 'settledAt'> & { settledAt?: string }): SettlementResult {
    // Another tab may have settled this result since construction (or since
    // the previous call). Refresh before checking the in-memory copy so the
    // one-result/one-reward contract also holds across tabs.
    const persisted = readEntries(this.storage);
    if (persisted.length > 0) this.entries = persisted;
    const existing = this.entries.find((item) => item.resultId === entry.resultId);
    if (existing) return { accepted: false, entry: { ...existing } };
    if (!this.validInput(entry)) throw new Error('精算台帳へ登録できない結果です。');
    const next: SettledResult = { ...entry, settledAt: entry.settledAt ?? new Date().toISOString() };
    // Do not evict old result IDs: an evicted ID could be settled a second
    // time after a reload, violating the one-result/one-reward contract.
    this.entries = [...this.entries, next];
    if (!this.persist()) {
      this.entries = this.entries.filter((item) => item.resultId !== next.resultId);
      throw new Error('精算台帳を保存できませんでした。');
    }
    return { accepted: true, entry: { ...next } };
  }

  public list(): SettledResult[] { return this.entries.map((entry) => ({ ...entry })); }

  private validInput(entry: Omit<SettledResult, 'settledAt'> & { settledAt?: string }): boolean {
    return typeof entry.resultId === 'string' && entry.resultId.length > 0 && entry.resultId.length <= 160
      && (entry.playId === null || typeof entry.playId === 'string')
      && typeof entry.stageId === 'string' && STAGE_ORDER.includes(entry.stageId as typeof STAGE_ORDER[number]) && (entry.outcome === 'victory' || entry.outcome === 'defeat')
      && typeof entry.retired === 'boolean'
      && Number.isSafeInteger(entry.score) && entry.score >= 0
      && Number.isSafeInteger(entry.partsEarned) && entry.partsEarned >= 0
      && (entry.settledAt === undefined || (typeof entry.settledAt === 'string' && Number.isFinite(Date.parse(entry.settledAt))));
  }

  private persist(): boolean {
    if (!this.storage) return false;
    try {
      const serialized = JSON.stringify(this.entries);
      this.storage.setItem(RESULT_LEDGER_KEY, serialized);
      const readBack = this.storage.getItem(RESULT_LEDGER_KEY);
      if (readBack !== serialized || !readBack) return false;
      const parsed: unknown = JSON.parse(readBack);
      return Array.isArray(parsed) && parsed.length === this.entries.length && parsed.every(isEntry);
    } catch { return false; }
  }
}
