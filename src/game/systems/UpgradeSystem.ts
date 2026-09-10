import { SUPPORTS, SUPPORT_ORDER } from '../../data/supports';
import { WEAPONS, WEAPON_ORDER } from '../../data/weapons';
import type { SupportId, WeaponId } from '../../types/content';
import type { UpgradeCandidate } from '../../types/game';
import { SupportModule } from '../entities/SupportModule';
import { Weapon } from '../entities/Weapon';
import { DEVICE_SLOT_COUNT } from '../deviceLayout';
import { DeterministicRng } from './SpawnDirector';

export type ContinuousUpgradeId = 'polish' | 'armor' | 'parts';

export interface ContinuousUpgradeState {
  weaponPolishStacks?: number;
  pendingPartsBonus?: number;
}

export interface UpgradeApplicationCallbacks {
  onContinuous?: (id: ContinuousUpgradeId) => void;
}

export function createUpgradeCandidateList(
  weapons: Weapon[],
  supports: SupportModule[],
  coreHealth: number,
  rng: DeterministicRng,
  banned: Set<string>,
  coreMaxHealth = 100,
  continuousState: ContinuousUpgradeState = {},
): UpgradeCandidate[] {
  const existing: UpgradeCandidate[] = [];
  const newItems: UpgradeCandidate[] = [];
  for (const weapon of weapons) {
    if (weapon.level < weapon.definition.maxLevel) {
      const next = weapon.level + 1;
      if (next === 3 || next === 5) {
        const branches = weapon.definition.branches.filter((branch) => branch.atLevel === next);
        for (const branch of branches) existing.push({
          id: `weapon:${weapon.id}:branch:${branch.id}:${next}`,
          kind: 'weapon', targetId: weapon.id,
          title: `${weapon.definition.name} Lv${next}・${branch.name}`,
          description: branch.description,
          before: `Lv${weapon.level} / 威力 ${weapon.stats.damage}`,
          after: `Lv${next} / 威力 ${weapon.definition.levels[next - 1].damage}`,
          role: weapon.definition.role, isExisting: true,
          details: `${attackPowerChange(
            weapon.stats.damage,
            weapon.stats.cooldown * weapon.cooldownMultiplier,
            weapon.damageMultiplier,
            weapon.definition.levels[next - 1].damage,
            weapon.definition.levels[next - 1].cooldown * (branch.cooldownMultiplier ?? weapon.cooldownMultiplier),
            weapon.damageMultiplier * (branch.damageMultiplier ?? 1),
          )} / ${branchEffectLabel(branch.damageMultiplier, branch.cooldownMultiplier)}`,
        });
      } else {
        existing.push({
          id: `weapon:${weapon.id}:level`, kind: 'weapon', targetId: weapon.id,
          title: `${weapon.definition.name} Lv${next}`,
          description: `${weapon.definition.description}威力を上げます。`,
          before: `威力 ${weapon.stats.damage}`, after: `威力 ${weapon.definition.levels[next - 1].damage}`,
          role: weapon.definition.role, isExisting: true,
          details: attackPowerChange(weapon.stats.damage, weapon.stats.cooldown * weapon.cooldownMultiplier, weapon.damageMultiplier, weapon.definition.levels[next - 1].damage, weapon.definition.levels[next - 1].cooldown * weapon.cooldownMultiplier, weapon.damageMultiplier),
        });
      }
    }
    if (weapon.precisionBonus < 2) existing.push({
      id: `weapon:${weapon.id}:focus`, kind: 'weapon', targetId: weapon.id,
      title: `${weapon.definition.name}・照準強化`, description: '狙いを整え、攻撃の威力を少し高めます。',
      before: `基準威力 ×${weapon.damageMultiplier.toFixed(2)}`,
      after: `基準威力 ×${(weapon.damageMultiplier + 0.06).toFixed(2)}`,
      role: '安定した単体攻撃', isExisting: true,
      details: attackPowerChange(weapon.stats.damage, weapon.stats.cooldown * weapon.cooldownMultiplier, weapon.damageMultiplier, weapon.stats.damage, weapon.stats.cooldown * weapon.cooldownMultiplier, weapon.damageMultiplier + 0.06 * (weapon.finalBranchDefinition?.damageMultiplier ?? 1)),
    });
  }
  for (const support of supports) {
    if (support.level >= support.definition.maxLevel) continue;
    const next = support.level + 1;
    existing.push({
      id: `support:${support.id}:level`, kind: 'support', targetId: support.id,
      title: `${support.definition.name} Lv${next}`, description: support.definition.description,
      before: support.definition.levels[support.level - 1].label, after: support.definition.levels[next - 1].label,
      role: support.definition.role, isExisting: true,
    });
  }
  if (coreHealth <= 30) existing.push({
    id: 'repair:core', kind: 'repair', targetId: 'core', title: '応急修復', description: 'コアの耐久力を20回復します。',
    before: `耐久力 ${Math.round(coreHealth)}`, after: `耐久力 ${Math.min(coreMaxHealth, Math.round(coreHealth + 20))}`,
    role: '立て直し', isExisting: true,
  });
  if (weapons.length < 3) for (const id of WEAPON_ORDER) if (!weapons.some((weapon) => weapon.id === id)) newItems.push(newWeaponCandidate(id));
  if (supports.length < 3) for (const id of SUPPORT_ORDER) if (!supports.some((support) => support.id === id)) newItems.push(newSupportCandidate(id));

  const firstMilestone = existing.find((candidate) => candidate.id.includes(':branch:'));
  const milestonePair = firstMilestone
    ? existing.filter((candidate) => candidate.targetId === firstMilestone.targetId && candidate.id.includes(':branch:'))
    : [];
  const orderedExisting = milestonePair.length === 2
    ? [...shuffle(milestonePair, rng), ...shuffle(existing.filter((candidate) => !milestonePair.includes(candidate)), rng)]
    : shuffle(existing, rng);
  const related = uniqueCandidates(orderedExisting, banned);
  const additions = uniqueCandidates(shuffle(newItems, rng), banned);

  // The old two-related/one-new ratio is a preference, not a gate. When only
  // one or two normal choices remain, keep them and fill the rest with
  // repeatable progress. A candidate list is therefore always actionable,
  // even after every device has reached its normal cap or has been banned.
  const normal = additions.length > 0
    ? [...related.slice(0, 2), additions[0]!]
    : related.slice(0, 3);
  const continuous = createContinuousCandidates(coreHealth, coreMaxHealth, continuousState);
  return [...normal, ...continuous].slice(0, 3);
}

function uniqueCandidates(candidates: UpgradeCandidate[], banned: Set<string>): UpgradeCandidate[] {
  return candidates.filter((candidate, index, list) => !banned.has(candidate.id) && list.findIndex((other) => other.id === candidate.id) === index);
}

function newWeaponCandidate(id: WeaponId): UpgradeCandidate {
  const definition = WEAPONS[id];
  const stats = definition.levels[0];
  return { id: `weapon:${id}:new`, kind: 'weapon', targetId: id, title: `${definition.name} Lv1`, description: definition.description, before: '空き面', after: `役割: ${definition.role}`, role: definition.role, isExisting: false, details: `1秒あたりの基準攻撃力 ${Math.round(stats.damage / stats.cooldown)}` };
}

function newSupportCandidate(id: SupportId): UpgradeCandidate {
  const definition = SUPPORTS[id];
  return { id: `support:${id}:new`, kind: 'support', targetId: id, title: `${definition.name} Lv1`, description: definition.description, before: '空き面', after: definition.levels[0].label, role: definition.role, isExisting: false };
}

function createContinuousCandidates(coreHealth: number, coreMaxHealth: number, state: ContinuousUpgradeState): UpgradeCandidate[] {
  const weaponPolishStacks = Math.max(0, Math.floor(state.weaponPolishStacks ?? 0));
  const pendingPartsBonus = Math.max(0, Math.floor(state.pendingPartsBonus ?? 0));
  return [
    {
      id: 'continuous:polish', kind: 'continuous', targetId: 'polish',
      title: '兵装研磨',
      description: 'すべての武器へ、基準威力の2%分を加算します。既存の倍率へ連続乗算しません。',
      before: `全武器 基準威力 +${weaponPolishStacks * 2}%`,
      after: `全武器 基準威力 +${(weaponPolishStacks + 1) * 2}%`,
      role: '継続火力', isExisting: true, canBan: false,
    },
    {
      id: 'continuous:armor', kind: 'continuous', targetId: 'armor',
      title: '追加外装',
      description: 'コアの最大耐久力と現在耐久力を2ずつ増やします。満タンでも有効です。',
      before: `最大${Math.round(coreMaxHealth)} / 現在${Math.round(coreHealth)}`,
      after: `最大${Math.round(coreMaxHealth + 2)} / 現在${Math.round(Math.min(coreMaxHealth + 2, coreHealth + 2))}`,
      role: '継続防衛', isExisting: true, canBan: false,
    },
    {
      id: 'continuous:parts', kind: 'continuous', targetId: 'parts',
      title: '部品確保',
      description: 'このプレイが結果確定したときに受け取る部品を1つ増やします。リタイアでは精算しません。',
      before: `結果精算時 +${pendingPartsBonus}部品`,
      after: `結果精算時 +${pendingPartsBonus + 1}部品`,
      role: '継続報酬', isExisting: true, canBan: false,
    },
  ];
}

function shuffle<T>(items: T[], rng: DeterministicRng): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng.next() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function attackPowerChange(beforeDamage: number, beforeCooldown: number, beforeMultiplier: number, afterDamage: number, afterCooldown: number, afterMultiplier: number): string {
  const before = Math.round(beforeDamage * beforeMultiplier / beforeCooldown);
  const after = Math.round(afterDamage * afterMultiplier / afterCooldown);
  return `1秒あたりの基準攻撃力 ${before} → ${after}`;
}

function branchEffectLabel(damageMultiplier?: number, cooldownMultiplier?: number): string {
  const effects: string[] = [];
  if (damageMultiplier !== undefined) effects.push(`分岐威力 +${Math.round((damageMultiplier - 1) * 100)}%`);
  if (cooldownMultiplier !== undefined) effects.push(`発射間隔 -${Math.round((1 - cooldownMultiplier) * 100)}%`);
  return effects.length > 0 ? effects.join(' / ') : '固有効果を追加';
}

export function applyUpgradeCandidate(
  candidate: UpgradeCandidate,
  weapons: Weapon[],
  supports: SupportModule[],
  heal: (amount: number) => void,
  callbacks: UpgradeApplicationCallbacks = {},
): boolean {
  if (candidate.kind === 'repair') { heal(20); return true; }
  if (candidate.kind === 'continuous') {
    if (candidate.targetId !== 'polish' && candidate.targetId !== 'armor' && candidate.targetId !== 'parts') return false;
    callbacks.onContinuous?.(candidate.targetId);
    return true;
  }
  if (candidate.kind === 'weapon') {
    if (candidate.id.endsWith(':new')) {
      const placementSlot = resolvePlacementSlot(candidate.placementSlot, weapons.map((item) => item.slot));
      if (weapons.some((item) => item.slot === placementSlot)) return false;
      weapons.push(new Weapon(candidate.targetId as WeaponId, placementSlot));
      return true;
    }
    const weapon = weapons.find((item) => item.id === candidate.targetId);
    if (!weapon) return false;
    if (candidate.id.includes(':focus')) {
      if (weapon.precisionBonus >= 2) return false;
      weapon.precisionBonus += 1;
      return true;
    }
    if (weapon) {
      const parts = candidate.id.split(':');
      const branchIndex = parts.indexOf('branch');
      if (branchIndex >= 0) {
        const nextLevel = Number(parts[branchIndex + 2]);
        if (!Number.isInteger(nextLevel) || nextLevel !== weapon.level + 1 || nextLevel > weapon.definition.maxLevel) return false;
        if (nextLevel === 5) weapon.finalBranch = parts[branchIndex + 1] as Weapon['finalBranch'];
        else weapon.branch = parts[branchIndex + 1] as Weapon['branch'];
        weapon.level = Math.min(weapon.definition.maxLevel, weapon.level + 1);
        return true;
      }
      if (weapon.level >= weapon.definition.maxLevel) return false;
      weapon.level = Math.min(weapon.definition.maxLevel, weapon.level + 1);
      return true;
    }
    return false;
  }
  if (candidate.kind === 'support') {
    if (candidate.id.endsWith(':new')) {
      const placementSlot = resolvePlacementSlot(candidate.placementSlot, supports.map((item) => item.slot));
      if (supports.some((item) => item.slot === placementSlot)) return false;
      supports.push(new SupportModule(candidate.targetId as SupportId, placementSlot));
      return true;
    }
    const support = supports.find((item) => item.id === candidate.targetId);
    if (!support || support.level >= support.definition.maxLevel) return false;
    support.level = Math.min(support.definition.maxLevel, support.level + 1);
    return true;
  }
  return false;
}

function resolvePlacementSlot(requestedSlot: number | undefined, occupiedSlots: number[]): number {
  const availableSlots = Array.from({ length: DEVICE_SLOT_COUNT }, (_, slot) => slot).filter((slot) => !occupiedSlots.includes(slot));
  return requestedSlot !== undefined && availableSlots.includes(requestedSlot) ? requestedSlot : availableSlots[0] ?? 0;
}

export function wouldStrandNewItems(
  candidate: UpgradeCandidate,
  weapons: Weapon[],
  supports: SupportModule[],
  coreHealth: number,
  coreMaxHealth: number,
  bannedAfterChoice: Set<string>,
): boolean {
  if (!candidate.isExisting) return false;
  const weaponCopies = weapons.map((weapon) => {
    const copy = new Weapon(weapon.id, weapon.slot);
    copy.level = weapon.level;
    copy.precisionBonus = weapon.precisionBonus;
    copy.branch = weapon.branch;
    copy.finalBranch = weapon.finalBranch;
    return copy;
  });
  const supportCopies = supports.map((support) => {
    const copy = new SupportModule(support.id, support.slot);
    copy.level = support.level;
    return copy;
  });
  let healthAfterChoice = coreHealth;
  applyUpgradeCandidate(candidate, weaponCopies, supportCopies, (amount) => { healthAfterChoice = Math.min(coreMaxHealth, healthAfterChoice + amount); });
  const hasAvailableNewItem = weaponCopies.length < 3 && WEAPON_ORDER.some((id) => !weaponCopies.some((weapon) => weapon.id === id) && !bannedAfterChoice.has(`weapon:${id}:new`))
    || supportCopies.length < 3 && SUPPORT_ORDER.some((id) => !supportCopies.some((support) => support.id === id) && !bannedAfterChoice.has(`support:${id}:new`));
  if (!hasAvailableNewItem) return false;
  return createUpgradeCandidateList(weaponCopies, supportCopies, healthAfterChoice, new DeterministicRng(0x51a7), bannedAfterChoice, coreMaxHealth).length !== 3;
}

export function shouldRetryUpgradeDraw(experience: number, blockedAtExperience: number | null): boolean {
  return blockedAtExperience === null || experience > blockedAtExperience;
}
