import { SUPPORTS } from '../../data/supports';
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
): UpgradeCandidate[] {
  const existing: UpgradeCandidate[] = [];
  const newItems: UpgradeCandidate[] = [];
  for (const weapon of weapons) {
    if (weapon.level < weapon.definition.maxLevel) {
      const next = weapon.level + 1;
      const before = weapon.stats.damage;
      const after = weapon.definition.levels[next - 1].damage;
      existing.push({
        id: `weapon:${weapon.id}:level`, kind: 'weapon', targetId: weapon.id,
        title: `${weapon.definition.name} Lv${next}`,
        description: `${weapon.definition.description}威力を上げます。`,
        before: `威力 ${before}`, after: `威力 ${after}`,
        role: weapon.definition.role, isExisting: true,
      });
    }
    if (weapon.precisionBonus < 2) {
      existing.push({
        id: `weapon:${weapon.id}:focus`, kind: 'weapon', targetId: weapon.id,
        title: `${weapon.definition.name}・照準強化`,
        description: '狙いを整え、攻撃の威力を少し高めます。',
        before: `基準威力 ×${weapon.damageMultiplier.toFixed(2)}`,
        after: `基準威力 ×${(weapon.damageMultiplier + 0.06).toFixed(2)}`,
        role: '安定した単体攻撃', isExisting: true,
      });
    }
  }
  for (const support of supports) {
    if (support.level >= support.definition.maxLevel) continue;
    const next = support.level + 1;
    existing.push({
      id: `support:${support.id}:level`, kind: 'support', targetId: support.id,
      title: `${support.definition.name} Lv${next}`,
      description: support.definition.description,
      before: support.definition.levels[support.level - 1].label,
      after: support.definition.levels[next - 1].label,
      role: support.definition.role, isExisting: true,
    });
  }
  if (coreHealth <= 30) {
    existing.push({
      id: 'repair:core', kind: 'repair', targetId: 'core', title: '応急修復',
      description: 'コアの耐久力を20回復します。', before: `耐久力 ${Math.round(coreHealth)}`,
      after: `耐久力 ${Math.min(100, Math.round(coreHealth + 20))}`, role: '立て直し', isExisting: true,
    });
  }
  if (weapons.length < 3) {
    for (const id of WEAPON_ORDER) {
      if (!weapons.some((weapon) => weapon.id === id)) newItems.push(newWeaponCandidate(id));
    }
  }
  if (supports.length < 3) {
    for (const id of ['output', 'rhythm', 'brake'] as SupportId[]) {
      if (!supports.some((support) => support.id === id)) newItems.push(newSupportCandidate(id));
    }
  }
  const clean = [...shuffle(existing, rng), ...shuffle(newItems, rng)].filter((candidate, index, list) => !banned.has(candidate.id) && list.findIndex((other) => other.id === candidate.id) === index);
  const related = clean.filter((candidate) => candidate.isExisting);
  const additions = clean.filter((candidate) => !candidate.isExisting).slice(0, 1);
  const selected = [...related.slice(0, 3), ...additions];
  if (selected.length < 3) {
    for (const candidate of clean) {
      if (!selected.some((item) => item.id === candidate.id)) selected.push(candidate);
      if (selected.length === 3) break;
    }
  }
  return selected.slice(0, 3);
}

function newWeaponCandidate(id: WeaponId): UpgradeCandidate {
  const definition = WEAPONS[id];
  return { id: `weapon:${id}:new`, kind: 'weapon', targetId: id, title: `${definition.name} Lv1`, description: definition.description, before: '空き面', after: `役割: ${definition.role}`, role: definition.role, isExisting: false };
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

export function applyUpgradeCandidate(candidate: UpgradeCandidate, weapons: Weapon[], supports: SupportModule[], heal: (amount: number) => void): void {
  if (candidate.kind === 'repair') { heal(20); return; }
  if (candidate.kind === 'weapon') {
    const weapon = weapons.find((item) => item.id === candidate.targetId);
    if (candidate.id.endsWith(':new')) weapons.push(new Weapon(candidate.targetId as WeaponId, weapons.length));
    else if (weapon && candidate.id.endsWith(':focus')) weapon.precisionBonus += 1;
    else if (weapon) weapon.level = Math.min(weapon.definition.maxLevel, weapon.level + 1);
    return;
  }
  const support = supports.find((item) => item.id === candidate.targetId);
  if (candidate.id.endsWith(':new')) supports.push(new SupportModule(candidate.targetId as SupportId, supports.length));
  else if (support) support.level = Math.min(support.definition.maxLevel, support.level + 1);
}
