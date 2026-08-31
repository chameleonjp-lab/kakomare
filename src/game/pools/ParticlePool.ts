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
    let activeCount = this.items.reduce((count, item) => count + (item.life > 0 ? 1 : 0), 0);
    while (activeCount >= safeLimit) {
      let oldest: ParticleItem | null = null;
      for (const item of this.items) if (item.life > 0 && (!oldest || item.life < oldest.life)) oldest = item;
      if (!oldest) break;
      oldest.life = 0;
      activeCount -= 1;
    }
    const reusable = this.items.find((item) => item.life <= 0);
    if (reusable) {
      reusable.x = x;
      reusable.y = y;
      reusable.life = life;
      reusable.maxLife = life;
      reusable.color = color;
      return;
    }
    this.items.push({ x, y, life, maxLife: life, color });
  }

  public update(seconds: number): void {
    for (const item of this.items) item.life -= seconds;
  }

  public active(): ParticleItem[] {
    return this.items.filter((item) => item.life > 0);
  }

  public clear(): void {
    for (const item of this.items) item.life = 0;
  }

  public get size(): number {
    return this.items.length;
  }
}
