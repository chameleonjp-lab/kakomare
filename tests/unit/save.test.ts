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
    const save = createDefaultSave(); save.profile.name = 'テスト'; save.statistics.playCount = 2;
    expect(service.persist(save)).toBe(true);
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

  it('rejects invalid numeric values in a v1 source instead of rounding or clamping them', () => {
    const service = new SaveService(new MemoryStorage());
    const valid = createDefaultSave();
    valid.profile.name = '旧版検査';
    const v1 = { ...valid, version: 1 };
    const invalid = [
      { ...v1, progress: { ...v1.progress, parts: -1 } },
      { ...v1, progress: { ...v1.progress, parts: 1.5 } },
      { ...v1, records: { ...v1.records, endlessBest: -1 } },
      { ...v1, records: { ...v1.records, endlessBest: 2.5 } },
      { ...v1, settings: { ...v1.settings, audio: -1 } },
      { ...v1, settings: { ...v1.settings, audio: 101 } },
      { ...v1, settings: { ...v1.settings, music: 10.5 } },
      { ...v1, statistics: { ...v1.statistics, playCount: -1 } },
      { ...v1, statistics: { ...v1.statistics, totalKills: 3.5 } },
    ];
    for (const source of invalid) expect(service.validateImport(JSON.stringify(source))).toBeNull();
    expect(service.validateImport(JSON.stringify({ profile: { name: '試作版' }, statistics: { playCount: 1.5 } }))).toBeNull();
    expect(service.validateImport(JSON.stringify({ profile: { name: '試作版' }, statistics: { totalKills: -1 } }))).toBeNull();
  });

  it('rejects invalid imported values instead of silently clamping them', () => {
    const service = new SaveService(new MemoryStorage());
    expect(service.validateImport(JSON.stringify({ version: 1, profile: { name: '' } }))).toBeNull();
  });

  it('keeps an empty profile valid for a new local save but rejects it as an import', () => {
    const storage = new MemoryStorage();
    const service = new SaveService(storage);
    const initial = createDefaultSave();
    expect(service.persist(initial)).toBe(true);
    expect(service.load()).toMatchObject({ recovered: false, data: { profile: { name: '' } } });
    expect(service.validateImport(JSON.stringify(initial))).toBeNull();
  });

  it.each([
    ['fractional', 1.5],
    ['negative', -1],
    ['above the definition maximum', 6],
  ])('rejects %s research levels without correcting them', (_label, level) => {
    const service = new SaveService(new MemoryStorage());
    const save = createDefaultSave();
    save.profile.name = '研究確認';
    save.progress.researchLevels['weapon-power'] = level;
    expect(service.validateImport(JSON.stringify(save))).toBeNull();

    const legacy = { ...save, version: 1 };
    expect(service.validateImport(JSON.stringify(legacy))).toBeNull();
  });

  it.each([
    ['skips the first stage', ['stage-2']],
    ['skips a middle stage', ['stage-1', 'stage-3']],
    ['contains a duplicate', ['stage-1', 'stage-1']],
    ['is out of order', ['stage-1', 'stage-3', 'stage-2']],
  ])('rejects an unlock list that %s', (_label, unlockedStages) => {
    const service = new SaveService(new MemoryStorage());
    const save = createDefaultSave();
    save.profile.name = '解放確認';
    const imported = { ...save, progress: { ...save.progress, unlockedStages } };
    expect(service.validateImport(JSON.stringify(imported))).toBeNull();
    expect(service.validateImport(JSON.stringify({ ...imported, version: 1 }))).toBeNull();
  });

  it('accepts valid bounded research levels and a sequential unlock list', () => {
    const service = new SaveService(new MemoryStorage());
    const save = createDefaultSave();
    save.profile.name = '正常確認';
    save.progress.unlockedStages = ['stage-1', 'stage-2', 'stage-3', 'endless'];
    save.progress.researchLevels = { 'core-health': 3, 'weapon-power': 5, reroll: 2 };
    expect(service.validateImport(JSON.stringify(save))).toMatchObject({ profile: { name: '正常確認' }, progress: save.progress });
  });

  it('returns false when the save cannot be written', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => { throw new Error('storage unavailable'); },
      removeItem: () => undefined,
    };
    expect(new SaveService(storage).persist(createDefaultSave())).toBe(false);
    expect(new SaveService(null).persist(createDefaultSave())).toBe(false);
  });
});
