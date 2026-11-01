import { translateData, translateGameText } from '../services/GameTextService';
import { translate as t, formatNumber } from '../services/TranslationService';
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
  return translateGameText(cause);
}

function rankingStatusLabel(snapshot: RankingSnapshot): string {
  if (snapshot.diagnosticCode === 'unconfirmed_result') return t('result.unconfirmed');
  if (snapshot.diagnosticCode === 'guest_run') return t('result.guest');
  if (snapshot.status === 'submitting') return t('result.submitting');
  if (snapshot.status === 'submitted') return t('result.submitted');
  if (snapshot.status === 'retryable_failed') return t('result.retryable');
  if (snapshot.status === 'permanent_failed') return snapshot.diagnosticCode === 'ranking_endpoint_unconfigured'
    ? t('result.unconfigured')
    : t('result.failed');
  return t('result.checking');
}

function topRankingList(snapshot: RankingSnapshot): HTMLElement {
  if (snapshot.topRankingStatus === 'loading' || snapshot.topRankingStatus === 'idle') {
    return element('p', 'summary-line', t('ranking.loading'));
  }
  if (snapshot.topRankingStatus === 'failed') {
    return element('p', 'summary-line', t('ranking.failed'));
  }
  if (snapshot.topRanking.length === 0) {
    return element('p', 'summary-line', t('ranking.empty'));
  }
  const list = element('ol', 'result-top-ranking');
  list.dataset.testid = 'result-top-ranking';
  for (const entry of snapshot.topRanking.slice(0, 30)) {
    const row = element('li', 'result-ranking-entry');
    row.dataset.testid = 'result-ranking-entry';
    const rank = element('strong', 'result-ranking-rank', t('ranking.rank', { value: formatNumber(entry.rank) }));
    const name = element('span', 'result-ranking-name', entry.displayName);
    const score = element('strong', 'result-ranking-score', t('common.points', { value: formatNumber(entry.bestScore) }));
    const plays = element('span', 'result-ranking-plays', t('ranking.plays', { value: formatNumber(entry.playCount) }));
    row.append(rank, name, score, plays);
    list.append(row);
  }
  return list;
}

function resultActions(result: BattleResult, actions: ResultActions): HTMLElement {
  const actionsGrid = element('div', 'result-actions result-actions-top');
  const again = button(t('result.again'), 'button button-primary button-large');
  again.dataset.testid = 'result-again';
  again.addEventListener('click', actions.again);
  actionsGrid.append(again);

  if (!result.retired) {
    const share = button(t('common.share'), 'button button-secondary button-large');
    share.dataset.testid = 'share-result';
    share.addEventListener('click', actions.share);
    actionsGrid.append(share);
  }

  const home = button(t('common.home'), 'button button-secondary button-large');
  home.dataset.testid = 'result-home';
  home.addEventListener('click', actions.home);
  actionsGrid.append(home);
  return actionsGrid;
}

function resultDetails(result: BattleResult): HTMLElement {
  const details = card('result-details result-summary-details');
  details.append(heading(t('result.details'), 2));
  const cause = playerFacingCause(result);
  const rows: Array<[string, string]> = [
    [t('result.health'), `${Math.max(0, Math.round(result.coreRemaining))}`],
    [t('result.bossKills'), formatNumber(result.bossesDefeated)],
    [result.retired ? t('result.endReason') : t('result.defeatReason'), cause],
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
  deviceCard.append(heading(t('result.weapons'), 2));
  if (weapons.length === 0) {
    deviceCard.append(element('p', 'summary-line', t('result.noDamage')));
  } else {
    const list = element('ol', 'result-weapon-list');
    for (const weapon of weapons) {
      const entry = element('li', 'result-weapon-entry');
      const name = element('span', 'result-weapon-name', translateData(`data.weapons.name.${weapon.id}`, WEAPONS[weapon.id].name));
      const role = element('span', 'result-device-role', translateData(`data.weapons.role.${weapon.id}`, WEAPONS[weapon.id].role));
      const damage = element('strong', 'result-device-value', t('result.damage', { value: formatNumber(Math.round(weapon.damage)) }));
      entry.append(name, role, damage);
      list.append(entry);
    }
    deviceCard.append(list);
  }

  const supports = usedSupportIds(result);
  if (supports.length > 0) {
    deviceCard.append(heading(t('result.supports'), 2));
    const supportSummary = element('p', 'result-support-summary');
    supportSummary.dataset.testid = 'result-supports';
    supportSummary.textContent = supports
      .map((id) => translateData(`data.supports.name.${id}`, SUPPORTS[id].name))
      .join(' / ');
    deviceCard.append(supportSummary);
  }
  return deviceCard;
}

export function createResultView(result: BattleResult, actions: ResultActions): HTMLElement {
  const title = result.retired ? t('result.ended') : result.outcome === 'victory' ? t('result.victory') : t('result.defeat');
  const description = result.retired
    ? t('result.noScore')
    : result.outcome === 'victory'
      ? t('result.defended')
      : playerFacingCause(result);
  const shell = pageShell(title, description);
  shell.dataset.testid = 'result-screen';

  const scoreCard = card('result-score-card');
  const score = heading(result.retired ? t('result.pending') : t('common.points', { value: formatNumber(result.score) }), 2);
  score.className = 'result-score';
  score.dataset.testid = 'result-score';
  scoreCard.append(score);
  scoreCard.append(element('p', 'result-highlight', t('result.highlight', { seconds: formatNumber(Math.floor(result.survivalTime)), kills: formatNumber(result.kills) })));
  shell.append(scoreCard);

  // Keep the three next actions in the first viewport, immediately below the score.
  shell.append(resultActions(result, actions));

  if (result.stageId === 'endless' && actions.ranking) {
    const rankingCard = card('card result-ranking-card');
    rankingCard.dataset.testid = 'ranking-status';
    rankingCard.append(heading(t('common.ranking'), 2), element('p', 'summary-line', rankingStatusLabel(actions.ranking)));
    rankingCard.append(heading(t('ranking.top'), 3), topRankingList(actions.ranking));
    if ((actions.ranking.status === 'retryable_failed' || actions.ranking.topRankingStatus === 'failed') && actions.retryRanking) {
      const retry = button(actions.ranking.status === 'retryable_failed' ? t('ranking.retry') : t('ranking.reload'), 'button button-secondary');
      retry.dataset.testid = 'ranking-retry';
      retry.addEventListener('click', actions.retryRanking);
      rankingCard.append(retry);
    }
    shell.append(rankingCard);
  }

  shell.append(resultDetails(result), resultEquipment(result));

  const external = element('a', 'experiment-link', t('common.ranking'));
  external.href = 'https://chameleonjp-lab.github.io/chameleonjp_lab/ranking.html?game=kakomare';
  external.target = '_blank';
  external.rel = 'noopener noreferrer';
  shell.append(external);
  return shell;
}

