import type { BossId, EnemyId, StageId, SupportId, WeaponId } from '../../types/content';
import type { BattleResult } from '../../types/game';
import { InputRecorder, type NormalizedRunInput } from './InputRecorder';

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
  public readonly inputRecorder = new InputRecorder();
  public readonly ruleVersion: string;
  public kills = 0;
  public score = 0;
  public bossDefeated = false;
  public bossesDefeated = 0;
  public survivalTime = 0;
  public lastDamageSource = 'まだ被害はありません';

  public constructor(stageId: StageId, bossId: BossId = 'crown', runSeed = 0, ruleVersion = 'runtime-v0') {
    this.stageId = stageId;
    this.bossId = bossId;
    this.runSeed = runSeed;
    this.ruleVersion = ruleVersion;
  }

  public recordWeaponDamage(id: WeaponId, amount: number, instanceId?: string): void {
    if (amount <= 0) return;
    this.weaponDamage[id] = (this.weaponDamage[id] ?? 0) + amount;
    if (instanceId) this.weaponInstanceDamage[instanceId] = (this.weaponInstanceDamage[instanceId] ?? 0) + amount;
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
    };
  }
}
