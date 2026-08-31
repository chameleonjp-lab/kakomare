import { describe, expect, it } from 'vitest';
import { RunLifecycleGuard } from '../../src/app/RunLifecycleGuard';
import { FixedStepClock } from '../../src/game/systems/FixedStepClock';
import { RunRecorder } from '../../src/game/systems/RunRecorder';
import { SaveService, type StorageLike } from '../../src/services/SaveService';
import { createDefaultSave, SAVE_KEY } from '../../src/types/save';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.values.set(key, value); }
  public removeItem(key: string): void { this.values.delete(key); }
}

describe('run lifecycle integration', () => {
  it('counts one start, settles once, and stops fixed-step updates after the result', () => {
    const storage = new MemoryStorage();
    const saves = new SaveService(storage);
    const lifecycle = new RunLifecycleGuard();
    const clock = new FixedStepClock();
    const recorder = new RunRecorder('stage-1', 'crown', 73);
    let save = createDefaultSave();
    save.profile.name = '結合確認';

    const start = (): void => {
      if (!lifecycle.start()) return;
      save = { ...save, statistics: { ...save.statistics, playCount: save.statistics.playCount + 1 } };
      expect(saves.persist(save)).toBe(true);
    };
    start();
    start();
    expect(JSON.parse(storage.getItem(SAVE_KEY) ?? '{}').statistics.playCount).toBe(1);

    clock.advance(1, (seconds) => {
      if (!lifecycle.active) return;
      recorder.survivalTime += seconds;
      recorder.score += 1;
    });
    const scoreAtResult = recorder.score;
    expect(scoreAtResult).toBeGreaterThan(0);

    const settle = (): void => {
      if (!lifecycle.finish()) return;
      save = {
        ...save,
        progress: { ...save.progress, parts: save.progress.parts + 20 },
        statistics: { ...save.statistics, clearCount: save.statistics.clearCount + 1 },
      };
      expect(saves.persist(save)).toBe(true);
    };
    settle();
    settle();
    clock.advance(1, () => {
      if (lifecycle.active) recorder.score += 1;
    });

    const loaded = saves.load().data;
    expect(recorder.score).toBe(scoreAtResult);
    expect(loaded.statistics).toMatchObject({ playCount: 1, clearCount: 1 });
    expect(loaded.progress.parts).toBe(20);
  });
});
