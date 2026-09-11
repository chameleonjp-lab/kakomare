import type { StageId } from './content';
import type { BattleSnapshot } from './game';
import type { NormalizedRunInput } from '../game/systems/InputRecorder';

/** Versioned, run-local state. It is intentionally separate from profile save. */
export const RUN_SAVE_VERSION = 3 as const;
export const RUN_SAVE_KEY = 'kakomare-run-save-v3';
export const RUN_SAVE_TEMP_KEY = 'kakomare-run-save-v3-pending';
export const RUN_DAMAGED_SAVE_KEY = 'kakomare-run-save-damaged';

export type RunSavePhase = 'playing' | 'paused' | 'upgrade';

export interface RunRandomState {
  'enemy-spawn': number;
  'candidate-draw': number;
  'combat-effect': number;
  presentation: number;
}

export interface RunSaveEnvelope {
  version: typeof RUN_SAVE_VERSION;
  runId: string;
  /** Stable 32-bit seed used for result identity and replay metadata. */
  runSeed: number;
  stageId: StageId;
  ruleVersion: string;
  contentVersion: string;
  competitive: boolean;
  phase: RunSavePhase;
  savedAt: string;
  tick: number;
  snapshot: BattleSnapshot;
  /** Full verification ledger; unlike a display history it is not truncated. */
  inputLog: NormalizedRunInput[];
  randomState: RunRandomState;
  /** Server-issued ranking session associated with this unfinished run. */
  rankingSession?: {
    startId: string;
    playId: string;
    displayName: string;
    gameSlug: string;
    clientVersion: string;
    ruleVersion: string;
    startedAt: string;
  };
  /** Director state is opaque to the UI but required for deterministic resume. */
  spawnState?: Record<string, unknown>;
  /** Persistent presentation-free runtime state (fields, drones, telegraphs). */
  runtimeState?: Record<string, unknown>;
}
