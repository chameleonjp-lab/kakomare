import { STAGES } from '../data/stages';
import type { SaveData } from '../types/save';
import { button, card, element, heading, pageShell } from './viewUtils';

export function createStageSelectView(save: SaveData, onSelect: (id: 'stage-1') => void, onBack: () => void): HTMLElement {
  const shell = pageShell('ステージ選択', '最初はステージ1から始まります。');
  const list = element('div', 'stage-list');
  const stage = STAGES['stage-1'];
  const item = card('stage-card');
  item.append(heading(`ステージ1「${stage.name}」`, 2));
  item.append(element('p', 'stage-description', stage.description));
  item.append(element('p', 'stage-meta', `制限時間 ${Math.floor(stage.timeLimit / 60)}分`));
  item.append(element('p', 'stage-meta', '主な敵: 小片・針走り・格子盾・胞子体'));
  const best = save.records.stageBest['stage-1'];
  item.append(element('p', 'stage-meta', `最高得点 ${best?.bestScore ?? 0} / 最高残り耐久力 ${best?.bestCore ?? 0}`));
  const start = button('このステージを開始', 'button button-primary');
  start.dataset.testid = 'select-stage-1';
  start.addEventListener('click', () => onSelect('stage-1'));
  item.append(start);
  list.append(item);
  shell.append(list);
  const back = button('ホームへ戻る');
  back.addEventListener('click', onBack);
  shell.append(back);
  return shell;
}
