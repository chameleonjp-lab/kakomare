import { translate as t } from '../services/TranslationService';
import { button, card, element, heading, pageShell } from './viewUtils';

export function createRulesView(onBack: () => void): HTMLElement {
  const shell = pageShell(t('rules.title'), t('rules.intro'));

  const goal = card('rules-card');
  goal.append(heading(t('rules.protectHeading'), 2));
  goal.append(element('p', '', t('rules.core')));
  goal.append(element('p', '', t('rules.scoring')));
  goal.append(element('p', '', t('rules.freshStart')));
  shell.append(goal);

  const aim = card('rules-card');
  aim.append(heading(t('rules.aimHeading'), 2));
  aim.append(element('p', '', t('rules.manualAim')));
  aim.append(element('p', '', t('rules.autoAim')));
  shell.append(aim);

  const upgrades = card('rules-card');
  upgrades.append(heading(t('rules.upgradeHeading'), 2));
  upgrades.append(element('p', '', t('rules.choices')));
  upgrades.append(element('p', '', t('rules.support')));
  upgrades.append(element('p', '', t('rules.replacement')));
  upgrades.append(element('p', '', t('rules.reposition')));
  upgrades.append(element('p', '', t('rules.rerolls')));
  shell.append(upgrades);

  const enemies = card('rules-card');
  enemies.append(heading(t('rules.enemyHeading'), 2));
  enemies.append(element('p', '', t('rules.enemyRoles')));
  enemies.append(element('p', '', t('rules.warnings')));
  shell.append(enemies);

  const back = button(t('rules.back'));
  back.addEventListener('click', onBack);
  shell.append(back);
  return shell;
}

