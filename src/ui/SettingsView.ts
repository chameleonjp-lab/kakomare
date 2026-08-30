import type { SaveData } from '../types/save';
import { button, card, element, heading, pageShell } from './viewUtils';

export interface SettingsActions {
  change: (next: SaveData) => void;
  changeName: (name: string) => void;
  exportSave: () => void;
  importSave: (raw: string) => void;
  reset: () => void;
  back: () => void;
}

export function createSettingsView(save: SaveData, actions: SettingsActions): HTMLElement {
  const shell = pageShell('設定', '音と演出を端末に保存します。');
  const settingsCard = card('settings-card');
  settingsCard.append(heading('ゲーム設定', 2));
  const nameRow = element('label', 'setting-row', '名前');
  const nameInput = element('input') as HTMLInputElement;
  nameInput.type = 'text'; nameInput.maxLength = 12; nameInput.value = save.profile.name; nameInput.setAttribute('autocomplete', 'nickname');
  nameInput.addEventListener('change', () => { const name = nameInput.value.trim(); if (name && [...name].length <= 12) actions.changeName(name); else nameInput.value = save.profile.name; });
  nameRow.append(nameInput); settingsCard.append(nameRow);

  const sound = element('label', 'setting-row', '効果音');
  const soundValue = element('output', 'setting-value', `${save.settings.audio}`);
  const soundInput = element('input') as HTMLInputElement;
  soundInput.type = 'range'; soundInput.min = '0'; soundInput.max = '100'; soundInput.value = String(save.settings.audio);
  soundInput.addEventListener('input', () => { soundValue.textContent = soundInput.value; actions.change({ ...save, settings: { ...save.settings, audio: Number(soundInput.value) } }); });
  sound.append(soundInput, soundValue);

  const music = element('label', 'setting-row', '音楽');
  const musicValue = element('output', 'setting-value', `${save.settings.music}`);
  const musicInput = element('input') as HTMLInputElement;
  musicInput.type = 'range'; musicInput.min = '0'; musicInput.max = '100'; musicInput.value = String(save.settings.music);
  musicInput.addEventListener('input', () => { musicValue.textContent = musicInput.value; actions.change({ ...save, settings: { ...save.settings, music: Number(musicInput.value) } }); });
  music.append(musicInput, musicValue);

  const effects = element('label', 'setting-row', '演出量');
  const effectsInput = element('select') as HTMLSelectElement;
  for (const [value, label] of [['standard', '標準'], ['low', '少ない'], ['minimum', '最小']] as const) {
    const option = element('option', '', label) as HTMLOptionElement;
    option.value = value; option.selected = save.settings.effects === value; effectsInput.append(option);
  }
  effectsInput.addEventListener('change', () => actions.change({ ...save, settings: { ...save.settings, effects: effectsInput.value as SaveData['settings']['effects'] } }));
  effects.append(effectsInput);

  const motion = element('label', 'check-row');
  const motionInput = element('input') as HTMLInputElement;
  motionInput.type = 'checkbox'; motionInput.checked = save.settings.reducedMotion;
  motionInput.addEventListener('change', () => actions.change({ ...save, settings: { ...save.settings, reducedMotion: motionInput.checked } }));
  motion.append(motionInput, element('span', '', '動きを減らす'));
  settingsCard.append(sound, music, effects, motion);
  shell.append(settingsCard);

  const saveCard = card('settings-card');
  saveCard.append(heading('保存データ', 2));
  const exportButton = button('保存データを書き出す'); exportButton.addEventListener('click', actions.exportSave);
  const importLabel = element('label', 'import-label', '保存データを読み込む');
  const importInput = element('textarea', 'import-textarea') as HTMLTextAreaElement;
  importInput.placeholder = '書き出したJSONを貼り付け'; importInput.rows = 5;
  const importButton = button('内容を確認して読み込む'); importButton.addEventListener('click', () => actions.importSave(importInput.value));
  const resetButton = button('進行を初期化', 'button button-danger'); resetButton.addEventListener('click', actions.reset);
  saveCard.append(exportButton, importLabel, importInput, importButton, resetButton);
  shell.append(saveCard);
  const back = button('戻る'); back.addEventListener('click', actions.back); shell.append(back);
  return shell;
}
