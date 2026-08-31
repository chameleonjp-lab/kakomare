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
  private static readonly UPDATE_STEP = 1 / 60;
  private static readonly STEP_EPSILON = 1e-10;
  private budget = 0;
  private lastSector = -1;
  private consecutiveSectorCount = 0;
  private readonly rng: DeterministicRng;
  private bossSent = false;
  private bossPending = false;
  private nextBossAt: number;
  private updateAccumulator = 0;
  private simulatedElapsed = 0;
  private pendingEnemy: EnemyId | null = null;

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

  public update(seconds: number, _elapsed: number, activeEnemyCount: number, emit: (request: SpawnRequest) => void, reservedSlots = 0): void {
    this.updateAccumulator += Math.max(0, seconds);
    let count = activeEnemyCount;
    const spawnLimit = Math.max(0, this.enemyLimit - Math.max(0, Math.floor(reservedSlots)));
    while (this.updateAccumulator + SpawnDirector.STEP_EPSILON >= SpawnDirector.UPDATE_STEP) {
      this.updateAccumulator -= SpawnDirector.UPDATE_STEP;
      if (this.updateAccumulator < 0 && this.updateAccumulator > -SpawnDirector.STEP_EPSILON) this.updateAccumulator = 0;
      this.simulatedElapsed += SpawnDirector.UPDATE_STEP;
      count = this.updateSpawnStep(SpawnDirector.UPDATE_STEP, this.simulatedElapsed, count, spawnLimit, emit);
    }
  }

  private updateSpawnStep(seconds: number, elapsed: number, activeEnemyCount: number, spawnLimit: number, emit: (request: SpawnRequest) => void): number {
    const stage = STAGES[this.stageId];
    const endlessScale = stage.isEndless ? Math.pow(1.12, Math.floor(elapsed / 300)) : 1;
    const base = this.testMode ? 3.8 : stage.budgetBase * endlessScale;
    const rise = this.testMode ? 0.09 : stage.budgetRise * endlessScale;
    this.budget += (base + elapsed * rise) * seconds;
    let count = activeEnemyCount;
    while (count < spawnLimit) {
      const type = this.pendingEnemy ?? this.rng.pick(this.availableEnemies(elapsed));
      this.pendingEnemy = type;
      if (this.budget + SpawnDirector.STEP_EPSILON < ENEMIES[type].threatCost) break;
      this.budget -= ENEMIES[type].threatCost;
      this.pendingEnemy = null;
      const sector = this.chooseSector();
      emit({ type, angle: sector * Math.PI / 3 + (this.rng.next() - 0.5) * 0.24 });
      count += 1;
    }
    return count;
  }

  public requestBossSpawn(elapsed: number): boolean {
    if (this.bossPending) return true;
    if (this.stageId !== 'endless' && this.bossSent) return false;
    if (elapsed < this.nextBossAt) return false;
    this.bossPending = true;
    return true;
  }

  public shouldSpawnBoss(elapsed: number): boolean {
    return this.requestBossSpawn(elapsed);
  }

  public confirmBossSpawn(): void {
    if (!this.bossPending) return;
    this.bossPending = false;
    this.bossSent = true;
    if (this.stageId === 'endless') this.nextBossAt += 300;
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
    if (elapsed >= 900) {
      const common = new Set<EnemyId>(['shard', 'runner']);
      const special = stage.enemies.filter((id) => !common.has(id));
      return [...stage.enemies, ...special, ...special];
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
