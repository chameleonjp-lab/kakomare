export interface FixedStepClockSnapshot {
  accumulatorTicks: number;
  totalSteps: number;
}

export class FixedStepClock {
  public static readonly STEP = 1 / 60;
  public static readonly TICK_SCALE = 360_000;
  /** Serialized accumulator upper bound, in fixed-point tick units. */
  public static readonly STEP_TICKS = FixedStepClock.TICK_SCALE / 60;
  private static readonly TICK_EPSILON = 1e-6;
  private accumulatorTicks = 0;
  private totalSteps = 0;

  public reset(): void {
    this.accumulatorTicks = 0;
    this.totalSteps = 0;
  }

  public advance(frameSeconds: number, step: (seconds: number) => void): number {
    const safeFrame = Math.max(0, Math.min(0.25, frameSeconds));
    // Keep sub-tick time in the accumulator. Rounding every render callback
    // creates a systematic drift at rates such as 165 Hz.
    this.accumulatorTicks += safeFrame * FixedStepClock.TICK_SCALE;
    let steps = 0;
    while (this.accumulatorTicks + FixedStepClock.TICK_EPSILON >= FixedStepClock.STEP_TICKS && steps < 5) {
      step(FixedStepClock.STEP);
      this.accumulatorTicks -= FixedStepClock.STEP_TICKS;
      if (Math.abs(this.accumulatorTicks) < FixedStepClock.TICK_EPSILON) this.accumulatorTicks = 0;
      steps += 1;
      this.totalSteps += 1;
    }
    if (steps === 5 && this.accumulatorTicks + FixedStepClock.TICK_EPSILON >= FixedStepClock.STEP_TICKS) {
      this.accumulatorTicks = 0;
    }
    return steps;
  }

  public getSimulationSeconds(): number {
    return this.totalSteps * FixedStepClock.STEP;
  }

  public snapshot(): FixedStepClockSnapshot {
    return { accumulatorTicks: this.accumulatorTicks, totalSteps: this.totalSteps };
  }

  public restore(snapshot: FixedStepClockSnapshot): boolean {
    if (!snapshot || !Number.isFinite(snapshot.accumulatorTicks) || !Number.isSafeInteger(snapshot.totalSteps)
      || snapshot.accumulatorTicks < 0 || snapshot.accumulatorTicks >= FixedStepClock.STEP_TICKS
      || snapshot.totalSteps < 0) return false;
    this.accumulatorTicks = snapshot.accumulatorTicks;
    this.totalSteps = snapshot.totalSteps;
    return true;
  }
}
