import type { SupportDefinition, SupportId } from '../types/content';

export const SUPPORTS: Record<SupportId, SupportDefinition> = {
  output: {
    id: 'output',
    name: '出力環',
    description: '左右に接続した武器の威力を高めます。',
    role: '威力上昇',
    color: 0xffbe5c,
    maxLevel: 3,
    levels: [
      { value: 0.1, label: '威力 +10%' },
      { value: 0.15, label: '威力 +15%' },
      { value: 0.2, label: '威力 +20%' },
    ],
  },
  rhythm: {
    id: 'rhythm',
    name: '律動環',
    description: '左右に接続した武器の発射間隔を短くします。',
    role: '間隔短縮',
    color: 0x63d7e6,
    maxLevel: 3,
    levels: [
      { value: 0.08, label: '発射間隔 -8%' },
      { value: 0.12, label: '発射間隔 -12%' },
      { value: 0.16, label: '発射間隔 -16%' },
    ],
  },
  brake: {
    id: 'brake',
    name: '制動環',
    description: '押し戻しの距離を伸ばし、敵の進行を遅くします。',
    role: '減速・押し戻し',
    color: 0x76e6a7,
    maxLevel: 3,
    levels: [
      { value: 0.1, label: '制動効果 +10%' },
      { value: 0.18, label: '制動効果 +18%' },
      { value: 0.28, label: '制動効果 +28%' },
    ],
  },
};

export const SUPPORT_ORDER: SupportId[] = ['output', 'rhythm', 'brake'];
