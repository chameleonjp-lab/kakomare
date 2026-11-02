import type { BattleResult } from '../types/game';
import type { StorageLike } from './SaveService';
import { RANKING_PENDING_KEY } from './RankingClient';

type EnumerableStorage = StorageLike & { readonly length?: number; key?(index: number): string | null };
export interface RankingRunRecord {
  id: string;
  name: string;
  createdAt: string;
  result?: BattleResult;
  confirmed: boolean;
  /** False means at least part of this run exists only in the current tab. */
  persisted: boolean;
}
const PREFIX = 'kakomare:ranking-run:v1:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const nonNegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const nameValid = (value: unknown): value is string => typeof value === 'string' && value === value.trim() && [...value].length >= 1 && [...value].length <= 20 && [...value].every(char => { const code = char.codePointAt(0)!; return code > 31 && code !== 127; });

// Validate persisted presentation before the UI receives it. The existing
// RankingClient remains responsible for score/protocol/rule validation.
function resultValid(value: unknown): value is BattleResult {
  if (!object(value) || value.stageId !== 'endless' || !['victory', 'defeat'].includes(String(value.outcome)) || typeof value.retired !== 'boolean') return false;
  if (!['score', 'survivalTime', 'coreRemaining', 'kills', 'bossesDefeated', 'partsEarned', 'runSeed'].every(key => nonNegative(value[key]))) return false;
  if (typeof value.bossDefeated !== 'boolean' || typeof value.bossId !== 'string' || typeof value.mainCause !== 'string') return false;
  if (!['weaponDamage', 'supportUsage', 'enemyKills'].every(key => object(value[key]) && Object.values(value[key]).every(nonNegative))) return false;
  if (!Array.isArray(value.sectorDamage) || !value.sectorDamage.every(nonNegative)) return false;
  if (!object(value.controlSeconds) || !['slowed', 'pushed', 'pulled'].every(key => nonNegative(value.controlSeconds && (value.controlSeconds as Record<string, unknown>)[key]))) return false;
  if (!['upgrades', 'branches'].every(key => Array.isArray(value[key]) && value[key].every(item => typeof item === 'string'))) return false;
  if (value.newUnlock !== null && typeof value.newUnlock !== 'string') return false;
  if (value.weaponInstances !== undefined && (!Array.isArray(value.weaponInstances) || !value.weaponInstances.every(item => object(item) && typeof item.id === 'string' && typeof item.instanceId === 'string' && nonNegative(item.level)))) return false;
  if (value.supportInstances !== undefined && (!Array.isArray(value.supportInstances) || !value.supportInstances.every(item => object(item) && typeof item.id === 'string' && nonNegative(item.level)))) return false;
  return true;
}
function recordValid(value: unknown, id: string): value is RankingRunRecord {
  return object(value) && value.id === id && UUID.test(id) && nameValid(value.name) && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt)) &&
    (value.result === undefined || resultValid(value.result));
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function browserStorage(): EnumerableStorage | null { try { return globalThis.localStorage ?? null; } catch { return null; } }

/** Separate immutable capture/result and RPC storage for every named run.
 * Legacy global keys are never migrated, overwritten or deleted here. */
export class RankingRunStore {
  private readonly storage: EnumerableStorage | null;
  private readonly uuid: () => string;
  private readonly now: () => string;
  private readonly memory = new Map<string, string | null>();
  private readonly failedWrites = new Set<string>();

  public constructor(options: { storage?: EnumerableStorage | null; uuid?: () => string; now?: () => string } = {}) {
    this.storage = options.storage === undefined ? browserStorage() : options.storage;
    this.uuid = options.uuid ?? (() => globalThis.crypto.randomUUID());
    this.now = options.now ?? (() => new Date().toISOString());
  }
  private prefix(id: string): string { if (!UUID.test(id)) throw Error('Invalid ranking run ID'); return PREFIX + id + ':'; }
  private read(key: string): string | null {
    if (!this.failedWrites.has(key)) {
      try { const value = this.storage?.getItem(key) ?? null; if (value !== null || !this.memory.has(key)) return value; } catch { /* Keep this tab usable. */ }
    }
    return this.memory.get(key) ?? null;
  }
  private write(key: string, value: string): boolean {
    this.memory.set(key, value);
    try {
      if (!this.storage) throw Error('Storage unavailable');
      this.storage.setItem(key, value); this.failedWrites.delete(key); return true;
    } catch { this.failedWrites.add(key); return false; }
  }
  public create(name: string): RankingRunRecord | null {
    const normalized = name.trim(); if (!normalized) return null;
    if (!nameValid(normalized)) throw Error('Invalid ranking name');
    const id = this.uuid(); const prefix = this.prefix(id);
    if (this.read(prefix + 'meta') !== null) throw Error('Ranking run ID already exists');
    const record: RankingRunRecord = { id, name: normalized, createdAt: this.now(), confirmed: false, persisted: true };
    this.write(prefix + 'meta', JSON.stringify(record));
    return this.get(id)!;
  }
  public get(id: string): RankingRunRecord | null {
    if (!UUID.test(id)) return null;
    const prefix = this.prefix(id); let record: unknown;
    try { record = JSON.parse(this.read(prefix + 'meta') ?? 'null'); } catch { return null; }
    if (!recordValid(record, id)) return null;
    return { ...clone(record), confirmed: this.read(prefix + 'confirmed') === id,
      persisted: this.storage !== null && ![...this.failedWrites].some(key => key.startsWith(prefix)) };
  }
  private resolve(value: RankingRunRecord | string): RankingRunRecord {
    const record = this.get(typeof value === 'string' ? value : value.id);
    if (!record || (typeof value !== 'string' && (record.name !== value.name || record.createdAt !== value.createdAt))) throw Error('Unknown or changed ranking capture');
    return record;
  }
  public saveResult(value: RankingRunRecord | string, result: BattleResult): boolean {
    const record = this.resolve(value);
    if (!resultValid(result)) throw Error('Invalid ranking result');
    const fixed = clone(result);
    if (record.result && canonical(record.result) !== canonical(fixed)) throw Error('A finalized ranking result cannot change');
    this.write(this.prefix(record.id) + 'meta', JSON.stringify({ ...record, result: fixed }));
    return this.get(record.id)!.persisted;
  }
  public confirm(value: RankingRunRecord | string): boolean {
    const record = this.resolve(value);
    return this.write(this.prefix(record.id) + 'confirmed', record.id);
  }
  public listPending(): RankingRunRecord[] {
    const keys = new Set(this.memory.keys());
    try { if (this.storage?.key) for (let i = 0; i < (this.storage.length ?? 0); i++) { const key = this.storage.key(i); if (key) keys.add(key); } } catch { /* Use known in-memory entries. */ }
    const records: RankingRunRecord[] = [];
    for (const key of keys) {
      if (!key.startsWith(PREFIX) || !key.endsWith(':meta')) continue;
      const record = this.get(key.slice(PREFIX.length, -5));
      if (record?.result && !record.confirmed) records.push(record);
    }
    return records.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }
  public scopedStorage(id: string): StorageLike {
    const prefix = this.prefix(id) + 'rpc:';
    return {
      getItem: key => this.read(prefix + key),
      setItem: (key, value) => {
        if (!this.write(prefix + key, value)) throw Error('Ranking run storage unavailable');
      },
      removeItem: key => {
        // RankingClient removes this key only after a verified server ACK.
        // Persist the tombstone first. If quota/storage rejects it, KEEP the
        // original submission UUID so reload can only retry that same result.
        if (key === RANKING_PENDING_KEY && this.read(prefix + key) !== null && !this.confirm(id)) return;
        this.memory.set(prefix + key, null);
        try { this.storage?.removeItem(prefix + key); this.failedWrites.delete(prefix + key); }
        catch { this.failedWrites.add(prefix + key); }
      },
    };
  }
}
