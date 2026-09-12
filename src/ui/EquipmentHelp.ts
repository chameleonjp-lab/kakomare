import { SUPPORTS } from '../data/supports';
import { WEAPONS } from '../data/weapons';
import { adjacentWeaponSlots } from '../game/deviceLayout';
import { SupportModule, supportEffectsFor, supportWeaponSlots } from '../game/entities/SupportModule';
import type { SupportId, WeaponId } from '../types/content';
import type { BattleSnapshot, SupportSnapshot, WeaponSnapshot } from '../types/game';
import { element } from './viewUtils';

/** A small, UI-ready explanation of one installed weapon or support. */
export interface EquipmentHelp {
  kind: 'weapon' | 'support';
  id: WeaponId | SupportId;
  name: string;
  role: string;
  summary: string;
  current: string;
  effects: string[];
  conditions: string[];
  limits: string[];
  connections: string[];
  synergies: string[];
}

export interface EquipmentHelpBundle {
  weapons: EquipmentHelp[];
  supports: EquipmentHelp[];
}

/**
 * The battle loop uses a handful of bounded, shared paths for the later
 * weapon entries. Keeping the notes here makes the pause/upgrade copy say
 * what a player can observe now, including the deliberately unimplemented
 * named forms, instead of repeating catalog promises.
 */
interface RuntimeWeaponNote {
  current: string;
  condition: string;
  limits: string[];
}

const RUNTIME_WEAPON_NOTES: Record<WeaponId, RuntimeWeaponNote> = {
  needle: {
    current: '優先度の高い敵へ直進弾を放ちます。通常は1発、分散型では3発です。',
    condition: '自動では危険度の高い敵を選び、手動照準中は指定した向きの敵を優先します。',
    limits: ['弾は同じ敵へ一度だけ当たり、貫通数を使い切ると消えます。'],
  },
  ray: {
    current: '指定方向へ光線を一度出し、線上の敵をまとめて攻撃します。',
    condition: '反射型は光線が射程より先に外周へ届いたときだけ、外周から一度返ります。',
    limits: ['反射した光線は元の威力の55%で、届く長さも残りの射程内です。'],
  },
  cluster: {
    current: '指定した敵の位置へ予告付きの弾を送り、到着時に範囲攻撃します。',
    condition: '標的がいないときは照準方向の約250先へ着弾します。',
    limits: ['分裂型・連環群集弾の小弾は一世代だけで、元の弾からさらに増えません。'],
  },
  repulse: {
    current: 'コアの周囲へ円形の衝撃を出し、近い敵を押し戻して減速させます。',
    condition: '強反発型は押し戻しと威力を、遅延型は減速時間を伸ばします。',
    limits: ['ボスは押し戻されません。二重防衛輪の外側の波は減速だけです。'],
  },
  chain: {
    current: '最初の敵から150以内で最も近い別の敵へ、最大9体まで順に攻撃を渡します。',
    condition: '多連鎖型と網状導体は連鎖できる回数を増やし、終端破裂型は最後の位置を範囲攻撃します。',
    limits: ['同じ発射で同じ敵には戻りません。分岐と発展を重ねると最大13体までつながり、後ろの敵ほど威力が下がります。'],
  },
  orbit: {
    current: 'コアの周りを回る刃が、触れた敵へ繰り返し当たります。',
    condition: '多刃型は刃と回転速度、外周型は軌道と刃の長さを増やします。',
    limits: ['同じ敵への接触には個別の待ち時間があります。多層周回刃の外輪は威力60%です。'],
  },
  disc: {
    current: '飛ぶ円盤が敵と外周で跳ね返り、同じ敵にも待ち時間を置いて再び当たります。',
    condition: '反響型は反射回数と速度、軌跡型は飛行中の現在位置へ小範囲攻撃を加えます。',
    limits: ['反射回数を使い切るか寿命を迎えると消えます。共鳴円盤は別方向の小円盤を一度だけ出します。'],
  },
  gravity: {
    current: '外周寄りに重力点を置き、範囲内の敵を引き寄せて減速させます。',
    condition: '長時間型は持続時間と範囲、崩壊型は消滅時の範囲攻撃を増やします。',
    limits: ['重力点はコアの安全距離より内側へ置かれず、同時に24個までです。'],
  },
  grid: {
    current: '指定方向の敵弾を先に消し、同じ発射で弱い弾も一つ出します。',
    condition: '危険な敵弾がないときも弾は出ます。交差格子は直角方向にも迎撃線を置きます。',
    limits: ['一度の格子で消せる敵弾は最大4発です。狭域格子は幅だけが狭くなります。'],
  },
  mine: {
    current: '照準方向へ時間制限付きの機雷を置き、敵が触れると範囲爆発します。',
    condition: '近接機雷はコア寄り、遠隔機雷は標的より外側へ置きます。',
    limits: ['同じ機雷の置き場が埋まると古いものから置き換わり、交差機雷は角度違いを3個置きます。'],
  },
  lance: {
    current: 'ため時間がたまったとき、重い貫通槍を一度放ちます。',
    condition: '破槍型は威力と貫通数を増やし、蓄勢環があれば必要なため時間を少し短くします。',
    limits: ['ため時間には0.8秒の下限があります。長槍型は射程を18%、幅を4広げ、破槍型は貫通数を増やします。'],
  },
  drone: {
    current: '最大2機の子機がコアの周りを回り、それぞれが標的へ短い弾を撃ちます。',
    condition: '近接追尾は周回速度、遠隔追尾は周回半径を高めます。',
    limits: ['子機は全体で最大24機、1機ごとに寿命があります。交差追尾は速度・半径・初期位置だけを変えます。'],
  },
  prism: {
    current: '指定した敵または向きへ、角度を少しずらした弾を最大4発まとめて放ちます。',
    condition: '対象の選択は通常の優先度と手動照準に従います。',
    limits: ['同時に出る弾は最大4発です。Lv8発展は基礎値の更新のみです。'],
  },
  mortar: {
    current: '指定した敵へ、通常より重い弾を最大4発放ちます。',
    condition: '対象がいないときは照準方向へ飛びます。',
    limits: ['同時に出る弾は最大4発です。Lv8発展は基礎値の更新のみです。'],
  },
  ribbon: {
    current: '指定した敵または向きへ通常の弾を放ちます。',
    condition: '対象の選択は通常の優先度と手動照準に従います。',
    limits: ['通常の単体弾です。Lv8発展は基礎値の更新のみです。'],
  },
  shockwave: {
    current: '指定した敵へ弾を放ち、同じ位置を小範囲でも攻撃します。',
    condition: '発射時に範囲攻撃が起きるため、弾の到着を待たずに周囲へ届きます。',
    limits: ['脈動発展は同じ位置の範囲攻撃をもう一度加えます。周期発動の武器ではありません。'],
  },
  barrage: {
    current: '指定方向へ角度を広げた弾を最大4発まとめて放ちます。',
    condition: '手動照準中は指定方向の扇に入る敵を優先します。',
    limits: ['通常・分散深化では貫通せず、集中深化を選ぶと追加貫通2が付きます。Lv8発展は基礎値の更新のみです。'],
  },
  anchor: {
    current: '指定した敵または向きへ通常の弾を放ちます。',
    condition: '対象の選択は通常の優先度と手動照準に従います。',
    limits: ['通常の単体弾です。Lv8発展は基礎値の更新のみです。'],
  },
  flare: {
    current: '指定した敵へ発射した時点で、その標的を4秒間燃焼中にします。',
    condition: '燃焼中の敵が倒れると、誘爆環があれば周囲へ爆発を出せます。',
    limits: ['燃焼は4秒で切れます。Lv8発展は基礎値の更新のみです。'],
  },
  cutter: {
    current: '指定方向へ弾を最大4発放ち、1発につき敵を最大3体へ順に当てます。',
    condition: '貫通弾は進行方向の敵へ順に当たります。',
    limits: ['通常は1発につき最大3体に当たり、集中深化で追加貫通2が付きます。Lv8発展は基礎値の更新のみです。'],
  },
  beacon: {
    current: '指定した敵へ発射した時点で、その標的を6秒間印付きにします。',
    condition: '印付きの敵が倒れると、誘爆環があれば周囲へ爆発を出せます。',
    limits: ['印は6秒で切れます。Lv8発展は基礎値の更新のみです。'],
  },
  nova: {
    current: '指定した敵へ重い弾を放ち、同じ位置を小範囲でも攻撃します。',
    condition: '発射時に範囲攻撃が起きるため、弾の到着を待たずに周囲へ届きます。',
    limits: ['爆縮発展は同じ位置の範囲攻撃をもう一度加えます。中心から広がる二段爆発ではありません。'],
  },
  harpoon: {
    current: '指定方向へ弾を最大4発放ち、1発につき敵を最大3体へ順に当てます。',
    condition: '貫通弾は進行方向の敵へ順に当たります。',
    limits: ['通常は1発につき最大3体に当たり、集中深化で追加貫通2が付きます。Lv8発展は基礎値の更新のみです。'],
  },
  vortex: {
    current: '指定した敵へ弾を放ち、発射時に標的の周囲も小範囲攻撃します。',
    condition: '弾の飛翔とは別に、標的の位置へ範囲攻撃が出ます。',
    limits: ['旋回発展は同じ位置の範囲攻撃をもう一度加えます。'],
  },
  ward: {
    current: '指定方向へ威力58%の弾を放ち、短い光線を表示します。',
    condition: '対象の選択は通常の優先度と手動照準に従います。',
    limits: ['弾の威力は通常の58%で、光線は短時間表示されます。Lv8発展は基礎値の更新のみです。'],
  },
  fan: {
    current: '指定方向へ角度を広げた弾を最大4発まとめて放ちます。',
    condition: '近い敵が多い方向を自動で優先します。',
    limits: ['同時に出る弾は最大4発です。Lv8発展は基礎値の更新のみです。'],
  },
  swell: {
    current: '指定した敵または向きへ弾を放ち、標的の周囲も同時に攻撃します。',
    condition: '標的を選んだ発射時に、標的の位置へ範囲攻撃が出ます。',
    limits: ['弾の飛翔とは別に範囲攻撃が出ます。Lv8発展は基礎値の更新のみです。'],
  },
  seeker: {
    current: '指定した敵または向きへ通常の弾を放ちます。',
    condition: '危険度の高い敵を優先しますが、発射後に弾は曲がりません。',
    limits: ['通常の単体弾です。Lv8発展は基礎値の更新のみです。'],
  },
  drill: {
    current: '指定方向へ重い弾を最大4発放ち、1発につき敵を最大3体へ順に当てます。',
    condition: '防護を持つ敵を優先して狙います。',
    limits: ['通常は1発につき最大3体に当たり、集中深化で追加貫通2が付きます。Lv8発展は基礎値の更新のみです。'],
  },
  mist: {
    current: '指定した敵へ弾を放ち、発射時に標的の周囲を約0.7秒減速させます。',
    condition: '減速中の敵へ導電環が接続されていれば、近くの敵へも短い減速が伝わります。',
    limits: ['減速領域は短時間で消えます。Lv8発展は基礎値の更新のみです。'],
  },
  spark: {
    current: '指定方向へ角度を少しずらした弾を最大4発まとめて放ちます。',
    condition: '近い敵や標識体・位相体を優先します。',
    limits: ['同時に出る弾は最大4発です。Lv8発展は基礎値の更新のみです。'],
  },
  coil: {
    current: '指定した敵または向きへ通常の弾を放ちます。',
    condition: '近い敵が多い方向を自動で優先します。',
    limits: ['通常の単体弾です。Lv8発展は基礎値の更新のみです。'],
  },
  bloom: {
    current: '指定した敵へ弾を放ち、発射時に標的の周囲も攻撃します。',
    condition: '敵がまとまった方向を自動で優先します。',
    limits: ['弾の飛翔とは別に範囲攻撃が出ます。Lv8発展は基礎値の更新のみです。'],
  },
  shuttle: {
    current: '指定方向へ反射する円盤を最大4発放ち、敵と外周で最大2回反射します。',
    condition: '円盤は敵に当たると跳ね返り、同じ敵にも待ち時間を置いて再び当たります。',
    limits: ['敵を貫通せず、反射回数は最大2回です。Lv8発展は基礎値の更新のみです。'],
  },
  siphon: {
    current: '指定した敵へ弾を放ち、発射時に標的の周囲を約0.7秒減速させます。',
    condition: '速い敵や予告中の敵を優先します。',
    limits: ['減速領域は短時間で消えます。Lv8発展は基礎値の更新のみです。'],
  },
  mirror: {
    current: '指定方向へ反射する円盤を最大4発放ち、敵と外周で最大2回反射します。',
    condition: '円盤は敵に当たると跳ね返り、同じ敵にも待ち時間を置いて再び当たります。',
    limits: ['敵を貫通せず、反射回数は最大2回です。Lv8発展は基礎値の更新のみです。'],
  },
  stasis: {
    current: '指定した敵へ弾を放ち、発射時に標的の周囲を約0.9秒減速させます。',
    condition: '修復体・造兵体・突進体を優先します。',
    limits: ['減速は停止ではなく、領域は短時間で消えます。Lv8発展は基礎値の更新のみです。'],
  },
  quake: {
    current: '指定した敵へ重い弾を最大4発放ち、発射時に標的の周囲も攻撃します。',
    condition: '近い敵がまとまった方向を優先します。',
    limits: ['弾の飛翔とは別に範囲攻撃が出ます。Lv8発展は基礎値の更新のみです。'],
  },
  spoke: {
    current: '指定方向へ角度を大きくずらした弾を最大4発まとめて放ちます。',
    condition: '標識体・投下体や近い集団を優先します。',
    limits: ['同時に出る弾は最大4発です。Lv8発展は基礎値の更新のみです。'],
  },
  hollow: {
    current: '指定した敵または向きへ弾を放ち、標的の周囲も同時に攻撃します。',
    condition: '護衛体・外殻体を優先します。',
    limits: ['弾の飛翔とは別に範囲攻撃が出ます。Lv8発展は基礎値の更新のみです。'],
  },
  snare: {
    current: '指定した敵へ弾を放ち、発射時に標的の周囲を約1.15秒減速させます。',
    condition: '突進体・走行体を優先します。',
    limits: ['減速領域は短時間で消えます。Lv8発展は基礎値の更新のみです。'],
  },
  chime: {
    current: '指定方向へ弾を最大4発まとめて放ちます。',
    condition: '位相体・標識体や近い集団を優先します。',
    limits: ['同時に出る弾は最大4発です。Lv8発展は基礎値の更新のみです。'],
  },
  thunder: {
    current: '指定した敵へ重い弾を放ち、発射時に標的の周囲を威力40%で攻撃します。',
    condition: '造兵体・修復体・投下体を優先します。',
    limits: ['弾の飛翔とは別に範囲攻撃が出ます。Lv8発展は基礎値の更新のみです。'],
  },
  frost: {
    current: '指定した敵へ弾を放ち、発射時に標的の周囲を約0.7秒減速させます。',
    condition: '突進体・走行体・護衛体を優先します。',
    limits: ['減速領域は短時間で消えます。Lv8発展は基礎値の更新のみです。'],
  },
  swarm: {
    current: '指定方向へ角度を広げた弾を最大4発まとめて放ちます。',
    condition: '近い集団や投下体・標識体を優先します。',
    limits: ['同時に出る弾は最大4発です。Lv8発展は基礎値の更新のみです。'],
  },
  counter: {
    current: '指定方向へ威力58%の弾を放ち、短い光線を表示します。',
    condition: '予告中の敵、投下体、ボスを優先します。',
    limits: ['弾の威力は通常の58%で、光線は短時間表示されます。Lv8発展は基礎値の更新のみです。'],
  },
  dive: {
    current: '指定方向へ弾を放ち、最大2体まで順に貫きます。',
    condition: '護衛体・外殻体・標識体を優先します。',
    limits: ['1発の追加貫通は1回です。集中深化を選ぶとさらに2回増えます。Lv8発展は基礎値の更新のみです。'],
  },
  axis: {
    current: '指定方向へ角度を広げた弾を最大4発まとめて放ちます。',
    condition: '近い集団や投下体・標識体を優先します。',
    limits: ['同時に出る弾は最大4発です。Lv8発展は基礎値の更新のみです。'],
  },
  seed: {
    current: '指定した敵または向きへ通常の弾を放ちます。',
    condition: '遠い敵、またはコアへ近すぎる敵を優先します。',
    limits: ['通常の単体弾です。Lv8発展は基礎値の更新のみです。'],
  },
  requiem: {
    current: '指定した敵へ重い弾を放ちます。',
    condition: 'ボス、または近い集団を優先します。',
    limits: ['重い単体弾です。Lv8発展は基礎値の更新のみです。'],
  },
};

const GLOBAL_SUPPORTS = new Set<SupportId>(['brink', 'ignite', 'veil']);

function clampLevel(level: number, max: number): number {
  return Math.max(1, Math.min(max, Number.isFinite(level) ? Math.floor(level) : 1));
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function number(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function supportModule(snapshot: SupportSnapshot): SupportModule {
  const module = new SupportModule(snapshot.id, snapshot.slot, snapshot.instanceId);
  module.level = clampLevel(snapshot.level, SUPPORTS[snapshot.id].maxLevel);
  return module;
}

function supportModules(snapshots: readonly SupportSnapshot[]): SupportModule[] {
  return snapshots.map(supportModule);
}

function weaponStatsText(id: WeaponId, level: number, precisionBonus = 0): string[] {
  const stats = WEAPONS[id].levels[level - 1] ?? WEAPONS[id].levels[0];
  const result = [`基礎威力 ${number(stats.damage)} / 発射間隔 ${number(stats.cooldown)}秒 / 射程 ${number(stats.range)}`];
  if (stats.projectileSpeed !== undefined) result.push(`弾速 ${number(stats.projectileSpeed)}`);
  if (stats.pierce !== undefined) result.push(`貫通 ${number(stats.pierce)}`);
  if (stats.count !== undefined) result.push(`同時数 ${number(stats.count)}`);
  const hasArea = ['cluster', 'repulse', 'orbit', 'shockwave', 'nova', 'vortex', 'quake', 'bloom', 'swell', 'hollow', 'thunder'].includes(id);
  const hasSlowField = ['mist', 'frost', 'snare', 'siphon', 'stasis'].includes(id);
  if (stats.radius !== undefined && (hasArea || hasSlowField)) result.push(`範囲半径 ${number(stats.radius)}`);
  if (stats.width !== undefined) result.push(`弾の大きさ ${number(stats.width)}`);
  if (id === 'lance' && stats.chargeTime !== undefined) result.push(`ため時間 ${number(stats.chargeTime)}秒`);
  if (id === 'mine' && stats.duration !== undefined) result.push(`機雷の寿命 ${number(stats.duration)}秒`);
  if (id === 'gravity' && stats.duration !== undefined) result.push(`重力点の寿命 ${number(stats.duration)}秒`);
  if (id === 'drone' && stats.duration !== undefined) result.push(`子機の寿命 ${number(stats.duration)}秒`);
  if (hasSlowField && stats.duration !== undefined) result.push(`減速領域の寿命 最大${number(Math.min(3, stats.duration * 0.45))}秒`);
  if (precisionBonus > 0) result.push(`照準強化 +${Math.round(Math.min(2, precisionBonus) * 6)}%`);
  return result;
}

function supportValueText(id: SupportId, module: SupportModule, total: { primary: number; secondary: number }): string {
  switch (id) {
    case 'output': return `威力 +${percent(total.primary)}（合計上限40%）`;
    case 'rhythm': return `発射間隔 -${percent(total.primary)}（合計上限30%）`;
    case 'branch': return `${number(total.primary)}回ごとに威力50%の追加射撃`;
    case 'focus': return `射程 +${percent(total.primary)} / 弾速 +${percent(total.secondary)}`;
    case 'observe': return `特定の敵への威力 +${percent(total.primary)}（合計上限45%）`;
    case 'brake': return `押し戻し・減速時間 +${percent(total.primary)}（合計上限45%）`;
    case 'relay': return `中継先を含む武器の威力 +${percent(total.primary)}（合計上限30%）`;
    case 'repair': return `迎撃時の回復 +${number(total.primary)}（機雷爆発は最大2）`;
    case 'shatter': return `盾への威力 +${percent(total.primary)} / 命中ごとに追加破砕1枚`;
    case 'conductive': return `減速を周囲${Math.min(2, Math.max(1, Math.floor(total.secondary)))}体へ伝える`;
    case 'ignite': return `印・燃焼撃破時に構成内で最初の武器のその時点の威力の${percent(Math.min(0.35, total.primary * 0.55))} / 半径${number(Math.min(60, Math.max(24, total.secondary)))}`;
    case 'brink': return `コア30%以下で威力 +${percent(total.primary)}`;
    case 'anchor': return `重力点・機雷・子機の時間 +${percent(total.primary)}`;
    case 'veil': return `コア被害 -${percent(total.secondary)} / 接続武器の威力 -${percent(total.secondary)}`;
    case 'vector': return `手動照準中の接続武器の威力 +${percent(total.primary)}（自動照準中は0%）`;
    case 'pulse': return `${number(module.secondaryValue)}秒ごとに威力${percent(Math.min(0.5, module.value * 0.55))}・半径34の補助波`;
    case 'reserve': return `蓄圧槍のため時間を最大${number(Math.min(0.24, total.primary * 0.08))}秒短縮`;
    case 'lattice': return `迎撃格子の同時迎撃 +${Math.min(3, Math.max(0, Math.floor(total.primary)))}（最大4）`;
    case 'orbit': return `周回半径 +${percent(total.primary)} / 回転速度 +約${Math.round(Math.min(0.25, total.primary * 0.7) * 100)}%`;
    case 'catalyst': return `減速中の標識体・位相体・ボスへ威力 +${percent(total.primary)}`;
  }
}

function supportApplicability(weaponId: WeaponId, supportId: SupportId, weapon: WeaponSnapshot | undefined): string | null {
  switch (supportId) {
    case 'brake':
      if (weaponId === 'repulse') return '押し戻し距離と減速時間に働きます。';
      if (weaponId === 'gravity') return '重力点の減速時間に働きます。';
      if (weaponId === 'cluster' && weapon?.branch === 'residue') return '残留型の減速領域に働きます。';
      return null;
    case 'repair':
      if (weaponId === 'grid') return '敵弾を消したときに回復します。';
      if (weaponId === 'mine') return '機雷が爆発したときに回復します。';
      return null;
    case 'anchor': return ['gravity', 'mine', 'drone'].includes(weaponId) ? '持続する重力点・機雷・子機の時間に働きます。' : null;
    case 'lattice': return weaponId === 'grid' ? '迎撃格子の一度の迎撃数に働きます。' : null;
    case 'orbit': return weaponId === 'orbit' ? '周回刃の半径と回転に働きます。' : null;
    case 'reserve': return weaponId === 'lance' ? '蓄圧槍のため時間に働きます。' : null;
    case 'ignite': return '配置場所に関係なく、印または燃焼中の敵を倒すと働きます。';
    case 'brink': return '配置場所に関係なく、コア耐久30%以下で働きます。';
    case 'veil': return '接続中は武器の威力が下がり、配置中はコアの被害も軽減します。';
    case 'vector': return '手動照準中の接続武器の威力に加算されます。自動照準中は働きません。';
    case 'pulse': return '接続武器のうち、構成上で先に並ぶ一つが補助波を受けます。';
    case 'observe': return '外殻・標識体・投下体・位相体・護衛体・ボスへの命中時だけ加算されます。';
    case 'shatter': return '格子体・護衛体の盾へ命中したときだけ、盾を追加で1枚削ります。';
    case 'conductive': return '減速中の敵へ命中したとき、近くの敵へ減速を伝えます。';
    case 'catalyst': return '減速中の標識体・位相体・ボスへ命中したときだけ加算されます。';
    case 'branch': return '発射回数が指定値に達したとき、威力50%の追加射撃が出ます。';
    case 'output': return '接続中の武器の基礎威力に加算されます。';
    case 'rhythm': return '接続中の武器の発射間隔を短くします。';
    case 'focus': return '接続中の武器の射程と弾速を高めます。';
    case 'relay': return '左右と、2層目以降の同じ向きの内側武器へ出力を中継します。';
  }
}

function weaponHelp(input: WeaponId | WeaponSnapshot, supports: readonly SupportSnapshot[], allWeapons: readonly WeaponSnapshot[] = []): EquipmentHelp {
  const state = typeof input === 'string' ? undefined : input;
  const id: WeaponId = typeof input === 'string' ? input : input.id;
  const definition = WEAPONS[id];
  const level = clampLevel(state?.level ?? 1, definition.maxLevel);
  const notes = RUNTIME_WEAPON_NOTES[id];
  const modules = supportModules(supports);
  const effects = weaponStatsText(id, level, state?.precisionBonus ?? 0);
  const conditions = [notes.condition];
  const limits = [...notes.limits];
  const connections: string[] = [];
  const synergies: string[] = [];
  const igniteSource = allWeapons[0];
  const igniteSourceName = igniteSource ? WEAPONS[igniteSource.id].name : '構成内で最初の武器';
  const connected = supports.filter((support) => {
    const module = supportModule(support);
    return module.affectsWeaponSlot(state?.slot ?? -1);
  });
  const seen = new Set<SupportId>();
  for (const support of connected) {
    const module = supportModule(support);
    const applicability = supportApplicability(id, support.id, state);
    const total = supportEffectsFor(modules, support.id, state?.slot ?? -1);
    const connectionDetail = applicability
      ? supportValueText(support.id, module, total)
      : '接続されていますが、この武器には作用しません。';
    connections.push(`${SUPPORTS[support.id].name} Lv${module.level}: ${connectionDetail}`);
    if (applicability && !seen.has(support.id)) synergies.push(`${SUPPORTS[support.id].name}: ${applicability}`);
    if (!applicability && !GLOBAL_SUPPORTS.has(support.id) && !seen.has(support.id)) limits.push(`${SUPPORTS[support.id].name}は、この武器では固有の発動条件がありません。`);
    seen.add(support.id);
  }
  const globalVeil = supports.filter((support) => support.id === 'veil');
  if (globalVeil.length > 0 && !connected.some((support) => support.id === 'veil')) synergies.push('薄幕環: 配置中はコアの接触・遠隔弾の被害を軽減します（この武器の威力は下がりません）。');
  if (supports.some((support) => support.id === 'brink') && !connected.some((support) => support.id === 'brink')) synergies.push('背水環: 配置中はコア耐久30%以下で、この武器の威力が上がります。');
  if (supports.some((support) => support.id === 'ignite') && !connected.some((support) => support.id === 'ignite')) synergies.push(`誘爆環: 配置中は印・燃焼中の敵を倒したとき、${igniteSourceName}のその時点の威力を基準に周囲へ爆発します。`);
  if (connected.filter((support) => support.id === 'pulse').length > 0) {
    const pulse = connected.find((support) => support.id === 'pulse');
    const first = allWeapons.find((weapon) => supportModule(pulse!).affectsWeaponSlot(weapon.slot));
    if (first && state && first.instanceId !== state.instanceId) conditions.push(`脈動環の補助波は、先に並ぶ${WEAPONS[first.id].name}が受けます。`);
  }
  if (state?.branch) {
    const branch = definition.branches.find((item) => item.id === state.branch && item.atLevel === 3);
    if (branch) effects.push(`分岐「${branch.name}」: ${branch.description}`);
  } else effects.push('Lv3分岐: 未選択');
  if (state?.finalBranch) {
    const branch = definition.branches.find((item) => item.id === state.finalBranch && item.atLevel === 5);
    if (branch) effects.push(`Lv5「${branch.name}」: ${branch.description}`);
  } else effects.push('Lv5分岐: 未選択');
  if (state?.evolutionId) {
    const form = definition.evolutions.find((item) => item.id === state.evolutionId);
    if (form) effects.push(`Lv8「${form.name}」: ${form.description}`);
  } else effects.push(`Lv8発展: ${definition.evolutions[0]?.name ?? 'なし'}（未選択）`);
  return {
    kind: 'weapon', id, name: definition.name, role: definition.role,
    summary: definition.description, current: notes.current,
    effects, conditions, limits,
    connections: connections.length > 0 ? connections : ['接続中の補助はありません。'],
    synergies: synergies.length > 0 ? synergies : ['この構成で確認できる追加の相乗効果はありません。'],
  };
}

function supportHelp(input: SupportId | SupportSnapshot, weapons: readonly WeaponSnapshot[]): EquipmentHelp {
  const state = typeof input === 'string' ? undefined : input;
  const id: SupportId = typeof input === 'string' ? input : input.id;
  const definition = SUPPORTS[id];
  const level = clampLevel(state?.level ?? 1, definition.maxLevel);
  const module = state ? supportModule(state) : new SupportModule(id, 0);
  module.level = level;
  const slots = supportWeaponSlots(id, state?.slot ?? 0);
  const connected = slots.map((slot) => weapons.find((weapon) => weapon.slot === slot)).filter((weapon): weapon is WeaponSnapshot => weapon !== undefined);
  const adjacent = adjacentWeaponSlots(state?.slot ?? 0);
  const physicalConnections = connected.length > 0
    ? connected.map((weapon) => `${adjacent.includes(weapon.slot) ? '左右' : '内側'}: ${WEAPONS[weapon.id].name}（面${weapon.slot + 1}）`)
    : [];
  const connections = GLOBAL_SUPPORTS.has(id)
    ? ['配置全体に作用（武器への接続は不要）', ...physicalConnections]
    : physicalConnections.length > 0 ? physicalConnections : ['接続先の武器はありません。'];
  const total = supportEffectsFor([module], id, state?.slot ?? 0);
  const effects = [supportValueText(id, module, total)];
  const conditions: string[] = [];
  const limits: string[] = [];
  const synergies: string[] = [];
  switch (id) {
    case 'ignite': conditions.push('印または燃焼が残る敵の撃破時。配置場所や隣接は問いません。'); limits.push('敵1体につき一度だけ。範囲は最大60。'); break;
    case 'brink': conditions.push('コア耐久が最大値の30%以下の間。配置場所や隣接は問いません。'); limits.push('威力だけを高め、被害軽減や回復停止はしません。'); break;
    case 'veil': conditions.push('配置中はコアへの接触・遠隔弾の被害を軽減。隣接時は武器威力にも代償があります。'); limits.push('無敵にはならず、同じ割合の威力低下があります。'); break;
    case 'branch': conditions.push('接続武器の発射回数が指定値に達したとき。'); limits.push('追加射撃はさらに分岐を呼びません。'); break;
    case 'repair': conditions.push('迎撃格子が敵弾を消す、または軌道機雷が爆発したとき。'); limits.push('回復はコア最大値を超えず、機雷爆発は最大2です。'); break;
    case 'shatter': conditions.push('格子体・護衛体の盾へ命中したとき。'); limits.push('追加で削る盾は命中ごとに1枚。外殻には働きません。'); break;
    case 'conductive': conditions.push('減速中の敵へ命中したとき。'); limits.push(`近くへ伝わるのは最大${Math.min(2, Math.max(1, Math.floor(total.secondary)))}体。印や燃焼は伝えません。`); break;
    case 'pulse': conditions.push('接続先のうち、構成で先に並ぶ武器を一つ選び、指定周期で標的の周囲を攻撃。'); limits.push('補助波から別の補助波は生まれません。'); break;
    case 'reserve': conditions.push('蓄圧槍のため時間を判定するとき。'); limits.push('ため時間は0.8秒未満になりません。'); break;
    case 'lattice': conditions.push('迎撃格子へ接続したとき。'); limits.push('一度に消せる敵弾は最大4発です。'); break;
    case 'orbit': conditions.push('周回刃へ接続したとき。'); limits.push('往復弾やほかの移動経路には働きません。'); break;
    case 'anchor': conditions.push('重力点・軌道機雷・追尾子機を生成したとき。'); limits.push('生成位置や同時数は変えません。'); break;
    case 'brake': conditions.push('反発輪、重力点、残留型の減速領域が働くとき。'); limits.push('ほかの武器の弾には働きません。'); break;
    case 'observe': conditions.push('外殻・標識体・投下体・位相体・護衛体・ボスへ命中したとき。'); limits.push('通常の敵には加算されません。'); break;
    case 'catalyst': conditions.push('減速中の標識体・位相体・ボスへ命中したとき。'); limits.push('状態を消費せず、追加範囲攻撃も出しません。'); break;
    case 'vector': conditions.push('手動照準中に接続武器が攻撃するとき。自動照準中は働きません。'); limits.push('対象選択や指定方向は変わりません。'); break;
    case 'output': conditions.push('左右または継電環の中継先へ接続中。'); limits.push('同じ武器への合計は40%までです。'); break;
    case 'rhythm': conditions.push('左右へ接続中。'); limits.push('同じ武器への合計短縮は30%までです。'); break;
    case 'focus': conditions.push('左右へ接続中。'); limits.push('射程は35%、弾速は44%まで重なります。'); break;
    case 'relay': conditions.push('2層目以降で内側の同じ向きの武器があるとき、中継先が増えます。'); limits.push('中継は1経路だけで、別の継電環を連鎖しません。'); break;
    default: break;
  }
  for (const weapon of connected) {
    const applicability = supportApplicability(weapon.id, id, weapon);
    if (applicability) synergies.push(`${WEAPONS[weapon.id].name}: ${applicability}`);
    else if (!GLOBAL_SUPPORTS.has(id)) synergies.push(`${WEAPONS[weapon.id].name}: この武器では固有の発動条件がありません。`);
  }
  if (connected.length === 0 && !GLOBAL_SUPPORTS.has(id)) conditions.push('接続武器がないため、今は発動しません。');
  if (id === 'ignite' || id === 'brink' || id === 'veil') synergies.push('この補助は配置全体にも働くため、隣接武器がなくても上記の全体効果は発動します。');
  if (id === 'ignite' && weapons[0]) synergies.push(`爆発は構成内で最初の${WEAPONS[weapons[0].id].name}の、その時点の威力を基準にします。`);
  return {
    kind: 'support', id, name: definition.name, role: definition.role,
    summary: definition.description,
    current: `Lv${level}/${definition.maxLevel}: ${definition.levels[level - 1]?.label ?? ''}`,
    effects, conditions, limits, connections,
    synergies: synergies.length > 0 ? synergies : ['接続中の武器との追加相乗効果はありません。'],
  };
}

/** Build explanations from the exact installed weapon/support snapshot. */
export function getEquipmentHelp(snapshot: Pick<BattleSnapshot, 'weapons' | 'supports'>): EquipmentHelpBundle {
  return {
    weapons: snapshot.weapons.map((weapon) => weaponHelp(weapon, snapshot.supports, snapshot.weapons)),
    supports: snapshot.supports.map((support) => supportHelp(support, snapshot.weapons)),
  };
}

/** Explain a weapon by id or by its installed snapshot. */
export function getWeaponHelp(input: WeaponId | WeaponSnapshot, supports: readonly SupportSnapshot[] = [], weapons: readonly WeaponSnapshot[] = []): EquipmentHelp {
  return weaponHelp(input, supports, weapons);
}

/** Explain a support by id or by its installed snapshot. */
export function getSupportHelp(input: SupportId | SupportSnapshot, weapons: readonly WeaponSnapshot[] = []): EquipmentHelp {
  return supportHelp(input, weapons);
}

/** Alias names make the snapshot-oriented API easy to discover from UI code. */
export const weaponHelpForSnapshot = getWeaponHelp;
export const supportHelpForSnapshot = getSupportHelp;

/** Render the same structured copy as a compact, accessible card. */
export function renderEquipmentHelp(help: EquipmentHelp): HTMLElement {
  const card = element('article', 'equipment-help');
  card.append(element('h4', 'equipment-help-title', help.name));
  card.append(element('p', 'equipment-help-role', help.role));
  card.append(element('p', 'equipment-help-summary', help.summary));
  card.append(element('p', 'equipment-help-current', help.current));
  appendSection(card, 'いまの動き', help.effects);
  appendSection(card, '発動条件', help.conditions);
  appendSection(card, '接続', help.connections);
  appendSection(card, '相乗効果', help.synergies);
  appendSection(card, '制約', help.limits);
  return card;
}

function appendSection(parent: HTMLElement, title: string, lines: readonly string[]): void {
  if (lines.length === 0) return;
  const section = element('section', 'equipment-help-section');
  section.append(element('h5', '', title));
  const list = element('ul', 'equipment-help-list');
  for (const line of lines) list.append(element('li', '', line));
  section.append(list);
  parent.append(section);
}
