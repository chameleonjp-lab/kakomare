import { button, card, element, heading, pageShell } from './viewUtils';

export function createRulesView(onBack: () => void): HTMLElement {
  const shell = pageShell('遊び方', '無限モードは、1プレイの得点を競う防衛戦です。');

  const goal = card('rules-card');
  goal.append(heading('まずはコアを守る', 2));
  goal.append(element('p', '', 'コアは画面中央に固定されています。敵が外周の六方向から近づき、コアの耐久力が0になるとプレイ終了です。制限時間はありません。'));
  goal.append(element('p', '', '装置は自動で攻撃します。撃破数、危険度の高い敵やボスの処理、挑戦の達成でスコアが増えます。'));
  goal.append(element('p', '', '新しいプレイは毎回同じ初期条件で始まり、前のプレイの装置や研究は持ち越しません。'));
  shell.append(goal);

  const aim = card('rules-card');
  aim.append(heading('狙い方', 2));
  aim.append(element('p', '', '戦場を1本指でドラッグすると、指を動かした方向を手動照準にします。照準方向の左右30度以内にいる敵を優先し、指を離したあとも0.8秒だけ続きます。'));
  aim.append(element('p', '', '手動照準の時間が終わると自動照準へ戻ります。危険な敵弾や予告線が見えた方向へ照準を向けてください。'));
  shell.append(aim);

  const upgrades = card('rules-card');
  upgrades.append(heading('敵を倒して装置を強化', 2));
  upgrades.append(element('p', '', '敵を倒すと経験値がたまり、強化候補が3つ表示されます。戦闘は停止するので、既存装置は候補を1回タップ、新しい武器や補助は候補カードの空き面ボタンを1回タップして確定します。'));
  upgrades.append(element('p', '', '補助は線でつながった武器を助けます。配置する面で効果範囲が変わるため、装置の線も確認してください。'));
  upgrades.append(element('p', '', '面が満杯でも、強化候補から武器は別の武器へ、補助は別の補助へ交換できます。新しい装置のレベルは外した装置を引き継ぎますが、最大Lv3までです。元の分岐・照準強化・発展は引き継ぎません。'));
  upgrades.append(element('p', '', '一時停止中の「位置を入れ替える」は、装備を変えずに同じ種類の装置の面だけを移動・交換する操作です。別の武器や補助へ変えるときは強化候補を使います。'));
  upgrades.append(element('p', '', '候補は引き直しと除外をそれぞれ2回まで使えます。3回続けて強化したあとは、続けて選ぶか、保留して戦闘へ戻るかを選べます。'));
  shell.append(upgrades);

  const enemies = card('rules-card');
  enemies.append(heading('敵の予告を読む', 2));
  enemies.append(element('p', '', '敵ごとに速度、盾、分裂、修復、遠隔攻撃などの役割が異なります。色だけでなく輪郭と予告表示も確認してください。'));
  enemies.append(element('p', '', '盾のある敵の周りには、区切りのある輪を表示します。明るく残っている区切りが盾の残り枚数です。格子盾は8枚、護衛盾は4枚から減り、すべて暗くなると盾がなくなります。上の細い棒は本体の耐久力です。'));
  enemies.append(element('p', '', '時間が進むと危険度が上がり、方向集中波やボスが予告付きで出現します。予告線が出たら、その方向へ手動照準を合わせるか、迎撃・減速できる装置で備えます。'));
  shell.append(enemies);

  const back = button('ホームへ戻る');
  back.addEventListener('click', onBack);
  shell.append(back);
  return shell;
}
