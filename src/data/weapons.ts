import type { WeaponDefinition, WeaponEvolutionDefinition, WeaponId, WeaponStats } from '../types/content';

const evolution = (id: string, name: string, description: string): WeaponEvolutionDefinition => ({ id, name, description });

const commonBranches = (
  first: { id: WeaponDefinition['branches'][number]['id']; name: string; description: string; damageMultiplier?: number; cooldownMultiplier?: number },
  second: { id: WeaponDefinition['branches'][number]['id']; name: string; description: string; damageMultiplier?: number; cooldownMultiplier?: number },
  powerDescription: string,
  tempoDescription: string,
  powerName = '威力深化',
  tempoName = '連続深化',
): WeaponDefinition['branches'] => [
  { ...first, atLevel: 3 },
  { ...second, atLevel: 3 },
  { id: 'power', name: powerName, description: powerDescription, atLevel: 5, damageMultiplier: 1.22 },
  { id: 'tempo', name: tempoName, description: tempoDescription, atLevel: 5, cooldownMultiplier: 0.82 },
];

const define = (
  id: WeaponId,
  name: string,
  shortName: string,
  description: string,
  role: string,
  color: number,
  levels: WeaponStats[],
  branches: WeaponDefinition['branches'],
  finalEvolution: WeaponEvolutionDefinition,
): WeaponDefinition => ({ id, name, shortName, description, role, color, maxLevel: 8, levels, branches, evolutions: [finalEvolution] });

/** V3's twelve runtime weapons. The first eight retain their V0/V2 values
 * for levels 1–5; levels 6–8 and the final forms add a distinct path or
 * target rule. The four first-12 entries use the same compact primitives but
 * have different timing, origin, and target responsibilities. */
export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  needle: define('needle', '連針砲', '連針', '細い弾を素早く放ち、近づく敵を一体ずつ削ります。', '単体・盾削り', 0x63d7e6, [
    { damage: 8, cooldown: 0.16, range: 560, pierce: 0, projectileSpeed: 480 },
    { damage: 10, cooldown: 0.15, range: 570, pierce: 0, projectileSpeed: 500 },
    { damage: 13, cooldown: 0.14, range: 580, pierce: 1, projectileSpeed: 520 },
    { damage: 16, cooldown: 0.13, range: 590, pierce: 1, projectileSpeed: 540 },
    { damage: 20, cooldown: 0.12, range: 600, pierce: 2, projectileSpeed: 560 },
    { damage: 24, cooldown: 0.115, range: 610, pierce: 2, projectileSpeed: 575 },
    { damage: 29, cooldown: 0.108, range: 620, pierce: 3, projectileSpeed: 590 },
    { damage: 34, cooldown: 0.1, range: 630, pierce: 3, projectileSpeed: 610 },
  ], commonBranches(
    { id: 'spread', name: '分散型', description: '三方向へ弾を広げ、小型の集団に対応します。' },
    { id: 'piercing', name: '貫通型', description: '弾速と貫通数を増やし、硬い敵の列を抜きます。' },
    '一射ごとの威力を22%高め、硬い敵を削り切ります。',
    '発射間隔を18%短くし、盾と小型敵へ途切れず撃ち込みます。',
    '針圧深化', '連射深化',
  ), evolution('needle-volley', '多連装針砲', '主射撃の直後に左右の追撃斉射を一度だけ加えます。追撃から再追撃は生じません。')),
  ray: define('ray', '光路刃', '光路', '狙った直線を一度に切り払い、並んだ敵へ届きます。', '直線・貫通', 0xffbe5c, [
    { damage: 28, cooldown: 1.15, range: 560, width: 18 }, { damage: 35, cooldown: 1.08, range: 570, width: 22 },
    { damage: 43, cooldown: 1.0, range: 580, width: 28 }, { damage: 52, cooldown: 0.92, range: 590, width: 34 },
    { damage: 64, cooldown: 0.82, range: 600, width: 42 }, { damage: 75, cooldown: 0.78, range: 610, width: 46 },
    { damage: 88, cooldown: 0.73, range: 620, width: 50 }, { damage: 102, cooldown: 0.68, range: 630, width: 54 },
  ], commonBranches(
    { id: 'wide', name: '幅広型', description: '攻撃幅と残る時間を増やし、横に広い列を切ります。' },
    { id: 'reflect', name: '反射型', description: '外周で一度跳ね返り、別方向へも届きます。' },
    '一閃の威力を22%高め、硬い列を切り抜きます。',
    '発射間隔を18%短くし、直線攻撃を重ねます。',
    '光圧深化', '残光深化',
  ), evolution('ray-cross', '交差光路', '主線が外周へ届いたとき、直角の短い副線を一度だけ作ります。')),
  cluster: define('cluster', '群集弾', '群集', '敵が多い方向へ予告を出し、着弾点をまとめて攻撃します。', '範囲・集団', 0xa78bfa, [
    { damage: 36, cooldown: 1.45, range: 560, radius: 72, projectileSpeed: 330 }, { damage: 45, cooldown: 1.36, range: 570, radius: 80, projectileSpeed: 340 },
    { damage: 55, cooldown: 1.26, range: 580, radius: 90, projectileSpeed: 350 }, { damage: 67, cooldown: 1.16, range: 590, radius: 102, projectileSpeed: 360 },
    { damage: 82, cooldown: 1.05, range: 600, radius: 116, projectileSpeed: 370 }, { damage: 96, cooldown: 0.98, range: 610, radius: 124, projectileSpeed: 380 },
    { damage: 112, cooldown: 0.91, range: 620, radius: 134, projectileSpeed: 390 }, { damage: 130, cooldown: 0.84, range: 630, radius: 146, projectileSpeed: 400 },
  ], commonBranches(
    { id: 'split', name: '分裂型', description: '着弾後に三方向へ小弾を放ちます。' },
    { id: 'residue', name: '残留型', description: '着弾地点へ短い減速領域を残します。' },
    '着弾威力を22%高め、密集した敵をまとめて崩します。',
    '発射間隔を18%短くし、危険な方向へ範囲攻撃を重ねます。',
  ), evolution('cluster-ring', '連環群集弾', '着弾後に外側へ三つの二次爆発を一世代だけ作ります。')),
  repulse: define('repulse', '反発輪', '反発', 'コアの周囲へ衝撃波を広げ、近い敵を押し戻します。', '防衛・押し戻し', 0x76e6a7, [
    { damage: 14, cooldown: 2.8, range: 165, radius: 165, pushDistance: 58 }, { damage: 18, cooldown: 2.65, range: 180, radius: 180, pushDistance: 70 },
    { damage: 23, cooldown: 2.5, range: 195, radius: 195, pushDistance: 82 }, { damage: 29, cooldown: 2.35, range: 212, radius: 212, pushDistance: 96 },
    { damage: 36, cooldown: 2.2, range: 230, radius: 230, pushDistance: 112 }, { damage: 43, cooldown: 2.08, range: 244, radius: 244, pushDistance: 124 },
    { damage: 51, cooldown: 1.96, range: 258, radius: 258, pushDistance: 136 }, { damage: 60, cooldown: 1.84, range: 272, radius: 272, pushDistance: 148 },
  ], commonBranches(
    { id: 'strong-push', name: '強反発型', description: '押し戻し距離と威力を増やします。', damageMultiplier: 1.25 },
    { id: 'delayed', name: '遅延型', description: '押し戻した敵の速度をさらに下げます。' },
    '衝撃波の威力を22%高め、コア近くの敵を崩します。',
    '発射間隔を18%短くし、防衛の空白を減らします。',
    '衝圧深化', '循環深化',
  ), evolution('repulse-double', '二重防衛輪', '内側の押し戻し波に加え、外側へ弱い減速波を一度だけ重ねます。')),
  chain: define('chain', '連鎖導体', '連鎖', '最初の敵から近い敵へ攻撃を移し、密集した敵をまとめて削ります。', '連鎖・集団', 0xff8bd8, [
    { damage: 16, cooldown: 0.85, range: 520, chainCount: 3, count: 3 }, { damage: 20, cooldown: 0.8, range: 540, chainCount: 3, count: 3 },
    { damage: 25, cooldown: 0.74, range: 560, chainCount: 4, count: 4 }, { damage: 31, cooldown: 0.68, range: 580, chainCount: 5, count: 5 },
    { damage: 38, cooldown: 0.6, range: 600, chainCount: 6, count: 6 }, { damage: 45, cooldown: 0.56, range: 615, chainCount: 7, count: 7 },
    { damage: 53, cooldown: 0.52, range: 630, chainCount: 8, count: 8 }, { damage: 62, cooldown: 0.48, range: 645, chainCount: 9, count: 9 },
  ], commonBranches(
    { id: 'chain', name: '多連鎖型', description: '連鎖回数を増やし、離れた敵へ攻撃を渡します。' },
    { id: 'burst', name: '終端破裂型', description: '最後の敵で小さな範囲攻撃を起こします。' },
    '連鎖ごとの威力を22%高め、集団の奥まで削ります。',
    '発射間隔を18%短くし、新しい集団へ素早くつなぎます。',
    '電圧深化', '導通深化',
  ), evolution('chain-mesh', '網状導体', '終端から別の列へ一回だけ再接続し、連鎖の向きを増やします。')),
  orbit: define('orbit', '周回刃', '周回', 'コアの周囲を回る刃で、近づいた敵へ接触攻撃を行います。', '近距離・防衛', 0xf4e285, [
    { damage: 20, cooldown: 0.1, range: 180, count: 2, orbitRadius: 108, orbitSpeed: 1.9, hitCooldown: 0.45, bladeLength: 34 }, { damage: 25, cooldown: 0.1, range: 190, count: 2, orbitRadius: 110, orbitSpeed: 2.15, hitCooldown: 0.42, bladeLength: 38 },
    { damage: 31, cooldown: 0.1, range: 205, count: 3, orbitRadius: 112, orbitSpeed: 2.4, hitCooldown: 0.38, bladeLength: 42 }, { damage: 38, cooldown: 0.1, range: 220, count: 3, orbitRadius: 118, orbitSpeed: 2.7, hitCooldown: 0.34, bladeLength: 45 },
    { damage: 46, cooldown: 0.1, range: 240, count: 4, orbitRadius: 125, orbitSpeed: 3.0, hitCooldown: 0.3, bladeLength: 48 }, { damage: 54, cooldown: 0.1, range: 252, count: 4, orbitRadius: 132, orbitSpeed: 3.2, hitCooldown: 0.28, bladeLength: 50 },
    { damage: 63, cooldown: 0.1, range: 266, count: 5, orbitRadius: 138, orbitSpeed: 3.35, hitCooldown: 0.26, bladeLength: 53 }, { damage: 73, cooldown: 0.1, range: 280, count: 5, orbitRadius: 145, orbitSpeed: 3.5, hitCooldown: 0.24, bladeLength: 56 },
  ], commonBranches(
    { id: 'many', name: '多刃型', description: '刃の数と回転速度を増やします。' },
    { id: 'outer', name: '外周型', description: '周回半径と刃の長さを増やします。' },
    '刃の威力を22%高め、接近した敵を確実に削ります。',
    '発射間隔を18%短くし、周囲へ細かく当て続けます。',
    '刃圧深化', '回転深化',
  ), evolution('orbit-double', '多層周回刃', '内外二つの軌道を持ち、刃ごとの接触間隔を保ったまま守ります。')),
  disc: define('disc', '残響円盤', '円盤', '敵と外周で跳ね返る円盤を放ち、複数方向へ継続して触れます。', '反射・継続', 0x78a8ff, [
    { damage: 22, cooldown: 1.05, range: 620, projectileSpeed: 290, bounceCount: 3, hitCooldown: 0.3 }, { damage: 28, cooldown: 0.98, range: 640, projectileSpeed: 310, bounceCount: 3, hitCooldown: 0.28 },
    { damage: 35, cooldown: 0.9, range: 660, projectileSpeed: 330, bounceCount: 4, hitCooldown: 0.26 }, { damage: 43, cooldown: 0.82, range: 680, projectileSpeed: 350, bounceCount: 5, hitCooldown: 0.24 },
    { damage: 52, cooldown: 0.74, range: 700, projectileSpeed: 380, bounceCount: 6, hitCooldown: 0.22 }, { damage: 62, cooldown: 0.69, range: 710, projectileSpeed: 395, bounceCount: 7, hitCooldown: 0.2 },
    { damage: 73, cooldown: 0.64, range: 720, projectileSpeed: 410, bounceCount: 8, hitCooldown: 0.19 }, { damage: 85, cooldown: 0.59, range: 730, projectileSpeed: 425, bounceCount: 9, hitCooldown: 0.18 },
  ], commonBranches(
    { id: 'echo', name: '反響型', description: '反射回数と速度を増やします。' },
    { id: 'trail', name: '軌跡型', description: '通過した場所へ短い攻撃線を残します。' },
    '円盤の威力を22%高め、反射ごとの打撃を強めます。',
    '発射間隔を18%短くし、戦場へ複数の円盤を保ちます。',
    '円圧深化', '反響深化',
  ), evolution('disc-resonant', '共鳴円盤', '二回目の敵命中後、別方向へ小円盤を一度だけ放ちます。')),
  gravity: define('gravity', '遠隔重力点', '重力', '外周寄りへ吸引点を作り、敵を集めて短時間だけ動きを抑えます。', '吸引・制御', 0xc084fc, [
    { damage: 5, cooldown: 6.5, range: 620, duration: 2.2, pullRadius: 125, pullStrength: 34, safeDistance: 180 }, { damage: 6, cooldown: 6.1, range: 640, duration: 2.5, pullRadius: 140, pullStrength: 38, safeDistance: 180 },
    { damage: 7, cooldown: 5.7, range: 660, duration: 2.8, pullRadius: 155, pullStrength: 42, safeDistance: 180 }, { damage: 8, cooldown: 5.3, range: 680, duration: 3.1, pullRadius: 170, pullStrength: 46, safeDistance: 180 },
    { damage: 10, cooldown: 4.8, range: 700, duration: 3.5, pullRadius: 185, pullStrength: 50, safeDistance: 180 }, { damage: 12, cooldown: 4.5, range: 710, duration: 3.8, pullRadius: 196, pullStrength: 54, safeDistance: 180 },
    { damage: 14, cooldown: 4.2, range: 720, duration: 4.1, pullRadius: 208, pullStrength: 58, safeDistance: 180 }, { damage: 16, cooldown: 3.9, range: 730, duration: 4.4, pullRadius: 220, pullStrength: 62, safeDistance: 180 },
  ], commonBranches(
    { id: 'long', name: '長時間型', description: '継続時間と吸引半径を増やします。' },
    { id: 'collapse', name: '崩壊型', description: '終了時に範囲攻撃を起こします。' },
    '重力点の威力を22%高め、集めた敵を削ります。',
    '発射間隔を18%短くし、制御できない時間を減らします。',
    '重圧深化', '展開深化',
  ), evolution('gravity-linked', '連結重力点', '二地点を結ぶ短い減速帯を一回だけ追加し、コア安全半径を維持します。')),
  grid: define('grid', '迎撃格子', '迎撃', '指定方向の敵弾を優先して消し、空いた時間に短い射撃を行います。', '敵弾迎撃・方向防衛', 0xf0a6ff, [
    { damage: 7, cooldown: 1.8, range: 520, width: 30, count: 1, projectileSpeed: 420 }, { damage: 9, cooldown: 1.7, range: 540, width: 34, count: 1, projectileSpeed: 440 },
    { damage: 11, cooldown: 1.6, range: 560, width: 40, count: 2, projectileSpeed: 460 }, { damage: 14, cooldown: 1.5, range: 580, width: 46, count: 2, projectileSpeed: 480 },
    { damage: 17, cooldown: 1.4, range: 600, width: 52, count: 2, projectileSpeed: 500 }, { damage: 20, cooldown: 1.3, range: 615, width: 58, count: 3, projectileSpeed: 520 },
    { damage: 24, cooldown: 1.2, range: 630, width: 64, count: 3, projectileSpeed: 540 }, { damage: 28, cooldown: 1.1, range: 645, width: 70, count: 4, projectileSpeed: 560 },
  ], commonBranches(
    { id: 'narrow', name: '狭域格子', description: '格子幅を絞り、指定方向の迎撃数を増やします。' },
    { id: 'multi-direction', name: '多方向格子', description: '一度の再装填で左右の近い方向にも格子を伸ばします。' },
    '迎撃後の短射撃を強め、敵弾のない場面でも最低限の火力を保ちます。',
    '再装填を18%短くし、危険波へ格子を戻します。',
  ), evolution('grid-cross', '交差格子', '指定方向と直角方向の格子を同時に置くが、各方向の迎撃上限は共有します。')),
  mine: define('mine', '軌道機雷', '機雷', '敵の進路へ時間制限付きの機雷を置き、通過時に範囲爆発します。', '設置・通過爆発', 0xff8f70, [
    { damage: 32, cooldown: 2.4, range: 520, radius: 44, duration: 6, count: 2 }, { damage: 40, cooldown: 2.3, range: 540, radius: 50, duration: 6.5, count: 2 },
    { damage: 49, cooldown: 2.2, range: 560, radius: 56, duration: 7, count: 3 }, { damage: 59, cooldown: 2.1, range: 580, radius: 62, duration: 7.5, count: 3 },
    { damage: 70, cooldown: 2.0, range: 600, radius: 68, duration: 8, count: 4 }, { damage: 82, cooldown: 1.9, range: 615, radius: 74, duration: 8.5, count: 4 },
    { damage: 95, cooldown: 1.8, range: 630, radius: 80, duration: 9, count: 5 }, { damage: 110, cooldown: 1.7, range: 645, radius: 86, duration: 9.5, count: 6 },
  ], commonBranches(
    { id: 'near', name: '近接機雷', description: 'コア寄りへ置き、接触直前の敵をまとめて止めます。' },
    { id: 'remote', name: '遠隔機雷', description: '照準方向の外側へ置き、射手の進路を先に塞ぎます。' },
    '爆発範囲の威力を22%高め、殻を一度に削ります。',
    '設置間隔を18%短くし、空いた進路へ置き直します。',
  ), evolution('mine-cross', '交差機雷', '照準方向と左右一方向へ機雷を置き、古い機雷から安全に置換します。')),
  lance: define('lance', '蓄圧槍', '蓄圧', '時間をためて重い貫通槍を放ち、殻や盾へ一撃を通します。', '蓄積・重貫通', 0xffd166, [
    { damage: 48, cooldown: 2.8, range: 640, pierce: 3, projectileSpeed: 620, width: 10, chargeTime: 0.8 }, { damage: 59, cooldown: 2.7, range: 650, pierce: 3, projectileSpeed: 640, width: 11, chargeTime: 0.8 },
    { damage: 72, cooldown: 2.6, range: 660, pierce: 4, projectileSpeed: 660, width: 12, chargeTime: 0.8 }, { damage: 86, cooldown: 2.5, range: 670, pierce: 4, projectileSpeed: 680, width: 13, chargeTime: 0.85 },
    { damage: 102, cooldown: 2.4, range: 680, pierce: 5, projectileSpeed: 700, width: 14, chargeTime: 0.85 }, { damage: 120, cooldown: 2.3, range: 690, pierce: 5, projectileSpeed: 720, width: 15, chargeTime: 0.9 },
    { damage: 140, cooldown: 2.2, range: 700, pierce: 6, projectileSpeed: 740, width: 16, chargeTime: 0.9 }, { damage: 162, cooldown: 2.1, range: 710, pierce: 6, projectileSpeed: 760, width: 17, chargeTime: 0.95 },
  ], commonBranches(
    { id: 'long', name: '長槍型', description: '槍の幅と射程を増やし、遠い殻へ届かせます。' },
    { id: 'shatter', name: '破槍型', description: '盾・殻への一撃を強めますが、待ち時間は変わりません。' },
    '重撃の威力を22%高め、硬い防護を削ります。',
    '再装填を18%短くし、ため直しの隙を減らします。',
  ), evolution('lance-double', '二段槍', '同じ照準へ短い二本目を一度だけ放ち、二本目から派生しません。')),
  drone: define('drone', '追尾子機', '子機', '最大2機の小型機が敵を追尾し、別経路から短い弾を撃ちます。', '追尾・優先対象', 0x6ee7b7, [
    { damage: 10, cooldown: 3.4, range: 560, count: 1, projectileSpeed: 300, orbitRadius: 74, orbitSpeed: 1.2, hitCooldown: 0.55, duration: 12 }, { damage: 13, cooldown: 3.3, range: 575, count: 1, projectileSpeed: 320, orbitRadius: 78, orbitSpeed: 1.3, hitCooldown: 0.52, duration: 13 },
    { damage: 16, cooldown: 3.2, range: 590, count: 2, projectileSpeed: 340, orbitRadius: 82, orbitSpeed: 1.4, hitCooldown: 0.49, duration: 14 }, { damage: 20, cooldown: 3.1, range: 605, count: 2, projectileSpeed: 360, orbitRadius: 86, orbitSpeed: 1.5, hitCooldown: 0.46, duration: 15 },
    { damage: 25, cooldown: 3.0, range: 620, count: 2, projectileSpeed: 380, orbitRadius: 90, orbitSpeed: 1.6, hitCooldown: 0.43, duration: 16 }, { damage: 30, cooldown: 2.9, range: 635, count: 2, projectileSpeed: 400, orbitRadius: 94, orbitSpeed: 1.7, hitCooldown: 0.4, duration: 17 },
    { damage: 36, cooldown: 2.8, range: 650, count: 2, projectileSpeed: 420, orbitRadius: 98, orbitSpeed: 1.8, hitCooldown: 0.37, duration: 18 }, { damage: 43, cooldown: 2.7, range: 665, count: 2, projectileSpeed: 440, orbitRadius: 102, orbitSpeed: 1.9, hitCooldown: 0.34, duration: 19 },
  ], commonBranches(
    { id: 'near', name: '近接追尾', description: '子機の周回を短くし、コア近くの敵へ早く戻します。' },
    { id: 'remote', name: '遠隔追尾', description: '子機の射程と移動を伸ばし、射手を優先します。' },
    '子機の弾威力を22%高め、単体の危険対象を削ります。',
    '子機の再装填を18%短くし、追尾の空白を減らします。',
  ), evolution('drone-cross', '交差追尾', '二機が別の角度から同じ優先対象を追い、子機はさらに子機を作りません。')),
};

export const WEAPON_ORDER: WeaponId[] = [
  'needle', 'ray', 'cluster', 'repulse', 'chain', 'orbit', 'disc', 'gravity', 'grid', 'mine', 'lance', 'drone',
];
