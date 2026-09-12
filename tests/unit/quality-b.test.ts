import { describe, expect, it } from 'vitest';
import { SUPPORTS, SUPPORT_ORDER } from '../../src/data/supports';
import { WEAPONS, WEAPON_ORDER } from '../../src/data/weapons';
import { SupportModule, SUPPORT_EFFECT_CAPS, supportEffectsFor, supportWeaponSlots } from '../../src/game/entities/SupportModule';
import { Weapon } from '../../src/game/entities/Weapon';
import { effectiveWeaponStats } from '../../src/game/systems/CombatStats';
import { audioCueForStatus } from '../../src/services/AudioService';

describe('V5 の実効値と表現', () => {
  it('50武器は8段階の正の基礎値とレベル3・5・8の成長を持つ', () => {
    for (const id of WEAPON_ORDER) {
      const weapon = WEAPONS[id];
      expect(weapon.levels).toHaveLength(weapon.maxLevel);
      for (const level of weapon.levels) {
        expect(level.damage).toBeGreaterThan(0);
        expect(level.cooldown).toBeGreaterThan(0);
        expect(level.range).toBeGreaterThan(0);
      }
      expect(weapon.branches.filter((branch) => branch.atLevel === 3)).toHaveLength(2);
      expect(weapon.branches.filter((branch) => branch.atLevel === 5)).toHaveLength(2);
      expect(new Set(weapon.branches.map((branch) => branch.id)).size).toBe(weapon.branches.length);
      expect(weapon.evolutions).toHaveLength(1);
    }
  });

  it('50武器×20補助の1,000組すべてで隣接効果を計算できる', () => {
    const expectedAtLevelThree = {
      output: { primary: 0.2, secondary: 0.2 },
      rhythm: { primary: 0.16, secondary: 0.16 },
      branch: { primary: 4, secondary: 4 },
      focus: { primary: 0.18, secondary: 0.22 },
      observe: { primary: 0.28, secondary: 0.28 },
      brake: { primary: 0.28, secondary: 0.28 },
      relay: { primary: 0.12, secondary: 0.12 },
      repair: { primary: 3, secondary: 3 },
      shatter: { primary: 0.3, secondary: 3 },
      conductive: { primary: 0.22, secondary: 2 },
      ignite: { primary: 0.26, secondary: 52 },
      brink: { primary: 0.18, secondary: 0.18 },
      anchor: { primary: 0.22, secondary: 1.1 },
      veil: { primary: 0.2, secondary: 0.08 },
      vector: { primary: 0.22, secondary: 0.22 },
      pulse: { primary: 0.42, secondary: 2 },
      reserve: { primary: 3, secondary: 0.22 },
      lattice: { primary: 3, secondary: 3 },
      orbit: { primary: 0.22, secondary: 0.22 },
      catalyst: { primary: 0.24, secondary: 1 },
    } as const;
    let combinations = 0;
    for (const weaponId of WEAPON_ORDER) {
      expect(WEAPONS[weaponId].id).toBe(weaponId);
      for (const supportId of SUPPORT_ORDER) {
        const support = new SupportModule(supportId, 0);
        support.level = 3;
        expect(supportEffectsFor([support], supportId, 1)).toEqual(expectedAtLevelThree[supportId]);
        combinations += 1;
      }
    }
    expect(combinations).toBe(50 * 20);
  });

  it('補助2基の上限は成長値を隠さず、射程と弾速を別々に制限する', () => {
    for (const supportId of SUPPORT_ORDER) {
      const first = new SupportModule(supportId, 0);
      const second = new SupportModule(supportId, 1);
      first.level = 3;
      second.level = 3;
      const result = supportEffectsFor([first, second], supportId, 1);
      expect(result.primary).toBeLessThanOrEqual(SUPPORT_EFFECT_CAPS[supportId].primary);
      expect(result.secondary).toBeLessThanOrEqual(SUPPORT_EFFECT_CAPS[supportId].secondary);
    }
    const focusA = new SupportModule('focus', 0);
    const focusB = new SupportModule('focus', 1);
    focusA.level = 3;
    focusB.level = 3;
    expect(supportEffectsFor([focusA, focusB], 'focus', 1)).toEqual({ primary: 0.35, secondary: 0.44 });

    const branchA = new SupportModule('branch', 0);
    const branchB = new SupportModule('branch', 1);
    branchA.level = 3;
    branchB.level = 3;
    expect(supportEffectsFor([branchA, branchB], 'branch', 1)).toEqual({ primary: 4, secondary: 4 });
  });

  it('戦闘状態を重要度別の音へ変換する', () => {
    expect(audioCueForStatus('戦闘開始')).toBe('start');
    expect(audioCueForStatus('カコマレが10ダメージを受けました')).toBe('damage');
    expect(audioCueForStatus('群集弾の着弾予告')).toBe('warning');
    expect(audioCueForStatus('回転冠が出現しました')).toBe('boss');
    expect(audioCueForStatus('回転冠がコア向け攻撃を予告しています')).toBe('warning');
    expect(audioCueForStatus('投下体が遠隔弾を発射しました')).toBe('shot');
    expect(audioCueForStatus('回転冠を撃破しました。戦闘を続けます')).toBe('defeat');
    expect(audioCueForStatus('強化候補を選んでください')).toBe('upgrade');
  });

  it('各補助の定義ラベルはレベル値と一致する', () => {
    for (const supportId of SUPPORT_ORDER) {
      const definition = SUPPORTS[supportId];
      expect(definition.levels).toHaveLength(definition.maxLevel);
      for (const level of definition.levels) expect(level.label.length).toBeGreaterThan(0);
    }
  });

  it('継電環は第2層から内側へ一経路だけ届き、循環しない', () => {
    const relay = new SupportModule('relay', 3);
    relay.level = 3;
    expect(supportWeaponSlots('relay', 3)).toEqual([3, 4, 0]);
    expect(relay.affectsWeaponSlot(0)).toBe(true);
    expect(relay.affectsWeaponSlot(5)).toBe(false);
    expect(supportEffectsFor([relay], 'relay', 0)).toEqual({ primary: 0.12, secondary: 0.12 });
  });

  it('指向環は接続武器へ手動照準中だけレベル別の威力を加える', () => {
    const weapon = new Weapon('needle', 0, 'vector-weapon');
    const vector = new SupportModule('vector', 0, 'vector-support');
    const expected = [0.08, 0.14, 0.22];
    for (const [index, bonus] of expected.entries()) {
      vector.level = index + 1;
      const automatic = effectiveWeaponStats(weapon, [vector]);
      const manual = effectiveWeaponStats(weapon, [vector], 1, 1, 0, true);
      expect(automatic.vectorBonus).toBe(0);
      expect(automatic.damage).toBeCloseTo(weapon.stats.damage);
      expect(manual.vectorBonus).toBeCloseTo(bonus);
      expect(manual.damage).toBeCloseTo(weapon.stats.damage * (1 + bonus));
    }
    const unconnected = new Weapon('needle', 2, 'vector-unconnected');
    expect(effectiveWeaponStats(unconnected, [vector], 1, 1, 0, true).vectorBonus).toBe(0);
  });

  it('薄幕環の接続武器代償は出力補助がなくても負の実効値になる', () => {
    const weapon = new Weapon('needle', 0, 'veil-weapon');
    const veil = new SupportModule('veil', 0, 'veil-support');
    const unboosted = effectiveWeaponStats(weapon, [veil]);
    expect(unboosted.outputBonus).toBeCloseTo(-0.04);
    expect(unboosted.damage).toBeCloseTo(weapon.stats.damage * 0.96);

    const output = new SupportModule('output', 0, 'veil-output');
    const offset = effectiveWeaponStats(weapon, [veil, output]);
    expect(offset.outputBonus).toBeCloseTo(0.06);
    expect(offset.damage).toBeCloseTo(weapon.stats.damage * 1.06);
  });

  it('蓄勢環は蓄圧槍の再発射間隔だけを短くし、連針砲の間隔を変えない', () => {
    const reserve = new SupportModule('reserve', 0);
    reserve.level = 3;

    const lanceLv1 = new Weapon('lance', 0);
    expect(effectiveWeaponStats(lanceLv1, []).cooldown).toBeCloseTo(2.8);
    expect(effectiveWeaponStats(lanceLv1, [reserve]).cooldown).toBeCloseTo(2.56);

    const lanceLv3 = new Weapon('lance', 0);
    lanceLv3.level = 3;
    expect(effectiveWeaponStats(lanceLv3, [reserve]).cooldown).toBeCloseTo(2.36);

    const needle = new Weapon('needle', 0);
    expect(effectiveWeaponStats(needle, [reserve]).cooldown).toBeCloseTo(0.16);
  });
});
