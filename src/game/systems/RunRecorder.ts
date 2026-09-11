import type { BossId, EnemyId, StageId, SupportId, WeaponId } from '../../types/content';
import type { BattleResult } from '../../types/game';
import { InputRecorder, type NormalizedRunInput } from './InputRecorder';

export interface RunRecorderState {
  kills: number;
  score: number;
  bossDefeated: boolean;
  bossesDefeated: number;
  survivalTime: number;
  lastDamageSource: string;
  weaponDamage: Partial<Record<WeaponId, number>>;
  enemyKills: Partial<Record<EnemyId, number>>;
  supportUsage: Partial<Record<SupportId, number>>;
  sectorDamage: number[];
  upgrades: string[];
  branches: string[];
  controlSeconds: { slowed: number; pushed: number; pulled: number };
  weaponInstanceDamage: Record<string, number>;
  weaponEvents: Partial<Record<WeaponId, { shots: number; intercepts: number; detonations: number }>>;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function copyRecord(value: unknown): Record<string, number> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const output: Record<string, number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (!finiteNonNegative(item)) return null;
    output[key] = item;
  }
  return output;
}

function copyEvents(value: unknown): Partial<Record<WeaponId, { shots: number; intercepts: number; detonations: number }>> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const output: Partial<Record<WeaponId, { shots: number; intercepts: number; detonations: number }>> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    if (!finiteNonNegative(record.shots) || !finiteNonNegative(record.intercepts) || !finiteNonNegative(record.detonations)) return null;
    output[key as WeaponId] = { shots: record.shots, intercepts: record.intercepts, detonations: record.detonations };
  }
  return output;
}

export class RunRecorder {
  public readonly stageId: StageId;
  public readonly bossId: BossId;
  public readonly runSeed: number;
  public readonly weaponDamage: Partial<Record<WeaponId, number>> = {};
  public readonly enemyKills: Partial<Record<EnemyId, number>> = {};
  public readonly supportUsage: Partial<Record<SupportId, number>> = {};
  public readonly sectorDamage = [0, 0, 0, 0, 0, 0];
  public readonly upgrades: string[] = [];
  public readonly branches: string[] = [];
  public readonly controlSeconds = { slowed: 0, pushed: 0, pulled: 0 };
  public readonly weaponInstanceDamage: Record<string, number> = {};
  public readonly weaponEvents: Partial<Record<WeaponId, { shots: number; intercepts: number; detonations: number }>> = {};
  public readonly inputRecorder = new InputRecorder();
  public readonly ruleVersion: string;
  public readonly runId: string;
  public kills = 0;
  public score = 0;
  public bossDefeated = false;
  public bossesDefeated = 0;
  public survivalTime = 0;
  public lastDamageSource = 'まだ被害はありません';

  public constructor(stageId: StageId, bossId: BossId = 'crown', runSeed = 0, ruleVersion = 'runtime-v0', runId = '') {
    this.stageId = stageId;
    this.bossId = bossId;
    this.runSeed = runSeed;
    this.ruleVersion = ruleVersion;
    this.runId = runId;
  }

  public recordWeaponDamage(id: WeaponId, amount: number, instanceId?: string): void {
    if (amount <= 0) return;
    this.weaponDamage[id] = (this.weaponDamage[id] ?? 0) + amount;
    if (instanceId) this.weaponInstanceDamage[instanceId] = (this.weaponInstanceDamage[instanceId] ?? 0) + amount;
  }

  public recordWeaponEvent(id: WeaponId, event: 'shots' | 'intercepts' | 'detonations'): void {
    const current = this.weaponEvents[id] ?? { shots: 0, intercepts: 0, detonations: 0 };
    current[event] += 1;
    this.weaponEvents[id] = current;
  }

  public recordInput(input: NormalizedRunInput): void { this.inputRecorder.record(input); }

  public recordEnemyKill(id: EnemyId): void {
    this.enemyKills[id] = (this.enemyKills[id] ?? 0) + 1;
  }

  public recordSupportUsage(id: SupportId): void {
    this.supportUsage[id] = (this.supportUsage[id] ?? 0) + 1;
  }

  public recordContact(angle: number, amount: number, source: string): void {
    const sector = Math.floor(((angle + Math.PI * 2 + Math.PI / 6) % (Math.PI * 2)) / (Math.PI / 3));
    this.sectorDamage[sector] += amount;
    this.lastDamageSource = source;
  }

  public recordControl(kind: keyof typeof this.controlSeconds, seconds: number): void {
    this.controlSeconds[kind] += Math.max(0, seconds);
  }

  public snapshotState(): RunRecorderState {
    return {
      kills: this.kills,
      score: this.score,
      bossDefeated: this.bossDefeated,
      bossesDefeated: this.bossesDefeated,
      survivalTime: this.survivalTime,
      lastDamageSource: this.lastDamageSource,
      weaponDamage: { ...this.weaponDamage },
      enemyKills: { ...this.enemyKills },
      supportUsage: { ...this.supportUsage },
      sectorDamage: [...this.sectorDamage],
      upgrades: [...this.upgrades],
      branches: [...this.branches],
      controlSeconds: { ...this.controlSeconds },
      weaponInstanceDamage: { ...this.weaponInstanceDamage },
      weaponEvents: Object.fromEntries(Object.entries(this.weaponEvents).map(([id, value]) => [id, { ...value }])) as RunRecorderState['weaponEvents'],
    };
  }

  /** Restore the result ledger atomically at a safe update boundary. */
  public restoreState(state: RunRecorderState): boolean {
    if (!state || !finiteNonNegative(state.kills) || !Number.isInteger(state.kills)
      || !finiteNonNegative(state.score) || !finiteNonNegative(state.bossesDefeated) || !Number.isInteger(state.bossesDefeated)
      || !finiteNonNegative(state.survivalTime) || typeof state.bossDefeated !== 'boolean' || typeof state.lastDamageSource !== 'string'
      || !Array.isArray(state.sectorDamage) || state.sectorDamage.length !== 6 || !state.sectorDamage.every(finiteNonNegative)
      || !Array.isArray(state.upgrades) || !state.upgrades.every((item) => typeof item === 'string')
      || !Array.isArray(state.branches) || !state.branches.every((item) => typeof item === 'string')
      || !state.controlSeconds || !finiteNonNegative(state.controlSeconds.slowed) || !finiteNonNegative(state.controlSeconds.pushed) || !finiteNonNegative(state.controlSeconds.pulled)) return false;
    const weaponDamage = copyRecord(state.weaponDamage);
    const enemyKills = copyRecord(state.enemyKills);
    const supportUsage = copyRecord(state.supportUsage);
    const weaponInstanceDamage = copyRecord(state.weaponInstanceDamage);
    const weaponEvents = copyEvents(state.weaponEvents);
    if (!weaponDamage || !enemyKills || !supportUsage || !weaponInstanceDamage || !weaponEvents) return false;
    this.kills = state.kills;
    this.score = state.score;
    this.bossDefeated = state.bossDefeated;
    this.bossesDefeated = state.bossesDefeated;
    this.survivalTime = state.survivalTime;
    this.lastDamageSource = state.lastDamageSource;
    Object.keys(this.weaponDamage).forEach((key) => delete this.weaponDamage[key as WeaponId]);
    Object.assign(this.weaponDamage, weaponDamage);
    Object.keys(this.enemyKills).forEach((key) => delete this.enemyKills[key as EnemyId]);
    Object.assign(this.enemyKills, enemyKills);
    Object.keys(this.supportUsage).forEach((key) => delete this.supportUsage[key as SupportId]);
    Object.assign(this.supportUsage, supportUsage);
    this.sectorDamage.splice(0, this.sectorDamage.length, ...state.sectorDamage);
    this.upgrades.splice(0, this.upgrades.length, ...state.upgrades);
    this.branches.splice(0, this.branches.length, ...state.branches);
    Object.assign(this.controlSeconds, state.controlSeconds);
    Object.keys(this.weaponInstanceDamage).forEach((key) => delete this.weaponInstanceDamage[key]);
    Object.assign(this.weaponInstanceDamage, weaponInstanceDamage);
    Object.keys(this.weaponEvents).forEach((key) => delete this.weaponEvents[key as WeaponId]);
    Object.assign(this.weaponEvents, weaponEvents);
    return true;
  }

  public result(outcome: BattleResult['outcome'], coreRemaining: number, partsEarned: number, retired = false, newUnlock: StageId | null = null): BattleResult {
    return {
      stageId: this.stageId,
      outcome,
      score: Math.max(0, Math.round(this.score + this.survivalTime * 5 + coreRemaining * 20)),
      survivalTime: this.survivalTime,
      coreRemaining,
      kills: this.kills,
      bossDefeated: this.bossDefeated,
      bossesDefeated: this.bossesDefeated,
      bossId: this.bossId,
      partsEarned,
      weaponDamage: { ...this.weaponDamage },
      supportUsage: { ...this.supportUsage },
      enemyKills: { ...this.enemyKills },
      sectorDamage: [...this.sectorDamage],
      controlSeconds: { ...this.controlSeconds },
      mainCause: this.lastDamageSource,
      upgrades: [...this.upgrades],
      branches: [...this.branches],
      runSeed: this.runSeed,
      newUnlock,
      retired,
      ruleVersion: this.ruleVersion,
      inputLog: this.inputRecorder.snapshot(),
      weaponInstanceDamage: { ...this.weaponInstanceDamage },
      weaponEvents: Object.fromEntries(Object.entries(this.weaponEvents).map(([id, value]) => [id, { ...value }])) as BattleResult['weaponEvents'],
      resultId: this.runId || `${this.stageId}:${this.runSeed}:${Math.round(this.survivalTime * 60)}:${Math.round(this.score)}`,
      playId: null,
    };
  }
}
