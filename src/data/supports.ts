import type { SupportDefinition, SupportId } from '../types/content';

export const SUPPORTS: Record<SupportId, SupportDefinition> = {
  output: {
    id: 'output', name: '出力環', description: '左右に接続した武器の基礎威力を加算で高めます。同じ武器への合計は40%までです。', role: '接続武器の威力', color: 0xffbe5c, maxLevel: 3,
    levels: [{ value: 0.1, label: '威力 +10%' }, { value: 0.15, label: '威力 +15%' }, { value: 0.2, label: '威力 +20%' }],
  },
  rhythm: {
    id: 'rhythm', name: '律動環', description: '左右に接続した武器の発射間隔を短くします。合計短縮は30%までです。', role: '接続武器の間隔短縮', color: 0x63d7e6, maxLevel: 3,
    levels: [{ value: 0.08, label: '発射間隔 -8%' }, { value: 0.12, label: '発射間隔 -12%' }, { value: 0.16, label: '発射間隔 -16%' }],
  },
  branch: {
    id: 'branch', name: '分岐環', description: '接続した武器の発射回数を数え、一定回数ごとに威力50%の追加射撃を1回だけ出します。追加射撃はさらに数えません。', role: '発射回数ごとの追加射撃', color: 0xff8bd8, maxLevel: 3,
    levels: [{ value: 6, label: '6回ごとに威力50%の追加射撃' }, { value: 5, label: '5回ごとに威力50%の追加射撃' }, { value: 4, label: '4回ごとに威力50%の追加射撃' }],
  },
  focus: {
    id: 'focus', name: '収束環', description: '接続した武器の届く距離と弾の速さを別々に高めます。距離は35%、速さは44%まで重なります。', role: '射程・弾速', color: 0x78a8ff, maxLevel: 3,
    levels: [
      { value: 0.08, secondaryValue: 0.1, label: '射程 +8% / 弾速 +10%' },
      { value: 0.12, secondaryValue: 0.15, label: '射程 +12% / 弾速 +15%' },
      { value: 0.18, secondaryValue: 0.22, label: '射程 +18% / 弾速 +22%' },
    ],
  },
  observe: {
    id: 'observe', name: '観測環', description: '外殻・標識体・投下体・位相体・護衛体・ボスへ与える威力を高めます。', role: '特定の敵への威力', color: 0xf4e285, maxLevel: 3,
    levels: [{ value: 0.1, label: '特殊敵への威力 +10%' }, { value: 0.18, label: '+18%' }, { value: 0.28, label: '+28%' }],
  },
  brake: {
    id: 'brake', name: '制動環', description: '反発輪の押し戻し距離と、重力点・残留領域の減速時間を伸ばします。ほかの攻撃には働きません。', role: '押し戻し・減速', color: 0x76e6a7, maxLevel: 3,
    levels: [{ value: 0.1, label: '制動効果 +10%' }, { value: 0.18, label: '+18%' }, { value: 0.28, label: '+28%' }],
  },
  relay: {
    id: 'relay', name: '継電環', description: '左右の武器に加え、2層目以降では同じ向きの一つ内側の武器へも出力を1本だけ中継します。中継は巡回しません。', role: '内側への出力中継', color: 0xff9f68, maxLevel: 3,
    levels: [{ value: 0.05, label: '内側へ出力 +5%' }, { value: 0.08, label: '内側へ出力 +8%' }, { value: 0.12, label: '内側へ出力 +12%' }],
  },
  repair: {
    id: 'repair', name: '整備環', description: '接続した迎撃格子が敵弾を消すか、軌道機雷が爆発したとき、コアを回復します。', role: '迎撃・機雷時の回復', color: 0x9be7ff, maxLevel: 3,
    levels: [{ value: 1, label: '迎撃 / 機雷爆発で耐久 +1' }, { value: 2, label: '迎撃 / 機雷爆発で耐久 +2' }, { value: 3, label: '迎撃 +3 / 機雷爆発 +2' }],
  },
  shatter: {
    id: 'shatter', name: '破砕環', description: '格子体・護衛体の盾へ命中したとき、通常の命中に加えて盾を1枚余分に削り、威力も高めます。外殻には働きません。', role: '格子盾・護衛盾への追加破砕', color: 0xf97316, maxLevel: 3,
    levels: [{ value: 0.12, secondaryValue: 1, label: '盾への威力 +12% / 命中ごとに追加破砕 1枚' }, { value: 0.2, secondaryValue: 2, label: '盾への威力 +20% / 命中ごとに追加破砕 1枚' }, { value: 0.3, secondaryValue: 3, label: '盾への威力 +30% / 命中ごとに追加破砕 1枚' }],
  },
  conductive: {
    id: 'conductive', name: '導電環', description: '減速中の敵へ命中すると、その周囲の別の敵にも短い減速を伝えます。印や燃焼は伝えません。', role: '減速の周囲伝播', color: 0x22d3ee, maxLevel: 3,
    levels: [{ value: 0.08, secondaryValue: 1, label: '減速を周囲1体へ伝える' }, { value: 0.14, secondaryValue: 1, label: '減速を周囲1体へ伝える' }, { value: 0.22, secondaryValue: 2, label: '減速を周囲2体へ伝える' }],
  },
  ignite: {
    id: 'ignite', name: '誘爆環', description: '印または燃焼が残る敵を撃破すると、構成内で最初の武器のその時点の威力を基準に、周囲へ一度だけ範囲爆発を出します。武器への接続は必要ありません。', role: '印・燃焼撃破時の爆発', color: 0xfb7185, maxLevel: 3,
    levels: [{ value: 0.12, secondaryValue: 34, label: '撃破時に構成内で最初の武器のその時点の威力の6.6% / 半径34' }, { value: 0.18, secondaryValue: 42, label: '撃破時に構成内で最初の武器のその時点の威力の9.9% / 半径42' }, { value: 0.26, secondaryValue: 52, label: '撃破時に構成内で最初の武器のその時点の威力の14.3% / 半径52' }],
  },
  brink: {
    id: 'brink', name: '背水環', description: 'コア耐久が最大値の30%以下の間だけ、配置中のすべての武器の威力を高めます。障壁回復を止める効果はありません。', role: '危険時の全武器威力', color: 0xef4444, maxLevel: 3,
    levels: [{ value: 0.06, label: 'コア30%以下で威力 +6%' }, { value: 0.1, label: 'コア30%以下で威力 +10%' }, { value: 0.18, label: 'コア30%以下で威力 +18%' }],
  },
  anchor: {
    id: 'anchor', name: '定着環', description: '重力点・軌道機雷・追尾子機の持続時間を延ばします。生成位置ではなく、持続時間だけに働きます。', role: '重力点・機雷・子機の持続', color: 0x94a3b8, maxLevel: 3,
    levels: [{ value: 0.08, secondaryValue: 0.4, label: '重力点 / 機雷 / 子機の時間 +8%' }, { value: 0.14, secondaryValue: 0.7, label: '重力点 / 機雷 / 子機の時間 +14%' }, { value: 0.22, secondaryValue: 1.1, label: '重力点 / 機雷 / 子機の時間 +22%' }],
  },
  veil: {
    id: 'veil', name: '薄幕環', description: 'コアが接触や遠隔弾から受ける被害を常時軽減します。接続武器の威力は同じ割合だけ下がります。', role: '被害軽減・威力代償', color: 0xc4b5fd, maxLevel: 3,
    levels: [{ value: 0.08, secondaryValue: 0.04, label: 'コア被害 -4% / 接続武器の威力 -4%' }, { value: 0.13, secondaryValue: 0.06, label: 'コア被害 -6% / 接続武器の威力 -6%' }, { value: 0.2, secondaryValue: 0.08, label: 'コア被害 -8% / 接続武器の威力 -8%' }],
  },
  vector: {
    id: 'vector', name: '指向環', description: '手動照準中だけ、接続した武器の威力を高めます。自動照準中は働きません。', role: '手動照準中の接続武器威力', color: 0x60a5fa, maxLevel: 3,
    levels: [{ value: 0.08, label: '手動照準中の威力 +8%' }, { value: 0.14, label: '手動照準中の威力 +14%' }, { value: 0.22, label: '手動照準中の威力 +22%' }],
  },
  pulse: {
    id: 'pulse', name: '脈動環', description: '通常発射とは別の周期で、接続した武器のうち構成上で先に並ぶ一つを選び、その標的の周囲へ小さな補助波を出します。', role: '周期補助波', color: 0xf59e0b, maxLevel: 3,
    levels: [{ value: 0.2, secondaryValue: 2.8, label: '2.8秒ごとに補助波（威力11% / 半径34）' }, { value: 0.3, secondaryValue: 2.4, label: '2.4秒ごとに補助波（威力17% / 半径34）' }, { value: 0.42, secondaryValue: 2, label: '2秒ごとに補助波（威力23% / 半径34）' }],
  },
  reserve: {
    id: 'reserve', name: '蓄勢環', description: '蓄圧槍の再発射に必要なため時間を少し短くします。ほかの武器の蓄積や放出は変えません。', role: '蓄圧槍のため時間短縮', color: 0xeab308, maxLevel: 3,
    levels: [{ value: 1, secondaryValue: 0.08, label: '蓄圧槍のため時間を最大0.08秒短縮' }, { value: 2, secondaryValue: 0.14, label: '蓄圧槍のため時間を最大0.16秒短縮' }, { value: 3, secondaryValue: 0.22, label: '蓄圧槍のため時間を最大0.24秒短縮' }],
  },
  lattice: {
    id: 'lattice', name: '格子環', description: '迎撃格子が一度の発射で消せる敵弾の数を増やします。最大4発までです。', role: '迎撃格子の同時迎撃数', color: 0x818cf8, maxLevel: 3,
    levels: [{ value: 1, label: '迎撃格子の同時迎撃 +1' }, { value: 2, label: '迎撃格子の同時迎撃 +2' }, { value: 3, label: '迎撃格子の同時迎撃 +3' }],
  },
  orbit: {
    id: 'orbit', name: '軌道環', description: '周回刃の軌道半径を広げ、回転も少し速くします。往復弾やほかの移動経路には働きません。', role: '周回刃の軌道', color: 0x34d399, maxLevel: 3,
    levels: [{ value: 0.08, label: '周回半径 +8% / 回転速度 +約6%' }, { value: 0.14, label: '周回半径 +14% / 回転速度 +約10%' }, { value: 0.22, label: '周回半径 +22% / 回転速度 +約15%' }],
  },
  catalyst: {
    id: 'catalyst', name: '触媒環', description: '減速中の標識体・位相体・ボスへ命中したとき、状態を消費せず威力を上乗せします。ほかの敵には働きません。', role: '減速中の特定敵への威力', color: 0xa78bfa, maxLevel: 3,
    levels: [{ value: 0.1, secondaryValue: 1, label: '減速中の標識体 / 位相体 / ボスへ威力 +10%' }, { value: 0.16, secondaryValue: 1, label: '減速中の標識体 / 位相体 / ボスへ威力 +16%' }, { value: 0.24, secondaryValue: 1, label: '減速中の標識体 / 位相体 / ボスへ威力 +24%' }],
  },
};

export const SUPPORT_ORDER: SupportId[] = [
  'output', 'rhythm', 'branch', 'focus', 'observe', 'brake', 'relay', 'repair',
  'shatter', 'conductive', 'ignite', 'brink', 'anchor', 'veil', 'vector', 'pulse',
  'reserve', 'lattice', 'orbit', 'catalyst',
];
