import { describe, expect, it } from 'vitest';
import { ResultLedger } from '../../src/services/ResultLedger';
import type { StorageLike } from '../../src/services/SaveService';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.values.set(key, value); }
  public removeItem(key: string): void { this.values.delete(key); }
}

describe('ResultLedger', () => {
  it('settles one result once and preserves that decision after reloading', () => {
    const storage = new MemoryStorage();
    const first = new ResultLedger(storage).settle({ resultId: 'result-1', playId: 'play-1', stageId: 'endless', outcome: 'defeat', retired: false, score: 120, partsEarned: 20 });
    expect(first.accepted).toBe(true);
    const second = new ResultLedger(storage).settle({ resultId: 'result-1', playId: 'play-1', stageId: 'endless', outcome: 'defeat', retired: false, score: 999, partsEarned: 999 });
    expect(second.accepted).toBe(false);
    expect(second.entry.score).toBe(120);
    expect(new ResultLedger(storage).list()).toHaveLength(1);
  });

  it('rejects unsafe settlement values without writing a partial entry', () => {
    const storage = new MemoryStorage();
    expect(() => new ResultLedger(storage).settle({ resultId: 'bad', playId: null, stageId: 'stage-1', outcome: 'victory', retired: false, score: Number.MAX_SAFE_INTEGER + 1, partsEarned: 0 })).toThrow();
    expect(new ResultLedger(storage).list()).toHaveLength(0);
  });

  it('keeps old result IDs so a long-running profile cannot settle one twice', () => {
    const storage = new MemoryStorage();
    for (let index = 0; index < 205; index += 1) {
      new ResultLedger(storage).settle({ resultId: `result-${index}`, playId: `play-${index}`, stageId: 'endless', outcome: 'defeat', retired: false, score: index, partsEarned: 0 });
    }
    const ledger = new ResultLedger(storage);
    expect(ledger.list()).toHaveLength(205);
    expect(ledger.settle({ resultId: 'result-0', playId: 'play-0', stageId: 'endless', outcome: 'defeat', retired: false, score: 999, partsEarned: 999 }).accepted).toBe(false);
  });

  it('refreshes the durable ledger before settling across tabs', () => {
    const storage = new MemoryStorage();
    const firstTab = new ResultLedger(storage);
    const secondTab = new ResultLedger(storage);
    expect(firstTab.settle({ resultId: 'cross-tab', playId: 'play-cross-tab', stageId: 'endless', outcome: 'defeat', retired: false, score: 120, partsEarned: 20 }).accepted).toBe(true);
    expect(secondTab.settle({ resultId: 'cross-tab', playId: 'play-cross-tab', stageId: 'endless', outcome: 'defeat', retired: false, score: 999, partsEarned: 999 }).accepted).toBe(false);
    expect(secondTab.list()).toHaveLength(1);
    expect(secondTab.list()[0]?.score).toBe(120);
  });
});
