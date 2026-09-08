import { describe, expect, it } from 'vitest';
import { Enemy } from '../../src/game/entities/Enemy';
import { SupportModule, supportEffectsFor } from '../../src/game/entities/SupportModule';
import { Weapon } from '../../src/game/entities/Weapon';
import { adjacentWeaponSlots, itemAtSlot, itemsBySlot } from '../../src/game/deviceLayout';
import { angularDistance, normalizeAngle } from '../../src/game/systems/Angle';
import { impactAngleFromSource, impactAngleFromVelocity } from '../../src/game/systems/ImpactDirection';
import { applyUpgradeCandidate } from '../../src/game/systems/UpgradeSystem';
import type { UpgradeCandidate } from '../../src/types/game';

describe('PR-A の共通ルール', () => {
  it('角度の境界をまたいでも同じ方向として扱う', () => {
    expect(angularDistance((179 * Math.PI) / 180, (-179 * Math.PI) / 180)).toBeCloseTo((2 * Math.PI) / 180);
    expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(-Math.PI);
    expect(angularDistance(4 * Math.PI / 3, -2 * Math.PI / 3)).toBeCloseTo(0);
  });

  it('攻撃の到来側を攻撃源から求める', () => {
    expect(impactAngleFromSource(0, 0, 100, 0)).toBeCloseTo(Math.PI);
    expect(angularDistance(impactAngleFromVelocity(1, 0) ?? 0, Math.PI)).toBeCloseTo(0);
    expect(impactAngleFromSource(10, 10, 10, 10)).toBeNull();
    expect(impactAngleFromVelocity(0, 0)).toBeNull();
  });

  it('装置の取得順ではなく面番号で疎な配置を読む', () => {
    const weapons = [{ id: '面1', slot: 0 }, { id: '面3', slot: 2 }, { id: '面2', slot: 1 }];
    expect(itemsBySlot(weapons).map((item) => item?.id)).toEqual(['面1', '面2', '面3']);
    expect(itemAtSlot(weapons, 2)?.id).toBe('面3');
    expect(adjacentWeaponSlots(0)).toEqual([0, 1]);
    expect(adjacentWeaponSlots(2)).toEqual([2, 0]);
  });

  it('実際の取得処理でも指定した武器面と補助面を維持する', () => {
    const weapons = [new Weapon('needle', 0)];
    const supports: SupportModule[] = [];
    const weaponCandidate = {
      id: 'weapon:ray:new', kind: 'weapon', targetId: 'ray', title: '光路刃 Lv1', description: '', before: '', after: '', role: '', isExisting: false, placementSlot: 2,
    } as UpgradeCandidate;
    const supportCandidate = {
      id: 'support:output:new', kind: 'support', targetId: 'output', title: '出力環 Lv1', description: '', before: '', after: '', role: '', isExisting: false, placementSlot: 1,
    } as UpgradeCandidate;
    applyUpgradeCandidate(weaponCandidate, weapons, supports, () => undefined);
    applyUpgradeCandidate(supportCandidate, weapons, supports, () => undefined);
    expect(weapons.map((weapon) => weapon.slot)).toEqual([0, 2]);
    expect(supports.map((support) => support.slot)).toEqual([1]);
    expect(supportEffectsFor(supports, 'output', 2).primary).toBeGreaterThan(0);
    expect(itemsBySlot(weapons).map((item) => item?.slot)).toEqual([0, undefined, 2]);
  });

  it('補助の隣接効果も面番号から計算する', () => {
    const supports = [new SupportModule('output', 2), new SupportModule('output', 0)];
    const result = supportEffectsFor(supports, 'output', 0);
    expect(result.primary).toBeGreaterThan(0);
    expect(result.primary).toBeLessThanOrEqual(0.4);
    expect(supports[0]?.affectsWeaponSlot(1)).toBe(false);
    expect(supports[0]?.affectsWeaponSlot(0)).toBe(true);
  });

  it('安全半径内の敵は吸引で逆向きに動かず、次の更新で飛ばない', () => {
    const enemy = new Enemy(1, 'shard', 0, 100);
    enemy.applyPull(192, 0, 34 / 60, 1, 180);
    expect(enemy.x).toBe(100);
    expect(enemy.y).toBe(0);
    expect(enemy.distanceToCore).toBe(100);
    enemy.update(1 / 60, 1 + 1 / 60, { x: 0, y: 0 }, 1);
    expect(enemy.x).toBeCloseTo(100 - enemy.speed * 0.55 / 60);
    expect(enemy.distanceToCore).toBeCloseTo(Math.hypot(enemy.x, enemy.y));
  });

  it('斜めの吸引でも目標を越えず、座標と距離を同期する', () => {
    const enemy = new Enemy(1, 'shard', 0, 220);
    const before = Math.hypot(enemy.x, enemy.y);
    enemy.applyPull(0, 220, 80, 1, 180);
    expect(Math.hypot(enemy.x, enemy.y)).toBeGreaterThanOrEqual(180 - 1e-6);
    expect(Math.hypot(enemy.x, enemy.y)).toBeCloseTo(enemy.distanceToCore);
    expect(Math.hypot(enemy.x, enemy.y)).toBeLessThanOrEqual(before + 1e-6);
    expect(Math.hypot(enemy.x, enemy.y)).toBeGreaterThanOrEqual(before - 80 - 1e-6);
    enemy.update(1 / 60, 1 + 1 / 60, { x: 0, y: 0 }, 1);
    expect(Math.hypot(enemy.x, enemy.y)).toBeCloseTo(enemy.distanceToCore);
  });

  it('安全境界・同位置・ボスでは吸引移動をせず減速だけを残す', () => {
    const boundary = new Enemy(1, 'shard', 0, 180);
    boundary.applyPull(0, 0, 100, 1, 180);
    expect(boundary.x).toBe(180);
    expect(boundary.distanceToCore).toBe(180);

    const samePosition = new Enemy(2, 'shard', 0, 220);
    const before = { x: samePosition.x, y: samePosition.y };
    samePosition.applyPull(before.x, before.y, 100, 1, 180);
    expect(samePosition.x).toBe(before.x);
    expect(samePosition.y).toBe(before.y);

    const boss = new Enemy(3, 'crown', 0, 196);
    boss.applyPull(0, 0, 100, 1, 180);
    expect(boss.x).toBe(196);
    expect(boss.distanceToCore).toBe(196);
    expect(boss.slowUntil).toBeGreaterThan(1);
  });

  it('回転冠の盾は正負の同じ角度を同じ結果にする', () => {
    const enemy = new Enemy(1, 'crown', 0, 196);
    enemy.shieldRotation = 0;
    expect(enemy.damage(10, 0, 4 * Math.PI / 3).blocked).toBe(true);
    expect(enemy.damage(10, 0, -2 * Math.PI / 3).blocked).toBe(true);
  });
});
