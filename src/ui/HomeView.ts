import type { SaveData } from '../types/save';
import { button, card, element, heading, isValidPlayerName, pageShell } from './viewUtils';

export interface HomeActions {
  start: () => void;
  changeName?: (name: string) => void;
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
  const greeting = element('p', 'hero-copy', save.profile.name ? `${save.profile.name}さん、コアを守りましょう。` : 'コアを守りましょう。');
  const label = element('label', 'field-label', '名前（任意）');
  const input = element('input', 'name-input');
  input.id = 'player-name'; input.type = 'text'; input.value = save.profile.name;
  input.setAttribute('autocomplete', 'nickname'); input.placeholder = '空欄でも遊べます';
  label.htmlFor = input.id;
  input.setAttribute('aria-describedby', 'name-help name-error');
  const help = element('p', 'field-help', '名前を入力すると、名前と記録がランキングに公開されます。空欄でも遊べます。'); help.id = 'name-help';
  const error = element('p', 'form-error'); error.id = 'name-error'; error.setAttribute('role', 'alert');
  const update = (): void => {
    const name = input.value.trim(); const valid = name === '' || isValidPlayerName(name);
    start.disabled = !valid; error.textContent = valid ? '' : '名前は20文字以内で入力してください。';
    if (valid) { actions.changeName?.(name); greeting.textContent = name ? `${name}さん、コアを守りましょう。` : 'コアを守りましょう。'; }
  };
  input.addEventListener('input', (event) => { if (!(event as InputEvent).isComposing) update(); });
  input.addEventListener('compositionend', update);
  // Enter never starts a run from this field, including Japanese IME confirmation.
  hero.append(title, greeting, label, input, help, error, start);
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
    const shareButton = button('Xでシェア');
    shareButton.dataset.testid = 'share-home';
    shareButton.addEventListener('click', actions.share);
    actionsGrid.append(shareButton);
  }
  if (actionsGrid.childElementCount > 0) shell.append(actionsGrid);

  const external = element('a', 'experiment-link', 'ランキング');
  external.href = 'https://chameleonjp-lab.github.io/chameleonjp_lab/ranking.html?game=kakomare';
  external.target = '_blank';
  external.rel = 'noopener noreferrer';
  shell.append(external);
  return shell;
}
