import type { UpgradeCandidate } from '../types/game';
import { translateGameText } from '../services/GameTextService';
/** A display-only projection; pass the original candidate to game actions. */
export function localizeUpgradeCopy(candidate: UpgradeCandidate): Pick<UpgradeCandidate, 'title' | 'description' | 'before' | 'after' | 'role' | 'details'> {
  return {
    title: translateGameText(candidate.title), description: translateGameText(candidate.description),
    before: translateGameText(candidate.before), after: translateGameText(candidate.after),
    role: translateGameText(candidate.role), details: candidate.details ? translateGameText(candidate.details) : undefined,
  };
}
