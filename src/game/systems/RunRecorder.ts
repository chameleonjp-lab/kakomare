import type { StageId, WeaponId } from '../../types/content';
import type { BattleResult } from '../../types/game';

export class RunRecorder {
  public readonly stageId: StageId;
  public readonly weaponDamage: Partial<Record<WeaponId, number>> = {};
  public readonly sectorDamage = [0, 0, 0, 0, 0, 0];
  public readonly upgrades: string[] = [];
  public kills = 0;
  public score = 0;
  public bossDefeated = false;
  public survivalTime = 0;
  public lastDamageSource = 'まだ被害はありません';

  public constructor(stageId: StageId) {
    this.stageId = stageId;
  }

  public recordWeaponDamage(id: WeaponId, amount: number): void {
    this.weaponDamage[id] = (this.weaponDamage[id] ?? 0) + amount;
  }

  public recordContact(angle: number, amount: number, source: string): void {
    const sector = Math.floor(((angle + Math.PI * 2 + Math.PI / 6) % (Math.PI * 2)) / (Math.PI / 3));
    this.sectorDamage[sector] += amount;
    this.lastDamageSource = source;
  }

  public result(outcome: BattleResult['outcome'], coreRemaining: number, partsEarned: number, retired = false): BattleResult {
    const result: BattleResult = {
      stageId: this.stageId,
      outcome,
      score: Math.max(0, Math.round(this.score + this.survivalTime * 5 + coreRemaining * 20)),
      survivalTime: this.survivalTime,
      coreRemaining,
      kills: this.kills,
      bossDefeated: this.bossDefeated,
      partsEarned,
      weaponDamage: { ...this.weaponDamage },
      sectorDamage: [...this.sectorDamage],
      mainCause: this.lastDamageSource,
      upgrades: [...this.upgrades],
      retired,
    };
    return result;
  }
}
