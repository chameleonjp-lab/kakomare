import { Enemy } from '../entities/Enemy';
import type { BossId, EnemyId } from '../../types/content';
import type { EnemySnapshot } from '../../types/game';
import { BOSSES } from '../../data/bosses';
import { ENEMIES } from '../../data/enemies';

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

  public restore(snapshot: EnemySnapshot, elapsed: number, speedMultiplierCap = 1.25): Enemy | null {
    const definition = snapshot.isBoss ? BOSSES[snapshot.type as BossId] : ENEMIES[snapshot.type as EnemyId];
    if (!definition || !Number.isInteger(snapshot.id) || snapshot.id < 1) return null;
    const difficulty = definition.hp > 0 ? snapshot.maxHp / definition.hp : 1;
    const angle = Math.atan2(snapshot.y, snapshot.x);
    const existing = this.items.find((enemy) => enemy.id === snapshot.id);
    const enemy = existing ?? this.acquire(snapshot.type, angle, snapshot.distanceToCore, Math.max(0.01, difficulty), speedMultiplierCap);
    if (existing && existing.type !== snapshot.type) return null;
    this.nextId = Math.max(this.nextId, snapshot.id + 1);
    return enemy.restore(snapshot, elapsed) ? enemy : null;
  }

  public active(): Enemy[] {
    return this.items.filter((enemy) => enemy.active);
  }

  public clear(): void {
    for (const enemy of this.items) enemy.active = false;
  }

  /** Persist the allocator cursor so resumed runs do not reuse old IDs. */
  public get nextIdentifier(): number { return this.nextId; }

  public restoreNextIdentifier(nextId: number): boolean {
    if (!Number.isSafeInteger(nextId) || nextId < 1) return false;
    this.nextId = Math.max(this.nextId, nextId);
    return true;
  }

  public get size(): number {
    return this.items.length;
  }
}
