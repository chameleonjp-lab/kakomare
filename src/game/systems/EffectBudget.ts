export type EffectsLevel = 'standard' | 'low' | 'minimum';

export interface EffectLimits {
  enemies: number;
  projectiles: number;
  enemyProjectiles: number;
  particles: number;
  damageNumbers: number;
  shake: number;
}

const LIMITS: Record<EffectsLevel, EffectLimits> = {
  standard: { enemies: 180, projectiles: 280, enemyProjectiles: 80, particles: 500, damageNumbers: 18, shake: 4 },
  low: { enemies: 160, projectiles: 220, enemyProjectiles: 70, particles: 260, damageNumbers: 10, shake: 2 },
  minimum: { enemies: 140, projectiles: 180, enemyProjectiles: 60, particles: 100, damageNumbers: 0, shake: 0 },
};

export class EffectBudget {
  private level: EffectsLevel;
  private measured: number[] = [];
  private aboveSince = 0;
  private stableSince = 0;

  public constructor(level: EffectsLevel) {
    this.level = level;
  }

  public get limits(): EffectLimits {
    return LIMITS[this.level];
  }

  public get effectsLevel(): EffectsLevel {
    return this.level;
  }

  public sample(frameMs: number, elapsed: number, userReduced = false): void {
    this.measured.push(frameMs);
    if (this.measured.length > 180) this.measured.shift();
    const average = this.measured.reduce((sum, value) => sum + value, 0) / this.measured.length;
    if (average > 35) this.aboveSince ||= elapsed;
    else if (average > 28) this.aboveSince ||= elapsed;
    else if (average > 20) this.aboveSince ||= elapsed;
    else this.aboveSince = 0;
    if (!userReduced && this.aboveSince > 0 && elapsed - this.aboveSince > 2 && this.level === 'standard') this.level = 'low';
    if (!userReduced && this.aboveSince > 0 && elapsed - this.aboveSince > 4 && this.level === 'low') this.level = 'minimum';
    if (this.aboveSince === 0) this.stableSince ||= elapsed;
    else this.stableSince = 0;
    if (!userReduced && this.stableSince > 0 && elapsed - this.stableSince > 10 && this.level === 'minimum') this.level = 'low';
  }
}
