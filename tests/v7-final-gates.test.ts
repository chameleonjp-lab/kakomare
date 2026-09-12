import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { setImmediate as yieldToHost } from 'node:timers/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { STAGES } from '../src/data/stages';
import {
  buildFinalGateEndlessTrials,
  buildFinalGateNormalTrials,
  type FinalGateSelectionPolicy,
  type FinalGateTrial,
} from '../src/game/systems/FinalGateProtocol';
import type { BattleResult, UpgradeCandidate, UpgradePayload } from '../src/types/game';

type SceneModule = {
  BattleScene: new (options: Record<string, unknown>) => unknown;
};

interface TrialObservation {
  id: string;
  outcome: BattleResult['outcome'] | 'observation-limit';
  elapsed: number;
  score: number;
  kills: number;
  upgrades: number;
  maxEnemies: number;
  maxFriendlyProjectiles: number;
  maxEnemyProjectiles: number;
  result: BattleResult | null;
}

let moduleUnderTest: SceneModule;
let temporaryDirectory: string;

function privateValue<T>(scene: unknown, key: string): T {
  return (scene as Record<string, T>)[key] as T;
}

function researchEffects(trial: FinalGateTrial): Record<string, unknown> {
  if (trial.researchState === 'maximal') {
    return {
      maxCore: 140,
      partMultiplier: 1.2,
      powerMultiplier: 1.2,
      projectileSpeedMultiplier: 1.15,
      rerolls: 2,
      bans: 2,
      candidateDetails: true,
      enemyRecords: true,
      weaponRecords: true,
      sectorRecords: true,
    };
  }
  return {
    maxCore: 100,
    partMultiplier: 1,
    powerMultiplier: 1,
    projectileSpeedMultiplier: 1,
    rerolls: 0,
    bans: 0,
    candidateDetails: false,
    enemyRecords: false,
    weaponRecords: false,
    sectorRecords: false,
  };
}

async function createBundle(): Promise<void> {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'kakomare-v7-gates-'));
  const repositoryRoot = join(import.meta.dirname, '..');
  const output = join(temporaryDirectory, 'battle.mjs');
  await build({
    stdin: {
      contents: `export { BattleScene } from ${JSON.stringify(join(repositoryRoot, 'src/game/scenes/BattleScene.ts'))};`,
      resolveDir: repositoryRoot,
      sourcefile: 'v7-gates-entry.ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: output,
    plugins: [{
      name: 'phaser-test-stub',
      setup(buildApi) {
        buildApi.onResolve({ filter: /^phaser$/ }, () => ({ path: 'phaser-stub', namespace: 'phaser-test-stub' }));
        buildApi.onLoad({ filter: /.*/, namespace: 'phaser-test-stub' }, () => ({
          contents: 'export default { Scene: class {}, Game: class { destroy() {} }, CANVAS: 1, Scale: { FIT: 1, CENTER_BOTH: 1 } };',
          loader: 'js',
        }));
      },
    }],
  });
  moduleUnderTest = await import(`${pathToFileURL(output).href}?v7=${Date.now()}`) as SceneModule;
}

function candidateRank(candidate: UpgradeCandidate, policy: FinalGateSelectionPolicy): number {
  const isNewDevice = !candidate.isExisting && (candidate.kind === 'weapon' || candidate.kind === 'support');
  const isDefense = candidate.kind === 'repair' || candidate.id === 'continuous:armor' || candidate.targetId === 'veil';
  if (policy === 'expansion-first') {
    if (candidate.kind === 'expansion') return 0;
    if (isNewDevice && candidate.kind === 'weapon') return 1;
    if (isNewDevice && candidate.kind === 'support') return 2;
    if (candidate.kind === 'weapon') return 3;
    if (candidate.kind === 'support') return 4;
    if (isDefense) return 5;
    return 6;
  }
  if (policy === 'defense-first') {
    if (isDefense) return 0;
    if (candidate.kind === 'support') return 1;
    if (candidate.kind === 'expansion') return 2;
    if (candidate.kind === 'weapon') return 3;
    return 4;
  }
  if (candidate.kind === 'weapon' && candidate.isExisting) return 0;
  if (isNewDevice && candidate.kind === 'weapon') return 1;
  if (candidate.kind === 'support' && candidate.isExisting) return 2;
  if (isNewDevice && candidate.kind === 'support') return 3;
  if (candidate.kind === 'expansion') return 4;
  return 5;
}

function drainUpgrade(scene: unknown, policy: FinalGateSelectionPolicy): number {
  let applied = 0;
  for (let guard = 0; guard < 64; guard += 1) {
    const state = privateValue<string>(scene, 'state');
    if (state !== 'upgrade') return applied;
    const payload = privateValue<UpgradePayload | null>(scene, 'upgradePayload');
    if (!payload) return applied;
    if (payload.phase === 'break') {
      privateValue<(selectionId: number) => void>(scene, 'continueUpgrade').bind(scene)(payload.selectionId);
      continue;
    }
    const candidate = [...payload.candidates]
      .filter((item) => item.requiresNewItemFirst !== true)
      .sort((left, right) => candidateRank(left, policy) - candidateRank(right, policy) || left.id.localeCompare(right.id))[0];
    if (!candidate) throw new Error(`V7 trial ${payload.selectionId} has no selectable candidate`);
    const replacementTarget = candidate.replacementTargets?.find((target) => target.slot === candidate.placementSlots?.[0]);
    const replacementBranch = replacementTarget && Math.min(replacementTarget.level, 3) >= 3
      ? candidate.replacementBranchOptions?.[0]?.id
      : undefined;
    const choice = candidate.placementSlots?.[0] === undefined
      ? candidate
      : {
        ...candidate,
        placementSlot: candidate.placementSlots[0],
        ...(replacementTarget ? { replacementTargetInstanceId: replacementTarget.instanceId } : {}),
        ...(replacementBranch ? { replacementBranch } : {}),
      };
    privateValue<(candidate: UpgradeCandidate, selectionId: number) => void>(scene, 'chooseUpgrade').bind(scene)(choice, payload.selectionId);
    if (privateValue<string>(scene, 'state') === 'upgrade' && privateValue<UpgradePayload | null>(scene, 'upgradePayload')?.selectionId === payload.selectionId) {
      throw new Error(`V7 trial ${payload.selectionId} could not apply ${candidate.id}`);
    }
    applied += 1;
  }
  throw new Error('V7 upgrade drain exceeded the guard limit');
}

function aimAtDanger(scene: unknown): void {
  const enemies = privateValue<Array<{ active: boolean; type: string; angle: number }>>(scene, 'enemies');
  const priority = new Map([
    ['repair', 0], ['factory', 1], ['dropper', 2], ['guard', 3], ['charger', 4], ['marker', 5],
  ]);
  const target = enemies
    .filter((enemy) => enemy.active)
    .sort((left, right) => (priority.get(left.type) ?? 99) - (priority.get(right.type) ?? 99))[0];
  if (!target) return;
  const elapsed = privateValue<number>(scene, 'elapsed');
  (scene as Record<string, unknown>).aimAngle = target.angle;
  (scene as Record<string, unknown>).manualAim = true;
  (scene as Record<string, unknown>).aimReleaseAt = elapsed + 0.5;
}

async function runTrial(trial: FinalGateTrial, drawRate = 60): Promise<TrialObservation> {
  let result: BattleResult | null = null;
  const scene = new moduleUnderTest.BattleScene({
    stageId: trial.stageId,
    effectsLevel: 'minimum',
    reducedMotion: true,
    screenShake: false,
    aimAssist: trial.aimPolicy === 'danger-target' ? 'strong' : 'standard',
    researchEffects: researchEffects(trial),
    competitive: trial.mode === 'endless',
    seed: trial.seed,
    runId: `v7-${trial.id}`,
    callbacks: {
      onStatus() {},
      onUpgrade() {},
      onSnapshot() {},
      onPauseRequest() {},
      onFinish: (finished: BattleResult) => { result = finished; },
    },
  });
  const step = privateValue<(seconds: number) => void>(scene, 'step').bind(scene);
  const clock = privateValue<{ advance(frameSeconds: number, callback: (seconds: number) => void): number }>(scene, 'clock');
  let maxEnemies = 0;
  let maxFriendlyProjectiles = 0;
  let maxEnemyProjectiles = 0;
  let upgrades = 0;
  const sampleCaps = (): void => {
    const enemies = privateValue<Array<{ active: boolean }>>(scene, 'enemies');
    const projectiles = privateValue<Array<{ active: boolean; enemyProjectile: boolean }>>(scene, 'projectiles');
    const activeEnemies = enemies.filter((enemy) => enemy.active).length;
    const activeFriendlyProjectiles = projectiles.filter((projectile) => projectile.active && !projectile.enemyProjectile).length;
    const activeEnemyProjectiles = projectiles.filter((projectile) => projectile.active && projectile.enemyProjectile).length;
    maxEnemies = Math.max(maxEnemies, activeEnemies);
    maxFriendlyProjectiles = Math.max(maxFriendlyProjectiles, activeFriendlyProjectiles);
    maxEnemyProjectiles = Math.max(maxEnemyProjectiles, activeEnemyProjectiles);
    expect(activeEnemies).toBeLessThanOrEqual(180);
    expect(activeFriendlyProjectiles).toBeLessThanOrEqual(280);
    expect(activeEnemyProjectiles).toBeLessThanOrEqual(80);
  };
  const frameCount = Math.ceil(trial.maxSimulationSeconds * drawRate);
  for (let frame = 0; frame < frameCount && privateValue<string>(scene, 'state') !== 'finished'; frame += 1) {
    if (trial.aimPolicy === 'danger-target') aimAtDanger(scene);
    // Inspect inside the fixed-step callback as well as after the render
    // frame. At 30 Hz one render frame may contain two combat updates; a
    // transient cap breach must not be hidden by the second update.
    clock.advance(1 / drawRate, (seconds) => { step(seconds); sampleCaps(); });
    upgrades += drainUpgrade(scene, trial.selectionPolicy);
    // Keep Vitest's worker heartbeat alive during the deliberately long V7
    // observations. This does not alter the fixed-step simulation clock.
    if (frame % 600 === 0) await yieldToHost();
  }
  const elapsed = privateValue<number>(scene, 'elapsed');
  const recorder = privateValue<{ score: number; kills: number }>(scene, 'recorder');
  const outcome = result?.outcome ?? 'observation-limit';
  return {
    id: trial.id,
    outcome,
    elapsed,
    score: result?.score ?? recorder.score,
    kills: result?.kills ?? recorder.kills,
    upgrades,
    maxEnemies,
    maxFriendlyProjectiles,
    maxEnemyProjectiles,
    result,
  };
}

describe('V7 final battle gates', () => {
  beforeAll(async () => { await createBundle(); });
  afterAll(async () => { await rm(temporaryDirectory, { recursive: true, force: true }); });

  it('runs all 720 normal-stage observations through BattleScene', async () => {
    const trials = buildFinalGateNormalTrials();
    const observations: TrialObservation[] = [];
    for (const trial of trials) observations.push(await runTrial(trial));
    expect(observations).toHaveLength(720);
    expect(observations.every((observation) => observation.elapsed > 0 && Number.isFinite(observation.score))).toBe(true);
    expect(observations.every((observation) => observation.upgrades >= 0)).toBe(true);
    for (const stageId of Object.keys(STAGES).filter((id) => id !== 'endless')) {
      expect(observations.some((observation) => observation.id.includes(`normal:${stageId}:`))).toBe(true);
    }
  }, 900_000);

  it('runs all 60 endless observations with automatic and danger-target aim', async () => {
    const trials = buildFinalGateEndlessTrials();
    const observations: TrialObservation[] = [];
    for (const trial of trials) observations.push(await runTrial(trial));
    expect(observations).toHaveLength(60);
    expect(observations.every((observation) => observation.elapsed > 0 && Number.isFinite(observation.score))).toBe(true);
    expect(observations.every((observation) => observation.outcome === 'defeat' || observation.outcome === 'observation-limit')).toBe(true);
  }, 900_000);

  it('keeps the production result stable across 30, 60, and 120 Hz rendering', async () => {
    const trial = buildFinalGateEndlessTrials().find((candidate) => candidate.seed === 200_000 && candidate.selectionPolicy === 'main-first' && candidate.aimPolicy === 'automatic');
    if (!trial) throw new Error('missing representative V7 trial');
    const observations: TrialObservation[] = [];
    for (const rate of [30, 60, 120]) observations.push(await runTrial(trial, rate));
    expect(observations.map((observation) => ({ outcome: observation.outcome, elapsed: observation.elapsed, score: observation.score, kills: observation.kills }))).toEqual([
      { outcome: observations[1]!.outcome, elapsed: observations[1]!.elapsed, score: observations[1]!.score, kills: observations[1]!.kills },
      { outcome: observations[1]!.outcome, elapsed: observations[1]!.elapsed, score: observations[1]!.score, kills: observations[1]!.kills },
      { outcome: observations[1]!.outcome, elapsed: observations[1]!.elapsed, score: observations[1]!.score, kills: observations[1]!.kills },
    ]);
  }, 900_000);
});
