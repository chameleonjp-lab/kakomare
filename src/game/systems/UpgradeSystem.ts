import { SUPPORTS, SUPPORT_ORDER } from '../../data/supports';
import { WEAPONS, WEAPON_ORDER } from '../../data/weapons';
import type { SupportId, WeaponBranch, WeaponId } from '../../types/content';
import type {
  UpgradeCandidate,
  UpgradeReplacementBranchOption,
  UpgradeReplacementTarget,
} from '../../types/game';
import { SupportModule } from '../entities/SupportModule';
import { Weapon } from '../entities/Weapon';
import { DEVICE_SLOT_COUNT } from '../deviceLayout';
import { DeterministicRng } from './SpawnDirector';
import type { BuildLayer } from '../../types/build';

export type ContinuousUpgradeId = 'polish' | 'armor' | 'parts' | 'stabilizer';

export interface ContinuousUpgradeState {
  weaponPolishStacks?: number;
  pendingPartsBonus?: number;
  stabilizerStacks?: number;
}

export interface UpgradeApplicationCallbacks {
  onContinuous?: (id: ContinuousUpgradeId) => void;
  onExpansion?: (layer: BuildLayer) => void;
}

export interface UpgradePlacementState {
  /** Slots currently unlocked by the BuildGraph, excluding occupied faces. */
  weaponSlots?: number[];
  supportSlots?: number[];
  /** Maximum number of installed copies in each category for the unlocked layers. */
  maxWeapons?: number;
  maxSupports?: number;
  expansionCandidates?: UpgradeCandidate[];
  /** Full-slot replacement is enabled for competitive endless runs. */
  enableReplacements?: boolean;
  /** Competitive endless uses gameplay exits rather than the profile-parts
   * reward candidate. Normal mode keeps the legacy parts contract. */
  competitive?: boolean;
}

export function createUpgradeCandidateList(
  weapons: Weapon[],
  supports: SupportModule[],
  coreHealth: number,
  rng: DeterministicRng,
  banned: Set<string>,
  coreMaxHealth = 100,
  continuousState: ContinuousUpgradeState = {},
  placementState: UpgradePlacementState = {},
): UpgradeCandidate[] {
  const existing: UpgradeCandidate[] = [];
  const newItems: UpgradeCandidate[] = [];
  for (const weapon of weapons) {
    if (weapon.level < weapon.definition.maxLevel) {
      const next = weapon.level + 1;
      if (next === 8) {
        if (!weapon.evolutionId) for (const form of weapon.definition.evolutions) existing.push({
          id: `weapon:${weapon.id}:evolution:${form.id}:8`,
          kind: 'weapon', targetId: weapon.id,
          title: `${weapon.definition.name} Lv8・${form.name}`,
          description: form.description,
          before: `Lv${weapon.level} / 威力 ${weapon.stats.damage}`,
          after: `Lv8 / ${form.name}`,
          role: weapon.definition.role, isExisting: true,
          targetInstanceId: weapon.instanceId,
          details: 'Lv8へ成長します。追加効果はカードの説明をご確認ください。',
        });
      } else if (next === 3 || next === 5) {
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
          targetInstanceId: weapon.instanceId,
        });
      } else {
        existing.push({
          id: `weapon:${weapon.id}:level`, kind: 'weapon', targetId: weapon.id,
          title: `${weapon.definition.name} Lv${next}`,
          description: `${weapon.definition.description}威力を上げます。`,
          before: `威力 ${weapon.stats.damage}`, after: `威力 ${weapon.definition.levels[next - 1].damage}`,
          role: weapon.definition.role, isExisting: true,
          targetInstanceId: weapon.instanceId,
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
      targetInstanceId: weapon.instanceId,
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
      role: support.definition.role, isExisting: true, targetInstanceId: support.instanceId,
    });
  }
  if (coreHealth <= 30) existing.push({
    id: 'repair:core', kind: 'repair', targetId: 'core', title: '応急修復', description: 'コアの耐久力を20回復します。',
    before: `耐久力 ${Math.round(coreHealth)}`, after: `耐久力 ${Math.min(coreMaxHealth, Math.round(coreHealth + 20))}`,
    role: '立て直し', isExisting: true,
  });
  const maxWeapons = placementState.maxWeapons ?? 3;
  const maxSupports = placementState.maxSupports ?? 3;
  const weaponFaceSlots = unlockedFaceSlots(maxWeapons, placementState.weaponSlots ?? [], weapons.map((weapon) => weapon.slot));
  const supportFaceSlots = unlockedFaceSlots(maxSupports, placementState.supportSlots ?? [], supports.map((support) => support.slot));
  const weaponReplacementTargets = replacementTargetsForSlots(weapons, weaponFaceSlots);
  const supportReplacementTargets = replacementTargetsForSlots(supports, supportFaceSlots);
  const replacementsEnabled = placementState.enableReplacements === true;
  const weaponFacesFull = areAllFacesOccupied(weaponFaceSlots, weapons.map((weapon) => weapon.slot));
  const supportFacesFull = areAllFacesOccupied(supportFaceSlots, supports.map((support) => support.slot));

  if (!weaponFacesFull) {
    for (const id of WEAPON_ORDER) if (!weapons.some((weapon) => weapon.id === id)) newItems.push(newWeaponCandidate(id));
  } else if (replacementsEnabled) {
    for (const id of WEAPON_ORDER) if (!weapons.some((weapon) => weapon.id === id)) newItems.push(newWeaponReplacementCandidate(id, weaponReplacementTargets));
  }
  if (!supportFacesFull) {
    for (const id of SUPPORT_ORDER) if (!supports.some((support) => support.id === id)) newItems.push(newSupportCandidate(id));
  } else if (replacementsEnabled) {
    for (const id of SUPPORT_ORDER) if (!supports.some((support) => support.id === id)) newItems.push(newSupportReplacementCandidate(id, supportReplacementTargets));
  }

  const expansions = uniqueCandidates(placementState.expansionCandidates ?? [], banned);

  const firstMilestone = existing.find((candidate) => candidate.id.includes(':branch:'));
  const milestonePair = firstMilestone
    ? existing.filter((candidate) => candidate.targetId === firstMilestone.targetId && candidate.id.includes(':branch:'))
    : [];
  const orderedExisting = milestonePair.length === 2
    ? [...shuffle(milestonePair, rng), ...shuffle(existing.filter((candidate) => !milestonePair.includes(candidate)), rng)]
    : shuffle(existing, rng);
  const related = uniqueCandidates([...expansions, ...orderedExisting], banned);
  const additions = uniqueCandidates(shuffle(newItems, rng), banned);

  // The old two-related/one-new ratio is a preference, not a gate. When only
  // one or two normal choices remain, keep them and fill the rest with
  // repeatable progress. A candidate list is therefore always actionable,
  // even after every device has reached its normal cap or has been banned.
  const normal = additions.length > 0
    ? [...related.slice(0, 2), additions[0]!]
    : related.slice(0, 3);
  const continuous = createContinuousCandidates(coreHealth, coreMaxHealth, continuousState, placementState.competitive === true);
  return [...normal, ...continuous].slice(0, 3);
}

function uniqueCandidates(candidates: UpgradeCandidate[], banned: Set<string>): UpgradeCandidate[] {
  return candidates.filter((candidate, index, list) => !banned.has(candidate.id) && list.findIndex((other) => other.id === candidate.id) === index);
}

/** Public shape guard used by the scene and by alternate upgrade UIs. */
export function isReplacementCandidate(candidate: UpgradeCandidate): boolean {
  if (candidate.isExisting
    && (candidate.kind === 'weapon' || candidate.kind === 'support')
  ) return false;
  if ((candidate.kind !== 'weapon' && candidate.kind !== 'support')
    || !Array.isArray(candidate.replacementSlots)
    || candidate.replacementSlots.length === 0
    || !Array.isArray(candidate.replacementTargets)
    || candidate.replacementTargets.length !== candidate.replacementSlots.length) return false;
  const slots = new Set<number>();
  const instances = new Set<string>();
  return candidate.replacementSlots.every((slot) => {
    if (!Number.isInteger(slot) || slot < 0 || slot >= DEVICE_SLOT_COUNT * 3 || slots.has(slot)) return false;
    slots.add(slot);
    return true;
  }) && candidate.replacementTargets.every((target) => {
    if (!target || typeof target.id !== 'string' || !isReplacementCatalogId(candidate.kind, target.id) || !Number.isInteger(target.slot)
      || !slots.has(target.slot) || instances.has(target.instanceId) || typeof target.instanceId !== 'string'
      || target.instanceId.length === 0 || !Number.isFinite(target.level) || target.level < 1) return false;
    instances.add(target.instanceId);
    return true;
  });
}

/** Resolve the exact installed copy represented by a replacement face. */
export function replacementTargetFor(candidate: UpgradeCandidate, slot = candidate.placementSlot): UpgradeReplacementTarget | undefined {
  if (!isReplacementCandidate(candidate) || !Number.isInteger(slot)) return undefined;
  if (!candidate.replacementSlots!.includes(slot!)) return undefined;
  const target = candidate.replacementTargets!.find((item) => item.slot === slot);
  if (!target || target.id === candidate.targetId || target.slot !== slot || !isReplacementCatalogId(candidate.kind, target.id)) return undefined;
  if (candidate.replacementTargetInstanceId !== undefined && candidate.replacementTargetInstanceId !== target.instanceId) return undefined;
  return target;
}

function isReplacementCatalogId(kind: UpgradeCandidate['kind'], id: WeaponId | SupportId): boolean {
  return typeof id === 'string' && (kind === 'weapon' ? id in WEAPONS : kind === 'support' ? id in SUPPORTS : false);
}

function newWeaponCandidate(id: WeaponId): UpgradeCandidate {
  const definition = WEAPONS[id];
  const stats = definition.levels[0];
  return { id: `weapon:${id}:new`, kind: 'weapon', targetId: id, title: `${definition.name} Lv1`, description: definition.description, before: '空き面', after: `役割: ${definition.role}`, role: definition.role, isExisting: false, details: `基準値（比較用） ${Math.round(stats.damage / stats.cooldown)} / 秒` };
}

function newWeaponReplacementCandidate(id: WeaponId, targets: UpgradeReplacementTarget[]): UpgradeCandidate {
  const definition = WEAPONS[id];
  const branchOptions = definition.branches
    .filter((branch) => branch.atLevel === 3 && branch.id !== 'power' && branch.id !== 'tempo')
    .map((branch): UpgradeReplacementBranchOption => ({ id: branch.id as WeaponBranch, name: branch.name, description: branch.description }));
  const replacementSlots = targets.map((target) => target.slot);
  const levelRange = replacementLevelRange(targets);
  return {
    id: `weapon:${id}:replace`, kind: 'weapon', targetId: id,
    title: `${definition.name} Lv${levelRange.label}・入替`,
    description: `${definition.description}選択した面の武器を置き換えます。`,
    before: `選択面の武器 Lv${levelRange.before}`,
    after: `選択面へ Lv${levelRange.after}${branchOptions.length > 0 && levelRange.max >= 3 ? '（Lv3分岐を選択）' : ''}`,
    role: definition.role, isExisting: false,
    details: `埋まっている面から選択。新しい装置はLv${levelRange.max}以下で、分岐・照準・発展は引き継ぎません。${branchOptions.length > 0 && levelRange.max >= 3 ? '交換先を確認してからLv3分岐を選びます。' : ''}`,
    replacementSlots,
    // `placementSlots` is a compatibility alias for clients that already know
    // how to render face choices. BattleScene still validates it as occupied.
    placementSlots: replacementSlots,
    replacementTargets: targets,
    replacementBranchOptions: branchOptions.length > 0 && levelRange.max >= 3 ? branchOptions : undefined,
  };
}

function newSupportCandidate(id: SupportId): UpgradeCandidate {
  const definition = SUPPORTS[id];
  return { id: `support:${id}:new`, kind: 'support', targetId: id, title: `${definition.name} Lv1`, description: definition.description, before: '空き面', after: definition.levels[0].label, role: definition.role, isExisting: false };
}

function newSupportReplacementCandidate(id: SupportId, targets: UpgradeReplacementTarget[]): UpgradeCandidate {
  const definition = SUPPORTS[id];
  const levelRange = replacementLevelRange(targets);
  const replacementSlots = targets.map((target) => target.slot);
  return {
    id: `support:${id}:replace`, kind: 'support', targetId: id,
    title: `${definition.name} Lv${levelRange.label}・入替`,
    description: `${definition.description}選択した面の補助を置き換えます。`,
    before: `選択面の補助 Lv${levelRange.before}`,
    after: `選択面へ Lv${levelRange.after}`,
    role: definition.role, isExisting: false,
    details: `埋まっている面から選択。新しい装置はLv${levelRange.max}以下で、既存の補助値以外を引き継ぎません。`,
    replacementSlots,
    placementSlots: replacementSlots,
    replacementTargets: targets,
  };
}

function createContinuousCandidates(coreHealth: number, coreMaxHealth: number, state: ContinuousUpgradeState, competitive: boolean): UpgradeCandidate[] {
  const weaponPolishStacks = Math.max(0, Math.floor(state.weaponPolishStacks ?? 0));
  const pendingPartsBonus = Math.max(0, Math.floor(state.pendingPartsBonus ?? 0));
  const candidates: UpgradeCandidate[] = [
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
  ];
  if (competitive) {
    const stabilizerStacks = Math.max(0, Math.floor(state.stabilizerStacks ?? 0));
    candidates.push({
      id: 'continuous:stabilizer', kind: 'continuous', targetId: 'stabilizer',
      title: '攻守補強',
      description: 'コアの最大耐久力と現在耐久力を1ずつ増やし、全武器の基準威力へ1%を加算します。',
      before: `耐久 最大${Math.round(coreMaxHealth)} / 現在${Math.round(coreHealth)}・威力加算 +${stabilizerStacks}%`,
      after: `耐久 最大${Math.round(coreMaxHealth + 1)} / 現在${Math.round(Math.min(coreMaxHealth + 1, coreHealth + 1))}・威力加算 +${stabilizerStacks + 1}%`,
      role: '攻守強化', isExisting: true, canBan: false,
    });
  } else {
    candidates.push({
      id: 'continuous:parts', kind: 'continuous', targetId: 'parts',
      title: '部品確保',
      description: 'このプレイが結果確定したときに受け取る部品を1つ増やします。リタイアでは精算しません。',
      before: `結果精算時 +${pendingPartsBonus}部品`,
      after: `結果精算時 +${pendingPartsBonus + 1}部品`,
      role: '継続報酬', isExisting: true, canBan: false,
    });
  }
  return candidates;
}

/** Return the complete unlocked face address space, including occupied faces. */
function unlockedFaceSlots(maxSlots: number, availableSlots: number[], occupiedSlots: number[]): number[] {
  const boundedMax = Math.max(0, Math.min(DEVICE_SLOT_COUNT * 3, Math.floor(maxSlots)));
  const slots = new Set<number>();
  for (let slot = 0; slot < boundedMax; slot += 1) slots.add(slot);
  for (const slot of [...availableSlots, ...occupiedSlots]) {
    if (Number.isInteger(slot) && slot >= 0 && slot < DEVICE_SLOT_COUNT * 3) slots.add(slot);
  }
  return [...slots].sort((first, second) => first - second);
}

function areAllFacesOccupied(faceSlots: number[], occupiedSlots: number[]): boolean {
  if (faceSlots.length === 0) return false;
  const occupied = new Set(occupiedSlots);
  return faceSlots.every((slot) => occupied.has(slot));
}

function replacementTargetsForSlots<T extends Weapon | SupportModule>(items: T[], faceSlots: number[]): UpgradeReplacementTarget[] {
  const allowed = new Set(faceSlots);
  return items
    .filter((item) => allowed.has(item.slot))
    .sort((first, second) => first.slot - second.slot || first.instanceId.localeCompare(second.instanceId))
    .map((item) => ({ instanceId: item.instanceId, id: item.id, slot: item.slot, level: item.level }));
}

function replacementLevelRange(targets: UpgradeReplacementTarget[]): { min: number; max: number; before: string; after: string; label: string } {
  const levels = targets.map((target) => Math.max(1, Math.min(3, Math.floor(target.level))));
  const min = levels.length > 0 ? Math.min(...levels) : 1;
  const max = levels.length > 0 ? Math.max(...levels) : 1;
  // Callers add the visible `Lv` prefix in their own sentence. Keep this
  // helper numeric so cards do not render the accidental `LvLv3` form.
  const range = min === max ? `${min}` : `${min}–${max}`;
  return {
    min,
    max,
    before: range,
    after: range,
    label: `${min === max ? min : `${min}–${max}`}`,
  };
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
    if (candidate.targetId !== 'polish' && candidate.targetId !== 'armor' && candidate.targetId !== 'parts' && candidate.targetId !== 'stabilizer') return false;
    callbacks.onContinuous?.(candidate.targetId);
    return true;
  }
  if (candidate.kind === 'expansion') {
    const layer = candidate.expansionLayer ?? (candidate.targetId === 'layer-2' ? 2 : candidate.targetId === 'layer-3' ? 3 : null);
    if (layer !== 2 && layer !== 3) return false;
    callbacks.onExpansion?.(layer);
    return true;
  }
  if (candidate.kind === 'weapon') {
    if (isReplacementCandidate(candidate)) return applyWeaponReplacement(candidate, weapons);
    if (candidate.id.endsWith(':new')) {
      const placementSlot = resolvePlacementSlot(candidate.placementSlot, weapons.map((item) => item.slot), candidate.placementSlots);
      if (weapons.some((item) => item.slot === placementSlot)) return false;
      weapons.push(new Weapon(candidate.targetId as WeaponId, placementSlot));
      return true;
    }
    const weapon = candidate.targetInstanceId
      ? weapons.find((item) => item.instanceId === candidate.targetInstanceId && item.id === candidate.targetId)
      : weapons.find((item) => item.id === candidate.targetId);
    if (!weapon) return false;
    if (candidate.id.includes(':focus')) {
      if (weapon.precisionBonus >= 2) return false;
      weapon.precisionBonus += 1;
      return true;
    }
    if (candidate.id.includes(':evolution:')) {
      const parts = candidate.id.split(':');
      const evolutionIndex = parts.indexOf('evolution');
      const evolutionId = evolutionIndex >= 0 ? parts[evolutionIndex + 1] : undefined;
      const nextLevel = evolutionIndex >= 0 ? Number(parts[evolutionIndex + 2]) : NaN;
      if (!evolutionId || nextLevel !== 8 || weapon.level !== 7 || weapon.evolutionId || !weapon.definition.evolutions.some((form) => form.id === evolutionId)) return false;
      weapon.evolutionId = evolutionId;
      weapon.level = 8;
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
    if (isReplacementCandidate(candidate)) return applySupportReplacement(candidate, supports);
    if (candidate.id.endsWith(':new')) {
      const placementSlot = resolvePlacementSlot(candidate.placementSlot, supports.map((item) => item.slot), candidate.placementSlots);
      if (supports.some((item) => item.slot === placementSlot)) return false;
      supports.push(new SupportModule(candidate.targetId as SupportId, placementSlot));
      return true;
    }
    const support = candidate.targetInstanceId
      ? supports.find((item) => item.instanceId === candidate.targetInstanceId && item.id === candidate.targetId)
      : supports.find((item) => item.id === candidate.targetId);
    if (!support || support.level >= support.definition.maxLevel) return false;
    support.level = Math.min(support.definition.maxLevel, support.level + 1);
    return true;
  }
  return false;
}

function applyWeaponReplacement(candidate: UpgradeCandidate, weapons: Weapon[]): boolean {
  const target = replacementTargetFor(candidate);
  if (!target || !WEAPONS[candidate.targetId as WeaponId] || target.id === candidate.targetId) return false;
  const index = weapons.findIndex((weapon) => weapon.instanceId === target.instanceId && weapon.id === target.id && weapon.slot === target.slot);
  if (index < 0 || weapons.some((weapon) => weapon.id === candidate.targetId)) return false;
  const outgoing = weapons[index]!;
  const replacement = new Weapon(candidate.targetId as WeaponId, outgoing.slot, uniqueReplacementInstanceId('weapon', candidate.targetId as WeaponId, outgoing.slot, outgoing.instanceId, weapons.map((weapon) => weapon.instanceId)));
  replacement.level = Math.min(outgoing.level, 3, replacement.definition.maxLevel);
  // A replacement starts a fresh attack path, but cannot be used to obtain a
  // free immediate shot. Carry only the current wait timer forward; precision,
  // both normal branches, and the Lv8 evolution intentionally reset.
  replacement.cooldown = Math.max(0, Number.isFinite(outgoing.cooldown) ? outgoing.cooldown : 0);
  if (replacement.level >= 3) {
    const options = replacement.definition.branches.filter((branch) => branch.atLevel === 3 && branch.id !== 'power' && branch.id !== 'tempo');
    if (options.length > 0) {
      const requested = candidate.replacementBranch;
      const selected = requested !== undefined ? options.find((branch) => branch.id === requested) : undefined;
      // Lv3 replacement branches are a real choice. Refuse a missing or
      // malformed branch rather than silently granting a hidden default.
      if (!selected) return false;
      replacement.branch = selected.id as Weapon['branch'];
    }
  } else if (candidate.replacementBranch !== undefined) {
    return false;
  }
  weapons.splice(index, 1, replacement);
  return true;
}

function applySupportReplacement(candidate: UpgradeCandidate, supports: SupportModule[]): boolean {
  const target = replacementTargetFor(candidate);
  if (!target || !SUPPORTS[candidate.targetId as SupportId] || target.id === candidate.targetId) return false;
  const index = supports.findIndex((support) => support.instanceId === target.instanceId && support.id === target.id && support.slot === target.slot);
  if (index < 0 || supports.some((support) => support.id === candidate.targetId)) return false;
  const outgoing = supports[index]!;
  const replacement = new SupportModule(candidate.targetId as SupportId, outgoing.slot, uniqueReplacementInstanceId('support', candidate.targetId as SupportId, outgoing.slot, outgoing.instanceId, supports.map((support) => support.instanceId)));
  replacement.level = Math.min(outgoing.level, 3, replacement.definition.maxLevel);
  supports.splice(index, 1, replacement);
  return true;
}

function uniqueReplacementInstanceId(kind: 'weapon' | 'support', id: WeaponId | SupportId, slot: number, replacedInstanceId: string, occupiedIds: string[]): string {
  const occupied = new Set(occupiedIds);
  const safeTarget = replacedInstanceId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'target';
  const base = `${kind}-${id}-s${slot}-replacement-${safeTarget}`;
  let instanceId = base;
  let suffix = 2;
  while (occupied.has(instanceId)) {
    instanceId = `${base}-${suffix}`;
    suffix += 1;
  }
  return instanceId;
}

function resolvePlacementSlot(requestedSlot: number | undefined, occupiedSlots: number[], allowedSlots?: number[]): number {
  const availableSlots = (allowedSlots ?? Array.from({ length: DEVICE_SLOT_COUNT }, (_, slot) => slot)).filter((slot) => !occupiedSlots.includes(slot));
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
    copy.evolutionId = weapon.evolutionId;
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
