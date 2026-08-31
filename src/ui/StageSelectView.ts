import { ENEMIES } from '../data/enemies';
import { STAGES, STAGE_ORDER, stageIsUnlocked } from '../data/stages';
import type { StageId } from '../types/content';
import type { SaveData } from '../types/save';
import { button, card, element, heading, pageShell } from './viewUtils';

export function createStageSelectView(save: SaveData, onSelect: (id: StageId) => void, onBack: () => void): HTMLElement {
  const shell = pageShell('ステージ選択', 'クリアしたステージの次が解放されます。無限モードはステージ3の後に選べます。');
  const list = element('div', 'stage-list');
  for (const stageId of STAGE_ORDER) {
    const stage = STAGES[stageId];
    const unlocked = stageIsUnlocked(stageId, save.progress.unlockedStages);
    const item = card(`stage-card${unlocked ? '' : ' stage-card-locked'}`);
    item.append(heading(`${stageId === 'endless' ? '' : stageId.replace('stage-', 'ステージ')} ${stage.name}`.trim(), 2));
    item.append(element('p', 'stage-description', stage.description));
    item.append(element('p', 'stage-meta', stage.isEndless ? '制限時間 なし' : `制限時間 ${Math.floor(stage.timeLimit / 60)}分`));
    item.append(element('p', 'stage-meta', `主な敵: ${stage.enemies.slice(0, 5).map((id) => ENEMIES[id].name).join('・')}`));
    if (stage.isEndless) item.append(element('p', 'stage-meta', `最高得点 ${save.records.endlessBest}`));
    else {
      const best = save.records.stageBest[stageId];
      item.append(element('p', 'stage-meta', `最高得点 ${best?.bestScore ?? 0} / 最高残り耐久力 ${best?.bestCore ?? 0}`));
    }
    if (!unlocked) item.append(element('p', 'stage-lock', stageId === 'stage-2' ? 'ステージ1をクリアすると解放されます。' : stageId === 'stage-3' ? 'ステージ2をクリアすると解放されます。' : 'ステージ3をクリアすると解放されます。'));
    const start = button(unlocked ? 'このステージを開始' : '未解放', unlocked ? 'button button-primary' : 'button button-secondary');
    start.disabled = !unlocked;
    start.dataset.testid = `select-${stageId}`;
    start.addEventListener('click', () => { if (unlocked) onSelect(stageId); });
    item.append(start);
    list.append(item);
  }
  shell.append(list);
  const back = button('ホームへ戻る'); back.addEventListener('click', onBack); shell.append(back);
  return shell;
}
