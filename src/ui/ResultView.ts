import { BOSSES } from '../data/bosses';
import { STAGES } from '../data/stages';
import { WEAPONS } from '../data/weapons';
import type { BattleResult } from '../types/game';
import { button, card, element, heading, pageShell } from './viewUtils';

export interface ResultActions {
  again: () => void;
  next: () => void;
  home: () => void;
  share: () => void;
}

export function createResultView(result: BattleResult, actions: ResultActions): HTMLElement {
  const stage = STAGES[result.stageId];
  const shell = pageShell(result.retired ? 'プレイ終了' : result.outcome === 'victory' ? '防衛成功' : '防衛失敗', result.retired ? 'このプレイの得点と報酬は保存されません。' : result.outcome === 'victory' ? `${stage.name}を突破しました。` : result.mainCause);
  shell.dataset.testid = 'result-screen';
  const scoreCard = card('result-score-card');
  scoreCard.append(heading(result.retired ? '記録は未確定です' : `${result.score.toLocaleString('ja-JP')} 点`, 2));
  scoreCard.append(element('p', 'result-highlight', `${Math.floor(result.survivalTime)}秒生存 / 撃破 ${result.kills} / ${BOSSES[result.bossId].name}`));
  shell.append(scoreCard);
  const details = card('result-details');
  details.append(heading('今回の記録', 2));
  const rows: Array<[string, string]> = [
    ['ステージ', stage.name],
    ['残り耐久力', `${Math.max(0, Math.round(result.coreRemaining))}`],
    ['ボス撃破', `${result.bossesDefeated}体`],
    ['獲得部品', result.retired ? '未確定' : `${result.partsEarned}`],
    [result.retired ? '終了理由' : '主な敗因', result.mainCause],
    ['減速 / 押し戻し / 吸引', `${result.controlSeconds.slowed.toFixed(1)}秒 / ${result.controlSeconds.pushed.toFixed(1)}秒 / ${result.controlSeconds.pulled.toFixed(1)}秒`],
    ['方向別の被害', result.sectorDamage.map((value, index) => `${index + 1}方向 ${Math.round(value)}`).join(' / ')],
  ];
  for (const [label, value] of rows) {
    const row = element('div', 'result-row'); row.append(element('span', 'result-label', label), element('strong', '', value)); details.append(row);
  }
  shell.append(details);

  const weaponCard = card('result-details');
  weaponCard.append(heading('装置の働き', 2));
  for (const [id, amount] of Object.entries(result.weaponDamage)) weaponCard.append(element('p', 'summary-line', `${WEAPONS[id as keyof typeof WEAPONS].name}: ${Math.round(amount ?? 0)}`));
  if (result.upgrades.length > 0) weaponCard.append(element('p', 'summary-line', `強化順: ${result.upgrades.join(' → ')}`));
  if (result.branches.length > 0) weaponCard.append(element('p', 'summary-line', `発展分岐: ${result.branches.join(' / ')}`));
  shell.append(weaponCard);

  const actionsGrid = element('div', 'result-actions');
  const again = button('もう一度', 'button button-primary button-large'); again.addEventListener('click', actions.again); actionsGrid.append(again);
  if (result.outcome === 'victory' && result.newUnlock) {
    const next = button(result.newUnlock === 'endless' ? '無限モードへ' : '次のステージへ', 'button button-secondary button-large');
    next.addEventListener('click', actions.next); actionsGrid.append(next);
  }
  const share = button('結果を共有'); share.dataset.testid = 'share-result'; share.addEventListener('click', actions.share);
  const home = button('ホーム'); home.addEventListener('click', actions.home);
  if (!result.retired) actionsGrid.append(share);
  actionsGrid.append(home); shell.append(actionsGrid);
  const ranking = card('online-ranking');
  ranking.append(heading('スコアランキング TOP10', 3));
  const rankingList = element('ol'); rankingList.dataset.onlineRankingList = 'true'; rankingList.append(element('li', '', 'ランキングを読み込み中…'));
  const rankingStatus = element('p', 'ranking-status', ''); rankingStatus.dataset.onlineRankingStatus = 'true';
  ranking.append(rankingList, rankingStatus);
  shell.append(ranking);
  const external = element('a', 'experiment-link', 'カメレオンJPの実験場'); external.href = 'https://chameleonjp-lab.github.io/chameleonjp_lab/'; external.target = '_blank'; external.rel = 'noopener noreferrer'; shell.append(external);
  return shell;
}
