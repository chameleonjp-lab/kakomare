import type { StageId } from '../../types/content';

/**
 * The V7 trial matrix is data, not a test-only loop hidden in a report.  A
 * descriptor is the complete input contract for one deterministic observation
 * and can therefore be reused by the headless BattleScene probe, CI, or a
 * later result export without changing the selection rules.
 */
export const FINAL_GATE_NORMAL_STAGES = Object.freeze([
  'stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-5', 'stage-6',
] as const satisfies readonly StageId[]);

export const FINAL_GATE_NORMAL_SEEDS = Object.freeze(
  Array.from({ length: 20 }, (_, index) => 10_000 + index * 7_919),
);

export const FINAL_GATE_ENDLESS_SEEDS = Object.freeze(
  Array.from({ length: 10 }, (_, index) => 200_000 + index * 11_173),
);

export const FINAL_GATE_SELECTION_POLICIES = Object.freeze([
  'main-first', 'expansion-first', 'defense-first',
] as const);

export type FinalGateSelectionPolicy = (typeof FINAL_GATE_SELECTION_POLICIES)[number];
export type FinalGateResearchState = 'baseline' | 'maximal';
export type FinalGateAimPolicy = 'automatic' | 'danger-target';
export type FinalGateMode = 'normal' | 'endless';

export interface FinalGateTrial {
  id: string;
  mode: FinalGateMode;
  stageId: StageId;
  seed: number;
  selectionPolicy: FinalGateSelectionPolicy;
  researchState: FinalGateResearchState | null;
  aimPolicy: FinalGateAimPolicy | null;
  /** Observation cap; defeat may happen earlier and is retained as a result. */
  maxSimulationSeconds: number;
}

function normalTrialId(stageId: StageId, seed: number, policy: FinalGateSelectionPolicy, research: FinalGateResearchState): string {
  return `normal:${stageId}:${seed}:${policy}:${research}`;
}

function endlessTrialId(seed: number, policy: FinalGateSelectionPolicy, aim: FinalGateAimPolicy): string {
  return `endless:${seed}:${policy}:${aim}`;
}

/** 6 stages × 20 independent starts × 3 selection policies × 2 research states. */
export function buildFinalGateNormalTrials(): FinalGateTrial[] {
  const trials: FinalGateTrial[] = [];
  for (const stageId of FINAL_GATE_NORMAL_STAGES) {
    for (const seed of FINAL_GATE_NORMAL_SEEDS) {
      for (const selectionPolicy of FINAL_GATE_SELECTION_POLICIES) {
        for (const researchState of ['baseline', 'maximal'] as const) {
          trials.push({
            id: normalTrialId(stageId, seed, selectionPolicy, researchState),
            mode: 'normal',
            stageId,
            seed,
            selectionPolicy,
            researchState,
            aimPolicy: null,
            maxSimulationSeconds: 330,
          });
        }
      }
    }
  }
  return trials;
}

/** 10 independent starts × 3 selection policies × 2 aim policies. */
export function buildFinalGateEndlessTrials(): FinalGateTrial[] {
  const trials: FinalGateTrial[] = [];
  for (const seed of FINAL_GATE_ENDLESS_SEEDS) {
    for (const selectionPolicy of FINAL_GATE_SELECTION_POLICIES) {
      for (const aimPolicy of ['automatic', 'danger-target'] as const) {
        trials.push({
          id: endlessTrialId(seed, selectionPolicy, aimPolicy),
          mode: 'endless',
          stageId: 'endless',
          seed,
          selectionPolicy,
          researchState: null,
          aimPolicy,
          maxSimulationSeconds: 60 * 60,
        });
      }
    }
  }
  return trials;
}

export function buildFinalGateTrialMatrix(): FinalGateTrial[] {
  return [...buildFinalGateNormalTrials(), ...buildFinalGateEndlessTrials()];
}
