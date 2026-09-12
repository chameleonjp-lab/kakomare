import type { SaveData } from '../types/save';
import { button, card, element, heading, pageShell } from './viewUtils';

export interface HomeActions {
  start: () => void;
  resume?: () => void;
  /** Optional secondary navigation kept for hosts that expose preferences. */
  settings?: () => void;
  rules?: () => void;
  share?: () => void;
  /** Legacy routes are accepted by older hosts but are no longer rendered. */
  stages?: () => void;
  research?: () => void;
}

export function createHomeView(save: SaveData, actions: HomeActions): HTMLElement {
  const shell = pageShell('カコマレ', '六方向から迫る敵を防ぎ、無限モードでどこまでスコアを伸ばせるか挑戦します。');
  const hero = card('hero-card');
  const title = heading('無限モードに挑戦', 2);
  title.className = 'hero-title';
  const start = button('プレイする', 'button button-primary button-large');
  start.dataset.testid = 'start-game';
  start.addEventListener('click', actions.start);
  hero.append(title, element('p', 'hero-copy', `${save.profile.name}さん、コアを守りましょう。`), start);
  if (actions.resume) {
    const resume = button('中断したプレイを再開', 'button button-secondary button-large');
    resume.dataset.testid = 'resume-saved-run';
    resume.addEventListener('click', actions.resume);
    hero.append(resume);
  }
  shell.append(hero);

  const actionsGrid = element('div', 'action-grid');
  if (actions.rules) {
    const rulesButton = button('遊び方');
    rulesButton.addEventListener('click', actions.rules);
    actionsGrid.append(rulesButton);
  }
  if (actions.settings) {
    const settingsButton = button('設定');
    settingsButton.addEventListener('click', actions.settings);
    actionsGrid.append(settingsButton);
  }
  if (actions.share) {
    const shareButton = button('ゲームを共有');
    shareButton.dataset.testid = 'share-home';
    shareButton.addEventListener('click', actions.share);
    actionsGrid.append(shareButton);
  }
  if (actionsGrid.childElementCount > 0) shell.append(actionsGrid);

  const external = element('a', 'experiment-link', 'カメレオンJPの実験場');
  external.href = 'https://chameleonjp-lab.github.io/chameleonjp_lab/';
  external.target = '_blank';
  external.rel = 'noopener noreferrer';
  shell.append(external);
  return shell;
}
