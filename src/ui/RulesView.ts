import { button, card, element, heading, pageShell } from './viewUtils';

export function createRulesView(onBack: () => void): HTMLElement {
  const shell = pageShell('遊び方', '戦闘中は、見る場所を絞って操作します。');
  const basics = card('rules-card');
  basics.append(heading('1回タップと1本指のドラッグ', 2));
  basics.append(element('p', '', '装置は自動で攻撃します。戦場をドラッグすると、その方向を0.8秒だけ優先して狙います。指を離すと自動照準へ戻ります。'));
  basics.append(element('p', '', '敵を倒して強化候補を出し、候補を1回タップして装置を育てます。'));
  shell.append(basics);
  const enemies = card('rules-card');
  enemies.append(heading('敵の見分け方', 2));
  enemies.append(element('p', '', '小片は標準、針走りは高速、格子盾は攻撃回数の盾、胞子体は倒したあと2体に分かれます。色だけでなく輪郭も変わります。'));
  shell.append(enemies);
  const back = button('ホームへ戻る');
  back.addEventListener('click', onBack);
  shell.append(back);
  return shell;
}
