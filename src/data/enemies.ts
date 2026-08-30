import type { EnemyDefinition, EnemyId } from '../types/content';

export const ENEMIES: Record<EnemyId, EnemyDefinition> = {
  shard: {
    id: 'shard',
    name: '小片',
    description: '標準的な敵です。',
    hp: 24,
    speed: 42,
    contactDamage: 5,
    threatCost: 1,
    color: 0xff706a,
  },
  runner: {
    id: 'runner',
    name: '針走り',
    description: '細長い輪郭で素早く近づきます。',
    hp: 14,
    speed: 82,
    contactDamage: 4,
    threatCost: 1.3,
    color: 0xffbe5c,
  },
  lattice: {
    id: 'lattice',
    name: '格子盾',
    description: '8回攻撃を受けるまで、本体へ被害が通りません。',
    hp: 38,
    speed: 38,
    contactDamage: 7,
    threatCost: 2,
    color: 0xa78bfa,
  },
  spore: {
    id: 'spore',
    name: '胞子体',
    description: '倒れると小さな敵2体へ一度だけ分かれます。',
    hp: 54,
    speed: 36,
    contactDamage: 7,
    threatCost: 2.6,
    color: 0x76e6a7,
  },
};

export const ENEMY_ORDER: EnemyId[] = ['shard', 'runner', 'lattice', 'spore'];
