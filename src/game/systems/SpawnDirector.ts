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

  public getState(): number { return this.state; }

  public setState(state: number): void {
    if (!Number.isFinite(state)) return;
    this.state = (Math.floor(state) >>> 0) || 1;
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

export const SPECIAL_WAVE_FIRST_AT_SECONDS = 50;
export const SPECIAL_WAVE_INTERVAL_SECONDS = 45;
export const SPECIAL_WAVE_LEAD_SECONDS = 1.2;
const SPECIAL_WAVE_SIZE = 3;
const COMMON_ENEMY_TYPES: ReadonlySet<EnemyId> = new Set(['shard', 'runner']);

export interface SpawnWaveWarning {
  angle: number;
  leadTime: number;
  types: EnemyId[];
}

export interface SpawnRequest {
  type: EnemyId;
  angle: number;
  specialWave?: boolean;
}

interface PendingSpecialWave {
  angle: number;
  life: number;
  types: EnemyId[];
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
  private pendingSpecialWave: PendingSpecialWave | null = null;
  private nextSpecialWaveAt = SPECIAL_WAVE_FIRST_AT_SECONDS;
  private specialWaveCount = 0;
  private endlessBossIndex = 0;

  public constructor(private readonly stageId: StageId, seedOrRng: number | DeterministicRng, private readonly testMode = false) {
    this.rng = seedOrRng instanceof DeterministicRng ? seedOrRng : new DeterministicRng(seedOrRng);
    this.nextBossAt = this.testMode ? 5.5 : STAGES[stageId].bossAt;
  }

  public get bossSpawned(): boolean {
    return this.bossSent;
  }

  public get bossId() {
    if (this.stageId !== 'endless') return STAGES[this.stageId].boss;
    return (['echo', 'crown', 'designer', 'gate', 'weaver', 'reactor'] as const)[this.endlessBossIndex % 6];
  }

  public get enemyLimit(): number {
    return this.testMode ? 40 : STAGES[this.stageId].enemyLimit;
  }

  public get pendingSpecialWaveSlots(): number {
    return this.pendingSpecialWave?.types.length ?? 0;
  }

  public update(
    seconds: number,
    _elapsed: number,
    activeEnemyCount: number,
    emit: (request: SpawnRequest) => void,
    reservedSlots = 0,
    onSpecialWaveWarning?: (warning: SpawnWaveWarning) => void,
  ): void {
    this.updateAccumulator += Math.max(0, seconds);
    let count = activeEnemyCount;
    const spawnLimit = Math.max(0, this.enemyLimit - Math.max(0, Math.floor(reservedSlots)));
    while (this.updateAccumulator + SpawnDirector.STEP_EPSILON >= SpawnDirector.UPDATE_STEP) {
      this.updateAccumulator -= SpawnDirector.UPDATE_STEP;
      if (this.updateAccumulator < 0 && this.updateAccumulator > -SpawnDirector.STEP_EPSILON) this.updateAccumulator = 0;
      this.simulatedElapsed += SpawnDirector.UPDATE_STEP;
      count = this.updateSpawnStep(SpawnDirector.UPDATE_STEP, this.simulatedElapsed, count, spawnLimit, emit, onSpecialWaveWarning);
    }
  }

  private updateSpawnStep(
    seconds: number,
    elapsed: number,
    activeEnemyCount: number,
    spawnLimit: number,
    emit: (request: SpawnRequest) => void,
    onSpecialWaveWarning?: (warning: SpawnWaveWarning) => void,
  ): number {
    const stage = STAGES[this.stageId];
    const endlessScale = stage.isEndless ? Math.pow(1.12, Math.floor(elapsed / 300)) : 1;
    const base = this.testMode ? 3.8 : stage.budgetBase * endlessScale;
    const rise = this.testMode ? 0.09 : stage.budgetRise * endlessScale;
    this.budget += (base + elapsed * rise) * seconds;
    let count = activeEnemyCount;

    const hadPendingSpecialWave = this.pendingSpecialWave !== null;
    this.startSpecialWaveIfDue(elapsed, count, spawnLimit, onSpecialWaveWarning);
    const specialWave = this.pendingSpecialWave;
    if (specialWave && hadPendingSpecialWave) {
      specialWave.life -= seconds;
      if (specialWave.life <= 0 && count + specialWave.types.length <= spawnLimit) {
        const types = specialWave.types;
        const angle = specialWave.angle;
        // Clear the reservation before calling the scene callback. The callback
        // creates the actual enemies and must see the reserved slots as free.
        this.pendingSpecialWave = null;
        for (let index = 0; index < types.length; index += 1) {
          emit({ type: types[index] ?? 'shard', angle: angle + (index - 1) * 0.1, specialWave: true });
          count += 1;
        }
      }
    }

    const regularSpawnLimit = this.pendingSpecialWave
      ? Math.max(0, spawnLimit - this.pendingSpecialWave.types.length)
      : spawnLimit;
    while (count < regularSpawnLimit) {
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

  private startSpecialWaveIfDue(elapsed: number, activeEnemyCount: number, spawnLimit: number, onWarning?: (warning: SpawnWaveWarning) => void): void {
    if (this.pendingSpecialWave || elapsed + SpawnDirector.STEP_EPSILON < this.nextSpecialWaveAt - SPECIAL_WAVE_LEAD_SECONDS) return;
    const types = this.specialWaveTypes(elapsed);
    const cost = types.reduce((total, type) => total + ENEMIES[type].threatCost, 0);
    if (activeEnemyCount + types.length > spawnLimit) return;

    const sector = this.chooseSector();
    const angle = sector * Math.PI / 3;
    this.budget -= cost;
    this.pendingSpecialWave = { angle, life: SPECIAL_WAVE_LEAD_SECONDS, types };
    this.nextSpecialWaveAt += SPECIAL_WAVE_INTERVAL_SECONDS;
    this.specialWaveCount += 1;
    onWarning?.({ angle, leadTime: SPECIAL_WAVE_LEAD_SECONDS, types: [...types] });
  }

  private specialWaveTypes(elapsed: number): EnemyId[] {
    const available = this.availableEnemies(elapsed);
    const common = available.filter((type) => COMMON_ENEMY_TYPES.has(type));
    const special = available.filter((type) => !COMMON_ENEMY_TYPES.has(type));
    const first = common[0] ?? available[0] ?? 'shard';
    const second = common.find((type) => type !== first) ?? available[1] ?? first;
    const third = special.length > 0 ? special[this.specialWaveCount % special.length] ?? second : second;
    return [first, second, third].slice(0, SPECIAL_WAVE_SIZE);
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
    if (this.stageId === 'endless') { this.nextBossAt += 300; this.endlessBossIndex += 1; }
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
      return inStage(['shard', 'runner', 'shell', 'spore', 'marker', 'dropper', 'charger']);
    }
    if (this.stageId === 'stage-3') {
      if (elapsed < 45) return inStage(['shard', 'runner', 'lattice']);
      if (elapsed < 120) return inStage(['shard', 'runner', 'lattice', 'shell', 'spore', 'marker']);
      return inStage(stage.enemies);
    }
    if (this.stageId === 'stage-4') {
      if (elapsed < 55) return inStage(['shard', 'runner', 'dropper']);
      if (elapsed < 135) return inStage(['shard', 'runner', 'dropper', 'marker', 'charger']);
      return inStage(stage.enemies);
    }
    if (this.stageId === 'stage-5') {
      if (elapsed < 55) return inStage(['shard', 'runner', 'repair']);
      if (elapsed < 150) return inStage(['shard', 'runner', 'shell', 'spore', 'repair', 'factory']);
      return inStage(stage.enemies);
    }
    if (this.stageId === 'stage-6') {
      if (elapsed < 60) return inStage(['shard', 'runner', 'charger', 'dropper']);
      if (elapsed < 165) return inStage(['shard', 'runner', 'shell', 'lattice', 'marker', 'guard', 'repair']);
      return inStage(stage.enemies);
    }
    if (elapsed >= 900) {
      const common = new Set<EnemyId>(['shard', 'runner']);
      const special = stage.enemies.filter((id) => !common.has(id));
      return [...special, ...special, ...special, ...common];
    }
    const window = elapsed % 300;
    if (window < 45) return ['shard', 'runner', 'shell'];
    if (window < 120) return ['shard', 'runner', 'shell', 'lattice', 'spore', 'marker', 'charger'];
    if (window < 210) return ['shard', 'runner', 'guard', 'repair', 'dropper'];
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
