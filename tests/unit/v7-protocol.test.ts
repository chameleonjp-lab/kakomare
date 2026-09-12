import { describe, expect, it } from 'vitest';
import {
  FINAL_GATE_ENDLESS_SEEDS,
  FINAL_GATE_NORMAL_SEEDS,
  FINAL_GATE_NORMAL_STAGES,
  FINAL_GATE_SELECTION_POLICIES,
  buildFinalGateEndlessTrials,
  buildFinalGateNormalTrials,
  buildFinalGateTrialMatrix,
} from '../../src/game/systems/FinalGateProtocol';
import { RunRecorder } from '../../src/game/systems/RunRecorder';

describe('V7 final-gate trial protocol', () => {
  it('defines the complete normal-stage matrix without duplicate descriptors', () => {
    const trials = buildFinalGateNormalTrials();
    expect(FINAL_GATE_NORMAL_STAGES).toHaveLength(6);
    expect(FINAL_GATE_NORMAL_SEEDS).toHaveLength(20);
    expect(FINAL_GATE_SELECTION_POLICIES).toHaveLength(3);
    expect(trials).toHaveLength(720);
    expect(new Set(trials.map((trial) => trial.id)).size).toBe(720);
    expect(new Set(trials.map((trial) => trial.seed)).size).toBe(20);
    expect(new Set(trials.map((trial) => trial.stageId)).size).toBe(6);
    expect(new Set(trials.map((trial) => trial.researchState)).size).toBe(2);
    expect(trials.every((trial) => trial.mode === 'normal' && trial.maxSimulationSeconds === 330 && trial.aimPolicy === null)).toBe(true);
  });

  it('defines the complete endless matrix with a one-hour observation cap', () => {
    const trials = buildFinalGateEndlessTrials();
    expect(FINAL_GATE_ENDLESS_SEEDS).toHaveLength(10);
    expect(trials).toHaveLength(60);
    expect(new Set(trials.map((trial) => trial.id)).size).toBe(60);
    expect(new Set(trials.map((trial) => trial.aimPolicy)).size).toBe(2);
    expect(trials.every((trial) => trial.mode === 'endless' && trial.maxSimulationSeconds === 3_600 && trial.researchState === null)).toBe(true);
  });

  it('keeps normal and endless descriptors disjoint', () => {
    const normal = buildFinalGateNormalTrials();
    const endless = buildFinalGateEndlessTrials();
    const endlessIds = new Set(endless.map((trial) => trial.id));
    expect(normal.some((trial) => endlessIds.has(trial.id))).toBe(false);
    expect(buildFinalGateTrialMatrix()).toHaveLength(780);
  });

  it('does not turn competitive result fields into score', () => {
    const recorder = new RunRecorder('endless', 'echo', 42, 'expansion-v7-runtime');
    recorder.score = 120;
    recorder.survivalTime = 300;
    expect(recorder.result('defeat', 100, 0).score).toBe(3_620);
    expect(recorder.result('defeat', 100, 0, false, null, { includeSurvivalAndCore: false }).score).toBe(120);
  });
});
