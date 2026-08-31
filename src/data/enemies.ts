import type { EnemyDefinition, EnemyId } from '../types/content';

export const ENEMIES: Record<EnemyId, EnemyDefinition> = {
  shard: { id: 'shard', name: '小片', description: '標準的な敵です。', hp: 24, speed: 42, contactDamage: 5, threatCost: 1, color: 0xff706a, radius: 15 },
  runner: { id: 'runner', name: '針走り', description: '細長い輪郭で素早く近づきます。', hp: 14, speed: 82, contactDamage: 4, threatCost: 1.3, color: 0xffbe5c, radius: 15 },
  shell: { id: 'shell', name: '外殻', description: '一度に受ける被害を24までに抑える厚い輪を持ちます。', hp: 95, speed: 27, contactDamage: 9, threatCost: 2.2, color: 0x9b8cff, radius: 22 },
  lattice: { id: 'lattice', name: '格子盾', description: '8回攻撃を受けるまで、本体へ被害が通りません。', hp: 38, speed: 38, contactDamage: 7, threatCost: 2, color: 0xa78bfa, radius: 22 },
  spore: { id: 'spore', name: '胞子体', description: '倒れると小さな敵2体へ一度だけ分かれます。', hp: 54, speed: 36, contactDamage: 7, threatCost: 2.6, color: 0x76e6a7, radius: 18 },
  marker: { id: 'marker', name: '標識体', description: '周囲120px以内の敵の速度を20%上げます。', hp: 48, speed: 34, contactDamage: 6, threatCost: 3, color: 0xf4e285, radius: 19 },
  dropper: { id: 'dropper', name: '投下体', description: 'コアから離れた位置で停止し、予告後に弾を撃ちます。', hp: 42, speed: 31, contactDamage: 10, threatCost: 3, color: 0xff8bd8, radius: 20 },
  phase: { id: 'phase', name: '位相体', description: '一定間隔で短時間だけ攻撃を受けなくなります。', hp: 50, speed: 40, contactDamage: 8, threatCost: 3.2, color: 0x78a8ff, radius: 18 },
};

export const ENEMY_ORDER: EnemyId[] = ['shard', 'runner', 'shell', 'lattice', 'spore', 'marker', 'dropper', 'phase'];
