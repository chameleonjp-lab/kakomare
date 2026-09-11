import { SUPPORT_ORDER } from '../data/supports';
import { WEAPON_ORDER } from '../data/weapons';
import {
  EXPANSION_APPLICABILITY_MATRIX,
  EXPANSION_SUPPORT_ORDER,
  EXPANSION_SUPPORTS,
  EXPANSION_WEAPON_ORDER,
  EXPANSION_WEAPONS,
} from '../data/expansionCatalog';
import type { SupportApplicability } from '../types/expansion';

const APPLICABILITY_VALUES: SupportApplicability[] = ['direct', 'conditional', 'placement', 'not-applicable'];

export interface ExpansionCatalogValidation {
  ok: boolean;
  errors: string[];
  weaponCount: number;
  supportCount: number;
  matrixCellCount: number;
}

const hasAllKeys = (actual: Record<string, unknown>, expected: readonly string[]): boolean => {
  const actualKeys = Object.keys(actual).sort();
  return actualKeys.length === expected.length && actualKeys.every((key, index) => key === [...expected].sort()[index]);
};

const nonEmpty = (value: string): boolean => value.trim().length > 0;

export const validateExpansionCatalog = (): ExpansionCatalogValidation => {
  const errors: string[] = [];
  const weaponIds = new Set(EXPANSION_WEAPON_ORDER);
  const supportIds = new Set(EXPANSION_SUPPORT_ORDER);

  if (EXPANSION_WEAPONS.length !== 50) errors.push(`基本武器は50件必要ですが${EXPANSION_WEAPONS.length}件です`);
  if (weaponIds.size !== EXPANSION_WEAPONS.length) errors.push('基本武器IDが重複しています');
  if (EXPANSION_WEAPONS.filter((weapon) => weapon.productionGroup === 'existing-8').length !== 8) errors.push('既存8武器の制作群が8件ではありません');
  if (EXPANSION_WEAPONS.filter((weapon) => weapon.productionGroup === 'first-12').length !== 4) errors.push('最初の12武器の追加群が4件ではありません');
  if (EXPANSION_WEAPONS.filter((weapon) => weapon.productionGroup === 'new-38').length !== 38) errors.push('残る38武器の制作群が38件ではありません');

  for (const weapon of EXPANSION_WEAPONS) {
    for (const [field, value] of Object.entries({ name: weapon.name, shortName: weapon.shortName, role: weapon.role, closestWeapon: weapon.closestWeapon, attack: weapon.attack, growth: weapon.growth, weakness: weapon.weakness, limits: weapon.limits })) {
      if (!nonEmpty(value)) errors.push(`${weapon.id}の${field}が空です`);
    }
    if (weapon.differences.length < 2 || weapon.differences.some((difference) => !nonEmpty(difference))) errors.push(`${weapon.id}の重複監査差分が2件未満です`);
    if (weapon.synergies.length !== 2) errors.push(`${weapon.id}の相乗効果が2件ではありません`);
    const synergyIds = new Set(weapon.synergies.map((synergy) => synergy.id));
    if (synergyIds.size !== weapon.synergies.length) errors.push(`${weapon.id}の相乗効果IDが重複しています`);
    for (const synergy of weapon.synergies) {
      for (const [field, value] of Object.entries(synergy)) {
        if (!nonEmpty(value)) errors.push(`${weapon.id}/${synergy.id}の${field}が空です`);
      }
    }
    if (!hasAllKeys(weapon.supportProfile, EXPANSION_SUPPORT_ORDER)) errors.push(`${weapon.id}の補助適用表が20件ではありません`);
    for (const [supportId, applicability] of Object.entries(weapon.supportProfile)) {
      if (!APPLICABILITY_VALUES.includes(applicability)) errors.push(`${weapon.id}/${supportId}の適用区分が不正です`);
      if (applicability === 'not-applicable' && !nonEmpty(weapon.nonApplicableReasons[supportId] ?? '')) errors.push(`${weapon.id}/${supportId}の非対応理由がありません`);
    }
  }

  if (EXPANSION_SUPPORTS.length !== 20) errors.push(`補助は20件必要ですが${EXPANSION_SUPPORTS.length}件です`);
  if (supportIds.size !== EXPANSION_SUPPORTS.length) errors.push('補助IDが重複しています');
  if (EXPANSION_SUPPORTS.filter((support) => support.status === 'implemented').length !== SUPPORT_ORDER.length) errors.push('現行実装済み補助の数が一致しません');
  for (const support of EXPANSION_SUPPORTS) {
    for (const [field, value] of Object.entries({ name: support.name, role: support.role, condition: support.condition, effect: support.effect, cost: support.cost, limit: support.limit, record: support.record })) {
      if (!nonEmpty(value)) errors.push(`${support.id}の${field}が空です`);
    }
  }

  const matrixCellCount = Object.values(EXPANSION_APPLICABILITY_MATRIX).reduce((count, row) => count + Object.keys(row).length, 0);
  if (Object.keys(EXPANSION_APPLICABILITY_MATRIX).length !== 50) errors.push('適用表の武器行が50件ではありません');
  if (matrixCellCount !== 50 * EXPANSION_SUPPORT_ORDER.length) errors.push(`適用表は${50 * EXPANSION_SUPPORT_ORDER.length}セル必要ですが${matrixCellCount}セルです`);
  for (const weaponId of EXPANSION_WEAPON_ORDER) {
    const row = EXPANSION_APPLICABILITY_MATRIX[weaponId];
    if (!row || !hasAllKeys(row, EXPANSION_SUPPORT_ORDER)) errors.push(`${weaponId}の適用表に欠落があります`);
  }

  const productionWeaponIds = new Set<string>(WEAPON_ORDER);
  const productionSupportIds = new Set<string>(SUPPORT_ORDER);
  const designedImplementedWeaponIds = new Set(EXPANSION_WEAPONS.filter((weapon) => weapon.status === 'implemented').map((weapon) => weapon.id));
  const designedImplementedSupportIds = new Set(EXPANSION_SUPPORTS.filter((support) => support.status === 'implemented').map((support) => support.id));
  for (const weaponId of WEAPON_ORDER) {
    if (!designedImplementedWeaponIds.has(weaponId)) errors.push(`${weaponId}が現行実装武器として台帳にありません`);
  }
  for (const supportId of SUPPORT_ORDER) {
    if (!designedImplementedSupportIds.has(supportId)) errors.push(`${supportId}が現行実装補助として台帳にありません`);
  }
  for (const weaponId of designedImplementedWeaponIds) {
    if (!productionWeaponIds.has(weaponId)) errors.push(`${weaponId}は実装済み扱いですが現行武器登録にありません`);
  }
  for (const supportId of designedImplementedSupportIds) {
    if (!productionSupportIds.has(supportId)) errors.push(`${supportId}は実装済み扱いですが現行補助登録にありません`);
  }
  for (const weapon of EXPANSION_WEAPONS.filter((item) => item.status === 'design-only')) {
    if (productionWeaponIds.has(weapon.id)) errors.push(`${weapon.id}は設計のみなのに本番武器登録へ混入しています`);
  }
  for (const support of EXPANSION_SUPPORTS.filter((item) => item.status === 'design-only')) {
    if (productionSupportIds.has(support.id)) errors.push(`${support.id}は設計のみなのに本番補助登録へ混入しています`);
  }

  return { ok: errors.length === 0, errors, weaponCount: EXPANSION_WEAPONS.length, supportCount: EXPANSION_SUPPORTS.length, matrixCellCount };
};
