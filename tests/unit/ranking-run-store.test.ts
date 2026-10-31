import { describe, expect, it } from 'vitest';
import type { BattleResult } from '../../src/types/game';
import { RANKING_PENDING_KEY, RANKING_START_PENDING_KEY } from '../../src/services/RankingClient';
import { RankingRunStore } from '../../src/services/RankingRunStore';

class Storage {
  values = new Map<string, string>();
  denyWrites = false;
  get length() { return this.values.size; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.denyWrites) throw Error('quota'); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
function result(score = 10): BattleResult {
  return { stageId: 'endless', outcome: 'defeat', score, survivalTime: 12, coreRemaining: 0, kills: 3, bossDefeated: false, bossesDefeated: 0, bossId: 'echo', partsEarned: 2, weaponDamage: {}, supportUsage: {}, enemyKills: {}, sectorDamage: [0, 0, 0, 0, 0, 0], controlSeconds: { slowed: 0, pushed: 0, pulled: 0 }, mainCause: '確認', upgrades: [], branches: [], runSeed: 4, newUnlock: null, retired: false };
}
function fixture(storage = new Storage()) {
  let next = 0;
  return { storage, store: new RankingRunStore({ storage, uuid: () => ids[next++]! }) };
}

describe('ranking run storage', () => {
  it('never creates consent for blank names and captures a trimmed immutable name', () => {
    const { store, storage } = fixture();
    expect(store.create('　 ')).toBeNull(); expect(storage.length).toBe(0);
    const record = store.create(' 花子 ')!; record.name = 'later';
    expect(store.get(record.id)?.name).toBe('花子');
  });
  it('isolates two runs and retains legacy global keys without importing them as new consent', () => {
    const { store, storage } = fixture(); storage.setItem(RANKING_PENDING_KEY, 'legacy');
    const a = store.create('A')!, b = store.create('B')!;
    store.scopedStorage(a.id).setItem(RANKING_START_PENDING_KEY, 'start-A');
    store.scopedStorage(b.id).setItem(RANKING_START_PENDING_KEY, 'start-B');
    store.saveResult(a, result(10)); store.saveResult(b, result(20));
    const reload = new RankingRunStore({ storage });
    expect(reload.listPending().map(x => [x.name, x.result?.score])).toEqual([['A', 10], ['B', 20]]);
    expect(reload.scopedStorage(a.id).getItem(RANKING_START_PENDING_KEY)).toBe('start-A');
    expect(reload.scopedStorage(b.id).getItem(RANKING_START_PENDING_KEY)).toBe('start-B');
    expect(storage.getItem(RANKING_PENDING_KEY)).toBe('legacy');
  });
  it('freezes the full final result and rejects a changed result or forged capture', () => {
    const { store } = fixture(); const run = store.create('A')!, value = result();
    store.saveResult(run, value); value.score = 999;
    expect(store.get(run.id)?.result?.score).toBe(10);
    expect(() => store.saveResult(run, value)).toThrow();
    expect(() => store.saveResult({ ...run, name: 'B' }, result())).toThrow();
    expect(store.saveResult(run, result())).toBe(true);
  });
  it('keeps other tabs’ runs and a durable acknowledgement wins over stale metadata', () => {
    const { store, storage } = fixture(); const a = store.create('A')!; store.saveResult(a, result());
    const other = new RankingRunStore({ storage, uuid: () => ids[1]! });
    const b = other.create('B')!; other.saveResult(b, result(20));
    expect(other.listPending()).toHaveLength(2); expect(store.confirm(a)).toBe(true);
    other.saveResult(a.id, result());
    expect(other.get(a.id)?.confirmed).toBe(true);
    expect(other.listPending().map(x => x.id)).toEqual([b.id]);
  });
  it('writes the acknowledgement marker before removing a confirmed payload', () => {
    const { store, storage } = fixture(); const run = store.create('A')!; store.saveResult(run, result());
    const scoped = store.scopedStorage(run.id); scoped.setItem(RANKING_PENDING_KEY, '{"submissionId":"original"}');
    scoped.removeItem(RANKING_PENDING_KEY);
    const reload = new RankingRunStore({ storage });
    expect(reload.get(run.id)?.confirmed).toBe(true); expect(reload.listPending()).toHaveLength(0);
    expect(reload.scopedStorage(run.id).getItem(RANKING_PENDING_KEY)).toBeNull();
  });
  it('retains the original payload if acknowledgement persistence fails', () => {
    const { store, storage } = fixture(); const run = store.create('A')!; store.saveResult(run, result());
    const scoped = store.scopedStorage(run.id); scoped.setItem(RANKING_PENDING_KEY, '{"submissionId":"original"}');
    storage.denyWrites = true; scoped.removeItem(RANKING_PENDING_KEY);
    expect(store.get(run.id)?.persisted).toBe(false);
    const reload = new RankingRunStore({ storage });
    expect(reload.get(run.id)?.confirmed).toBe(false);
    expect(reload.scopedStorage(run.id).getItem(RANKING_PENDING_KEY)).toContain('original');
  });
  it('keeps a denied-storage run in memory and reports the reload limitation', () => {
    const storage = new Storage(); storage.denyWrites = true;
    const { store } = fixture(storage); const run = store.create('A')!;
    expect(run.persisted).toBe(false); expect(store.saveResult(run, result())).toBe(false);
    expect(() => store.scopedStorage(run.id).setItem(RANKING_START_PENDING_KEY, 'start')).toThrow();
    expect(store.scopedStorage(run.id).getItem(RANKING_START_PENDING_KEY)).toBe('start');
    expect(store.listPending()).toHaveLength(1);
    expect(new RankingRunStore({ storage }).listPending()).toHaveLength(0);
  });
  it('does not send malformed persisted records or turn an unfinished run into a result', () => {
    const { store, storage } = fixture(); const run = store.create('A')!;
    expect(store.listPending()).toHaveLength(0);
    const key = [...storage.values.keys()].find(k => k.endsWith(':meta'))!;
    storage.setItem(key, JSON.stringify({ ...run, result: { score: 10 } }));
    expect(new RankingRunStore({ storage }).get(run.id)).toBeNull();
    expect(new RankingRunStore({ storage }).listPending()).toHaveLength(0);
  });
});
