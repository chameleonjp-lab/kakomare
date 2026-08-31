import { describe, expect, it } from 'vitest';
import { DAMAGED_SAVE_KEY, SAVE_KEY, createDefaultSave } from '../../src/types/save';
import { SaveService, type StorageLike } from '../../src/services/SaveService';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.values.set(key, value); }
  public removeItem(key: string): void { this.values.delete(key); }
}

describe('SaveService', () => {
  it('recovers malformed JSON into a fresh save and preserves the damaged copy', () => {
    const storage = new MemoryStorage(); storage.setItem(SAVE_KEY, '{broken');
    const result = new SaveService(storage).load();
    expect(result.recovered).toBe(true);
    expect(storage.getItem(DAMAGED_SAVE_KEY)).toBe('{broken');
    expect(result.data.profile.name).toBe('');
  });

  it('round trips valid data and migrates the first prototype shape', () => {
    const storage = new MemoryStorage(); const service = new SaveService(storage);
    const save = createDefaultSave(); save.profile.name = 'テスト'; save.statistics.playCount = 2; service.persist(save);
    expect(service.load().data.profile.name).toBe('テスト');
    const migrated = service.validateImport(JSON.stringify({ profile: { name: '旧版' }, statistics: { playCount: 4 } }));
    expect(migrated?.profile.name).toBe('旧版');
    expect(migrated?.statistics.playCount).toBe(4);
  });

  it('migrates a complete PR1 save while retaining its progress and settings', () => {
    const service = new SaveService(new MemoryStorage());
    const legacy = createDefaultSave();
    legacy.profile.name = '旧版利用者';
    const v1 = { ...legacy, version: 1, progress: { ...legacy.progress, unlockedStages: ['stage-1'], parts: 12 }, records: { ...legacy.records, stageBest: { 'stage-1': { bestScore: 80, bestCore: 70, bestTime: 40 } } } };
    const migrated = service.validateImport(JSON.stringify(v1));
    expect(migrated?.version).toBe(2);
    expect(migrated?.progress.parts).toBe(12);
    expect(migrated?.records.stageBest['stage-1']?.bestScore).toBe(80);
  });

  it('rejects invalid imported values instead of silently clamping them', () => {
    const service = new SaveService(new MemoryStorage());
    expect(service.validateImport(JSON.stringify({ version: 1, profile: { name: '' } }))).toBeNull();
  });
});
