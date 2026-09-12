import { BOSSES } from '../data/bosses';
import { SUPPORTS, SUPPORT_ORDER } from '../data/supports';
import { WEAPONS, WEAPON_ORDER } from '../data/weapons';
import type { BattleResult } from '../types/game';
import type { RankingSnapshot } from '../types/ranking';
import type { WeaponId } from '../types/content';
import { button, card, element, heading, pageShell } from './viewUtils';

export interface ResultActions {
  again: () => void;
  /** Kept optional for hosts that still pass the former stage progression action. */
  next?: () => void;
  home: () => void;
  share: () => void;
  ranking?: RankingSnapshot;
  retryRanking?: () => void;
}

export interface ResultWeaponContribution {
  id: WeaponId;
  damage: number;
}

/** Return the highest-damage weapon types without exposing runtime instances. */
export function topContributingWeapons(result: BattleResult, limit = 3): ResultWeaponContribution[] {
  const count = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 3;
  return WEAPON_ORDER
    .map((id) => ({ id, damage: result.weaponDamage[id] ?? 0 }))
    .filter((entry) => Number.isFinite(entry.damage) && entry.damage > 0)
    .sort((first, second) => second.damage - first.damage || WEAPON_ORDER.indexOf(first.id) - WEAPON_ORDER.indexOf(second.id))
    .slice(0, count);
}

/** Supports are shown only when the run recorded them as installed/used. */
export function usedSupportIds(result: BattleResult): typeof SUPPORT_ORDER[number][] {
  return SUPPORT_ORDER.filter((id) => (result.supportUsage[id] ?? 0) > 0);
}

function playerFacingCause(result: BattleResult): string {
  let cause = result.mainCause;
  // The replay/ledger keeps the exact source. The compact result intentionally
  // uses a generic label so a boss name never leaks back into player copy.
  for (const boss of Object.values(BOSSES)) cause = cause.replaceAll(boss.name, 'ボス');
  return cause;
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

function resultActions(result: BattleResult, actions: ResultActions): HTMLElement {
  const actionsGrid = element('div', 'result-actions result-actions-top');
  const again = button('もう一度', 'button button-primary button-large');
  again.dataset.testid = 'result-again';
  again.addEventListener('click', actions.again);
  actionsGrid.append(again);

  if (!result.retired) {
    const share = button('結果を共有', 'button button-secondary button-large');
    share.dataset.testid = 'share-result';
    share.addEventListener('click', actions.share);
    actionsGrid.append(share);
  }

  const home = button('ホーム', 'button button-secondary button-large');
  home.dataset.testid = 'result-home';
  home.addEventListener('click', actions.home);
  actionsGrid.append(home);
  return actionsGrid;
}

function resultDetails(result: BattleResult): HTMLElement {
  const details = card('result-details result-summary-details');
  details.append(heading('プレイの内訳', 2));
  const cause = playerFacingCause(result);
  const rows: Array<[string, string]> = [
    ['残り耐久力', `${Math.max(0, Math.round(result.coreRemaining))}`],
    ['ボス撃破', `${result.bossesDefeated}体`],
    [result.retired ? '終了理由' : '主な敗因', cause],
  ];
  for (const [label, value] of rows) {
    const row = element('div', 'result-row');
    row.append(element('span', 'result-label', label), element('strong', '', value));
    details.append(row);
  }
  return details;
}

function resultEquipment(result: BattleResult): HTMLElement {
  const deviceCard = card('result-details result-equipment-card');
  deviceCard.dataset.testid = 'result-device-records';

  const weapons = topContributingWeapons(result);
  deviceCard.append(heading('主な武器（上位3）', 2));
  if (weapons.length === 0) {
    deviceCard.append(element('p', 'summary-line', 'このプレイで記録された武器ダメージはありません。'));
  } else {
    const list = element('ol', 'result-weapon-list');
    for (const weapon of weapons) {
      const entry = element('li', 'result-weapon-entry');
      const name = element('span', 'result-weapon-name', WEAPONS[weapon.id].name);
      const role = element('span', 'result-device-role', WEAPONS[weapon.id].role);
      const damage = element('strong', 'result-device-value', `${Math.round(weapon.damage)}ダメージ`);
      entry.append(name, role, damage);
      list.append(entry);
    }
    deviceCard.append(list);
  }

  const supports = usedSupportIds(result);
  if (supports.length > 0) {
    deviceCard.append(heading('使った補助', 2));
    const supportSummary = element('p', 'result-support-summary');
    supportSummary.dataset.testid = 'result-supports';
    supportSummary.textContent = supports
      .map((id) => SUPPORTS[id].name)
      .join(' / ');
    deviceCard.append(supportSummary);
  }
  return deviceCard;
}

export function createResultView(result: BattleResult, actions: ResultActions): HTMLElement {
  const title = result.retired ? 'プレイ終了' : result.outcome === 'victory' ? '防衛成功' : '防衛失敗';
  const description = result.retired
    ? 'このプレイの得点は確定しません。'
    : result.outcome === 'victory'
      ? '防衛を終えました。'
      : playerFacingCause(result);
  const shell = pageShell(title, description);
  shell.dataset.testid = 'result-screen';

  const scoreCard = card('result-score-card');
  const score = heading(result.retired ? '記録は未確定です' : `${result.score.toLocaleString('ja-JP')} 点`, 2);
  score.className = 'result-score';
  score.dataset.testid = 'result-score';
  scoreCard.append(score);
  scoreCard.append(element('p', 'result-highlight', `${Math.floor(result.survivalTime)}秒生存 / 撃破 ${result.kills}`));
  shell.append(scoreCard);

  // Keep the three next actions in the first viewport, immediately below the score.
  shell.append(resultActions(result, actions));

  if (result.stageId === 'endless' && actions.ranking) {
    const rankingCard = card('result-ranking-card');
    rankingCard.dataset.testid = 'ranking-status';
    rankingCard.append(heading('ランキング', 2), element('p', 'summary-line', rankingStatusLabel(actions.ranking)));
    if (actions.ranking.status === 'retryable_failed' && actions.retryRanking) {
      const retry = button('ランキングへ再送', 'button button-secondary');
      retry.dataset.testid = 'ranking-retry';
      retry.addEventListener('click', actions.retryRanking);
      rankingCard.append(retry);
    }
    shell.append(rankingCard);
  }

  shell.append(resultDetails(result), resultEquipment(result));

  const external = element('a', 'experiment-link', 'カメレオンJPの実験場');
  external.href = 'https://chameleonjp-lab.github.io/chameleonjp_lab/';
  external.target = '_blank';
  external.rel = 'noopener noreferrer';
  shell.append(external);
  return shell;
}
