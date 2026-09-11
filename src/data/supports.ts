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
  shatter: {
    id: 'shatter', name: '破砕環', description: '殻・盾・護衛の防護へ命中したとき、破砕値を加えます。', role: '装甲・盾破壊', color: 0xf97316, maxLevel: 3,
    levels: [{ value: 0.12, secondaryValue: 1, label: '防護への威力 +12% / 破砕 +1' }, { value: 0.2, secondaryValue: 2, label: '+20% / 破砕 +2' }, { value: 0.3, secondaryValue: 3, label: '+30% / 破砕 +3' }],
  },
  conductive: {
    id: 'conductive', name: '導電環', description: '減速・印などの状態を近い敵へ一度だけ伝えます。', role: '状態連結', color: 0x22d3ee, maxLevel: 3,
    levels: [{ value: 0.08, secondaryValue: 1, label: '状態伝導 +8% / 1体' }, { value: 0.14, secondaryValue: 1, label: '+14% / 1体' }, { value: 0.22, secondaryValue: 2, label: '+22% / 2体' }],
  },
  ignite: {
    id: 'ignite', name: '誘爆環', description: '印や燃焼状態の敵が倒れたとき、周囲へ一度だけ小爆発を起こします。', role: '条件範囲攻撃', color: 0xfb7185, maxLevel: 3,
    levels: [{ value: 0.12, secondaryValue: 34, label: '誘爆威力 +12% / 半径34' }, { value: 0.18, secondaryValue: 42, label: '+18% / 半径42' }, { value: 0.26, secondaryValue: 52, label: '+26% / 半径52' }],
  },
  brink: {
    id: 'brink', name: '背水環', description: 'コア耐久が30%以下の間だけ出力を高め、障壁回復を止めます。', role: '危険時強化', color: 0xef4444, maxLevel: 3,
    levels: [{ value: 0.06, label: '危険時出力 +6%（回復停止）' }, { value: 0.1, label: '+10%（回復停止）' }, { value: 0.18, label: '+18%（回復停止）' }],
  },
  anchor: {
    id: 'anchor', name: '定着環', description: '領域・機雷・子機などの生成位置を安定させます。', role: '寿命・設置', color: 0x94a3b8, maxLevel: 3,
    levels: [{ value: 0.08, secondaryValue: 0.4, label: '設置安定 +8% / 寿命 +0.4秒' }, { value: 0.14, secondaryValue: 0.7, label: '+14% / +0.7秒' }, { value: 0.22, secondaryValue: 1.1, label: '+22% / +1.1秒' }],
  },
  veil: {
    id: 'veil', name: '薄幕環', description: '短い被害軽減幕を作る代わりに、接続武器の出力を少し下げます。', role: '障壁・被害軽減', color: 0xc4b5fd, maxLevel: 3,
    levels: [{ value: 0.08, secondaryValue: 0.04, label: '被害軽減 +8% / 出力 -4%' }, { value: 0.13, secondaryValue: 0.06, label: '+13% / -6%' }, { value: 0.2, secondaryValue: 0.08, label: '+20% / -8%' }],
  },
  vector: {
    id: 'vector', name: '指向環', description: '指定した危険方向への対象選択を安定させます。全方向自動化はしません。', role: '照準補助', color: 0x60a5fa, maxLevel: 3,
    levels: [{ value: 0.08, label: '指定方向の優先 +8%' }, { value: 0.14, label: '+14%' }, { value: 0.22, label: '+22%' }],
  },
  pulse: {
    id: 'pulse', name: '脈動環', description: '通常発射とは別の周期で、小さな補助波を一度だけ出します。', role: '周期発動', color: 0xf59e0b, maxLevel: 3,
    levels: [{ value: 0.2, secondaryValue: 2.8, label: '補助波 +20% / 2.8秒' }, { value: 0.3, secondaryValue: 2.4, label: '+30% / 2.4秒' }, { value: 0.42, secondaryValue: 2, label: '+42% / 2秒' }],
  },
  reserve: {
    id: 'reserve', name: '蓄勢環', description: 'ため時間や命中蓄積を一段だけ増やし、放出の選択を作ります。', role: '蓄積・放出', color: 0xeab308, maxLevel: 3,
    levels: [{ value: 1, secondaryValue: 0.08, label: '蓄積 +1段 / 放出 +8%' }, { value: 2, secondaryValue: 0.14, label: '+2段 / +14%' }, { value: 3, secondaryValue: 0.22, label: '+3段 / +22%' }],
  },
  lattice: {
    id: 'lattice', name: '格子環', description: '敵弾や直線攻撃を迎撃する個体の対象数を増やします。', role: '迎撃・遮断', color: 0x818cf8, maxLevel: 3,
    levels: [{ value: 1, label: '同時迎撃 +1' }, { value: 2, label: '同時迎撃 +2' }, { value: 3, label: '同時迎撃 +3' }],
  },
  orbit: {
    id: 'orbit', name: '軌道環', description: '周回・往復・移動経路の半径を少し変えます。', role: '軌道変化', color: 0x34d399, maxLevel: 3,
    levels: [{ value: 0.08, label: '軌道半径 +8%' }, { value: 0.14, label: '+14%' }, { value: 0.22, label: '+22%' }],
  },
  catalyst: {
    id: 'catalyst', name: '触媒環', description: '二つ以上の状態が同じ敵に成立したとき、一方を消費して一度だけ追加効果を出します。', role: '状態消費', color: 0xa78bfa, maxLevel: 3,
    levels: [{ value: 0.1, secondaryValue: 1, label: '触媒効果 +10% / 1回' }, { value: 0.16, secondaryValue: 1, label: '+16% / 1回' }, { value: 0.24, secondaryValue: 1, label: '+24% / 1回' }],
  },
};

export const SUPPORT_ORDER: SupportId[] = [
  'output', 'rhythm', 'branch', 'focus', 'observe', 'brake', 'relay', 'repair',
  'shatter', 'conductive', 'ignite', 'brink', 'anchor', 'veil', 'vector', 'pulse',
  'reserve', 'lattice', 'orbit', 'catalyst',
];
