import type { Point } from '../../types/game';
import type { BuildLayer, BuildNode } from '../../types/build';

export const ARENA_RADIUS_BY_LAYER: Readonly<Record<BuildLayer, number>> = { 1: 325, 2: 390, 3: 450 };
export const DEVICE_RADIUS_BY_LAYER: Readonly<Record<BuildLayer, number>> = { 1: 118, 2: 206, 3: 294 };

export class ArenaGeometry {
  public constructor(private readonly radii: Readonly<Record<BuildLayer, number>> = ARENA_RADIUS_BY_LAYER) {}

  public radiusForLayer(layer: BuildLayer): number { return this.radii[layer]; }

  public weaponOrigin(node: Pick<BuildNode, 'kind' | 'layer' | 'sector'>): Point {
    return this.deviceOrigin(node, 0);
  }

  public supportOrigin(node: Pick<BuildNode, 'kind' | 'layer' | 'sector'>): Point {
    return this.deviceOrigin(node, Math.PI / 3);
  }

  public boundaryPoint(angle: number, layer: BuildLayer): Point {
    const radius = this.radiusForLayer(layer);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  }

  /** Distance from a point to the circular boundary along a ray. */
  public distanceToBoundary(point: Point, angle: number, layer: BuildLayer): number {
    const radius = this.radiusForLayer(layer);
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    const projection = point.x * directionX + point.y * directionY;
    const discriminant = Math.max(0, projection * projection + radius * radius - (point.x * point.x + point.y * point.y));
    return Math.max(0, -projection + Math.sqrt(discriminant));
  }

  /** Reflect a projectile at the selected circular arena boundary. */
  public reflect(position: Point, velocity: Point, layer: BuildLayer): { position: Point; velocity: Point } | null {
    const radius = this.radiusForLayer(layer);
    const distance = Math.hypot(position.x, position.y);
    if (distance < radius || distance <= 1e-9) return null;
    const nx = position.x / distance;
    const ny = position.y / distance;
    const dot = velocity.x * nx + velocity.y * ny;
    return {
      position: { x: nx * (radius - 1), y: ny * (radius - 1) },
      velocity: { x: velocity.x - 2 * dot * nx, y: velocity.y - 2 * dot * ny },
    };
  }

  private deviceOrigin(node: Pick<BuildNode, 'kind' | 'layer' | 'sector'>, supportOffset: number): Point {
    const angle = -Math.PI / 2 + node.sector * Math.PI * 2 / 3 + (node.kind === 'support' ? supportOffset : 0);
    const radius = DEVICE_RADIUS_BY_LAYER[node.layer];
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  }
}
