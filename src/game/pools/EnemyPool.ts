import { Enemy } from '../entities/Enemy';
import type { BossId, EnemyId } from '../../types/content';

export class EnemyPool {
  private readonly items: Enemy[] = [];
  private nextId = 1;

  public acquire(type: EnemyId | BossId, angle: number, distance: number, difficulty: number, speedMultiplierCap = 1.25): Enemy {
    const id = this.nextId;
    this.nextId += 1;
    const reusable = this.items.find((enemy) => !enemy.active && enemy.type === type);
    if (reusable) {
      reusable.reset(id, angle, distance, difficulty, speedMultiplierCap);
      return reusable;
    }
    const enemy = new Enemy(id, type, angle, distance, difficulty, speedMultiplierCap);
    this.items.push(enemy);
    return enemy;
  }

  public active(): Enemy[] {
    return this.items.filter((enemy) => enemy.active);
  }

  public clear(): void {
    for (const enemy of this.items) enemy.active = false;
  }

  public get size(): number {
    return this.items.length;
  }
}
