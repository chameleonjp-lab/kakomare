import { normalizeAngle } from './Angle';

export type NormalizedRunInput =
  | { tick: number; kind: 'aim'; angle: number }
  | { tick: number; kind: 'upgrade'; selectionId: number; candidateId: string; placementSlot?: number }
  | { tick: number; kind: 'build'; action: 'move' | 'swap'; instanceId: string; otherInstanceId?: string; slot?: number }
  | { tick: number; kind: 'pause' | 'resume' | 'retire' };

/**
 * Verification-facing input ledger. It intentionally has no visual-history
 * limit: a later save/transport layer can segment this list without dropping
 * events needed to replay a run.
 */
export class InputRecorder {
  private readonly events: NormalizedRunInput[] = [];
  private lastTick = 0;

  public record(input: NormalizedRunInput): boolean {
    if (!Number.isInteger(input.tick) || input.tick < this.lastTick) return false;
    if (input.kind === 'aim') {
      if (!Number.isFinite(input.angle)) return false;
      this.events.push({ tick: input.tick, kind: 'aim', angle: normalizeAngle(input.angle) });
    } else if (input.kind === 'upgrade') {
      if (!Number.isInteger(input.selectionId) || input.selectionId < 1 || input.candidateId.length === 0) return false;
      if (input.placementSlot !== undefined && (!Number.isInteger(input.placementSlot) || input.placementSlot < 0)) return false;
      this.events.push({
        tick: input.tick,
        kind: 'upgrade',
        selectionId: input.selectionId,
        candidateId: input.candidateId,
        ...(input.placementSlot === undefined ? {} : { placementSlot: input.placementSlot }),
      });
    } else if (input.kind === 'build') {
      if (!Number.isInteger(input.tick) || input.instanceId.length === 0) return false;
      if (input.action === 'move' && (input.slot === undefined || !Number.isInteger(input.slot) || input.slot < 0)) return false;
      if (input.action === 'swap' && (!input.otherInstanceId || input.otherInstanceId.length === 0)) return false;
      this.events.push({
        tick: input.tick,
        kind: 'build',
        action: input.action,
        instanceId: input.instanceId,
        ...(input.otherInstanceId === undefined ? {} : { otherInstanceId: input.otherInstanceId }),
        ...(input.slot === undefined ? {} : { slot: input.slot }),
      });
    } else {
      this.events.push({ tick: input.tick, kind: input.kind });
    }
    this.lastTick = input.tick;
    return true;
  }

  public snapshot(): NormalizedRunInput[] { return this.events.map((event) => ({ ...event })); }
  public get size(): number { return this.events.length; }
  public get lastRecordedTick(): number { return this.lastTick; }
}
