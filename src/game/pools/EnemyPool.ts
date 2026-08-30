import { Enemy } from '../entities/Enemy';
import type { BossId, EnemyId } from '../../types/content';

export class EnemyPool {
  private readonly items: Enemy[] = [];
  private nextId = 1;

  public acquire(type: EnemyId | BossId, angle: number, distance: number, difficulty: number): Enemy {
    const reusable = this.items.find((enemy) => !enemy.active && enemy.type === type);
    if (reusable) {
      const fresh = new Enemy(reusable.id, type, angle, distance, difficulty);
      const index = this.items.indexOf(reusable);
      this.items[index] = fresh;
      return fresh;
    }
    const enemy = new Enemy(this.nextId, type, angle, distance, difficulty);
    this.nextId += 1;
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
