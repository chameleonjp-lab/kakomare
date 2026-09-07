export interface DamageNumberItem {
  x: number;
  y: number;
  amount: number;
  color: number;
  life: number;
  maxLife: number;
}

const DAMAGE_NUMBER_LIFE = 0.55;
const MERGE_DISTANCE = 28;

/** Keeps hit feedback bounded and combines rapid hits in the same area. */
export class DamageNumberPool {
  private readonly items: DamageNumberItem[] = [];

  public emit(x: number, y: number, amount: number, color: number, limit: number): void {
    const safeLimit = Math.max(0, Math.floor(limit));
    if (safeLimit === 0 || !Number.isFinite(amount) || amount <= 0) return;

    const merged = this.items.find((item) => item.life > 0 && item.color === color && Math.hypot(item.x - x, item.y - y) <= MERGE_DISTANCE);
    if (merged) {
      merged.amount += amount;
      merged.life = DAMAGE_NUMBER_LIFE;
      return;
    }

    const activeCount = this.items.reduce((count, item) => count + (item.life > 0 ? 1 : 0), 0);
    if (activeCount >= safeLimit) {
      const oldest = this.items.filter((item) => item.life > 0).reduce((previous, item) => item.life < previous.life ? item : previous);
      oldest.life = 0;
    }

    const reusable = this.items.find((item) => item.life <= 0);
    if (reusable) {
      Object.assign(reusable, { x, y, amount, color, life: DAMAGE_NUMBER_LIFE, maxLife: DAMAGE_NUMBER_LIFE });
      return;
    }
    this.items.push({ x, y, amount, color, life: DAMAGE_NUMBER_LIFE, maxLife: DAMAGE_NUMBER_LIFE });
  }

  public update(seconds: number, reducedMotion: boolean): void {
    for (const item of this.items) {
      if (item.life <= 0) continue;
      item.life -= seconds;
      if (!reducedMotion) item.y -= 18 * seconds;
    }
  }

  public active(): DamageNumberItem[] {
    return this.items.filter((item) => item.life > 0);
  }

  public clear(): void {
    for (const item of this.items) item.life = 0;
  }

  public get size(): number {
    return this.items.length;
  }
}
