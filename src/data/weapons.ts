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
export const WEAPONS = ({
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
} as Record<WeaponId, WeaponDefinition>);

/** V4 runtime additions. Each entry has a distinct targeting/timing role; the
 * shared projectile primitive is intentional, while the catalog records its
 * different weakness and evolution path for later balance work. */
const V4_WEAPON_SPECS: Array<[WeaponId, string, string, string, string, number, string, string, string]> = [
  ['prism', '分光弾', '分光', '三方向へ色の異なる弾を分け、広い角度を守ります。', '方向分散・範囲', 0xff7dd3, 'prism-split', '分光発展', '三方向の弾が着弾順に短く連動します。'],
  ['mortar', '曲射砲', '曲射', '遠い地点へ弧を描く弾を落とし、後方の敵を狙います。', '遠距離・着弾', 0xffa07a, 'mortar-burst', '曲射発展', '着弾後に小さな二次爆発を一度だけ起こします。'],
  ['ribbon', '拘束索', '拘束', '敵を短時間つなぎ、接近を遅らせる連続攻撃です。', '制御・単体', 0x8be9fd, 'tether-lock', '拘束発展', '命中した敵から近い敵へ一度だけ索を渡します。'],
  ['shockwave', '脈動砲', '脈動', '一定間隔の円形波で近中距離を掃除します。', '周期・防衛', 0xffd166, 'pulse-ring', '脈動発展', '二重の波を異なる間隔で発生させます。'],
  ['barrage', '散弾幕', '散弾', '狙った方向へ多数の小弾を広げ、薄い敵群に強い武器です。', '散開・小型群', 0xfca5a5, 'scatter-fan', '散弾発展', '外側の小弾が一度だけ折り返します。'],
  ['anchor', '固定杭', '固定', '進路へ杭を打ち、通過する敵の動きを一時的に止めます。', '設置・停止', 0x94a3b8, 'anchor-field', '固定発展', '杭の周囲へ短い停止領域を重ねます。'],
  ['flare', '閃光弾', '閃光', '敵弾の予告方向へ明滅する弾を送り、危険な相手を優先します。', '迎撃補助・方向', 0xfde68a, 'flare-burst', '閃光発展', '命中時に敵弾を一回だけ弱めます。'],
  ['cutter', '横断刃', '横断', '照準を横切る短い刃を連続して置き、列を切断します。', '横断・列', 0xc4b5fd, 'slicer-cross', '横断発展', '直角の刃を一枚だけ追加します。'],
  ['beacon', '誘導標', '誘導', '敵を印で示し、次の攻撃が同じ対象へ集中します。', '標識・集中', 0xf9a8d4, 'beacon-mark', '誘導発展', '印の対象が倒れると近い敵へ一度だけ移ります。'],
  ['nova', '爆縮核', '爆縮', '時間をかけて小範囲へ強い一撃を落とします。', '重撃・範囲', 0xfb7185, 'nova-collapse', '爆縮発展', '中心から外側へ二段の爆発を起こします。'],
  ['harpoon', '牽引槍', '牽引', '敵を貫き、短い引き寄せで列の位置を整えます。', '貫通・牽引', 0x67e8f9, 'harpoon-pull', '牽引発展', '貫通後の終端で小さな牽引波を一度出します。'],
  ['vortex', '旋回渦', '旋回', '照準地点に渦を置き、敵の進路をゆるやかに曲げます。', '領域・制御', 0xa7f3d0, 'vortex-zone', '旋回発展', '渦が一度だけ別の位置へ移動します。'],
  ['ward', '守護灯', '守護', 'コア周囲を巡回し、近い敵と敵弾を順に処理します。', '防衛・迎撃', 0xfef08a, 'sentinel-guard', '守護発展', '巡回灯を二つに増やしますが無敵にはしません。'],
];

for (const [id, name, shortName, description, role, color, evolutionId, evolutionName, evolutionDescription] of V4_WEAPON_SPECS) {
  const levels = Array.from({ length: 8 }, (_, index) => ({
    damage: 12 + index * 5,
    cooldown: Math.max(0.28, 1.05 - index * 0.06),
    range: 500 + index * 18,
    radius: 38 + index * 4,
    width: 12 + index * 2,
    projectileSpeed: 300 + index * 18,
    count: Math.min(4, 1 + Math.floor(index / 2)),
  }));
  WEAPONS[id] = define(id, name, shortName, description, role, color, levels, commonBranches(
    { id: 'spread', name: '分散深化', description: '対象数と角度を広げます。' },
    { id: 'piercing', name: '集中深化', description: '一列への貫通を増やします。' },
    '一撃の威力を22%高めます。', '発射間隔を18%短くします。', `${shortName}威圧`, `${shortName}連続`,
  ), evolution(evolutionId, evolutionName, evolutionDescription));
}

/** V5 completes the remaining twenty-five basic weapon definitions.  These
 * definitions intentionally use the same bounded attack primitives as the
 * first twenty-five, but each keeps its own timing, range, count, target role,
 * and evolution identity so it can be measured and balanced independently. */
const V5_WEAPON_SPECS: Array<[WeaponId, string, string, string, string, number, string, string, string]> = [
  ['fan', '扇裂砲', '扇裂', '瞬間に複数方向へ弾を広げ、近中距離の波を処理します。', '扇状・近中距離', 0xf472b6, 'fan-fold', '二重扇', '二つの扇を角度をずらして一度だけ放ちます。'],
  ['swell', '膨張弾', '膨張', '飛翔距離に応じて大きくなる弾を遠い地点へ届けます。', '飛翔成長・範囲', 0x60a5fa, 'swell-ring', '膨張発展', '着弾時の最大半径を二段に分け、再膨張はしません。'],
  ['seeker', '追跡針', '追針', '発射後に対象へ曲がり、危険な一体を追い続けます。', '単体追尾・急加速', 0x38bdf8, 'seeker-pair', '二段追跡', '二本目の追跡弾を一度だけ追加し、無限追尾しません。'],
  ['drill', '穿孔錐', '穿孔', '一直線へ重い錐を通し、殻や盾の奥へ貫通します。', '重貫通・防護', 0xf59e0b, 'drill-bore', '双穿孔', '同じ線へ短い二本目を一度だけ通します。'],
  ['mist', '薄霧弾', '薄霧', '指定地点へ視界を遮らない短い減速霧を残します。', '領域・減速', 0x94a3b8, 'mist-screen', '重層薄霧', '二つの薄霧を重ねますが、減速段階は共有します。'],
  ['spark', '火花連射', '火花', '短い電弧を細かく連射し、近い敵へ状態を付けます。', '連射・状態', 0xfacc15, 'spark-link', '連結火花', '直近の別対象へ一度だけ電弧を渡します。'],
  ['coil', '螺旋弾', '螺旋', '螺旋軌道を描く弾で、直線外の敵にも届かせます。', '螺旋・追尾', 0xc084fc, 'coil-spiral', '二重螺旋', '逆向きの螺旋を一周だけ追加します。'],
  ['bloom', '開花弾', '開花', '着弾した場所から花弁状の小爆発を広げます。', '範囲・分裂', 0xfb7185, 'bloom-petal', '三重開花', '外側へ三枚の花弁を一度だけ作ります。'],
  ['shuttle', '往復舟', '往復', '敵列を往復する弾で、行きと帰りの経路を分けます。', '往復・貫通', 0x2dd4bf, 'shuttle-return', '双方向往復', '帰路の短弾を一度だけ追加し、再往復しません。'],
  ['siphon', '吸収線', '吸収', '命中した敵の速度を短く奪い、次の攻撃へつなげます。', '吸収・制御', 0x22d3ee, 'siphon-drain', '連続吸収', '二体目へ一度だけ吸収線を渡します。'],
  ['mirror', '双映鏡', '双映', '二枚の鏡弾を別方向へ飛ばし、反射経路を作ります。', '反射・分岐', 0xe879f9, 'mirror-pair', '四面鏡', '反射後の短弾を一枚だけ追加します。'],
  ['stasis', '静止針', '静止', '命中した敵を短く止め、止まった隙へ次の弾を合わせます。', '停止・単体', 0x67e8f9, 'stasis-lock', '静止網', '近い別対象へ一度だけ静止印を渡します。'],
  ['quake', '地脈槌', '地脈', '指定地点へ局所衝撃を落とし、敵を外向きへ押し戻します。', '局所衝撃・防衛', 0xf97316, 'quake-pair', '二地点衝撃', '反対側へ弱い二地点目を一度だけ落とします。'],
  ['spoke', '放射軸', '放射', '複数の放射軸を固定角へ伸ばし、方向を選んで切ります。', '固定放射・角度選択', 0x818cf8, 'spoke-double', '二重放射', '二つ目の軸を角度をずらして一度だけ出します。'],
  ['hollow', '虚空裂', '虚空', '二地点を結ぶ短い裂け目を開き、通過した敵を切断します。', '短距離転位・裂け目', 0xa78bfa, 'hollow-triple', '三点裂け', '三点目へ短い裂け目を一度だけ延ばします。'],
  ['snare', '絡網射', '絡網', '指定地点へ網を残し、通過した敵の速度を段階的に落とします。', '網罠・速度低下', 0x34d399, 'snare-cross', '交差網', '直角の網を一枚だけ追加します。'],
  ['chime', '共鳴鐘', '共鳴', '異なる状態が重なった敵へ周期音撃を鳴らします。', '状態反応・周期音', 0xf0abfc, 'chime-double', '二重共鳴', '二つ目の音撃を一度だけ追加し、状態を再付与しません。'],
  ['thunder', '雷柱', '雷柱', '予告した地点へ垂直の落雷を落とし、敵の列を断ちます。', '予告落雷・単発高威力', 0xfde047, 'thunder-triple', '三柱落雷', '左右の予告柱を一度だけ追加します。'],
  ['frost', '霜結線', '霜結', '線状領域を残し、敵の速度を段階的に下げます。', '減速領域・凍結段階', 0x93c5fd, 'frost-double', '二重霜結', '別角度の霜結線を一度だけ重ねます。'],
  ['swarm', '微群機', '微群', '小型機の群れを分散追尾させ、複数の敵へ同時に触れます。', '小型群・分散追尾', 0x86efac, 'swarm-pair', '二群展開', '別の角度から二群目を一度だけ展開します。'],
  ['counter', '返照盾', '返照', '短い盾で敵弾を受け、弱い返照弾として発射元へ返します。', '受け返し・敵弾反射', 0x64748b, 'counter-double', '二面返照', '反対方向の盾を一度だけ追加します。'],
  ['dive', '潜航弾', '潜航', '一度潜航してから対象の背面へ再出現し、貫通します。', '潜入・再出現', 0x14b8a6, 'dive-pair', '二重潜航', '別の対象へ短い潜航弾を一度だけ追加します。'],
  ['axis', '軸旋砲', '軸旋', '回転する軸上へ短弾を連射し、角度を変えながら掃射します。', '回転軸・角度連射', 0x818cf8, 'axis-cross', '二軸回転', '逆回転の軸を一度だけ追加します。'],
  ['seed', '種弾', '種弾', '指定地点へ種を落とし、成長後に短命の小砲台へ変えます。', '設置成長・小砲台', 0x84cc16, 'seed-pair', '二砲台', '成長した砲台を一台だけ追加し、寿命を共有します。'],
  ['requiem', '終奏砲', '終奏', '周囲の撃破を蓄積し、一定数で広い終端弾を放ちます。', '撃破蓄積・終端弾', 0xe879f9, 'requiem-echo', '二重終奏', '終端弾の短い残響を一度だけ追加します。'],
];

for (const [id, name, shortName, description, role, color, evolutionId, evolutionName, evolutionDescription] of V5_WEAPON_SPECS) {
  const levels = Array.from({ length: 8 }, (_, index) => {
    const isFast = ['spark', 'seeker', 'axis'].includes(id);
    const isHeavy = ['drill', 'quake', 'thunder', 'requiem'].includes(id);
    const baseCooldown = isFast ? 0.48 : isHeavy ? 1.35 : 0.82;
    const damageBase = isHeavy ? 22 : isFast ? 10 : 15;
    return {
      damage: damageBase + index * (isHeavy ? 9 : 6),
      cooldown: Math.max(0.24, baseCooldown - index * (isFast ? 0.035 : 0.055)),
      range: 470 + index * 22,
      radius: 34 + index * 5,
      width: 10 + index * 2,
      projectileSpeed: (isHeavy ? 290 : 340) + index * 20,
      count: Math.min(4, 1 + Math.floor(index / 2)),
      duration: 4 + index * 0.6,
      chargeTime: isHeavy ? Math.max(0.75, 1.15 - index * 0.03) : undefined,
    };
  });
  WEAPONS[id] = define(id, name, shortName, description, role, color, levels, commonBranches(
    { id: 'spread', name: '分散深化', description: '対象数と経路を広げます。' },
    { id: 'piercing', name: '集中深化', description: '一列への貫通と対象優先を高めます。' },
    `${shortName}の一撃を22%高め、得意な局面を伸ばします。`,
    `${shortName}の発射間隔を18%短くし、空白を減らします。`,
    `${shortName}威圧`, `${shortName}連続`,
  ), evolution(evolutionId, evolutionName, evolutionDescription));
}

export const WEAPON_ORDER: WeaponId[] = [
  'needle', 'ray', 'cluster', 'repulse', 'chain', 'orbit', 'disc', 'gravity', 'grid', 'mine', 'lance', 'drone',
  ...V4_WEAPON_SPECS.map(([id]) => id),
  ...V5_WEAPON_SPECS.map(([id]) => id),
];
