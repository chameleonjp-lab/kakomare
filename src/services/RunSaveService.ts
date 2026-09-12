import type { StorageLike } from './SaveService';
import { InputRecorder, MAX_INPUT_EVENTS, type NormalizedRunInput } from '../game/systems/InputRecorder';
import {
  RUN_DAMAGED_SAVE_KEY,
  RUN_SAVE_KEY,
  RUN_SAVE_TEMP_KEY,
  RUN_SAVE_VERSION,
  type RunRandomState,
  type RunSaveEnvelope,
  type RunSavePhase,
} from '../types/runSave';
import type { BattleSnapshot } from '../types/game';
import { STAGE_ORDER } from '../data/stages';
import { BOSSES } from '../data/bosses';
import { ENEMIES } from '../data/enemies';
import { SUPPORTS } from '../data/supports';
import { WEAPONS } from '../data/weapons';
import { layerForSlot, MAX_DEVICE_SLOT_COUNT, nodeIdForSlot, SLOTS_PER_LAYER } from '../game/deviceLayout';
import { BUILD_CAPACITY_BY_LAYER } from '../game/build/BuildCapacity';
import { MAX_PENDING_CHOICES, MAX_PROGRESSION_EXPERIENCE, MAX_PROGRESSION_LEVEL } from '../game/systems/ProgressionSystem';
import { FixedStepClock } from '../game/systems/FixedStepClock';

// Replacements can leave several generations of source weapons alive while
// their short-lived projectiles/fields resolve. Bound the serialized source
// list separately from the nine active faces to keep malformed saves cheap to
// inspect while preserving every legitimate in-flight attribution.
const MAX_RETIRED_WEAPON_SOURCES = MAX_DEVICE_SLOT_COUNT * 8;

export interface RunSaveLoadResult {
  data: RunSaveEnvelope | null;
  recovered: boolean;
  message: string;
}

export interface RunSaveMutationResult {
  persisted: boolean;
  data: RunSaveEnvelope;
}

function getStorage(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function nonNegativeInteger(value: unknown): value is number {
  return finite(value) && Number.isInteger(value) && value >= 0;
}

function isRunPhase(value: unknown): value is RunSavePhase {
  return value === 'playing' || value === 'paused' || value === 'upgrade';
}

function isInputLog(value: unknown, maxTick = Number.MAX_SAFE_INTEGER): value is NormalizedRunInput[] {
  if (!Array.isArray(value) || value.length > MAX_INPUT_EVENTS) return false;
  const recorder = new InputRecorder();
  return value.every((event) => {
    if (!isRecord(event) || !Number.isSafeInteger(event.tick) || (event.tick as number) < 0 || (event.tick as number) > maxTick || typeof event.kind !== 'string') return false;
    if (event.kind === 'aim') return finite(event.angle) && recorder.record(event as NormalizedRunInput);
    if (event.kind === 'upgrade') return Number.isInteger(event.selectionId) && (event.selectionId as number) > 0 && typeof event.candidateId === 'string' && recorder.record(event as NormalizedRunInput);
    if (event.kind === 'build') {
      if ((event.action !== 'move' && event.action !== 'swap') || typeof event.instanceId !== 'string') return false;
      if (event.action === 'move' && (!Number.isInteger(event.slot) || (event.slot as number) < 0)) return false;
      if (event.action === 'swap' && typeof event.otherInstanceId !== 'string') return false;
      return recorder.record(event as NormalizedRunInput);
    }
    return event.kind === 'pause' || event.kind === 'resume' || event.kind === 'retire'
      ? recorder.record(event as NormalizedRunInput)
      : false;
  });
}

function isRandomState(value: unknown): value is RunRandomState {
  return isRecord(value)
    && Number.isSafeInteger(value['enemy-spawn']) && (value['enemy-spawn'] as number) >= 0 && (value['enemy-spawn'] as number) <= 0xffffffff
    && Number.isSafeInteger(value['candidate-draw']) && (value['candidate-draw'] as number) >= 0 && (value['candidate-draw'] as number) <= 0xffffffff
    && Number.isSafeInteger(value['combat-effect']) && (value['combat-effect'] as number) >= 0 && (value['combat-effect'] as number) <= 0xffffffff
    && Number.isSafeInteger(value.presentation) && (value.presentation as number) >= 0 && (value.presentation as number) <= 0xffffffff;
}

function isRankingSession(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return ['startId', 'playId', 'displayName', 'gameSlug', 'clientVersion', 'ruleVersion'].every((key) => isBoundedText(value[key], key === 'displayName' ? 20 : 160))
    && isBoundedText(value.startedAt, 80) && Number.isFinite(Date.parse(value.startedAt));
}

function isSnapshot(value: unknown): value is BattleSnapshot {
  if (!isRecord(value)) return false;
  const numericKeys = ['elapsed', 'timeLimit', 'core', 'maxCore', 'level', 'experience', 'nextExperience', 'pendingUpgrades', 'score', 'kills', 'aimAngle'];
  if (!numericKeys.every((key) => finite(value[key]))) return false;
  if ((value.elapsed as number) < 0 || (value.elapsed as number) > 1_000_000_000 || (value.timeLimit as number) < 0 || (value.timeLimit as number) > 1_000_000_000 || (value.isEndless === true ? value.timeLimit !== 0 : (value.timeLimit as number) <= 0) || (value.core as number) < 0 || (value.maxCore as number) <= 0
    || (value.core as number) > (value.maxCore as number) || (value.experience as number) < 0 || (value.nextExperience as number) <= 0
    || (value.experience as number) > MAX_PROGRESSION_EXPERIENCE || (value.pendingUpgrades as number) < 0 || (value.pendingUpgrades as number) > MAX_PENDING_CHOICES || (value.score as number) < 0 || (value.kills as number) < 0 || !Number.isSafeInteger(value.score) || !Number.isSafeInteger(value.kills)) return false;
  const level = value.level;
  const pendingUpgrades = value.pendingUpgrades;
  if (!Number.isSafeInteger(level) || (level as number) < 1 || (level as number) > MAX_PROGRESSION_LEVEL || !Number.isSafeInteger(pendingUpgrades) || (pendingUpgrades as number) < 0) return false;
  if (typeof value.isEndless !== 'boolean' || typeof value.manualAim !== 'boolean' || typeof value.bossActive !== 'boolean' || typeof value.bossDefeated !== 'boolean') return false;
  if (!Array.isArray(value.enemies) || value.enemies.length > 180 || !value.enemies.every(isEnemySnapshot)) return false;
  if (!Array.isArray(value.projectiles) || value.projectiles.length > 360 || !value.projectiles.every(isProjectileSnapshot)) return false;
  if (!Array.isArray(value.weapons) || value.weapons.length > MAX_DEVICE_SLOT_COUNT || !value.weapons.every(isWeaponSnapshot)) return false;
  if (value.retiredWeaponSources !== undefined
    && (!Array.isArray(value.retiredWeaponSources) || value.retiredWeaponSources.length > MAX_RETIRED_WEAPON_SOURCES || !value.retiredWeaponSources.every(isWeaponSnapshot))) return false;
  if (!Array.isArray(value.supports) || value.supports.length > MAX_DEVICE_SLOT_COUNT || !value.supports.every(isSupportSnapshot)) return false;
  const enemyIds = new Set(value.enemies.map((enemy) => enemy.id));
  const projectileIds = new Set(value.projectiles.map((projectile) => projectile.id));
  const retiredWeapons = (value.retiredWeaponSources ?? []) as unknown as Array<{ instanceId: string; nodeId: string; slot: number }>;
  const activeInstanceIds = new Set([...value.weapons, ...value.supports].map((item) => item.instanceId));
  const instanceIds = new Set([...value.weapons, ...value.supports, ...retiredWeapons].map((item) => item.instanceId));
  if (enemyIds.size !== value.enemies.length || projectileIds.size !== value.projectiles.length
    || instanceIds.size !== value.weapons.length + value.supports.length + retiredWeapons.length) return false;
  if (retiredWeapons.some((weapon) => activeInstanceIds.has(weapon.instanceId) || weapon.nodeId !== nodeIdForSlot('weapon', weapon.slot))) return false;
  for (const projectile of value.projectiles) {
    if (projectile.sourceWeaponId !== null && !(projectile.sourceWeaponId in WEAPONS)) return false;
    if (projectile.sourceWeaponInstanceId !== null && !instanceIds.has(projectile.sourceWeaponInstanceId)) return false;
  }
  if (!Array.isArray(value.sectorDamage)) return false;
  if (value.sectorDamage.length !== 6 || !value.sectorDamage.every((item) => finite(item) && (item as number) >= 0)) return false;
  if (value.pendingUpgradeSelectionId !== undefined && value.pendingUpgradeSelectionId !== null
    && (!Number.isInteger(value.pendingUpgradeSelectionId) || (value.pendingUpgradeSelectionId as number) < 1)) return false;
  const weaponSlots = new Set<number>();
  const supportSlots = new Set<number>();
  for (const weapon of value.weapons) {
    if (weapon.nodeId !== nodeIdForSlot('weapon', weapon.slot) || weaponSlots.has(weapon.slot)) return false;
    weaponSlots.add(weapon.slot);
  }
  for (const support of value.supports) {
    if (support.nodeId !== nodeIdForSlot('support', support.slot) || supportSlots.has(support.slot)) return false;
    supportSlots.add(support.slot);
  }
  if (value.build !== undefined && !isBuildSnapshot(value.build)) return false;
  if (value.build !== undefined) {
    // `isBuildSnapshot` performs the deep shape check above, but the
    // structural guard is intentionally repeated here so TypeScript does not
    // widen the untrusted JSON back to `{}` while cross-checking instances.
    if (!isRecord(value.build) || !isRecord(value.build.graph) || !Array.isArray(value.build.graph.nodes)
      || !isRecord(value.build.capacity) || !Array.isArray(value.build.capacity.allocations)) return false;
    const build = value.build;
    const graph = value.build.graph;
    const capacity = value.build.capacity;
    const layer = build.unlockedLayer as number;
    const nodes = graph.nodes as unknown[];
    const allocations = capacity.allocations as unknown[];
    if ([...weaponSlots, ...supportSlots].some((slot) => (layerForSlot(slot) ?? 99) > layer)) return false;
    const installed = new Map<string, 'weapon' | 'support'>();
    for (const node of nodes) {
      if (!isRecord(node) || (node.occupiedInstanceId !== null && typeof node.occupiedInstanceId !== 'string')
        || (node.kind !== 'weapon' && node.kind !== 'support')) return false;
      if (!node.occupiedInstanceId) continue;
      if (installed.has(node.occupiedInstanceId)) return false;
      installed.set(node.occupiedInstanceId, node.kind);
    }
    const instances = new Map<string, 'weapon' | 'support'>([
      ...value.weapons.map((weapon) => [weapon.instanceId, 'weapon'] as const),
      ...value.supports.map((support) => [support.instanceId, 'support'] as const),
    ]);
    if (installed.size !== instances.size || [...instances].some(([id, kind]) => installed.get(id) !== kind)) return false;
    if (allocations.length !== instances.size || [...instances].some(([id, kind]) => allocations.some((allocation) => isRecord(allocation) && allocation.instanceId === id && allocation.kind === kind) === false)) return false;
  }
  return true;
}

function isBuildSnapshot(value: unknown): boolean {
  if (!isRecord(value) || ![1, 2, 3].includes(value.unlockedLayer as number)
    || !isRecord(value.graph) || !Array.isArray(value.graph.nodes) || !Array.isArray(value.graph.connections)
    || !isRecord(value.capacity) || !Array.isArray(value.capacity.allocations)) return false;
  const unlockedLayer = value.unlockedLayer as 1 | 2 | 3;
  if (value.graph.nodes.length !== MAX_DEVICE_SLOT_COUNT * 2 || value.graph.connections.length !== unlockedLayer * SLOTS_PER_LAYER || value.capacity.allocations.length > MAX_DEVICE_SLOT_COUNT * 2) return false;
  if (value.graph.unlockedLayer !== value.unlockedLayer || value.capacity.unlockedLayer !== value.unlockedLayer) return false;
  if (!Number.isInteger(value.capacity.maximum) || value.capacity.maximum !== BUILD_CAPACITY_BY_LAYER[unlockedLayer] || !Number.isInteger(value.capacity.used) || !Number.isInteger(value.capacity.remaining)
    || (value.capacity.used as number) < 0 || (value.capacity.maximum as number) < 1
    || value.capacity.remaining !== (value.capacity.maximum as number) - (value.capacity.used as number)) return false;
  const nodeIds = new Set<string>();
  for (const rawNode of value.graph.nodes) {
    if (!isRecord(rawNode) || typeof rawNode.nodeId !== 'string' || rawNode.nodeId.length === 0 || rawNode.nodeId.length > 160
      || nodeIds.has(rawNode.nodeId) || (rawNode.kind !== 'weapon' && rawNode.kind !== 'support')
      || ![1, 2, 3].includes(rawNode.layer as number) || !Number.isInteger(rawNode.slot) || (rawNode.slot as number) < 0 || (rawNode.slot as number) >= MAX_DEVICE_SLOT_COUNT
      || rawNode.nodeId !== nodeIdForSlot(rawNode.kind, rawNode.slot as number)
      || rawNode.layer !== layerForSlot(rawNode.slot as number)
      || !Number.isInteger(rawNode.sector) || rawNode.sector !== (rawNode.slot as number) % SLOTS_PER_LAYER
      || !Number.isFinite(rawNode.x) || !Number.isFinite(rawNode.y)
      || (rawNode.occupiedInstanceId !== null && (typeof rawNode.occupiedInstanceId !== 'string' || rawNode.occupiedInstanceId.length === 0 || rawNode.occupiedInstanceId.length > 160))
      || typeof rawNode.unlocked !== 'boolean' || rawNode.unlocked !== ((rawNode.layer as number) <= unlockedLayer)
      || (rawNode.parentNodeId !== null && typeof rawNode.parentNodeId !== 'string')) return false;
    const layer = rawNode.layer as 1 | 2 | 3;
    const sector = rawNode.sector as number;
    const expectedParent = layer === 1 ? null : nodeIdForSlot(rawNode.kind, (layer - 2) * SLOTS_PER_LAYER + sector);
    if (rawNode.parentNodeId !== expectedParent) return false;
    nodeIds.add(rawNode.nodeId);
  }
  if (nodeIds.size !== MAX_DEVICE_SLOT_COUNT * 2) return false;
  const connectionIds = new Set<string>();
  for (const rawConnection of value.graph.connections) {
    if (!isRecord(rawConnection) || typeof rawConnection.supportNodeId !== 'string' || connectionIds.has(rawConnection.supportNodeId)
      || !nodeIds.has(rawConnection.supportNodeId) || !rawConnection.supportNodeId.startsWith('support-')
      || !Array.isArray(rawConnection.weaponNodeIds) || rawConnection.weaponNodeIds.length !== 2
      || !rawConnection.weaponNodeIds.every((id) => typeof id === 'string' && nodeIds.has(id) && id.startsWith('weapon-'))) return false;
    const supportMatch = /^support-l([1-3])-s([0-2])$/.exec(rawConnection.supportNodeId);
    if (!supportMatch) return false;
    const supportLayer = Number(supportMatch[1]) as 1 | 2 | 3;
    const supportSector = Number(supportMatch[2]);
    if (supportLayer > unlockedLayer) return false;
    const baseSlot = (supportLayer - 1) * SLOTS_PER_LAYER;
    const expectedWeapons = [
      nodeIdForSlot('weapon', baseSlot + supportSector),
      nodeIdForSlot('weapon', baseSlot + (supportSector + 1) % SLOTS_PER_LAYER),
    ];
    if (rawConnection.weaponNodeIds[0] !== expectedWeapons[0] || rawConnection.weaponNodeIds[1] !== expectedWeapons[1]) return false;
    connectionIds.add(rawConnection.supportNodeId);
  }
  const expectedConnections = new Set<string>();
  for (let layer = 1; layer <= unlockedLayer; layer += 1) for (let sector = 0; sector < SLOTS_PER_LAYER; sector += 1) expectedConnections.add(nodeIdForSlot('support', (layer - 1) * SLOTS_PER_LAYER + sector));
  if (connectionIds.size !== expectedConnections.size || [...expectedConnections].some((id) => !connectionIds.has(id))) return false;
  const allocationIds = new Set<string>();
  let allocationTotal = 0;
  for (const allocation of value.capacity.allocations) {
    if (!isRecord(allocation) || typeof allocation.instanceId !== 'string' || allocation.instanceId.length === 0 || allocation.instanceId.length > 160
      || allocationIds.has(allocation.instanceId) || !Number.isInteger(allocation.cost) || (allocation.cost as number) <= 0 || (allocation.cost as number) > value.capacity.maximum
      || (allocation.kind !== 'weapon' && allocation.kind !== 'support')) return false;
    allocationIds.add(allocation.instanceId);
    allocationTotal += allocation.cost as number;
    if (allocationTotal > value.capacity.maximum) return false;
  }
  return allocationTotal === value.capacity.used;
}

function isEnemySnapshot(value: unknown): boolean {
  if (!isRecord(value) || !Number.isSafeInteger(value.id) || (value.id as number) < 1 || typeof value.type !== 'string') return false;
  const isBossType = value.type in BOSSES;
  if (!isBossType && !(value.type in ENEMIES)) return false;
  const numeric = ['x', 'y', 'distanceToCore', 'hitRadius', 'hp', 'maxHp', 'shieldHits', 'slowFactor'];
  if (!numeric.every((key) => finite(value[key])) || (value.hp as number) < 0 || (value.maxHp as number) <= 0 || (value.hp as number) > (value.maxHp as number)
    || (value.distanceToCore as number) < 0 || (value.hitRadius as number) < 0 || (value.shieldHits as number) < 0) return false;
  const optionalNumeric = ['telegraphPhase', 'shieldRotation', 'age', 'shotCooldown', 'specialCooldown', 'pressureCooldown', 'slowRemaining', 'markedRemaining', 'burningRemaining', 'movementAngle', 'movementDistance', 'specialDamageTaken'];
  if (!optionalNumeric.every((key) => value[key] === undefined || finite(value[key]))) return false;
  return typeof value.isBoss === 'boolean' && value.isBoss === isBossType && typeof value.invulnerable === 'boolean' && typeof value.telegraph === 'boolean'
    && typeof value.slowFactor === 'number' && value.slowFactor > 0
    && (value.marked === undefined || typeof value.marked === 'boolean')
    && (value.burning === undefined || typeof value.burning === 'boolean')
    && (value.splitDone === undefined || typeof value.splitDone === 'boolean')
    && (value.summoned === undefined || typeof value.summoned === 'boolean')
    && (value.summonedChildren === undefined || nonNegativeInteger(value.summonedChildren));
}

function isProjectileSnapshot(value: unknown): boolean {
  if (!isRecord(value) || !Number.isSafeInteger(value.id) || (value.id as number) < 1) return false;
  if (!['needle', 'cluster', 'disc', 'lance', 'grid', 'drone', 'enemy'].includes(value.kind as string)) return false;
  if (!['x', 'y', 'vx', 'vy', 'radius', 'damage', 'life', 'maxLife', 'piercing', 'bounces', 'boundaryRadius'].every((key) => finite(value[key]))) return false;
  if ((value.life as number) < 0 || (value.maxLife as number) <= 0 || (value.life as number) > (value.maxLife as number) || (value.radius as number) < 0
    || (value.bounces as number) < 0 || (value.piercing as number) < 0 || (value.boundaryRadius as number) <= 0 || typeof value.enemyProjectile !== 'boolean') return false;
  const optionalNumeric = ['hitCooldown', 'impactX', 'impactY', 'impactRadius', 'impactAngle'];
  if (!optionalNumeric.every((key) => value[key] === undefined || value[key] === null || finite(value[key]))) return false;
  if (value.targetId !== undefined && value.targetId !== null && (!Number.isInteger(value.targetId) || (value.targetId as number) < 1)) return false;
  if (value.clusterSplitChild !== undefined && typeof value.clusterSplitChild !== 'boolean') return false;
  if (value.impactWarningShown !== undefined && typeof value.impactWarningShown !== 'boolean') return false;
  if (value.hitAt !== undefined && (!Array.isArray(value.hitAt) || value.hitAt.length > 180 || !value.hitAt.every((pair) => Array.isArray(pair) && pair.length === 2 && Number.isInteger(pair[0]) && (pair[0] as number) >= 1 && finite(pair[1]) && (pair[1] as number) >= 0))) return false;
  return (value.sourceWeaponId === null || isBoundedText(value.sourceWeaponId))
    && (value.sourceWeaponInstanceId === null || isBoundedText(value.sourceWeaponInstanceId));
}

function isWeaponSnapshot(value: unknown): boolean {
  if (!isRecord(value) || typeof value.id !== 'string' || !(value.id in WEAPONS) || !isBoundedText(value.instanceId) || typeof value.nodeId !== 'string' || !Number.isInteger(value.slot) || (value.slot as number) < 0 || (value.slot as number) >= MAX_DEVICE_SLOT_COUNT || !Number.isInteger(value.level) || (value.level as number) < 1 || (value.level as number) > WEAPONS[value.id as keyof typeof WEAPONS].levels.length || !finite(value.damageDealt) || (value.damageDealt as number) < 0 || (value.damageDealt as number) > Number.MAX_SAFE_INTEGER) return false;
  const definition = WEAPONS[value.id as keyof typeof WEAPONS];
  if (value.branch !== null && (typeof value.branch !== 'string' || !definition.branches.some((branch) => branch.id === value.branch))) return false;
  if (value.finalBranch !== null && (value.finalBranch !== 'power' && value.finalBranch !== 'tempo')) return false;
  if (value.evolutionId !== null && (typeof value.evolutionId !== 'string' || !definition.evolutions.some((evolution) => evolution.id === value.evolutionId))) return false;
  if (value.evolutionId !== null && (value.level as number) < 8) return false;
  for (const key of ['cooldownRemaining', 'precisionBonus', 'shotsFired']) if (value[key] !== undefined && (!finite(value[key]) || (value[key] as number) < 0)) return false;
  if (value.shotsFired !== undefined && !Number.isSafeInteger(value.shotsFired)) return false;
  return true;
}

function isSupportSnapshot(value: unknown): boolean {
  return isRecord(value) && typeof value.id === 'string' && value.id in SUPPORTS && isBoundedText(value.instanceId) && typeof value.nodeId === 'string' && Number.isInteger(value.slot) && (value.slot as number) >= 0 && (value.slot as number) < MAX_DEVICE_SLOT_COUNT && Number.isInteger(value.level) && (value.level as number) >= 1 && (value.level as number) <= SUPPORTS[value.id as keyof typeof SUPPORTS].levels.length;
}

function cloneInput(event: NormalizedRunInput): NormalizedRunInput {
  return { ...event } as NormalizedRunInput;
}

function cloneSnapshot(snapshot: BattleSnapshot): BattleSnapshot {
  // Snapshots contain only JSON-compatible values by contract. A JSON round
  // trip also prevents a caller from mutating the value after it is queued.
  return JSON.parse(JSON.stringify(snapshot)) as BattleSnapshot;
}

function isValidEnvelope(value: unknown): value is RunSaveEnvelope {
  if (!isRecord(value) || value.version !== RUN_SAVE_VERSION) return false;
  if (typeof value.runId !== 'string' || value.runId.length < 1 || value.runId.length > 100 || !Number.isSafeInteger(value.runSeed) || (value.runSeed as number) < 0 || (value.runSeed as number) > 0xffffffff) return false;
  if (typeof value.stageId !== 'string' || !STAGE_ORDER.includes(value.stageId as RunSaveEnvelope['stageId'])) return false;
  if (typeof value.ruleVersion !== 'string' || value.ruleVersion.length < 1 || typeof value.contentVersion !== 'string' || value.contentVersion.length < 1) return false;
  if (typeof value.competitive !== 'boolean' || !isRunPhase(value.phase) || typeof value.savedAt !== 'string' || !finite(Date.parse(value.savedAt)) || !Number.isSafeInteger(value.tick) || !nonNegativeInteger(value.tick) || value.tick > 1_000_000_000) return false;
  if (!isSnapshot(value.snapshot) || !isInputLog(value.inputLog, value.tick) || !isRandomState(value.randomState)) return false;
  if (value.rankingSession !== undefined && !isRankingSession(value.rankingSession)) return false;
  if (value.spawnState !== undefined && !isSpawnState(value.spawnState)) return false;
  if (value.runtimeState !== undefined && !isRuntimeState(value.runtimeState)) return false;
  const runtime = value.runtimeState;
  const pauseReturnState = isRecord(runtime) ? runtime.pauseReturnState : undefined;
  const hasUpgradePayload = isRecord(runtime) && isRecord(runtime.upgradePayload)
    && (runtime.upgradePayload.phase === undefined || runtime.upgradePayload.phase === 'selection' || runtime.upgradePayload.phase === 'break');
  if ((value.phase === 'upgrade' || pauseReturnState === 'upgrade') && !hasUpgradePayload) return false;
  return true;
}

function isSpawnState(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const integerKeys = ['lastSector', 'consecutiveSectorCount', 'specialWaveCount', 'endlessBossIndex'];
  const finiteKeys = ['budget', 'nextBossAt', 'updateAccumulator', 'simulatedElapsed', 'nextSpecialWaveAt'];
  if (!integerKeys.every((key) => value[key] === undefined || Number.isSafeInteger(value[key]) && ((key === 'lastSector' && (value[key] as number) >= -1) || (key !== 'lastSector' && (value[key] as number) >= 0)))) return false;
  if (value.lastSector !== undefined && (value.lastSector as number) >= 6) return false;
  if (!finiteKeys.every((key) => value[key] === undefined || finite(value[key]) && (value[key] as number) >= 0)) return false;
  if (value.bossSent !== undefined && typeof value.bossSent !== 'boolean') return false;
  if (value.bossPending !== undefined && typeof value.bossPending !== 'boolean') return false;
  if (value.pendingEnemy !== null && value.pendingEnemy !== undefined && (typeof value.pendingEnemy !== 'string' || !(value.pendingEnemy in ENEMIES))) return false;
  if (value.rngState !== undefined && (!Number.isSafeInteger(value.rngState) || (value.rngState as number) < 0 || (value.rngState as number) > 0xffffffff)) return false;
  if (value.pendingSpecialWave !== null && value.pendingSpecialWave !== undefined) {
    if (!isRecord(value.pendingSpecialWave) || !finite(value.pendingSpecialWave.angle) || !finite(value.pendingSpecialWave.life) || value.pendingSpecialWave.life < 0 || !Array.isArray(value.pendingSpecialWave.types) || value.pendingSpecialWave.types.length < 1 || value.pendingSpecialWave.types.length > 3 || !value.pendingSpecialWave.types.every((type) => typeof type === 'string' && type in ENEMIES)) return false;
  }
  return true;
}

function isRuntimeState(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (value.state !== undefined && !isRunPhase(value.state)) return false;
  if (value.pauseReturnState !== undefined && value.pauseReturnState !== 'playing' && value.pauseReturnState !== 'upgrade') return false;
  for (const key of ['pendingUpgradeDeferred', 'upgradeRequestQueued', 'testUpgradeOpened', 'bossDefeated']) if (value[key] !== undefined && typeof value[key] !== 'boolean') return false;
  for (const key of ['rerollsLeft', 'bansLeft', 'repairsUsed', 'upgradeSequence', 'choicesSinceBreak', 'endlessMilestone', 'nextMineId', 'enemyPoolNextId', 'projectilePoolNextId', 'crownWavesTriggered']) if (value[key] !== undefined && (!Number.isSafeInteger(value[key]) || (value[key] as number) < 0 || (value[key] as number) > 1_000_000_000)) return false;
  for (const key of ['weaponPolishStacks', 'pendingPartsBonus', 'stabilizerStacks']) if (value[key] !== undefined && (!finite(value[key]) || (value[key] as number) < 0 || (value[key] as number) > 1_000_000_000)) return false;
  if (value.lastEnemyNotice !== undefined && !isBoundedText(value.lastEnemyNotice, 240, true)) return false;
  if (value.banned !== undefined) {
    if (!Array.isArray(value.banned) || value.banned.length > 1000) return false;
    const banned = new Set<string>();
    for (const item of value.banned) {
      if (!isBoundedText(item) || banned.has(item)) return false;
      banned.add(item);
    }
  }
  if (value.pendingSporeSplits !== undefined) {
    if (!Array.isArray(value.pendingSporeSplits) || value.pendingSporeSplits.length > 180
      || !value.pendingSporeSplits.every((item) => finite(item) && (item as number) >= -Math.PI * 2 && (item as number) <= Math.PI * 2)) return false;
  }
  for (const key of ['gravityFields', 'mines', 'drones', 'lanceCharge', 'orbitAngles', 'orbitHits', 'targetLocks', 'supportPulseAt', 'igniteTriggered', 'discTrailAt']) {
    if (value[key] !== undefined && !Array.isArray(value[key])) return false;
  }
  if (Array.isArray(value.gravityFields) && (value.gravityFields.length > 24 || !value.gravityFields.every(isGravityFieldRuntime))) return false;
  if (Array.isArray(value.mines) && (value.mines.length > 48 || !value.mines.every(isMineFieldRuntime))) return false;
  if (Array.isArray(value.drones)) {
    if (value.drones.length > MAX_DEVICE_SLOT_COUNT) return false;
    const instanceIds = new Set<string>();
    let unitCount = 0;
    for (const item of value.drones) {
      if (!isRecord(item) || !isBoundedText(item.instanceId) || instanceIds.has(item.instanceId) || !Array.isArray(item.units) || item.units.length > 2 || !item.units.every(isDroneUnitRuntime)) return false;
      instanceIds.add(item.instanceId);
      unitCount += item.units.length;
      if (unitCount > 24 || item.units.some((unit) => unit.sourceWeaponInstanceId !== item.instanceId)) return false;
    }
  }
  if (!isStringNumberMap(value.lanceCharge, 18, (number) => number >= 0)) return false;
  if (!isStringNumberMap(value.orbitAngles, 18)) return false;
  if (!isStringNumberMap(value.orbitHits, 10_000, (number) => number >= 0)) return false;
  if (!isStringIntegerMap(value.targetLocks, 18, (number) => number >= 1)) return false;
  if (!isStringNumberMap(value.supportPulseAt, 18, (number) => number >= 0)) return false;
  if (!isNumberNumberMap(value.discTrailAt, 360, (number) => number >= 0)) return false;
  if (Array.isArray(value.igniteTriggered)) {
    if (value.igniteTriggered.length > 180) return false;
    const ids = new Set<number>();
    for (const item of value.igniteTriggered) {
      if (!Number.isSafeInteger(item) || (item as number) < 1 || ids.has(item as number)) return false;
      ids.add(item as number);
    }
  }
  if (value.upgradePayload !== undefined && value.upgradePayload !== null && !isUpgradePayload(value.upgradePayload)) return false;
  if (value.recorder !== undefined && !isRecorderState(value.recorder)) return false;
  if (value.clock !== undefined && !isRecord(value.clock)) return false;
  const clock = value.clock;
  if (isRecord(clock) && (!finite(clock.accumulatorTicks) || (clock.accumulatorTicks as number) < 0 || (clock.accumulatorTicks as number) >= FixedStepClock.STEP_TICKS || !Number.isSafeInteger(clock.totalSteps) || (clock.totalSteps as number) < 0 || (clock.totalSteps as number) > 1_000_000_000)) return false;
  for (const key of ['designerWave', 'echoWave', 'crownPressure', 'specialWaveWarning']) if (value[key] !== undefined && value[key] !== null && !isWaveRuntime(value[key])) return false;
  if (value.lastDesignerSector !== undefined && (!Number.isSafeInteger(value.lastDesignerSector) || (value.lastDesignerSector as number) < -1 || (value.lastDesignerSector as number) >= 6)) return false;
  return true;
}

function isBoundedText(value: unknown, max = 160, allowEmpty = false): value is string {
  return typeof value === 'string' && (allowEmpty || value.length > 0) && value.length <= max;
}

function isGravityFieldRuntime(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const numeric = ['x', 'y', 'life', 'maxLife', 'radius', 'damage', 'pullStrength', 'safeDistance', 'damageTimer', 'collapseDamage', 'slowDuration'];
  if (!numeric.every((key) => finite(value[key])) || !finite(value.life) || !finite(value.maxLife) || value.life < 0 || value.maxLife <= 0 || value.life > value.maxLife) return false;
  if (!['radius', 'damage', 'pullStrength', 'safeDistance', 'damageTimer', 'collapseDamage', 'slowDuration'].every((key) => (value[key] as number) >= 0)) return false;
  return typeof value.collapse === 'boolean' && (value.sourceWeaponInstanceId === null || isBoundedText(value.sourceWeaponInstanceId));
}

function isMineFieldRuntime(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Number.isSafeInteger(value.id) && (value.id as number) > 0 && finite(value.x) && finite(value.y) && finite(value.life) && finite(value.maxLife)
    && value.life >= 0 && value.maxLife > 0 && value.life <= value.maxLife && finite(value.radius) && value.radius >= 0 && finite(value.damage) && value.damage >= 0
    && isBoundedText(value.sourceWeaponInstanceId) && typeof value.triggered === 'boolean';
}

function isDroneUnitRuntime(value: unknown): value is Record<string, unknown> & { sourceWeaponInstanceId: string } {
  if (!isRecord(value)) return false;
  return Number.isSafeInteger(value.index) && (value.index as number) >= 0 && finite(value.x) && finite(value.y) && finite(value.angle)
    && finite(value.cooldown) && value.cooldown >= 0 && finite(value.life) && finite(value.maxLife) && value.life >= 0 && value.maxLife > 0
    && value.life <= value.maxLife && isBoundedText(value.sourceWeaponInstanceId);
}

function isStringNumberMap(value: unknown, max: number, predicate: (number: number) => boolean = () => true): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > max) return false;
  const keys = new Set<string>();
  for (const item of value) {
    if (!Array.isArray(item) || item.length !== 2 || !isBoundedText(item[0]) || keys.has(item[0]) || !finite(item[1]) || !predicate(item[1])) return false;
    keys.add(item[0]);
  }
  return true;
}

function isStringIntegerMap(value: unknown, max: number, predicate: (number: number) => boolean): boolean {
  return isStringNumberMap(value, max, (number) => Number.isSafeInteger(number) && predicate(number));
}

function isNumberNumberMap(value: unknown, max: number, predicate: (number: number) => boolean): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > max) return false;
  const keys = new Set<number>();
  for (const item of value) {
    if (!Array.isArray(item) || item.length !== 2 || !Number.isSafeInteger(item[0]) || (item[0] as number) < 1 || keys.has(item[0] as number) || !finite(item[1]) || !predicate(item[1] as number)) return false;
    keys.add(item[0] as number);
  }
  return true;
}

function isWaveRuntime(value: unknown): boolean {
  return isRecord(value) && finite(value.angle) && finite(value.life) && finite(value.maxLife) && value.life >= 0 && value.maxLife > 0 && value.life <= value.maxLife;
}

function isUpgradePayload(value: unknown): boolean {
  if (!isRecord(value) || (value.phase !== undefined && value.phase !== 'selection' && value.phase !== 'break') || !Number.isSafeInteger(value.selectionId) || (value.selectionId as number) < 1 || (value.selectionId as number) > 1_000_000_000 || !Array.isArray(value.candidates) || value.candidates.length > 3) return false;
  const candidateIds = new Set<string>();
  for (const candidate of value.candidates) {
    if (!isRecord(candidate) || !isBoundedText(candidate.id) || candidateIds.has(candidate.id)
      || !['weapon', 'support', 'repair', 'continuous', 'expansion'].includes(candidate.kind as string)
      || !isBoundedText(candidate.targetId) || !isBoundedText(candidate.title, 240) || !isBoundedText(candidate.description, 1000)
      || !isBoundedText(candidate.before, 240) || !isBoundedText(candidate.after, 240) || !isBoundedText(candidate.role, 240)
      || typeof candidate.isExisting !== 'boolean') return false;
    candidateIds.add(candidate.id);
    for (const key of ['requiresNewItemFirst', 'canBan']) if (candidate[key] !== undefined && typeof candidate[key] !== 'boolean') return false;
    for (const key of ['placementSlot', 'expansionLayer']) if (candidate[key] !== undefined && (!Number.isSafeInteger(candidate[key]) || (candidate[key] as number) < 0 || (key === 'expansionLayer' && (candidate[key] as number) > 3))) return false;
    if (candidate.placementSlots !== undefined) {
      if (!Array.isArray(candidate.placementSlots) || candidate.placementSlots.length > MAX_DEVICE_SLOT_COUNT) return false;
      const slots = new Set<number>();
      for (const slot of candidate.placementSlots) {
        if (!Number.isSafeInteger(slot) || (slot as number) < 0 || (slot as number) >= MAX_DEVICE_SLOT_COUNT || slots.has(slot as number)) return false;
        slots.add(slot as number);
      }
    }
    if (candidate.targetInstanceId !== undefined && !isBoundedText(candidate.targetInstanceId)) return false;
    if (candidate.details !== undefined && !isBoundedText(candidate.details, 1000)) return false;
    if (!isUpgradeReplacementFields(candidate)) return false;
  }
  for (const key of ['rerollsLeft', 'bansLeft', 'pendingCount', 'choicesSinceBreak']) if (value[key] !== undefined && (!Number.isSafeInteger(value[key]) || (value[key] as number) < 0 || (value[key] as number) > 1_000_000_000)) return false;
  return true;
}

/** Validate the token-bound replacement metadata without trusting UI echoes. */
function isUpgradeReplacementFields(candidate: Record<string, unknown>): boolean {
  const replacementSlots = candidate.replacementSlots;
  const replacementTargets = candidate.replacementTargets;
  const hasReplacementFields = replacementSlots !== undefined || replacementTargets !== undefined
    || candidate.replacementTargetInstanceId !== undefined || candidate.replacementBranch !== undefined
    || candidate.replacementBranchOptions !== undefined;
  if (!hasReplacementFields) return true;
  if (candidate.isExisting === true || (candidate.kind !== 'weapon' && candidate.kind !== 'support')) return false;
  if (typeof candidate.targetId !== 'string'
    || (candidate.kind === 'weapon' ? !(candidate.targetId in WEAPONS) : !(candidate.targetId in SUPPORTS))) return false;
  if (!Array.isArray(replacementSlots) || replacementSlots.length === 0 || replacementSlots.length > MAX_DEVICE_SLOT_COUNT
    || !Array.isArray(replacementTargets) || replacementTargets.length !== replacementSlots.length) return false;
  const slots = new Set<number>();
  for (const slot of replacementSlots) {
    if (!Number.isSafeInteger(slot) || (slot as number) < 0 || (slot as number) >= MAX_DEVICE_SLOT_COUNT || slots.has(slot as number)) return false;
    slots.add(slot as number);
  }
  const instances = new Set<string>();
  for (const target of replacementTargets) {
    if (!isRecord(target) || !isBoundedText(target.instanceId) || instances.has(target.instanceId)
      || !Number.isSafeInteger(target.slot) || !slots.has(target.slot as number) || !Number.isSafeInteger(target.level) || (target.level as number) < 1
      || typeof target.id !== 'string' || (candidate.kind === 'weapon' ? !(target.id in WEAPONS) : !(target.id in SUPPORTS))
      || target.id === candidate.targetId) return false;
    const maximum = candidate.kind === 'weapon' ? WEAPONS[target.id as keyof typeof WEAPONS].levels.length : SUPPORTS[target.id as keyof typeof SUPPORTS].levels.length;
    if ((target.level as number) > maximum) return false;
    instances.add(target.instanceId);
  }
  if (candidate.placementSlot !== undefined && !slots.has(candidate.placementSlot as number)) return false;
  if (candidate.replacementTargetInstanceId !== undefined
    && (!isBoundedText(candidate.replacementTargetInstanceId) || !instances.has(candidate.replacementTargetInstanceId))) return false;
  if (candidate.replacementBranch !== undefined) {
    if (candidate.kind !== 'weapon' || typeof candidate.targetId !== 'string' || !(candidate.targetId in WEAPONS)
      || typeof candidate.replacementBranch !== 'string' || !WEAPONS[candidate.targetId as keyof typeof WEAPONS].branches.some((branch) => branch.atLevel === 3 && branch.id === candidate.replacementBranch)) return false;
  }
  if (candidate.replacementBranchOptions !== undefined) {
    if (candidate.kind !== 'weapon' || typeof candidate.targetId !== 'string' || !(candidate.targetId in WEAPONS)
      || !Array.isArray(candidate.replacementBranchOptions) || candidate.replacementBranchOptions.length > 4) return false;
    const optionIds = new Set<string>();
    for (const option of candidate.replacementBranchOptions) {
      if (!isRecord(option) || typeof option.id !== 'string' || optionIds.has(option.id)
        || !isBoundedText(option.name, 240) || !isBoundedText(option.description, 1000)
        || !WEAPONS[candidate.targetId as keyof typeof WEAPONS].branches.some((branch) => branch.atLevel === 3 && branch.id === option.id)) return false;
      optionIds.add(option.id);
    }
    if (candidate.replacementBranch !== undefined && !optionIds.has(candidate.replacementBranch as string)) return false;
  }
  return true;
}

function isRecorderState(value: unknown): boolean {
  if (!isRecord(value) || !Number.isSafeInteger(value.kills) || (value.kills as number) < 0 || (value.kills as number) > 1_000_000_000 || !finite(value.score) || value.score < 0 || value.score > Number.MAX_SAFE_INTEGER || !Number.isSafeInteger(value.bossesDefeated) || (value.bossesDefeated as number) < 0 || (value.bossesDefeated as number) > 1_000_000_000 || !finite(value.survivalTime) || value.survivalTime < 0 || value.survivalTime > 1_000_000_000 || !isBoundedText(value.lastDamageSource, 240) || typeof value.bossDefeated !== 'boolean' || !Array.isArray(value.sectorDamage) || value.sectorDamage.length !== 6 || !value.sectorDamage.every((item) => finite(item) && (item as number) >= 0) || !Array.isArray(value.upgrades) || value.upgrades.length > MAX_INPUT_EVENTS || !value.upgrades.every((item) => isBoundedText(item)) || !Array.isArray(value.branches) || value.branches.length > MAX_INPUT_EVENTS || !value.branches.every((item) => isBoundedText(item))) return false;
  const controlSeconds = value.controlSeconds;
  if (!isRecord(controlSeconds) || !['slowed', 'pushed', 'pulled'].every((key) => finite(controlSeconds[key]) && (controlSeconds[key] as number) >= 0 && (controlSeconds[key] as number) <= 1_000_000_000)) return false;
  for (const key of ['weaponDamage', 'enemyKills', 'supportUsage', 'weaponInstanceDamage']) {
    if (!isRecord(value[key]) || Object.keys(value[key]).length > MAX_DEVICE_SLOT_COUNT * 20 || !Object.values(value[key]).every((item) => finite(item) && (item as number) >= 0 && (item as number) <= Number.MAX_SAFE_INTEGER)) return false;
  }
  if (!isRecord(value.weaponEvents) || Object.keys(value.weaponEvents).length > MAX_DEVICE_SLOT_COUNT * 4 || !Object.values(value.weaponEvents).every((item) => isRecord(item) && ['shots', 'intercepts', 'detonations'].every((key) => finite(item[key]) && (item[key] as number) >= 0 && (item[key] as number) <= Number.MAX_SAFE_INTEGER))) return false;
  return true;
}

export function validateRunSave(value: unknown): RunSaveEnvelope | null {
  try {
    if (!isValidEnvelope(value)) return null;
    return {
      ...value,
      snapshot: { ...cloneSnapshot(value.snapshot), pendingUpgradeSelectionId: value.snapshot.pendingUpgradeSelectionId ?? null },
      inputLog: value.inputLog.map(cloneInput),
      randomState: { ...value.randomState },
      ...(value.spawnState ? { spawnState: JSON.parse(JSON.stringify(value.spawnState)) as Record<string, unknown> } : {}),
      ...(value.runtimeState ? { runtimeState: JSON.parse(JSON.stringify(value.runtimeState)) as Record<string, unknown> } : {}),
    };
  } catch {
    return null;
  }
}

export class RunSaveService {
  private readonly storage: StorageLike | null;

  public constructor(storage: StorageLike | null = getStorage()) {
    this.storage = storage;
  }

  public hasSavedRun(): boolean {
    try {
      for (const key of [RUN_SAVE_KEY, RUN_SAVE_TEMP_KEY]) {
        const raw = this.storage?.getItem(key);
        if (typeof raw === 'string' && validateRunSave(JSON.parse(raw)) !== null) return true;
      }
      return false;
    } catch { return false; }
  }

  public load(): RunSaveLoadResult {
    if (!this.storage) return { data: null, recovered: false, message: '' };
    let raw: string | null = null;
    let tempRaw: string | null = null;
    try {
      raw = this.storage.getItem(RUN_SAVE_KEY);
      tempRaw = this.storage.getItem(RUN_SAVE_TEMP_KEY);
    } catch {
      return { data: null, recovered: true, message: '途中状態を読み込めませんでした。' };
    }
    const candidates: Array<{ raw: string; source: 'canonical' | 'temporary'; data: RunSaveEnvelope }> = [];
    let damaged = false;
    for (const [candidate, source] of [[raw, 'canonical'], [tempRaw, 'temporary']] as const) {
      if (candidate === null) continue;
      try {
        const parsed = validateRunSave(JSON.parse(candidate));
        if (!parsed) throw new Error('invalid run save');
        candidates.push({ raw: candidate, source, data: parsed });
      } catch {
        damaged = true;
        try { this.storage.setItem(RUN_DAMAGED_SAVE_KEY, candidate); } catch { /* preserve best effort */ }
      }
    }
    if (candidates.length === 0) return { data: null, recovered: damaged, message: damaged ? '途中状態が壊れているため、再開できません。' : '' };

    // A crash can leave a newer write-ahead value beside an older canonical
    // value. Prefer the newest safe-boundary checkpoint, while keeping the
    // canonical value on ties so a stale temporary copy is harmless.
    candidates.sort((first, second) => {
      const tickDelta = second.data.tick - first.data.tick;
      if (tickDelta !== 0) return tickDelta;
      const timeDelta = Date.parse(second.data.savedAt) - Date.parse(first.data.savedAt);
      if (timeDelta !== 0) return timeDelta;
      return first.source === 'canonical' ? -1 : 1;
    });
    const selected = candidates[0]!;
    const recovered = damaged || selected.source === 'temporary';
    if (selected.source === 'temporary') this.persist(selected.data);
    return { data: selected.data, recovered, message: recovered ? '途中状態を復元しました。' : '' };
  }

  public persist(envelope: RunSaveEnvelope): boolean {
    const validated = validateRunSave(envelope);
    if (!validated || !this.storage) return false;
    const raw = JSON.stringify(validated);
    try {
      // Write-ahead temp storage keeps the last complete checkpoint if the
      // browser is closed between writes. The old canonical save is never
      // removed before the new one has been accepted.
      this.storage.setItem(RUN_SAVE_TEMP_KEY, raw);
      if (this.storage.getItem(RUN_SAVE_TEMP_KEY) !== raw) throw new Error('temporary checkpoint readback failed');
      this.storage.setItem(RUN_SAVE_KEY, raw);
      const readBack = this.storage.getItem(RUN_SAVE_KEY);
      if (readBack !== raw || !readBack || validateRunSave(JSON.parse(readBack)) === null) throw new Error('checkpoint readback failed');
      this.storage.removeItem(RUN_SAVE_TEMP_KEY);
      return true;
    } catch {
      try { this.storage.removeItem(RUN_SAVE_TEMP_KEY); } catch { /* best effort */ }
      return false;
    }
  }

  public clear(): boolean {
    if (!this.storage) return false;
    try {
      this.storage.removeItem(RUN_SAVE_KEY);
      this.storage.removeItem(RUN_SAVE_TEMP_KEY);
      return true;
    } catch { return false; }
  }

  public damagedJson(): string | null {
    try { return this.storage?.getItem(RUN_DAMAGED_SAVE_KEY) ?? null; } catch { return null; }
  }
}
