import { SUPPORTS, SUPPORT_ORDER } from '../../data/supports';
import { WEAPONS, WEAPON_ORDER } from '../../data/weapons';
import type { SupportId, WeaponId } from '../../types/content';
import type { UpgradeCandidate } from '../../types/game';
import { SupportModule } from '../entities/SupportModule';
import { Weapon } from '../entities/Weapon';
import { DeterministicRng } from './SpawnDirector';

export function createUpgradeCandidateList(
  weapons: Weapon[],
  supports: SupportModule[],
  coreHealth: number,
  rng: DeterministicRng,
  banned: Set<string>,
  coreMaxHealth = 100,
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
          details: attackPowerChange(
            weapon.stats.damage,
            weapon.stats.cooldown * weapon.cooldownMultiplier,
            weapon.damageMultiplier,
            weapon.definition.levels[next - 1].damage,
            weapon.definition.levels[next - 1].cooldown * (branch.cooldownMultiplier ?? weapon.cooldownMultiplier),
            weapon.damageMultiplier * (branch.damageMultiplier ?? 1),
          ),
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

  // A displayed choice must always satisfy the three-card contract. Returning
  // an incomplete list would either violate the two-related/one-new limits or
  // leave the battle waiting on a choice that cannot be made safely.
  if (additions.length > 0) {
    if (related.length < 2) return [];
    return [...related.slice(0, 2), additions[0]!];
  }
  if (related.length < 3) return [];
  return related.slice(0, 3);
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

export function applyUpgradeCandidate(candidate: UpgradeCandidate, weapons: Weapon[], supports: SupportModule[], heal: (amount: number) => void): void {
  if (candidate.kind === 'repair') { heal(20); return; }
  if (candidate.kind === 'weapon') {
    const weapon = weapons.find((item) => item.id === candidate.targetId);
    if (candidate.id.endsWith(':new')) weapons.push(new Weapon(candidate.targetId as WeaponId, weapons.length));
    else if (weapon && candidate.id.includes(':focus')) weapon.precisionBonus += 1;
    else if (weapon) {
      const parts = candidate.id.split(':');
      const branchIndex = parts.indexOf('branch');
      if (branchIndex >= 0) {
        const nextLevel = Number(parts[branchIndex + 2]);
        if (nextLevel === 5) weapon.finalBranch = parts[branchIndex + 1] as Weapon['finalBranch'];
        else weapon.branch = parts[branchIndex + 1] as Weapon['branch'];
        weapon.level = Math.min(weapon.definition.maxLevel, weapon.level + 1);
      } else weapon.level = Math.min(weapon.definition.maxLevel, weapon.level + 1);
    }
    return;
  }
  const support = supports.find((item) => item.id === candidate.targetId);
  if (candidate.id.endsWith(':new')) supports.push(new SupportModule(candidate.targetId as SupportId, supports.length));
  else if (support) support.level = Math.min(support.definition.maxLevel, support.level + 1);
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
