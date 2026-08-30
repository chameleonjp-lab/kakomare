import { ENEMIES } from '../../data/enemies';
import type { EnemyId, StageId } from '../../types/content';

export class DeterministicRng {
  private state: number;

  public constructor(seed: number) {
    this.state = seed >>> 0 || 1;
  }

  public next(): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  public pick<T>(items: T[]): T {
    return items[Math.floor(this.next() * items.length)] ?? items[0];
  }
}

export function seedFromStage(stageId: StageId, startTime: number, serial: number): number {
  let hash = serial + Math.floor(startTime) + 17;
  for (const char of stageId) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return hash >>> 0;
}

export interface SpawnRequest {
  type: EnemyId;
  angle: number;
}

export class SpawnDirector {
  private budget = 0;
  private lastSector = -1;
  private consecutiveSectorCount = 0;
  private readonly rng: DeterministicRng;
  private bossSent = false;

  public constructor(_stageId: StageId, seed: number, private readonly testMode = false) {
    this.rng = new DeterministicRng(seed);
  }

  public get bossSpawned(): boolean {
    return this.bossSent;
  }

  public update(seconds: number, elapsed: number, activeEnemyCount: number, emit: (request: SpawnRequest) => void): void {
    if (activeEnemyCount >= (this.testMode ? 40 : 90)) return;
    const base = this.testMode ? 3.8 : 1.3;
    const rise = this.testMode ? 0.09 : 0.012;
    this.budget += (base + elapsed * rise) * seconds;
    const choices = this.availableEnemies(elapsed);
    while (this.budget >= ENEMIES[choices[0]].threatCost && activeEnemyCount < (this.testMode ? 40 : 90)) {
      const type = this.rng.pick(choices);
      const cost = ENEMIES[type].threatCost;
      if (this.budget < cost) break;
      this.budget -= cost;
      const sector = this.chooseSector();
      emit({ type, angle: sector * Math.PI / 3 + (this.rng.next() - 0.5) * 0.24 });
      activeEnemyCount += 1;
    }
  }

  public shouldSpawnBoss(elapsed: number): boolean {
    const bossAt = this.testMode ? 5.5 : 145;
    if (!this.bossSent && elapsed >= bossAt) {
      this.bossSent = true;
      return true;
    }
    return false;
  }

  private availableEnemies(elapsed: number): EnemyId[] {
    if (elapsed < (this.testMode ? 1.6 : 40)) return ['shard', 'runner'];
    if (elapsed < (this.testMode ? 3.5 : 85)) return ['shard', 'runner', 'lattice'];
    return ['shard', 'runner', 'lattice', 'spore'];
  }

  private chooseSector(): number {
    let sector = Math.floor(this.rng.next() * 6);
    if (sector === this.lastSector && this.consecutiveSectorCount >= 2) sector = (sector + 1 + Math.floor(this.rng.next() * 5)) % 6;
    if (sector === this.lastSector) this.consecutiveSectorCount += 1;
    else { this.lastSector = sector; this.consecutiveSectorCount = 1; }
    return sector;
  }
}
