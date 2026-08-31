import { ENEMIES } from '../../data/enemies';
import { STAGES } from '../../data/stages';
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
  private nextBossAt: number;

  public constructor(private readonly stageId: StageId, seed: number, private readonly testMode = false) {
    this.rng = new DeterministicRng(seed);
    this.nextBossAt = this.testMode ? 5.5 : STAGES[stageId].bossAt;
  }

  public get bossSpawned(): boolean {
    return this.bossSent;
  }

  public get bossId() {
    return STAGES[this.stageId].boss;
  }

  public get enemyLimit(): number {
    return this.testMode ? 40 : STAGES[this.stageId].enemyLimit;
  }

  public update(seconds: number, elapsed: number, activeEnemyCount: number, emit: (request: SpawnRequest) => void): void {
    if (activeEnemyCount >= this.enemyLimit) return;
    const stage = STAGES[this.stageId];
    const endlessScale = stage.isEndless ? 1 + Math.floor(elapsed / 300) * 0.12 : 1;
    const base = this.testMode ? 3.8 : stage.budgetBase * endlessScale;
    const rise = this.testMode ? 0.09 : stage.budgetRise * endlessScale;
    this.budget += (base + elapsed * rise) * seconds;
    const choices = this.availableEnemies(elapsed);
    const cheapest = Math.min(...choices.map((type) => ENEMIES[type].threatCost));
    let count = activeEnemyCount;
    while (this.budget >= cheapest && count < this.enemyLimit) {
      const affordable = choices.filter((type) => ENEMIES[type].threatCost <= this.budget);
      if (affordable.length === 0) break;
      const type = this.rng.pick(affordable);
      this.budget -= ENEMIES[type].threatCost;
      const sector = this.chooseSector();
      emit({ type, angle: sector * Math.PI / 3 + (this.rng.next() - 0.5) * 0.24 });
      count += 1;
    }
  }

  public shouldSpawnBoss(elapsed: number): boolean {
    if (this.stageId === 'endless') {
      if (elapsed < this.nextBossAt) return false;
      this.nextBossAt += 300;
      this.bossSent = true;
      return true;
    }
    if (!this.bossSent && elapsed >= this.nextBossAt) {
      this.bossSent = true;
      return true;
    }
    return false;
  }

  public get rngForEvents(): DeterministicRng {
    return this.rng;
  }

  private availableEnemies(elapsed: number): EnemyId[] {
    if (this.testMode) return ['shard', 'runner', 'shell', 'lattice', 'spore', 'marker', 'dropper', 'phase'];
    const stage = STAGES[this.stageId];
    const inStage = (ids: EnemyId[]): EnemyId[] => ids.filter((id) => stage.enemies.includes(id));
    if (this.stageId === 'stage-1') {
      if (elapsed < 40) return ['shard', 'runner'];
      if (elapsed < 85) return ['shard', 'runner', 'lattice'];
      return ['shard', 'runner', 'lattice', 'spore'];
    }
    if (this.stageId === 'stage-2') {
      if (elapsed < 45) return inStage(['shard', 'runner', 'shell']);
      if (elapsed < 110) return inStage(['shard', 'runner', 'shell', 'spore', 'marker']);
      return inStage(['shard', 'runner', 'shell', 'spore', 'marker', 'dropper']);
    }
    if (this.stageId === 'stage-3') {
      if (elapsed < 45) return inStage(['shard', 'runner', 'lattice']);
      if (elapsed < 120) return inStage(['shard', 'runner', 'lattice', 'shell', 'spore', 'marker']);
      return inStage(stage.enemies);
    }
    const window = elapsed % 300;
    if (window < 45) return ['shard', 'runner', 'shell'];
    if (window < 120) return ['shard', 'runner', 'shell', 'lattice', 'spore', 'marker'];
    return stage.enemies;
  }

  private chooseSector(): number {
    let sector = Math.floor(this.rng.next() * 6);
    if (sector === this.lastSector && this.consecutiveSectorCount >= 2) sector = (sector + 1 + Math.floor(this.rng.next() * 5)) % 6;
    if (sector === this.lastSector) this.consecutiveSectorCount += 1;
    else { this.lastSector = sector; this.consecutiveSectorCount = 1; }
    return sector;
  }
}
