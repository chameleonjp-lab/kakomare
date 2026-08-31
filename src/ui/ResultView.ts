import type { BattleResult } from '../types/game';
import { button, card, element, heading, pageShell } from './viewUtils';

export interface ResultActions {
  again: () => void;
  home: () => void;
  share: () => void;
}

export function createResultView(result: BattleResult, actions: ResultActions): HTMLElement {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  const shell = pageShell(result.retired ? 'プレイ終了' : result.outcome === 'victory' ? '防衛成功' : '防衛失敗', result.retired ? 'このプレイの得点と報酬は確定していません。' : result.outcome === 'victory' ? '回転冠を止め、コアを守り切りました。' : 'コアの耐久力が尽きました。');
  shell.dataset.testid = 'result-screen';
  const scoreCard = card('result-score-card');
  scoreCard.append(heading(`${result.score.toLocaleString('ja-JP')} 点`, 2));
  scoreCard.append(element('p', 'result-highlight', `${Math.floor(result.survivalTime)}秒生存 / 撃破 ${result.kills}`));
  shell.append(scoreCard);
  const details = card('result-details');
  details.append(heading('今回の記録', 2));
  const rows: Array<[string, string]> = [
    ['残り耐久力', `${Math.max(0, Math.round(result.coreRemaining))}`],
    ['ボス撃破', result.bossDefeated ? 'あり' : 'なし'],
    ['獲得部品', `${result.partsEarned}`],
    ['主な敗因', result.mainCause],
    ['方向別の被害', result.sectorDamage.map((value, index) => `${index + 1}方向 ${Math.round(value)}`).join(' / ')],
  ];
  for (const [label, value] of rows) {
    const row = element('div', 'result-row'); row.append(element('span', 'result-label', label), element('strong', '', value)); details.append(row);
  }
  shell.append(details);
  const weaponCard = card('result-details');
  weaponCard.append(heading('装置の働き', 2));
  for (const [id, amount] of Object.entries(result.weaponDamage)) weaponCard.append(element('p', 'summary-line', `${id}: ${Math.round(amount ?? 0)}`));
  if (result.upgrades.length > 0) weaponCard.append(element('p', 'summary-line', `強化順: ${result.upgrades.join(' → ')}`));
  shell.append(weaponCard);
  const actionsGrid = element('div', 'result-actions');
  const again = button('もう一度', 'button button-primary button-large'); again.addEventListener('click', actions.again);
  const share = button('結果を共有'); share.addEventListener('click', actions.share);
  const home = button('ホーム'); home.addEventListener('click', actions.home);
  actionsGrid.append(again, share, home); shell.append(actionsGrid);
  const external = element('a', 'experiment-link', 'カメレオンJPの実験場'); external.href = 'https://chameleonjp-lab.github.io/chameleonjp_lab/'; external.target = '_blank'; external.rel = 'noopener noreferrer'; shell.append(external);
  return shell;
}
