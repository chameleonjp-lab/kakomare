import type { SaveData } from '../types/save';
import { button, card, element, heading, pageShell } from './viewUtils';

export interface HomeActions {
  start: () => void;
  stages: () => void;
  settings: () => void;
  rules: () => void;
  share: () => void;
}

export function createHomeView(save: SaveData, actions: HomeActions): HTMLElement {
  const shell = pageShell('カコマレ', '六方向から迫る敵を防ぎ、装置を組み上げる全方位防衛ゲーム。');
  const hero = card('hero-card');
  const title = heading('防衛を始める', 2);
  title.className = 'hero-title';
  const start = button('ゲーム開始', 'button button-primary button-large');
  start.dataset.testid = 'start-game';
  start.addEventListener('click', actions.start);
  hero.append(title, element('p', 'hero-copy', `${save.profile.name}さん、コアを守りましょう。`), start);
  shell.append(hero);

  const stats = card('summary-card');
  stats.append(heading('現在の記録', 2));
  const stageBest = save.records.stageBest['stage-1'];
  stats.append(element('p', 'summary-line', `ステージ1最高得点: ${stageBest?.bestScore ?? 0}`));
  stats.append(element('p', 'summary-line', `プレイ回数: ${save.statistics.playCount}`));
  shell.append(stats);

  const actionsGrid = element('div', 'action-grid');
  const stageButton = button('ステージ選択');
  stageButton.addEventListener('click', actions.stages);
  const researchButton = button('研究（次の実装で追加）');
  researchButton.disabled = true;
  researchButton.title = 'PR 2で追加予定です';
  const rulesButton = button('遊び方');
  rulesButton.addEventListener('click', actions.rules);
  const settingsButton = button('設定');
  settingsButton.addEventListener('click', actions.settings);
  const shareButton = button('ホームを共有');
  shareButton.addEventListener('click', actions.share);
  actionsGrid.append(stageButton, researchButton, rulesButton, settingsButton, shareButton);
  shell.append(actionsGrid);

  const external = element('a', 'experiment-link', 'カメレオンJPの実験場');
  external.href = 'https://chameleonjp-lab.github.io/chameleonjp_lab/';
  external.target = '_blank';
  external.rel = 'noopener noreferrer';
  shell.append(external);
  return shell;
}
