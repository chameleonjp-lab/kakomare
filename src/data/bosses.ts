import type { BossDefinition, BossId } from '../types/content';

export const BOSSES: Record<BossId, BossDefinition> = {
  crown: {
    id: 'crown',
    name: '回転冠',
    description: '三枚の盾が回転し、隙間からの攻撃だけが本体へ届きます。',
    hp: 900,
    speed: 12,
    contactDamage: 18,
    color: 0xffbe5c,
  },
};
