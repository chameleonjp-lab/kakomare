import { BOSSES } from '../data/bosses';
import { ENEMIES, ENEMY_ORDER } from '../data/enemies';
import { RESEARCH, RESEARCH_ORDER, getResearchEffects, researchCost, researchLevel } from '../data/research';
import { STAGES } from '../data/stages';
import { WEAPONS, WEAPON_ORDER } from '../data/weapons';
import type { ResearchId, SaveData } from '../types/save';
import { button, card, element, heading, pageShell } from './viewUtils';

export interface ResearchActions {
  purchase: (id: ResearchId) => void;
  back: () => void;
}

export function createResearchView(save: SaveData, actions: ResearchActions): HTMLElement {
  const shell = pageShell('研究と記録', '集めた部品を使って、次の防衛を少しだけ有利にします。');
  const balance = card('summary-card');
  balance.append(heading('部品', 2), element('p', 'summary-line', `${save.progress.parts} 部品`));
  shell.append(balance);

  const sections = ['コア', '攻撃', '選択', '記録'] as const;
  for (const section of sections) {
    const group = card('research-section');
    group.append(heading(section, 2));
    for (const id of RESEARCH_ORDER.filter((researchId) => RESEARCH[researchId].section === section)) {
      group.append(researchCard(save, id, actions));
    }
    shell.append(group);
  }
  shell.append(recordCards(save));
  const back = button('ホームへ戻る'); back.addEventListener('click', actions.back); shell.append(back);
  return shell;
}

function researchCard(save: SaveData, id: ResearchId, actions: ResearchActions): HTMLElement {
  const definition = RESEARCH[id];
  const level = researchLevel(save, id);
  const cost = researchCost(save, id);
  const item = element('article', 'research-card');
  item.append(element('h3', '', definition.name));
  item.append(element('p', 'research-description', definition.description));
  item.append(element('p', 'research-level', `Lv${level} / ${definition.maxLevel}`));
  const purchase = button(cost === null ? '取得済み' : `研究する（${cost}部品）`, 'button button-secondary');
  purchase.dataset.testid = `research-buy-${id}`;
  purchase.disabled = cost === null || save.progress.parts < cost;
  purchase.addEventListener('click', () => actions.purchase(id));
  item.append(purchase);
  return item;
}

function recordCards(save: SaveData): HTMLElement {
  const effects = getResearchEffects(save);
  const wrapper = element('div', 'records-area');
  const enemyCard = card('records-card');
  enemyCard.append(heading('敵図鑑', 2));
  enemyCard.append(element('p', 'record-lock', effects.enemyRecords ? '出会った敵の撃破数を表示しています。' : '研究「敵図鑑」を取得すると詳細を表示します。'));
  for (const id of ENEMY_ORDER) enemyCard.append(element('p', 'summary-line', `${ENEMIES[id].name}: ${effects.enemyRecords ? save.records.enemyKills[id] ?? 0 : '—'}`));
  for (const id of ['crown', 'designer', 'echo'] as const) enemyCard.append(element('p', 'summary-line', `${BOSSES[id].name}: ${effects.enemyRecords ? save.records.enemyKills[id] ?? 0 : '—'}`));

  const weaponCard = card('records-card');
  weaponCard.append(heading('武器記録', 2));
  weaponCard.append(element('p', 'record-lock', effects.weaponRecords ? '1プレイ中の最高攻撃量です。' : '研究「武器記録」を取得すると詳細を表示します。'));
  for (const id of WEAPON_ORDER) weaponCard.append(element('p', 'summary-line', `${WEAPONS[id].name}: ${effects.weaponRecords ? Math.round(save.records.weaponBestDamage[id] ?? 0) : '—'}`));

  const sectorCard = card('records-card');
  sectorCard.append(heading('方向別被害履歴', 2));
  sectorCard.append(element('p', 'record-lock', effects.sectorRecords ? '各ステージの合計被害です。' : '研究「方向解析」を取得すると詳細を表示します。'));
  for (const stageId of ['stage-1', 'stage-2', 'stage-3'] as const) {
    const values = save.records.sectorDamage[stageId];
    sectorCard.append(element('p', 'summary-line', `${STAGES[stageId].name}: ${effects.sectorRecords && values ? values.map((value, index) => `${index + 1}方向 ${Math.round(value)}`).join(' / ') : '—'}`));
  }
  wrapper.append(enemyCard, weaponCard, sectorCard);
  return wrapper;
}
