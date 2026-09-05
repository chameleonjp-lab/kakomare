import type { WeaponDefinition, WeaponId } from '../types/content';

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  needle: {
    id: 'needle', name: '連針砲', shortName: '連針',
    description: '細い弾を素早く放ち、近づく敵を一体ずつ削ります。', role: '単体・盾削り', color: 0x63d7e6, maxLevel: 5,
    levels: [
      { damage: 8, cooldown: 0.16, range: 560, pierce: 0, projectileSpeed: 480 },
      { damage: 10, cooldown: 0.15, range: 570, pierce: 0, projectileSpeed: 500 },
      { damage: 13, cooldown: 0.14, range: 580, pierce: 1, projectileSpeed: 520 },
      { damage: 16, cooldown: 0.13, range: 590, pierce: 1, projectileSpeed: 540 },
      { damage: 20, cooldown: 0.12, range: 600, pierce: 2, projectileSpeed: 560 },
    ],
    branches: [
      { id: 'spread', name: '分散型', description: '三方向へ弾を広げ、小型の集団に対応します。', atLevel: 3 },
      { id: 'piercing', name: '貫通型', description: '弾速と貫通数を増やし、硬い敵の列を抜きます。', atLevel: 3 },
      { id: 'power', name: '針圧深化', description: '一射ごとの威力を22%高め、硬い敵を削り切ります。', atLevel: 5, damageMultiplier: 1.22 },
      { id: 'tempo', name: '連射深化', description: '発射間隔を18%短くし、盾と小型敵へ途切れず撃ち込みます。', atLevel: 5, cooldownMultiplier: 0.82 },
    ],
  },
  ray: {
    id: 'ray', name: '光路刃', shortName: '光路',
    description: '狙った直線を一度に切り払い、並んだ敵へ届きます。', role: '直線・貫通', color: 0xffbe5c, maxLevel: 5,
    levels: [
      { damage: 28, cooldown: 1.15, range: 560, width: 18 },
      { damage: 35, cooldown: 1.08, range: 570, width: 22 },
      { damage: 43, cooldown: 1.0, range: 580, width: 28 },
      { damage: 52, cooldown: 0.92, range: 590, width: 34 },
      { damage: 64, cooldown: 0.82, range: 600, width: 42 },
    ],
    branches: [
      { id: 'wide', name: '幅広型', description: '攻撃幅と残る時間を増やし、横に広い列を切ります。', atLevel: 3 },
      { id: 'reflect', name: '反射型', description: '外周で一度跳ね返り、別方向へも届きます。', atLevel: 3 },
      { id: 'power', name: '光圧深化', description: '一閃の威力を22%高め、硬い列を切り抜きます。', atLevel: 5, damageMultiplier: 1.22 },
      { id: 'tempo', name: '残光深化', description: '発射間隔を18%短くし、直線攻撃を重ねます。', atLevel: 5, cooldownMultiplier: 0.82 },
    ],
  },
  cluster: {
    id: 'cluster', name: '群集弾', shortName: '群集',
    description: '敵が多い方向へ予告を出し、着弾点をまとめて攻撃します。', role: '範囲・集団', color: 0xa78bfa, maxLevel: 5,
    levels: [
      { damage: 36, cooldown: 1.45, range: 560, radius: 72, projectileSpeed: 330 },
      { damage: 45, cooldown: 1.36, range: 570, radius: 80, projectileSpeed: 340 },
      { damage: 55, cooldown: 1.26, range: 580, radius: 90, projectileSpeed: 350 },
      { damage: 67, cooldown: 1.16, range: 590, radius: 102, projectileSpeed: 360 },
      { damage: 82, cooldown: 1.05, range: 600, radius: 116, projectileSpeed: 370 },
    ],
    branches: [
      { id: 'split', name: '分裂型', description: '着弾後に三方向へ小弾を放ちます。', atLevel: 3 },
      { id: 'residue', name: '残留型', description: '着弾地点へ短い減速領域を残します。', atLevel: 3 },
      { id: 'power', name: '爆圧深化', description: '着弾威力を22%高め、密集した敵をまとめて崩します。', atLevel: 5, damageMultiplier: 1.22 },
      { id: 'tempo', name: '装填深化', description: '発射間隔を18%短くし、危険な方向へ範囲攻撃を重ねます。', atLevel: 5, cooldownMultiplier: 0.82 },
    ],
  },
  repulse: {
    id: 'repulse', name: '反発輪', shortName: '反発',
    description: 'コアの周囲へ衝撃波を広げ、近い敵を押し戻します。', role: '防衛・押し戻し', color: 0x76e6a7, maxLevel: 5,
    levels: [
      { damage: 14, cooldown: 2.8, range: 165, radius: 165, pushDistance: 58 },
      { damage: 18, cooldown: 2.65, range: 180, radius: 180, pushDistance: 70 },
      { damage: 23, cooldown: 2.5, range: 195, radius: 195, pushDistance: 82 },
      { damage: 29, cooldown: 2.35, range: 212, radius: 212, pushDistance: 96 },
      { damage: 36, cooldown: 2.2, range: 230, radius: 230, pushDistance: 112 },
    ],
    branches: [
      { id: 'strong-push', name: '強反発型', description: '押し戻し距離と威力を増やします。', atLevel: 3 },
      { id: 'delayed', name: '遅延型', description: '押し戻した敵の速度をさらに下げます。', atLevel: 3 },
      { id: 'power', name: '衝圧深化', description: '衝撃波の威力を22%高め、コア近くの敵を崩します。', atLevel: 5, damageMultiplier: 1.22 },
      { id: 'tempo', name: '循環深化', description: '発射間隔を18%短くし、防衛の空白を減らします。', atLevel: 5, cooldownMultiplier: 0.82 },
    ],
  },
  chain: {
    id: 'chain', name: '連鎖導体', shortName: '連鎖',
    description: '最初の敵から近い敵へ攻撃を移し、密集した敵をまとめて削ります。', role: '連鎖・集団', color: 0xff8bd8, maxLevel: 5,
    levels: [
      { damage: 16, cooldown: 0.85, range: 520, chainCount: 3, count: 3 },
      { damage: 20, cooldown: 0.8, range: 540, chainCount: 3, count: 3 },
      { damage: 25, cooldown: 0.74, range: 560, chainCount: 4, count: 4 },
      { damage: 31, cooldown: 0.68, range: 580, chainCount: 5, count: 5 },
      { damage: 38, cooldown: 0.6, range: 600, chainCount: 6, count: 6 },
    ],
    branches: [
      { id: 'chain', name: '多連鎖型', description: '連鎖回数を増やし、離れた敵へ攻撃を渡します。', atLevel: 3 },
      { id: 'burst', name: '終端破裂型', description: '最後の敵で小さな範囲攻撃を起こします。', atLevel: 3 },
      { id: 'power', name: '電圧深化', description: '連鎖ごとの威力を22%高め、集団の奥まで削ります。', atLevel: 5, damageMultiplier: 1.22 },
      { id: 'tempo', name: '導通深化', description: '発射間隔を18%短くし、新しい集団へ素早くつなぎます。', atLevel: 5, cooldownMultiplier: 0.82 },
    ],
  },
  orbit: {
    id: 'orbit', name: '周回刃', shortName: '周回',
    description: 'コアの周囲を回る刃で、近づいた敵へ接触攻撃を行います。', role: '近距離・防衛', color: 0xf4e285, maxLevel: 5,
    levels: [
      { damage: 20, cooldown: 0.1, range: 180, count: 2, orbitRadius: 108, orbitSpeed: 1.9, hitCooldown: 0.45, bladeLength: 34 },
      { damage: 25, cooldown: 0.1, range: 190, count: 2, orbitRadius: 110, orbitSpeed: 2.15, hitCooldown: 0.42, bladeLength: 38 },
      { damage: 31, cooldown: 0.1, range: 205, count: 3, orbitRadius: 112, orbitSpeed: 2.4, hitCooldown: 0.38, bladeLength: 42 },
      { damage: 38, cooldown: 0.1, range: 220, count: 3, orbitRadius: 118, orbitSpeed: 2.7, hitCooldown: 0.34, bladeLength: 45 },
      { damage: 46, cooldown: 0.1, range: 240, count: 4, orbitRadius: 125, orbitSpeed: 3.0, hitCooldown: 0.3, bladeLength: 48 },
    ],
    branches: [
      { id: 'many', name: '多刃型', description: '刃の数と回転速度を増やします。', atLevel: 3 },
      { id: 'outer', name: '外周型', description: '周回半径と刃の長さを増やします。', atLevel: 3 },
      { id: 'power', name: '刃圧深化', description: '刃の威力を22%高め、接近した敵を確実に削ります。', atLevel: 5, damageMultiplier: 1.22 },
      { id: 'tempo', name: '回転深化', description: '攻撃間隔を18%短くし、周囲へ細かく当て続けます。', atLevel: 5, cooldownMultiplier: 0.82 },
    ],
  },
  disc: {
    id: 'disc', name: '残響円盤', shortName: '円盤',
    description: '敵と外周で跳ね返る円盤を放ち、複数方向へ継続して触れます。', role: '反射・継続', color: 0x78a8ff, maxLevel: 5,
    levels: [
      { damage: 22, cooldown: 1.05, range: 620, projectileSpeed: 290, bounceCount: 3, hitCooldown: 0.3 },
      { damage: 28, cooldown: 0.98, range: 640, projectileSpeed: 310, bounceCount: 3, hitCooldown: 0.28 },
      { damage: 35, cooldown: 0.9, range: 660, projectileSpeed: 330, bounceCount: 4, hitCooldown: 0.26 },
      { damage: 43, cooldown: 0.82, range: 680, projectileSpeed: 350, bounceCount: 5, hitCooldown: 0.24 },
      { damage: 52, cooldown: 0.74, range: 700, projectileSpeed: 380, bounceCount: 6, hitCooldown: 0.22 },
    ],
    branches: [
      { id: 'echo', name: '反響型', description: '反射回数と速度を増やします。', atLevel: 3 },
      { id: 'trail', name: '軌跡型', description: '通過した場所へ短い攻撃線を残します。', atLevel: 3 },
      { id: 'power', name: '円圧深化', description: '円盤の威力を22%高め、反射ごとの打撃を強めます。', atLevel: 5, damageMultiplier: 1.22 },
      { id: 'tempo', name: '反響深化', description: '発射間隔を18%短くし、戦場へ複数の円盤を保ちます。', atLevel: 5, cooldownMultiplier: 0.82 },
    ],
  },
  gravity: {
    id: 'gravity', name: '遠隔重力点', shortName: '重力',
    description: '外周寄りへ吸引点を作り、敵を集めて短時間だけ動きを抑えます。', role: '吸引・制御', color: 0xc084fc, maxLevel: 5,
    levels: [
      { damage: 5, cooldown: 6.5, range: 620, duration: 2.2, pullRadius: 125, pullStrength: 34, safeDistance: 180 },
      { damage: 6, cooldown: 6.1, range: 640, duration: 2.5, pullRadius: 140, pullStrength: 38, safeDistance: 180 },
      { damage: 7, cooldown: 5.7, range: 660, duration: 2.8, pullRadius: 155, pullStrength: 42, safeDistance: 180 },
      { damage: 8, cooldown: 5.3, range: 680, duration: 3.1, pullRadius: 170, pullStrength: 46, safeDistance: 180 },
      { damage: 10, cooldown: 4.8, range: 700, duration: 3.5, pullRadius: 185, pullStrength: 50, safeDistance: 180 },
    ],
    branches: [
      { id: 'long', name: '長時間型', description: '継続時間と吸引半径を増やします。', atLevel: 3 },
      { id: 'collapse', name: '崩壊型', description: '終了時に範囲攻撃を起こします。', atLevel: 3 },
      { id: 'power', name: '重圧深化', description: '重力点の威力を22%高め、集めた敵を削ります。', atLevel: 5, damageMultiplier: 1.22 },
      { id: 'tempo', name: '展開深化', description: '発射間隔を18%短くし、制御できない時間を減らします。', atLevel: 5, cooldownMultiplier: 0.82 },
    ],
  },
};

export const WEAPON_ORDER: WeaponId[] = ['needle', 'ray', 'cluster', 'repulse', 'chain', 'orbit', 'disc', 'gravity'];
