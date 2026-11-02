import { translate as t } from '../services/TranslationService';
import { languageService } from '../services/LanguageService';
import { createLanguageSelect } from './LanguageSelect';
import type { SaveData } from '../types/save';
import { button, card, element, heading, isValidPlayerName, pageShell } from './viewUtils';

export interface HomeActions {
  start: () => void;
  changeLanguage?: (language: string) => void;
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
  const shell = pageShell(t('home.title'), t('home.description'));
  const hero = card('hero-card');
  const title = heading(t('home.challenge'), 2);
  title.className = 'hero-title';
  const start = button(t('home.play'), 'button button-primary button-large');
  start.dataset.testid = 'start-game';
  start.addEventListener('click', actions.start);
  const greeting = element('p', 'hero-copy', save.profile.name ? t('home.greeting', { name: save.profile.name }) : t('home.protect'));
  const label = element('label', 'field-label', t('home.optionalName'));
  const input = element('input', 'name-input');
  input.id = 'player-name'; input.type = 'text'; input.value = save.profile.name;
  input.setAttribute('autocomplete', 'nickname'); input.placeholder = t('home.namePlaceholder');
  label.htmlFor = input.id;
  input.setAttribute('aria-describedby', 'name-help name-error');
  const help = element('p', 'field-help', t('home.nameHelp')); help.id = 'name-help';
  const error = element('p', 'form-error'); error.id = 'name-error'; error.setAttribute('role', 'alert');
  let composing = false;
  let pendingLanguage: string | null = null;
  const update = (): void => {
    const name = input.value.trim(); const valid = name === '' || isValidPlayerName(name);
    start.disabled = !valid; error.textContent = valid ? '' : t('home.nameError');
    if (valid) { actions.changeName?.(name); greeting.textContent = name ? t('home.greeting', { name }) : t('home.protect'); }
  };
  input.addEventListener('input', (event) => { if (!(event as InputEvent).isComposing) update(); });
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => {
    composing = false;
    if (pendingLanguage) { const next = pendingLanguage; pendingLanguage = null; requestLanguage(next); } else update();
  });
  const requestLanguage = (language: string): void => {
    if (composing) { pendingLanguage = language; return; }
    update();
    if (start.disabled) {
      const select = shell.querySelector<HTMLSelectElement>('[data-testid="language-select"]');
      if (select) select.value = languageService.language;
      return;
    }
    actions.changeLanguage?.(language);
  };
  if (actions.changeLanguage) shell.append(createLanguageSelect(requestLanguage));
  // Enter never starts a run from this field, including Japanese IME confirmation.
  hero.append(title, greeting, label, input, help, error, start);
  if (actions.resume) {
    const resume = button(t('home.resume'), 'button button-secondary button-large');
    resume.dataset.testid = 'resume-saved-run';
    resume.addEventListener('click', actions.resume);
    hero.append(resume);
  }
  shell.append(hero);

  const actionsGrid = element('div', 'action-grid');
  if (actions.rules) {
    const rulesButton = button(t('common.rules'));
    rulesButton.addEventListener('click', actions.rules);
    actionsGrid.append(rulesButton);
  }
  if (actions.settings) {
    const settingsButton = button(t('common.settings'));
    settingsButton.addEventListener('click', actions.settings);
    actionsGrid.append(settingsButton);
  }
  if (actions.share) {
    const shareButton = button(t('common.share'));
    shareButton.dataset.testid = 'share-home';
    shareButton.addEventListener('click', actions.share);
    actionsGrid.append(shareButton);
  }
  if (actionsGrid.childElementCount > 0) shell.append(actionsGrid);

  const external = element('a', 'experiment-link', t('common.ranking'));
  external.href = 'https://chameleonjp-lab.github.io/chameleonjp_lab/ranking.html?game=kakomare';
  external.target = '_blank';
  external.rel = 'noopener noreferrer';
  shell.append(external);
  return shell;
}

