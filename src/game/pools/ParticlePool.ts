export interface ParticleItem {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  color: number;
}

export class ParticlePool {
  private readonly items: ParticleItem[] = [];

  public emit(x: number, y: number, color: number, life = 0.35, limit = 500): void {
    const safeLimit = Math.max(0, Math.floor(limit));
    if (safeLimit === 0) return;
    while (this.items.length >= safeLimit) this.items.shift();
    this.items.push({ x, y, life, maxLife: life, color });
  }

  public update(seconds: number): void {
    for (const item of this.items) item.life -= seconds;
    while (this.items[0]?.life <= 0) this.items.shift();
  }

  public active(): ParticleItem[] {
    return this.items;
  }

  public clear(): void {
    this.items.length = 0;
  }
}
