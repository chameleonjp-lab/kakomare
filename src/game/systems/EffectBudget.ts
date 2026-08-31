export type EffectsLevel = 'standard' | 'low' | 'minimum';

export interface EffectLimits {
  enemies: number;
  projectiles: number;
  enemyProjectiles: number;
  particles: number;
  damageNumbers: number;
  shake: number;
}

interface FrameMeasurement {
  at: number;
  frameMs: number;
}

const LIMITS: Record<EffectsLevel, EffectLimits> = {
  standard: { enemies: 180, projectiles: 280, enemyProjectiles: 80, particles: 500, damageNumbers: 18, shake: 4 },
  low: { enemies: 160, projectiles: 220, enemyProjectiles: 70, particles: 260, damageNumbers: 10, shake: 2 },
  minimum: { enemies: 140, projectiles: 180, enemyProjectiles: 60, particles: 100, damageNumbers: 0, shake: 0 },
};

export class EffectBudget {
  private requestedLevel: EffectsLevel;
  private adaptiveLevel: EffectsLevel = 'standard';
  private measured: FrameMeasurement[] = [];
  private above20Since: number | null = null;
  private above28Since: number | null = null;
  private above35Since: number | null = null;
  private stableSince: number | null = null;

  public constructor(level: EffectsLevel) {
    this.requestedLevel = level;
  }

  public get limits(): EffectLimits {
    return LIMITS[this.effectsLevel];
  }

  public get effectsLevel(): EffectsLevel {
    return stricterLevel(this.requestedLevel, this.adaptiveLevel);
  }

  public get adaptiveEffectsLevel(): EffectsLevel {
    return this.adaptiveLevel;
  }

  public get maximumPixelRatio(): number {
    return this.adaptiveLevel === 'minimum' ? 1.5 : 2;
  }

  public pixelRatio(devicePixelRatio: number): number {
    const normalized = Number.isFinite(devicePixelRatio) ? Math.max(1, devicePixelRatio) : 1;
    return Math.min(normalized, this.maximumPixelRatio);
  }

  public setRequestedLevel(level: EffectsLevel): void {
    this.requestedLevel = level;
  }

  public sample(frameMs: number, elapsed: number): void {
    if (!Number.isFinite(frameMs) || !Number.isFinite(elapsed) || frameMs < 0) return;
    this.measured.push({ at: elapsed, frameMs });
    const cutoff = elapsed - 3;
    while (this.measured[0] && this.measured[0].at < cutoff) this.measured.shift();
    const average = this.measured.reduce((sum, value) => sum + value.frameMs, 0) / this.measured.length;
    this.above20Since = average > 20 ? this.above20Since ?? elapsed : null;
    this.above28Since = average > 28 ? this.above28Since ?? elapsed : null;
    this.above35Since = average > 35 ? this.above35Since ?? elapsed : null;
    this.stableSince = average <= 20 ? this.stableSince ?? elapsed : null;

    if (this.above35Since !== null && elapsed - this.above35Since >= 1) this.adaptiveLevel = 'minimum';
    else if (this.above28Since !== null && elapsed - this.above28Since >= 2) this.adaptiveLevel = 'minimum';
    else if (this.above20Since !== null && elapsed - this.above20Since >= 2 && this.adaptiveLevel === 'standard') this.adaptiveLevel = 'low';
    if (this.stableSince !== null && elapsed - this.stableSince >= 10 && this.adaptiveLevel !== 'standard') {
      this.adaptiveLevel = this.adaptiveLevel === 'minimum' ? 'low' : 'standard';
      this.stableSince = elapsed;
    }
  }
}

export function selectVisibleEntities<T>(items: T[], limit: number, comparePriority: (first: T, second: T) => number): T[] {
  const safeLimit = Math.max(0, Math.floor(limit));
  if (items.length <= safeLimit) return items;
  return [...items].sort(comparePriority).slice(0, safeLimit);
}

const LEVEL_RANK: Record<EffectsLevel, number> = { standard: 0, low: 1, minimum: 2 };

function stricterLevel(first: EffectsLevel, second: EffectsLevel): EffectsLevel {
  return LEVEL_RANK[first] >= LEVEL_RANK[second] ? first : second;
}
