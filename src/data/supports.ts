import type { SupportDefinition, SupportId } from '../types/content';

export const SUPPORTS: Record<SupportId, SupportDefinition> = {
  output: {
    id: 'output', name: '出力環', description: '左右に接続した武器の威力を高めます。', role: '威力上昇', color: 0xffbe5c, maxLevel: 3,
    levels: [{ value: 0.1, label: '威力 +10%' }, { value: 0.15, label: '威力 +15%' }, { value: 0.2, label: '威力 +20%' }],
  },
  rhythm: {
    id: 'rhythm', name: '律動環', description: '左右に接続した武器の発射間隔を短くします。', role: '間隔短縮', color: 0x63d7e6, maxLevel: 3,
    levels: [{ value: 0.08, label: '発射間隔 -8%' }, { value: 0.12, label: '発射間隔 -12%' }, { value: 0.16, label: '発射間隔 -16%' }],
  },
  branch: {
    id: 'branch', name: '分岐環', description: '一定回数ごとに、接続した武器を弱い威力で追加発動します。', role: '追加発動', color: 0xff8bd8, maxLevel: 3,
    levels: [{ value: 6, label: '6回ごとに追加発動' }, { value: 5, label: '5回ごとに追加発動' }, { value: 4, label: '4回ごとに追加発動' }],
  },
  focus: {
    id: 'focus', name: '収束環', description: '接続した武器の射程と弾速を高めます。', role: '射程・弾速', color: 0x78a8ff, maxLevel: 3,
    levels: [
      { value: 0.08, secondaryValue: 0.1, label: '射程 +8% / 弾速 +10%' },
      { value: 0.12, secondaryValue: 0.15, label: '射程 +12% / 弾速 +15%' },
      { value: 0.18, secondaryValue: 0.22, label: '射程 +18% / 弾速 +22%' },
    ],
  },
  observe: {
    id: 'observe', name: '観測環', description: '外殻・標識体・投下体・位相体へ与える威力を高めます。', role: '特殊敵への威力', color: 0xf4e285, maxLevel: 3,
    levels: [{ value: 0.1, label: '特殊敵への威力 +10%' }, { value: 0.18, label: '+18%' }, { value: 0.28, label: '+28%' }],
  },
  brake: {
    id: 'brake', name: '制動環', description: '押し戻しの距離を伸ばし、敵の進行を遅くします。', role: '減速・押し戻し', color: 0x76e6a7, maxLevel: 3,
    levels: [{ value: 0.1, label: '制動効果 +10%' }, { value: 0.18, label: '+18%' }, { value: 0.28, label: '+28%' }],
  },
  relay: {
    id: 'relay', name: '継電環', description: '同じ層から内側の武器へ、効果を一経路だけ中継します。', role: '接続中継', color: 0xff9f68, maxLevel: 3,
    levels: [{ value: 0.05, label: '内側へ出力 +5%' }, { value: 0.08, label: '内側へ出力 +8%' }, { value: 0.12, label: '内側へ出力 +12%' }],
  },
  repair: {
    id: 'repair', name: '整備環', description: '接続武器が迎撃や状態解除を行うと、コアを少し回復します。', role: '条件付き防衛', color: 0x9be7ff, maxLevel: 3,
    levels: [{ value: 1, label: '条件成立時に耐久 +1' }, { value: 2, label: '条件成立時に耐久 +2' }, { value: 3, label: '条件成立時に耐久 +3' }],
  },
};

export const SUPPORT_ORDER: SupportId[] = ['output', 'rhythm', 'branch', 'focus', 'observe', 'brake', 'relay', 'repair'];
