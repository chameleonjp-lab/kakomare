import { BOSSES } from '../data/bosses';
import { STAGES } from '../data/stages';
import { SUPPORTS, SUPPORT_ORDER } from '../data/supports';
import { WEAPONS, WEAPON_ORDER } from '../data/weapons';
import type { BattleResult } from '../types/game';
import type { RankingSnapshot } from '../types/ranking';
import { button, card, element, heading, pageShell } from './viewUtils';

export interface ResultActions {
  again: () => void;
  next: () => void;
  home: () => void;
  share: () => void;
  ranking?: RankingSnapshot;
  retryRanking?: () => void;
}

function rankingStatusLabel(snapshot: RankingSnapshot): string {
  if (snapshot.status === 'submitting') return 'ランキングへ送信中…';
  if (snapshot.status === 'submitted') return 'ランキングへ登録しました。';
  if (snapshot.status === 'retryable_failed') return 'ランキング送信を再試行できます。';
  if (snapshot.status === 'permanent_failed') return snapshot.diagnosticCode === 'ranking_endpoint_unconfigured'
    ? 'ランキング受付が未設定のため、今回の記録は送信していません。'
    : 'ランキングへ登録できませんでした。結果と再戦は利用できます。';
  return 'ランキング受付を確認しています。';
}

export function createResultView(result: BattleResult, actions: ResultActions): HTMLElement {
  const stage = STAGES[result.stageId];
  const shell = pageShell(result.retired ? 'プレイ終了' : result.outcome === 'victory' ? '防衛成功' : '防衛失敗', result.retired ? 'このプレイの得点と報酬は保存されません。' : result.outcome === 'victory' ? `${stage.name}を突破しました。` : result.mainCause);
  shell.dataset.testid = 'result-screen';
  const scoreCard = card('result-score-card');
  scoreCard.append(heading(result.retired ? '記録は未確定です' : `${result.score.toLocaleString('ja-JP')} 点`, 2));
  scoreCard.append(element('p', 'result-highlight', `${Math.floor(result.survivalTime)}秒生存 / 撃破 ${result.kills} / ${BOSSES[result.bossId].name}`));
  shell.append(scoreCard);
  if (result.stageId === 'endless' && actions.ranking) {
    const rankingCard = card('result-ranking-card');
    rankingCard.dataset.testid = 'ranking-status';
    rankingCard.append(heading('ランキング', 2), element('p', 'summary-line', rankingStatusLabel(actions.ranking)));
    if (actions.ranking.session) rankingCard.append(element('p', 'summary-line', `受付ID: ${actions.ranking.session.playId}`));
    if (actions.ranking.status === 'retryable_failed' && actions.retryRanking) {
      const retry = button('ランキングへ再送', 'button button-secondary');
      retry.dataset.testid = 'ranking-retry';
      retry.addEventListener('click', actions.retryRanking);
      rankingCard.append(retry);
    }
    shell.append(rankingCard);
  }
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
  weaponCard.dataset.testid = 'result-device-records';
  weaponCard.append(heading('装置の働き', 2));
  weaponCard.append(element('h3', '', '今回使った武器'));
  const usedWeaponIds = new Set((result.weaponInstances ?? []).map((weapon) => weapon.id));
  const renderedWeaponIds = new Set<string>();
  const renderWeapon = (id: typeof WEAPON_ORDER[number], instanceId?: string): HTMLElement => {
    const amount = result.weaponDamage[id] ?? 0;
    const entry = element('article', 'result-device-entry');
    entry.append(element('h4', '', `${WEAPONS[id].name}${instanceId ? `（${instanceId}）` : ''}`));
    entry.append(element('p', 'result-device-role', WEAPONS[id].role));
    const instanceAmount = instanceId ? result.weaponInstanceDamage?.[instanceId] : undefined;
    entry.append(element('strong', 'result-device-value', `${Math.round(instanceAmount ?? amount)}ダメージ`));
    return entry;
  };
  const usedInstances = result.weaponInstances ?? [];
  for (const weapon of usedInstances) {
    weaponCard.append(renderWeapon(weapon.id, weapon.instanceId));
    renderedWeaponIds.add(weapon.id);
  }
  // Older result fixtures do not carry instance snapshots. Positive damage is
  // still a reliable used-set for those records.
  for (const id of WEAPON_ORDER.filter((weaponId) => (result.weaponDamage[weaponId] ?? 0) > 0 && !renderedWeaponIds.has(weaponId))) {
    weaponCard.append(renderWeapon(id));
    renderedWeaponIds.add(id);
  }
  if (renderedWeaponIds.size === 0) weaponCard.append(renderWeapon('needle'));
  const unusedWeapons = WEAPON_ORDER.filter((id) => !usedWeaponIds.has(id) && !renderedWeaponIds.has(id));
  if (unusedWeapons.length > 0) {
    const unused = document.createElement('details');
    unused.className = 'result-unused-details';
    unused.append(element('summary', '', `未使用の武器（${unusedWeapons.length}）`));
    for (const id of unusedWeapons) unused.append(renderWeapon(id));
    weaponCard.append(unused);
  }
  weaponCard.append(element('h3', '', '補助装置の接続'));
  const usedSupportIds = new Set(SUPPORT_ORDER.filter((id) => (result.supportUsage[id] ?? 0) > 0));
  for (const id of SUPPORT_ORDER.filter((supportId) => usedSupportIds.has(supportId))) {
    const count = result.supportUsage[id] ?? 0;
    const entry = element('article', 'result-device-entry');
    entry.append(element('h4', '', SUPPORTS[id].name));
    entry.append(element('p', 'result-device-role', SUPPORTS[id].role));
    entry.append(element('strong', 'result-device-value', count > 0 ? `${count}面で採用` : '未採用'));
    weaponCard.append(entry);
  }
  const unusedSupports = SUPPORT_ORDER.filter((id) => !usedSupportIds.has(id));
  if (unusedSupports.length > 0) {
    const unused = document.createElement('details');
    unused.className = 'result-unused-details';
    unused.append(element('summary', '', `未使用の補助（${unusedSupports.length}）`));
    for (const id of unusedSupports) {
      const entry = element('article', 'result-device-entry');
      entry.append(element('h4', '', SUPPORTS[id].name), element('p', 'result-device-role', SUPPORTS[id].role), element('strong', 'result-device-value', '未採用'));
      unused.append(entry);
    }
    weaponCard.append(unused);
  }
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
  const external = element('a', 'experiment-link', 'カメレオンJPの実験場'); external.href = 'https://chameleonjp-lab.github.io/chameleonjp_lab/'; external.target = '_blank'; external.rel = 'noopener noreferrer'; shell.append(external);
  return shell;
}
