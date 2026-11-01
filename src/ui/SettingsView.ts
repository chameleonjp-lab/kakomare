import { translate as t } from '../services/TranslationService';
import { createLanguageSelect } from './LanguageSelect';
import type { SaveData } from '../types/save';
import { button, card, element, heading, isValidPlayerName, pageShell } from './viewUtils';

export interface SettingsActions {
  change: (patch: Partial<SaveData['settings']>) => void;
  changeName: (name: string) => void;
  changeLanguage?: (language: string) => void;
  /** Legacy save-data actions remain accepted by older hosts, but are hidden. */
  exportSave?: () => void;
  copyDamaged?: () => void;
  hasDamagedSave?: boolean;
  importSave?: (raw: string) => void;
  reset?: () => void;
  back: () => void;
}

export function createSettingsView(save: SaveData, actions: SettingsActions): HTMLElement {
  const shell = pageShell(t('common.settings'), t('settings.description'));
  if (actions.changeLanguage) shell.append(createLanguageSelect(actions.changeLanguage));
  const settingsCard = card('settings-card');
  settingsCard.append(heading(t('settings.game'), 2));
  const nameRow = element('label', 'setting-row', t('common.name'));
  const nameInput = element('input') as HTMLInputElement;
  nameInput.id = 'settings-name';
  nameInput.type = 'text'; nameInput.value = save.profile.name; nameInput.setAttribute('autocomplete', 'nickname'); nameInput.setAttribute('aria-label', t('common.playerName'));
  nameInput.addEventListener('change', () => { const name = nameInput.value.trim(); if (name === '' || isValidPlayerName(name)) actions.changeName(name); else nameInput.value = save.profile.name; });
  nameRow.append(nameInput); settingsCard.append(nameRow);

  const sound = element('label', 'setting-row', t('settings.sound'));
  const soundValue = element('output', 'setting-value', `${save.settings.audio}`);
  const soundInput = element('input') as HTMLInputElement;
  soundInput.id = 'settings-audio';
  soundInput.type = 'range'; soundInput.min = '0'; soundInput.max = '100'; soundInput.value = String(save.settings.audio); soundInput.setAttribute('aria-label', t('settings.soundVolume'));
  soundInput.addEventListener('input', () => { soundValue.textContent = soundInput.value; actions.change({ audio: Number(soundInput.value) }); });
  sound.append(soundInput, soundValue);

  const music = element('label', 'setting-row', t('settings.music'));
  const musicValue = element('output', 'setting-value', `${save.settings.music}`);
  const musicInput = element('input') as HTMLInputElement;
  musicInput.id = 'settings-music';
  musicInput.type = 'range'; musicInput.min = '0'; musicInput.max = '100'; musicInput.value = String(save.settings.music); musicInput.setAttribute('aria-label', t('settings.musicVolume'));
  musicInput.addEventListener('input', () => { musicValue.textContent = musicInput.value; actions.change({ music: Number(musicInput.value) }); });
  music.append(musicInput, musicValue);

  const effects = element('label', 'setting-row', t('settings.effects'));
  const effectsInput = element('select') as HTMLSelectElement;
  effectsInput.id = 'settings-effects'; effectsInput.setAttribute('aria-label', t('settings.effects'));
  for (const [value, label] of [['standard', t('settings.standard')], ['low', t('settings.low')], ['minimum', t('settings.minimum')]] as const) {
    const option = element('option', '', label) as HTMLOptionElement;
    option.value = value; option.selected = save.settings.effects === value; effectsInput.append(option);
  }
  effectsInput.addEventListener('change', () => actions.change({ effects: effectsInput.value as SaveData['settings']['effects'] }));
  effects.append(effectsInput);

  const motion = element('label', 'check-row');
  const motionInput = element('input') as HTMLInputElement;
  motionInput.id = 'settings-reduced-motion';
  motionInput.type = 'checkbox'; motionInput.checked = save.settings.reducedMotion;
  motionInput.addEventListener('change', () => actions.change({ reducedMotion: motionInput.checked }));
  motion.append(motionInput, element('span', '', t('settings.reduceMotion')));
  const shake = element('label', 'check-row');
  const shakeInput = element('input') as HTMLInputElement;
  shakeInput.id = 'settings-screen-shake';
  shakeInput.type = 'checkbox'; shakeInput.checked = save.settings.screenShake;
  shakeInput.addEventListener('change', () => actions.change({ screenShake: shakeInput.checked }));
  shake.append(shakeInput, element('span', '', t('settings.shake')));
  // Endless competitive play fixes the aim-assist window for every player;
  // do not expose the persisted legacy toggle as if it changed this run.
  settingsCard.append(sound, music, effects, motion, shake);
  shell.append(settingsCard);
  const back = button(t('common.back')); back.addEventListener('click', actions.back); shell.append(back);
  return shell;
}

