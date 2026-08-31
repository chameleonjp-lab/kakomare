import { Projectile } from '../entities/Projectile';

export class ProjectilePool {
  private readonly items: Projectile[] = [];
  private nextId = 1;

  public acquire(options: Omit<ConstructorParameters<typeof Projectile>[0], 'id'>): Projectile {
    const reusable = this.items.find((projectile) => !projectile.active && projectile.kind === options.kind);
    const projectile = new Projectile({ ...options, id: reusable?.id ?? this.nextId });
    if (reusable) this.items[this.items.indexOf(reusable)] = projectile;
    else { this.items.push(projectile); this.nextId += 1; }
    return projectile;
  }

  public active(): Projectile[] {
    return this.items.filter((projectile) => projectile.active);
  }

  public clear(): void {
    for (const projectile of this.items) projectile.active = false;
  }

  public get size(): number {
    return this.items.length;
  }
}
