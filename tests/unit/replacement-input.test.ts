import { describe, expect, it } from 'vitest';
import { InputRecorder, type NormalizedRunInput } from '../../src/game/systems/InputRecorder';

describe('replacement input remains reproducible', () => {
  it('preserves the chosen face, outgoing instance and Lv3 branch through restore', () => {
    const input: NormalizedRunInput = { kind: 'upgrade', tick: 5, selectionId: 2, candidateId: 'weapon:needle:replace', placementSlot: 4, replacementTargetInstanceId: 'weapon-ray-old', replacementBranch: 'spread' };
    const recorder = new InputRecorder();
    expect(recorder.record(input)).toBe(true);
    expect(recorder.snapshot()).toEqual([input]);
    const restored = new InputRecorder();
    expect(restored.restore(recorder.snapshot())).toBe(true);
    expect(restored.snapshot()).toEqual([input]);
    expect(new InputRecorder().record({ ...input, replacementBranch: 'piercing' })).toBe(true);
  });
  it('rejects a branch from a different weapon and malformed target without changing the log', () => {
    const recorder = new InputRecorder();
    const input: NormalizedRunInput = { kind: 'upgrade', tick: 5, selectionId: 2, candidateId: 'weapon:needle:replace', placementSlot: 4, replacementTargetInstanceId: 'weapon-ray-old', replacementBranch: 'long' };
    expect(recorder.record(input)).toBe(false);
    expect(recorder.record({ ...input, replacementBranch: 'spread', replacementTargetInstanceId: '' })).toBe(false);
    expect(recorder.record({ ...input, candidateId: 'support:output:replace' })).toBe(false);
    expect(recorder.snapshot()).toEqual([]);
  });
});
