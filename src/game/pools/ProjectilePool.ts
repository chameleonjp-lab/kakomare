import { Projectile } from '../entities/Projectile';
import type { ProjectileSnapshot } from '../../types/game';

export class ProjectilePool {
  private readonly items: Projectile[] = [];
  private nextId = 1;

  public acquire(options: Omit<ConstructorParameters<typeof Projectile>[0], 'id'>): Projectile {
    const reusable = this.items.find((projectile) => !projectile.active && projectile.kind === options.kind);
    if (reusable) {
      reusable.reset(options);
      return reusable;
    }
    const projectile = new Projectile({ ...options, id: this.nextId });
    this.items.push(projectile);
    this.nextId += 1;
    return projectile;
  }

  public restore(snapshot: ProjectileSnapshot): Projectile | null {
    if (!Number.isInteger(snapshot.id) || snapshot.id < 1) return null;
    const existing = this.items.find((projectile) => projectile.id === snapshot.id);
    if (existing) {
      return existing.restore(snapshot) ? existing : null;
    }
    const projectile = new Projectile({ ...snapshot, id: snapshot.id, impactX: snapshot.impactX ?? undefined, impactY: snapshot.impactY ?? undefined });
    if (!projectile.restore(snapshot)) return null;
    this.items.push(projectile);
    this.nextId = Math.max(this.nextId, snapshot.id + 1);
    return projectile;
  }

  public active(): Projectile[] {
    return this.items.filter((projectile) => projectile.active);
  }

  public clear(): void {
    for (const projectile of this.items) projectile.active = false;
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
