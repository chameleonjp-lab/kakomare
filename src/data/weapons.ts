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

/**
 * The additional weapons share a bounded shot path in BattleScene. Their
 * level-three choices use the same readable contract: spread adds one shot
 * (up to four) and widens its fan, while piercing adds two extra hits to a
 * travelling shot (or two extra rebounds for a disc-like weapon).
 */
const runtimeBranches = (shortName: string): WeaponDefinition['branches'] => commonBranches(
  { id: 'spread', name: '分散深化', description: `${shortName}の弾を1本増やし（最大4本）、発射角を1.8倍に広げます。` },
  { id: 'piercing', name: '集中深化', description: `${shortName}の弾の追加貫通を2増やします。反射弾は反射回数を2増やします。` },
  `${shortName}の一撃を22%高め、得意な局面を伸ばします。`,
  `${shortName}の発射間隔を18%短くし、空白を減らします。`,
  `${shortName}威圧`, `${shortName}連続`,
);

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
    { id: 'spread', name: '分散型', description: '一回の発射で左右にも一本ずつ広がる、三方向の弾になります。分散弾は追加貫通を持ちません。' },
    { id: 'piercing', name: '貫通型', description: '貫通数を2増やし、弾速を18%、威力を12%高めます。' },
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
    { id: 'wide', name: '幅広型', description: '光線の幅を20広げ、表示される時間も0.16秒から0.22秒へ延ばします。' },
    { id: 'reflect', name: '反射型', description: '光線が射程より先に外周へ届くと、外周から逆向きへ威力55%の光線を一度返します。' },
    '一閃の威力を22%高め、硬い列を切り抜きます。',
    '発射間隔を18%短くし、直線攻撃を重ねます。',
    '光圧深化', '残光深化',
  ), evolution('ray-cross', '交差光路', '主線と同時に、直角方向へ長さ72%・威力45%の短い光線を一度だけ加えます。')),
  cluster: define('cluster', '群集弾', '群集', '敵が多い方向へ予告を出し、着弾点をまとめて攻撃します。', '範囲・集団', 0xa78bfa, [
    { damage: 36, cooldown: 1.45, range: 560, radius: 72, projectileSpeed: 330 }, { damage: 45, cooldown: 1.36, range: 570, radius: 80, projectileSpeed: 340 },
    { damage: 55, cooldown: 1.26, range: 580, radius: 90, projectileSpeed: 350 }, { damage: 67, cooldown: 1.16, range: 590, radius: 102, projectileSpeed: 360 },
    { damage: 82, cooldown: 1.05, range: 600, radius: 116, projectileSpeed: 370 }, { damage: 96, cooldown: 0.98, range: 610, radius: 124, projectileSpeed: 380 },
    { damage: 112, cooldown: 0.91, range: 620, radius: 134, projectileSpeed: 390 }, { damage: 130, cooldown: 0.84, range: 630, radius: 146, projectileSpeed: 400 },
  ], commonBranches(
    { id: 'split', name: '分裂型', description: '着弾後、元の威力の30%の小さな弾を三方向へ飛ばし、それぞれでもう一度小範囲を攻撃します。' },
    { id: 'residue', name: '残留型', description: '着弾地点に1.8秒の減速領域を残します。制動環があれば減速時間だけ延びます。' },
    '着弾威力を22%高め、密集した敵をまとめて崩します。',
    '発射間隔を18%短くし、危険な方向へ範囲攻撃を重ねます。',
  ), evolution('cluster-ring', '連環群集弾', '着弾後、元の威力の32%の小範囲弾を三方向へ一度だけ飛ばします。分裂型の小弾からは増えません。')),
  repulse: define('repulse', '反発輪', '反発', 'コアの周囲へ衝撃波を広げ、近い敵を押し戻します。', '防衛・押し戻し', 0x76e6a7, [
    { damage: 14, cooldown: 2.8, range: 165, radius: 165, pushDistance: 58 }, { damage: 18, cooldown: 2.65, range: 180, radius: 180, pushDistance: 70 },
    { damage: 23, cooldown: 2.5, range: 195, radius: 195, pushDistance: 82 }, { damage: 29, cooldown: 2.35, range: 212, radius: 212, pushDistance: 96 },
    { damage: 36, cooldown: 2.2, range: 230, radius: 230, pushDistance: 112 }, { damage: 43, cooldown: 2.08, range: 244, radius: 244, pushDistance: 124 },
    { damage: 51, cooldown: 1.96, range: 258, radius: 258, pushDistance: 136 }, { damage: 60, cooldown: 1.84, range: 272, radius: 272, pushDistance: 148 },
  ], commonBranches(
    { id: 'strong-push', name: '強反発型', description: '押し戻し距離を1.5倍にし、衝撃波の威力を25%高めます。', damageMultiplier: 1.25 },
    { id: 'delayed', name: '遅延型', description: '押し戻した敵への減速を0.4秒から1.4秒へ延ばします。' },
    '衝撃波の威力を22%高め、コア近くの敵を崩します。',
    '発射間隔を18%短くし、防衛の空白を減らします。',
    '衝圧深化', '循環深化',
  ), evolution('repulse-double', '二重防衛輪', '通常の範囲の外側（半径+58）へ、威力を持たない0.6秒の減速波を一度だけ加えます。')),
  chain: define('chain', '連鎖導体', '連鎖', '最初の敵から近い敵へ攻撃を移し、密集した敵をまとめて削ります。', '連鎖・集団', 0xff8bd8, [
    { damage: 16, cooldown: 0.85, range: 520, chainCount: 3, count: 3 }, { damage: 20, cooldown: 0.8, range: 540, chainCount: 3, count: 3 },
    { damage: 25, cooldown: 0.74, range: 560, chainCount: 4, count: 4 }, { damage: 31, cooldown: 0.68, range: 580, chainCount: 5, count: 5 },
    { damage: 38, cooldown: 0.6, range: 600, chainCount: 6, count: 6 }, { damage: 45, cooldown: 0.56, range: 615, chainCount: 7, count: 7 },
    { damage: 53, cooldown: 0.52, range: 630, chainCount: 8, count: 8 }, { damage: 62, cooldown: 0.48, range: 645, chainCount: 9, count: 9 },
  ], commonBranches(
    { id: 'chain', name: '多連鎖型', description: '連鎖できる敵を3体分から5体分へ増やします。次の敵は直前の敵から150以内で選ばれます。' },
    { id: 'burst', name: '終端破裂型', description: '連鎖が1体以上当たった最後の位置で、半径40・威力50%の範囲攻撃を一度出します。' },
    '連鎖ごとの威力を22%高め、集団の奥まで削ります。',
    '発射間隔を18%短くし、新しい集団へ素早くつなぎます。',
    '電圧深化', '導通深化',
  ), evolution('chain-mesh', '網状導体', '連鎖できる敵の数をさらに2体分増やします。各接続は直前の敵から150以内で、別の連鎖は始まりません。')),
  orbit: define('orbit', '周回刃', '周回', 'コアの周囲を回る刃で、近づいた敵へ接触攻撃を行います。', '近距離・防衛', 0xf4e285, [
    { damage: 20, cooldown: 0.1, range: 180, count: 2, orbitRadius: 108, orbitSpeed: 1.9, hitCooldown: 0.45, bladeLength: 34 }, { damage: 25, cooldown: 0.1, range: 190, count: 2, orbitRadius: 110, orbitSpeed: 2.15, hitCooldown: 0.42, bladeLength: 38 },
    { damage: 31, cooldown: 0.1, range: 205, count: 3, orbitRadius: 112, orbitSpeed: 2.4, hitCooldown: 0.38, bladeLength: 42 }, { damage: 38, cooldown: 0.1, range: 220, count: 3, orbitRadius: 118, orbitSpeed: 2.7, hitCooldown: 0.34, bladeLength: 45 },
    { damage: 46, cooldown: 0.1, range: 240, count: 4, orbitRadius: 125, orbitSpeed: 3.0, hitCooldown: 0.3, bladeLength: 48 }, { damage: 54, cooldown: 0.1, range: 252, count: 4, orbitRadius: 132, orbitSpeed: 3.2, hitCooldown: 0.28, bladeLength: 50 },
    { damage: 63, cooldown: 0.1, range: 266, count: 5, orbitRadius: 138, orbitSpeed: 3.35, hitCooldown: 0.26, bladeLength: 53 }, { damage: 73, cooldown: 0.1, range: 280, count: 5, orbitRadius: 145, orbitSpeed: 3.5, hitCooldown: 0.24, bladeLength: 56 },
  ], commonBranches(
    { id: 'many', name: '多刃型', description: '刃を1枚増やし、回転速度を25%高めます。' },
    { id: 'outer', name: '外周型', description: '周回半径を38、刃の長さを28広げます。' },
    '刃の威力を22%高め、接近した敵を確実に削ります。',
    '発射間隔を18%短くし、周囲へ細かく当て続けます。',
    '刃圧深化', '回転深化',
  ), evolution('orbit-double', '多層周回刃', '通常の軌道の外側（半径+52）へ、威力60%の刃の輪を一つ重ねます。接触間隔の判定は内側と別です。')),
  disc: define('disc', '残響円盤', '円盤', '敵と外周で跳ね返る円盤を放ち、複数方向へ継続して触れます。', '反射・継続', 0x78a8ff, [
    { damage: 22, cooldown: 1.05, range: 620, projectileSpeed: 290, bounceCount: 3, hitCooldown: 0.3 }, { damage: 28, cooldown: 0.98, range: 640, projectileSpeed: 310, bounceCount: 3, hitCooldown: 0.28 },
    { damage: 35, cooldown: 0.9, range: 660, projectileSpeed: 330, bounceCount: 4, hitCooldown: 0.26 }, { damage: 43, cooldown: 0.82, range: 680, projectileSpeed: 350, bounceCount: 5, hitCooldown: 0.24 },
    { damage: 52, cooldown: 0.74, range: 700, projectileSpeed: 380, bounceCount: 6, hitCooldown: 0.22 }, { damage: 62, cooldown: 0.69, range: 710, projectileSpeed: 395, bounceCount: 7, hitCooldown: 0.2 },
    { damage: 73, cooldown: 0.64, range: 720, projectileSpeed: 410, bounceCount: 8, hitCooldown: 0.19 }, { damage: 85, cooldown: 0.59, range: 730, projectileSpeed: 425, bounceCount: 9, hitCooldown: 0.18 },
  ], commonBranches(
    { id: 'echo', name: '反響型', description: '外周や敵での反射回数を3回分、速度を20%増やします。' },
    { id: 'trail', name: '軌跡型', description: '飛行中、0.18秒ごとに現在位置へ半径28・威力20%の小範囲攻撃を残します。' },
    '円盤の威力を22%高め、反射ごとの打撃を強めます。',
    '発射間隔を18%短くし、戦場へ複数の円盤を保ちます。',
    '円圧深化', '反響深化',
  ), evolution('disc-resonant', '共鳴円盤', '主円盤と同時に、60度ずれた方向へ威力45%・速度86%の小円盤を一度だけ放ちます。')),
  gravity: define('gravity', '遠隔重力点', '重力', '外周寄りへ吸引点を作り、敵を集めて短時間だけ動きを抑えます。', '吸引・制御', 0xc084fc, [
    { damage: 5, cooldown: 6.5, range: 620, duration: 2.2, pullRadius: 125, pullStrength: 34, safeDistance: 180 }, { damage: 6, cooldown: 6.1, range: 640, duration: 2.5, pullRadius: 140, pullStrength: 38, safeDistance: 180 },
    { damage: 7, cooldown: 5.7, range: 660, duration: 2.8, pullRadius: 155, pullStrength: 42, safeDistance: 180 }, { damage: 8, cooldown: 5.3, range: 680, duration: 3.1, pullRadius: 170, pullStrength: 46, safeDistance: 180 },
    { damage: 10, cooldown: 4.8, range: 700, duration: 3.5, pullRadius: 185, pullStrength: 50, safeDistance: 180 }, { damage: 12, cooldown: 4.5, range: 710, duration: 3.8, pullRadius: 196, pullStrength: 54, safeDistance: 180 },
    { damage: 14, cooldown: 4.2, range: 720, duration: 4.1, pullRadius: 208, pullStrength: 58, safeDistance: 180 }, { damage: 16, cooldown: 3.9, range: 730, duration: 4.4, pullRadius: 220, pullStrength: 62, safeDistance: 180 },
  ], commonBranches(
    { id: 'long', name: '長時間型', description: '重力点の持続時間を40%、吸引半径を20%増やします。' },
    { id: 'collapse', name: '崩壊型', description: '重力点が消えると、同じ範囲へ基礎威力の180%の範囲攻撃を一度出します。' },
    '重力点の威力を22%高め、集めた敵を削ります。',
    '発射間隔を18%短くし、制御できない時間を減らします。',
    '重圧深化', '展開深化',
  ), evolution('gravity-linked', '連結重力点', '主重力点から角度をずらした位置へ、持続時間72%・半径70%・威力45%の補助重力点を一つ加えます。')),
  grid: define('grid', '迎撃格子', '迎撃', '指定方向の敵弾を優先して消し、空いた時間に短い射撃を行います。', '敵弾迎撃・方向防衛', 0xf0a6ff, [
    { damage: 7, cooldown: 1.8, range: 520, width: 30, count: 1, projectileSpeed: 420 }, { damage: 9, cooldown: 1.7, range: 540, width: 34, count: 1, projectileSpeed: 440 },
    { damage: 11, cooldown: 1.6, range: 560, width: 40, count: 2, projectileSpeed: 460 }, { damage: 14, cooldown: 1.5, range: 580, width: 46, count: 2, projectileSpeed: 480 },
    { damage: 17, cooldown: 1.4, range: 600, width: 52, count: 2, projectileSpeed: 500 }, { damage: 20, cooldown: 1.3, range: 615, width: 58, count: 3, projectileSpeed: 520 },
    { damage: 24, cooldown: 1.2, range: 630, width: 64, count: 3, projectileSpeed: 540 }, { damage: 28, cooldown: 1.1, range: 645, width: 70, count: 4, projectileSpeed: 560 },
  ], commonBranches(
    { id: 'narrow', name: '狭域格子', description: '格子の幅を8狭めます。迎撃できる数や射程は変わりません。' },
    { id: 'multi-direction', name: '多方向格子', description: '一度の格子で消せる敵弾を1発増やします。格子を伸ばす方向は増えません。' },
    '迎撃後の短射撃を強め、敵弾のない場面でも最低限の火力を保ちます。',
    '再装填を18%短くし、危険波へ格子を戻します。',
  ), evolution('grid-cross', '交差格子', '指定方向に加えて直角方向にも、幅70%・射程72%の迎撃線を置きます。二方向の迎撃数上限は共有します。')),
  mine: define('mine', '軌道機雷', '機雷', '敵の進路へ時間制限付きの機雷を置き、通過時に範囲爆発します。', '設置・通過爆発', 0xff8f70, [
    { damage: 32, cooldown: 2.4, range: 520, radius: 44, duration: 6, count: 2 }, { damage: 40, cooldown: 2.3, range: 540, radius: 50, duration: 6.5, count: 2 },
    { damage: 49, cooldown: 2.2, range: 560, radius: 56, duration: 7, count: 3 }, { damage: 59, cooldown: 2.1, range: 580, radius: 62, duration: 7.5, count: 3 },
    { damage: 70, cooldown: 2.0, range: 600, radius: 68, duration: 8, count: 4 }, { damage: 82, cooldown: 1.9, range: 615, radius: 74, duration: 8.5, count: 4 },
    { damage: 95, cooldown: 1.8, range: 630, radius: 80, duration: 9, count: 5 }, { damage: 110, cooldown: 1.7, range: 645, radius: 86, duration: 9.5, count: 6 },
  ], commonBranches(
    { id: 'near', name: '近接機雷', description: '標的までの距離と260のうち短い方へ機雷を置き、コア寄りを先に守ります。' },
    { id: 'remote', name: '遠隔機雷', description: '標的より90遠い位置へ機雷を置き、射程内に収めます。' },
    '爆発範囲の威力を22%高め、殻を一度に削ります。',
    '設置間隔を18%短くし、空いた進路へ置き直します。',
  ), evolution('mine-cross', '交差機雷', '照準方向と左右へ角度をずらした機雷を計3個置き、保持できる数も1個増やします。古い機雷から置き換わります。')),
  lance: define('lance', '蓄圧槍', '蓄圧', '時間をためて重い貫通槍を放ち、殻や盾へ一撃を通します。', '蓄積・重貫通', 0xffd166, [
    { damage: 48, cooldown: 2.8, range: 640, pierce: 3, projectileSpeed: 620, width: 10, chargeTime: 0.8 }, { damage: 59, cooldown: 2.7, range: 650, pierce: 3, projectileSpeed: 640, width: 11, chargeTime: 0.8 },
    { damage: 72, cooldown: 2.6, range: 660, pierce: 4, projectileSpeed: 660, width: 12, chargeTime: 0.8 }, { damage: 86, cooldown: 2.5, range: 670, pierce: 4, projectileSpeed: 680, width: 13, chargeTime: 0.85 },
    { damage: 102, cooldown: 2.4, range: 680, pierce: 5, projectileSpeed: 700, width: 14, chargeTime: 0.85 }, { damage: 120, cooldown: 2.3, range: 690, pierce: 5, projectileSpeed: 720, width: 15, chargeTime: 0.9 },
    { damage: 140, cooldown: 2.2, range: 700, pierce: 6, projectileSpeed: 740, width: 16, chargeTime: 0.9 }, { damage: 162, cooldown: 2.1, range: 710, pierce: 6, projectileSpeed: 760, width: 17, chargeTime: 0.95 },
  ], commonBranches(
    { id: 'long', name: '長槍型', description: '槍の射程を18%、幅を4広げます。ため時間と威力は変わりません。' },
    { id: 'shatter', name: '破槍型', description: '槍の貫通数を2増やし、威力を20%高めます。' },
    '重撃の威力を22%高め、硬い防護を削ります。',
    '再装填を18%短くし、ため直しの隙を減らします。',
  ), evolution('lance-double', '二段槍', '同じ照準へ威力48%・速度92%の二本目を一度だけ放ちます。二本目からは増えません。')),
  drone: define('drone', '追尾子機', '子機', '最大2機の小型機が敵を追尾し、別経路から短い弾を撃ちます。', '追尾・優先対象', 0x6ee7b7, [
    { damage: 10, cooldown: 3.4, range: 560, count: 1, projectileSpeed: 300, orbitRadius: 74, orbitSpeed: 1.2, hitCooldown: 0.55, duration: 12 }, { damage: 13, cooldown: 3.3, range: 575, count: 1, projectileSpeed: 320, orbitRadius: 78, orbitSpeed: 1.3, hitCooldown: 0.52, duration: 13 },
    { damage: 16, cooldown: 3.2, range: 590, count: 2, projectileSpeed: 340, orbitRadius: 82, orbitSpeed: 1.4, hitCooldown: 0.49, duration: 14 }, { damage: 20, cooldown: 3.1, range: 605, count: 2, projectileSpeed: 360, orbitRadius: 86, orbitSpeed: 1.5, hitCooldown: 0.46, duration: 15 },
    { damage: 25, cooldown: 3.0, range: 620, count: 2, projectileSpeed: 380, orbitRadius: 90, orbitSpeed: 1.6, hitCooldown: 0.43, duration: 16 }, { damage: 30, cooldown: 2.9, range: 635, count: 2, projectileSpeed: 400, orbitRadius: 94, orbitSpeed: 1.7, hitCooldown: 0.4, duration: 17 },
    { damage: 36, cooldown: 2.8, range: 650, count: 2, projectileSpeed: 420, orbitRadius: 98, orbitSpeed: 1.8, hitCooldown: 0.37, duration: 18 }, { damage: 43, cooldown: 2.7, range: 665, count: 2, projectileSpeed: 440, orbitRadius: 102, orbitSpeed: 1.9, hitCooldown: 0.34, duration: 19 },
  ], commonBranches(
    { id: 'near', name: '近接追尾', description: '子機の周回速度を25%高めます。射程や周回半径は変わりません。' },
    { id: 'remote', name: '遠隔追尾', description: '子機の周回半径を35%広げます。弾の射程は変わりません。' },
    '子機の弾威力を22%高め、単体の危険対象を削ります。',
    '子機の再装填を18%短くし、追尾の空白を減らします。',
  ), evolution('drone-cross', '交差追尾', '子機の周回速度を12%、半径を10%高め、初期位置を少しずらします。子機の数は増えません。')),
} as Record<WeaponId, WeaponDefinition>);

/** V4 runtime additions.  Several entries use the same bounded projectile
 * path, so the copy describes the observable shot (not the design nickname).
 */
const V4_WEAPON_SPECS: Array<[WeaponId, string, string, string, string, number, string, string, string]> = [
  ['prism', '分光弾', '分光', '指定した敵または向きへ、角度をずらした弾を最大4発放ちます。', '角度分散・複数弾', 0xff7dd3, 'prism-split', '分光発展', ''],
  ['mortar', '曲射砲', '曲射', '指定した敵または向きへ、通常より重い弾を最大4発放ちます。', '重い複数弾', 0xffa07a, 'mortar-burst', '曲射発展', ''],
  ['ribbon', '拘束索', '拘束', '指定した敵または向きへ弾を放ちます。', '単体射撃', 0x8be9fd, 'tether-lock', '拘束発展', ''],
  ['shockwave', '脈動砲', '脈動', '指定した敵へ弾を最大4発放ち、標的の周囲も同時に攻撃します。', '複数弾・範囲', 0xffd166, 'pulse-ring', '脈動発展', '発射時の範囲攻撃をもう一度重ねます。'],
  ['barrage', '散弾幕', '散弾', '指定した敵または向きへ、角度を広げた弾を最大4発放ちます。', '広角・複数弾', 0xfca5a5, 'scatter-fan', '散弾発展', ''],
  ['anchor', '固定杭', '固定', '指定した敵または向きへ弾を放ちます。', '単体射撃', 0x94a3b8, 'anchor-field', '固定発展', ''],
  ['flare', '閃光弾', '閃光', '指定した敵へ発射した時点で、その標的を4秒間燃焼中にします。', '燃焼付与・射撃', 0xfde68a, 'flare-burst', '閃光発展', ''],
  ['cutter', '横断刃', '横断', '指定した方向へ弾を最大4発放ち、1発につき敵を最大3体まで順に貫きます。', '貫通・複数弾', 0xc4b5fd, 'slicer-cross', '横断発展', ''],
  ['beacon', '誘導標', '誘導', '指定した敵へ発射した時点で、その標的を6秒間印付きにします。', '印付与・射撃', 0xf9a8d4, 'beacon-mark', '誘導発展', ''],
  ['nova', '爆縮核', '爆縮', '指定した敵へ重い弾を放ち、標的の周囲も同時に攻撃します。', '重い弾・範囲', 0xfb7185, 'nova-collapse', '爆縮発展', '発射時の範囲攻撃をもう一度重ねます。'],
  ['harpoon', '牽引槍', '牽引', '指定した方向へ弾を最大4発放ち、1発につき敵を最大3体まで順に貫きます。', '貫通・複数弾', 0x67e8f9, 'harpoon-pull', '牽引発展', ''],
  ['vortex', '旋回渦', '旋回', '指定した敵へ弾を放ち、標的の周囲も同時に攻撃します。', '弾・範囲', 0xa7f3d0, 'vortex-zone', '旋回発展', '発射時の範囲攻撃をもう一度重ねます。'],
  ['ward', '守護灯', '守護', '指定した敵または向きへ威力58%の弾を放ち、短い光線も表示します。', '低威力・光線', 0xfef08a, 'sentinel-guard', '守護発展', ''],
];

/** The generic V4/V5 forms still receive the level-eight stat row.  Their
 * named extra attack is not read by the shared live firing path, so show the
 * stat increase without promising an effect that cannot occur. */
const runtimeEvolutionDescription = (shortName: string, description: string): string => description
  || `${shortName}の基礎威力・発射間隔・射程などがLv8値になります。追加の攻撃や状態効果はありません。`;

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
  WEAPONS[id] = define(id, name, shortName, description, role, color, levels, runtimeBranches(shortName), evolution(evolutionId, evolutionName, runtimeEvolutionDescription(shortName, evolutionDescription)));
}

/** V5 completes the remaining twenty-five basic weapon definitions.  These
 * entries use the same bounded attack primitives while keeping their own
 * target priority and level values.
 */
const V5_WEAPON_SPECS: Array<[WeaponId, string, string, string, string, number, string, string, string]> = [
  ['fan', '扇裂砲', '扇裂', '指定した方向へ、角度を広げた弾を最大4発まとめて放ちます。', '広角・複数弾', 0xf472b6, 'fan-fold', '二重扇', ''],
  ['swell', '膨張弾', '膨張', '指定した敵へ弾を放ち、標的の周囲も同時に攻撃します。', '弾・範囲', 0x60a5fa, 'swell-ring', '膨張発展', ''],
  ['seeker', '追跡針', '追針', '指定した敵または向きへ弾を放ちます。', '単体射撃', 0x38bdf8, 'seeker-pair', '二段追跡', ''],
  ['drill', '穿孔錐', '穿孔', '指定した方向へ重い弾を最大4発放ち、1発につき敵を最大3体まで順に貫きます。', '重い貫通・複数弾', 0xf59e0b, 'drill-bore', '双穿孔', ''],
  ['mist', '薄霧弾', '薄霧', '指定した敵へ弾を放ち、標的の周囲を約0.7秒減速させます。', '範囲・減速', 0x94a3b8, 'mist-screen', '重層薄霧', ''],
  ['spark', '火花連射', '火花', '指定した方向へ弾を最大4発放ちます。', '連射・複数弾', 0xfacc15, 'spark-link', '連結火花', ''],
  ['coil', '螺旋弾', '螺旋', '指定した敵または向きへ弾を放ちます。', '単体射撃', 0xc084fc, 'coil-spiral', '二重螺旋', ''],
  ['bloom', '開花弾', '開花', '指定した敵へ弾を放ち、標的の周囲も同時に攻撃します。', '弾・範囲', 0xfb7185, 'bloom-petal', '三重開花', ''],
  ['shuttle', '往復舟', '往復', '指定した方向へ反射する円盤を最大4発放ち、敵と外周で最大2回跳ね返ります。', '反射・複数弾', 0x2dd4bf, 'shuttle-return', '双方向往復', ''],
  ['siphon', '吸収線', '吸収', '指定した敵へ弾を放ち、標的の周囲を約0.7秒減速させます。', '範囲・減速', 0x22d3ee, 'siphon-drain', '連続吸収', ''],
  ['mirror', '双映鏡', '双映', '指定した方向へ反射する円盤を最大4発放ち、敵と外周で最大2回跳ね返ります。', '反射・複数弾', 0xe879f9, 'mirror-pair', '四面鏡', ''],
  ['stasis', '静止針', '静止', '指定した敵へ弾を放ち、標的の周囲を約0.9秒減速させます。', '範囲・減速', 0x67e8f9, 'stasis-lock', '静止網', ''],
  ['quake', '地脈槌', '地脈', '指定した敵へ重い弾を最大4発放ち、標的の周囲も同時に攻撃します。', '重い弾・範囲', 0xf97316, 'quake-pair', '二地点衝撃', ''],
  ['spoke', '放射軸', '放射', '指定した方向へ、角度を大きくずらした弾を最大4発まとめて放ちます。', '広角・複数弾', 0x818cf8, 'spoke-double', '二重放射', ''],
  ['hollow', '虚空裂', '虚空', '指定した敵へ弾を放ち、標的の周囲も同時に攻撃します。', '弾・範囲', 0xa78bfa, 'hollow-triple', '三点裂け', ''],
  ['snare', '絡網射', '絡網', '指定した敵へ弾を放ち、標的の周囲を約1.15秒減速させます。', '範囲・減速', 0x34d399, 'snare-cross', '交差網', ''],
  ['chime', '共鳴鐘', '共鳴', '指定した方向へ弾を最大4発放ちます。', '複数弾', 0xf0abfc, 'chime-double', '二重共鳴', ''],
  ['thunder', '雷柱', '雷柱', '指定した敵へ重い弾を放ち、標的の周囲を威力40%で攻撃します。', '重い弾・範囲', 0xfde047, 'thunder-triple', '三柱落雷', ''],
  ['frost', '霜結線', '霜結', '指定した敵へ弾を放ち、標的の周囲を約0.7秒減速させます。', '範囲・減速', 0x93c5fd, 'frost-double', '二重霜結', ''],
  ['swarm', '微群機', '微群', '指定した方向へ、角度を広げた弾を最大4発まとめて放ちます。', '広角・複数弾', 0x86efac, 'swarm-pair', '二群展開', ''],
  ['counter', '返照盾', '返照', '指定した敵または向きへ威力58%の弾を放ち、短い光線も表示します。', '低威力・光線', 0x64748b, 'counter-double', '二面返照', ''],
  ['dive', '潜航弾', '潜航', '指定した方向へ弾を放ち、最大2体まで順に貫きます。', '単貫通射撃', 0x14b8a6, 'dive-pair', '二重潜航', ''],
  ['axis', '軸旋砲', '軸旋', '指定した方向へ角度を広げた弾を最大4発放ちます。', '広角・複数弾', 0x818cf8, 'axis-cross', '二軸回転', ''],
  ['seed', '種弾', '種弾', '指定した敵または向きへ弾を放ちます。', '単体射撃', 0x84cc16, 'seed-pair', '二砲台', ''],
  ['requiem', '終奏砲', '終奏', '指定した敵へ重い弾を放ちます。', '重い射撃', 0xe879f9, 'requiem-echo', '二重終奏', ''],
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
  WEAPONS[id] = define(id, name, shortName, description, role, color, levels, runtimeBranches(shortName), evolution(evolutionId, evolutionName, runtimeEvolutionDescription(shortName, evolutionDescription)));
}

export const WEAPON_ORDER: WeaponId[] = [
  'needle', 'ray', 'cluster', 'repulse', 'chain', 'orbit', 'disc', 'gravity', 'grid', 'mine', 'lance', 'drone',
  ...V4_WEAPON_SPECS.map(([id]) => id),
  ...V5_WEAPON_SPECS.map(([id]) => id),
];
