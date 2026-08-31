import type { WeaponDefinition, WeaponId } from '../types/content';

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  needle: {
    id: 'needle',
    name: '連針砲',
    shortName: '連針',
    description: '細い弾を素早く放ち、近づく敵を一体ずつ削ります。',
    role: '単体・盾削り',
    color: 0x63d7e6,
    maxLevel: 5,
    levels: [
      { damage: 8, cooldown: 0.16, range: 560, pierce: 0, projectileSpeed: 480 },
      { damage: 10, cooldown: 0.15, range: 570, pierce: 0, projectileSpeed: 500 },
      { damage: 13, cooldown: 0.14, range: 580, pierce: 1, projectileSpeed: 520 },
      { damage: 16, cooldown: 0.13, range: 590, pierce: 1, projectileSpeed: 540 },
      { damage: 20, cooldown: 0.12, range: 600, pierce: 2, projectileSpeed: 560 },
    ],
  },
  ray: {
    id: 'ray',
    name: '光路刃',
    shortName: '光路',
    description: '狙った直線を一度に切り払い、並んだ敵へ届きます。',
    role: '直線・貫通',
    color: 0xffbe5c,
    maxLevel: 5,
    levels: [
      { damage: 28, cooldown: 1.15, range: 560, width: 18 },
      { damage: 35, cooldown: 1.08, range: 570, width: 22 },
      { damage: 43, cooldown: 1.0, range: 580, width: 28 },
      { damage: 52, cooldown: 0.92, range: 590, width: 34 },
      { damage: 64, cooldown: 0.82, range: 600, width: 42 },
    ],
  },
  cluster: {
    id: 'cluster',
    name: '群集弾',
    shortName: '群集',
    description: '敵が多い方向へ予告を出し、着弾点をまとめて攻撃します。',
    role: '範囲・集団',
    color: 0xa78bfa,
    maxLevel: 5,
    levels: [
      { damage: 36, cooldown: 1.45, range: 560, radius: 72, projectileSpeed: 330 },
      { damage: 45, cooldown: 1.36, range: 570, radius: 80, projectileSpeed: 340 },
      { damage: 55, cooldown: 1.26, range: 580, radius: 90, projectileSpeed: 350 },
      { damage: 67, cooldown: 1.16, range: 590, radius: 102, projectileSpeed: 360 },
      { damage: 82, cooldown: 1.05, range: 600, radius: 116, projectileSpeed: 370 },
    ],
  },
  repulse: {
    id: 'repulse',
    name: '反発輪',
    shortName: '反発',
    description: 'コアの周囲へ衝撃波を広げ、近い敵を押し戻します。',
    role: '防衛・押し戻し',
    color: 0x76e6a7,
    maxLevel: 5,
    levels: [
      { damage: 14, cooldown: 2.8, range: 165, radius: 165, pushDistance: 58 },
      { damage: 18, cooldown: 2.65, range: 180, radius: 180, pushDistance: 70 },
      { damage: 23, cooldown: 2.5, range: 195, radius: 195, pushDistance: 82 },
      { damage: 29, cooldown: 2.35, range: 212, radius: 212, pushDistance: 96 },
      { damage: 36, cooldown: 2.2, range: 230, radius: 230, pushDistance: 112 },
    ],
  },
};

export const WEAPON_ORDER: WeaponId[] = ['needle', 'ray', 'cluster', 'repulse'];
