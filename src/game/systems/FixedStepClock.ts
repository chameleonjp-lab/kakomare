export class FixedStepClock {
  public static readonly STEP = 1 / 60;
  private static readonly TICK_SCALE = 360_000;
  private static readonly STEP_TICKS = FixedStepClock.TICK_SCALE / 60;
  private accumulatorTicks = 0;
  private totalSteps = 0;

  public reset(): void {
    this.accumulatorTicks = 0;
    this.totalSteps = 0;
  }

  public advance(frameSeconds: number, step: (seconds: number) => void): number {
    const safeFrame = Math.max(0, Math.min(0.25, frameSeconds));
    // Quantising the render delta to a fine time grid removes floating point
    // drift between 60, 90 and 120 Hz display callbacks.
    this.accumulatorTicks += Math.round(safeFrame * FixedStepClock.TICK_SCALE);
    let steps = 0;
    while (this.accumulatorTicks >= FixedStepClock.STEP_TICKS && steps < 5) {
      step(FixedStepClock.STEP);
      this.accumulatorTicks -= FixedStepClock.STEP_TICKS;
      steps += 1;
      this.totalSteps += 1;
    }
    if (steps === 5 && this.accumulatorTicks >= FixedStepClock.STEP_TICKS) {
      this.accumulatorTicks = 0;
    }
    return steps;
  }

  public getSimulationSeconds(): number {
    return this.totalSteps * FixedStepClock.STEP;
  }
}
