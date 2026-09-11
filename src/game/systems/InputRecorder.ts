import { normalizeAngle } from './Angle';

export type NormalizedRunInput =
  | { tick: number; kind: 'aim'; angle: number }
  | { tick: number; kind: 'upgrade'; selectionId: number; candidateId: string; placementSlot?: number }
  | { tick: number; kind: 'build'; action: 'move' | 'swap'; instanceId: string; otherInstanceId?: string; slot?: number }
  | { tick: number; kind: 'pause' | 'resume' | 'retire' };

export const MAX_INPUT_EVENTS = 100_000;

/**
 * Verification-facing input ledger. It intentionally has no visual-history
 * limit: a later save/transport layer can segment this list without dropping
 * events needed to replay a run.
 */
export class InputRecorder {
  private readonly events: NormalizedRunInput[] = [];
  private lastTick = 0;

  public record(input: NormalizedRunInput): boolean {
    if (!input || typeof input !== 'object' || this.events.length >= MAX_INPUT_EVENTS || !Number.isSafeInteger(input.tick) || input.tick < 0 || input.tick < this.lastTick) return false;
    if (input.kind === 'aim') {
      if (!Number.isFinite(input.angle)) return false;
      this.events.push({ tick: input.tick, kind: 'aim', angle: normalizeAngle(input.angle) });
    } else if (input.kind === 'upgrade') {
      if (!Number.isSafeInteger(input.selectionId) || input.selectionId < 1 || typeof input.candidateId !== 'string' || input.candidateId.length === 0 || input.candidateId.length > 160) return false;
      if (input.placementSlot !== undefined && (!Number.isInteger(input.placementSlot) || input.placementSlot < 0)) return false;
      this.events.push({
        tick: input.tick,
        kind: 'upgrade',
        selectionId: input.selectionId,
        candidateId: input.candidateId,
        ...(input.placementSlot === undefined ? {} : { placementSlot: input.placementSlot }),
      });
    } else if (input.kind === 'build') {
      if (typeof input.instanceId !== 'string' || input.instanceId.length === 0 || input.instanceId.length > 160 || (input.action !== 'move' && input.action !== 'swap')) return false;
      if (input.action === 'move' && (input.slot === undefined || !Number.isInteger(input.slot) || input.slot < 0)) return false;
      if (input.action === 'swap' && (typeof input.otherInstanceId !== 'string' || input.otherInstanceId.length === 0 || input.otherInstanceId.length > 160)) return false;
      this.events.push({
        tick: input.tick,
        kind: 'build',
        action: input.action,
        instanceId: input.instanceId,
        ...(input.otherInstanceId === undefined ? {} : { otherInstanceId: input.otherInstanceId }),
        ...(input.slot === undefined ? {} : { slot: input.slot }),
      });
    } else if (input.kind === 'pause' || input.kind === 'resume' || input.kind === 'retire') {
      this.events.push({ tick: input.tick, kind: input.kind });
    } else return false;
    this.lastTick = input.tick;
    return true;
  }

  public snapshot(): NormalizedRunInput[] { return this.events.map((event) => ({ ...event })); }
  public get size(): number { return this.events.length; }
  public get lastRecordedTick(): number { return this.lastTick; }

  /**
   * Restore a complete verification ledger atomically.  Replaying through
   * `record` keeps the same normalization and monotonic-tick contract used by
   * live input.  A malformed event therefore cannot leave a partially restored
   * ledger behind.
   */
  public restore(events: readonly NormalizedRunInput[]): boolean {
    if (!Array.isArray(events)) return false;
    const candidate = new InputRecorder();
    for (const event of events) {
      if (!event || !candidate.record(event)) return false;
    }
    this.events.splice(0, this.events.length, ...candidate.events.map((event) => ({ ...event })));
    this.lastTick = candidate.lastTick;
    return true;
  }
}
