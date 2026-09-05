import type { BossDefinition, BossId } from '../types/content';

export const BOSSES: Record<BossId, BossDefinition> = {
  crown: {
    id: 'crown',
    name: '回転冠',
    description: '三枚の盾が回転し、隙間からの攻撃だけが本体へ届きます。',
    hp: 900,
    speed: 12,
    color: 0xffbe5c,
    hitRadius: 40,
    pressure: { interval: 6, telegraph: 0.9, damage: 12, speed: 180, life: 1.3 },
  },
  designer: {
    id: 'designer',
    name: '群れの設計者',
    description: '一方向へ小型敵を集めて送り出すボスです。予告線を見て迎え撃ちます。',
    hp: 1_400,
    speed: 10,
    color: 0xff8bd8,
    hitRadius: 44,
  },
  echo: {
    id: 'echo',
    name: '反響核',
    description: '攻撃を受けると反射弾を準備します。弾の予告方向を確認します。',
    hp: 2_000,
    speed: 8,
    color: 0x78a8ff,
    hitRadius: 48,
  },
};
