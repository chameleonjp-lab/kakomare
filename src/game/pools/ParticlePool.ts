export interface ParticleItem {
  x: number;
  y: number;
  life: number;
  color: number;
}

export class ParticlePool {
  private readonly items: ParticleItem[] = [];

  public emit(x: number, y: number, color: number, life = 0.35, limit = 500): void {
    if (this.items.length >= limit) this.items.shift();
    this.items.push({ x, y, life, color });
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
