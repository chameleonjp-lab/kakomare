import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import type { BattleResult, BattleSnapshot, UpgradeCandidate, UpgradePayload } from '../../src/types/game';
import { SUPPORT_ORDER } from '../../src/data/supports';
import { WEAPON_ORDER } from '../../src/data/weapons';
import { collideProjectiles } from '../../src/game/systems/CollisionSystem';

type BattleModule = {
  BattleScene: new (options: Record<string, unknown>) => unknown;
  GameHost: new () => { startBattle(mount: unknown, options: Record<string, unknown>): void; requestPendingUpgrade(id: number, runId: number): void; chooseUpgrade(candidate: UpgradeCandidate, id: number, runId: number): void; pause(runId: number): void; retire(runId: number): void; moveDevice(instanceId: string, toSlot: number, runId: number): boolean; swapDevices(firstInstanceId: string, secondInstanceId: string, runId: number): boolean; stop(): void };
  Enemy: new (id: number, type: string, angle: number, distance: number) => unknown;
  Weapon: new (id: string, slot: number) => { id: string; level: number; precisionBonus: number; slot: number };
  SupportModule: new (id: string, slot: number) => { id: string; level: number; slot: number };
};

let moduleUnderTest: BattleModule;
let temporaryDirectory: string;

function options(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    stageId: 'stage-1',
    effectsLevel: 'minimum',
    reducedMotion: true,
    screenShake: false,
    aimAssist: 'standard',
    researchEffects: {
      maxCore: 100,
      partMultiplier: 1,
      powerMultiplier: 1,
      projectileSpeedMultiplier: 1,
      rerolls: 0,
      bans: 0,
    },
    seed: 123,
    callbacks: { onStatus() {}, onUpgrade() {}, onFinish() {}, onSnapshot() {}, onPauseRequest() {} },
    ...overrides,
  };
}

function privateValue<T>(scene: unknown, key: string): T {
  return (scene as Record<string, T>)[key] as T;
}

async function createBundle(): Promise<void> {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'kakomare-quality-b-'));
  const repositoryRoot = join(import.meta.dirname, '..', '..');
  const output = join(temporaryDirectory, 'battle.mjs');
  await build({
    stdin: {
      contents: `export { GameHost } from ${JSON.stringify(join(repositoryRoot, 'src/game/GameHost.ts'))}; export { BattleScene } from ${JSON.stringify(join(repositoryRoot, 'src/game/scenes/BattleScene.ts'))}; export { Enemy } from ${JSON.stringify(join(repositoryRoot, 'src/game/entities/Enemy.ts'))}; export { Weapon } from ${JSON.stringify(join(repositoryRoot, 'src/game/entities/Weapon.ts'))}; export { SupportModule } from ${JSON.stringify(join(repositoryRoot, 'src/game/entities/SupportModule.ts'))};`,
      resolveDir: repositoryRoot,
      sourcefile: 'quality-a-entry.ts',
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
  await readFile(output);
  moduleUnderTest = await import(`${pathToFileURL(output).href}?qualityA=${Date.now()}`) as BattleModule;
}

beforeAll(async () => { await createBundle(); });
afterAll(async () => { await rm(temporaryDirectory, { recursive: true, force: true }); });

describe('BattleScene の実戦処理を使う品質回帰', () => {
  it('固定seedで通常戦闘を進め、終了まで同じ処理を通せる', () => {
    const statuses: string[] = [];
    const scene = new moduleUnderTest.BattleScene(options({ callbacks: {
      onStatus: (message: string) => statuses.push(message),
      onUpgrade() {}, onFinish() {}, onSnapshot() {}, onPauseRequest() {},
    } }));
    const step = privateValue<(seconds: number) => void>(scene, 'step').bind(scene);
    for (let frame = 0; frame < 60 * 12 && privateValue<string>(scene, 'state') !== 'finished'; frame += 1) step(1 / 60);
    expect(privateValue<number>(scene, 'elapsed')).toBeGreaterThan(0);
    expect(statuses.length).toBeGreaterThan(0);
    expect(privateValue<unknown[]>(scene, 'enemies').length).toBeGreaterThan(0);
  });

  it('敵180体と敵弾80発を演出設定に関係なく可視集合へ残す', () => {
    for (const effectsLevel of ['standard', 'low', 'minimum'] as const) {
      const scene = new moduleUnderTest.BattleScene(options({ effectsLevel }));
      const enemies = privateValue<unknown[]>(scene, 'enemies');
      const addEnemy = moduleUnderTest.Enemy;
      for (let id = 1; id <= 180; id += 1) enemies.push(new addEnemy(id, 'shard', 0, 300));
      const visibleEnemies = privateValue<() => unknown[]>(scene, 'visibleEnemies').bind(scene)();
      expect(visibleEnemies).toHaveLength(180);

      const addProjectile = privateValue<(config: Record<string, unknown>) => unknown>(scene, 'addProjectile').bind(scene);
      for (let id = 1; id <= 80; id += 1) addProjectile({ id, kind: 'enemy', x: 300, y: 0, vx: -1, vy: 0, radius: 9, damage: 1, life: 2, piercing: 0, enemyProjectile: true });
      const visibleProjectiles = privateValue<() => unknown[]>(scene, 'visibleProjectiles').bind(scene)();
      expect(visibleProjectiles).toHaveLength(80);
    }
  });

  it('低演出でも上限280発の味方攻撃を可視集合とスナップショットへ残す', () => {
    const snapshots: BattleSnapshot[] = [];
    const scene = new moduleUnderTest.BattleScene(options({ effectsLevel: 'minimum', callbacks: {
      onStatus() {}, onUpgrade() {}, onFinish() {}, onPauseRequest() {},
      onSnapshot: (snapshot: BattleSnapshot) => snapshots.push(snapshot),
    } }));
    const addProjectile = privateValue<(config: Record<string, unknown>) => unknown>(scene, 'addProjectile').bind(scene);
    for (let id = 1; id <= 280; id += 1) addProjectile({
      kind: 'needle', x: id, y: 0, vx: 1, vy: 0, radius: 6, damage: 1, life: 2, piercing: 0,
    });
    const visibleProjectiles = privateValue<() => Array<{ enemyProjectile: boolean }>>(scene, 'visibleProjectiles').bind(scene)();
    expect(visibleProjectiles.filter((projectile) => !projectile.enemyProjectile)).toHaveLength(280);
    privateValue<(force: boolean) => void>(scene, 'emitSnapshot').bind(scene)(true);
    expect(snapshots.at(-1)?.projectiles.filter((projectile) => !projectile.enemyProjectile)).toHaveLength(280);
  });

  it('最低演出でも範囲攻撃の中心と半径を短い輪で示し、予告を装飾で上書きしない', () => {
    const scene = new moduleUnderTest.BattleScene(options({ effectsLevel: 'minimum' }));
    const weapon = privateValue<Array<{ id: string }>>(scene, 'weapons')[0];
    if (!weapon) throw new Error('initial weapon was not created');
    const hitArea = privateValue<(weapon: unknown, x: number, y: number, radius: number, damage: number, angle: number | null) => void>(scene, 'hitArea').bind(scene);
    const flashes = privateValue<Array<{ x: number; y: number; radius: number; life: number; maxLife: number; kind: string }>>(scene, 'flashes');
    hitArea(weapon, 37, -19, 46, 8, null);
    expect(flashes).toContainEqual(expect.objectContaining({ x: 37, y: -19, radius: 46, life: 0.2, maxLife: 0.2, kind: 'impact' }));

    const warningScene = new moduleUnderTest.BattleScene(options({ effectsLevel: 'minimum' }));
    const addFlash = privateValue<(effect: { x: number; y: number; color: number; life: number; maxLife: number; radius: number; kind: 'impact' | 'telegraph' | 'decoration' }) => void>(warningScene, 'addFlash').bind(warningScene);
    const warnings = privateValue<Array<{ kind: string }>>(warningScene, 'flashes');
    for (let index = 0; index < 64; index += 1) addFlash({ x: index, y: 0, color: 0xffffff, life: 1, maxLife: 1, radius: 10, kind: 'telegraph' });
    addFlash({ x: 0, y: 0, color: 0xffffff, life: 1, maxLife: 1, radius: 10, kind: 'decoration' });
    addFlash({ x: 1, y: 0, color: 0xffffff, life: 1, maxLife: 1, radius: 10, kind: 'decoration' });
    addFlash({ x: 2, y: 0, color: 0xffffff, life: 1, maxLife: 1, radius: 10, kind: 'decoration' });
    expect(warnings.filter((flash) => flash.kind === 'telegraph')).toHaveLength(64);
    expect(warnings.filter((flash) => flash.kind === 'decoration')).toHaveLength(2);

    const lineScene = new moduleUnderTest.BattleScene(options({ effectsLevel: 'minimum' }));
    const addLine = privateValue<(effect: { angle: number; color: number; life: number; maxLife: number; width: number }) => void>(lineScene, 'addLine').bind(lineScene);
    const lines = privateValue<Array<{ width: number }>>(lineScene, 'lines');
    for (let index = 0; index < 60; index += 1) addLine({ angle: 0, color: 0xffffff, life: 1, maxLife: 1, width: index + 1 });
    expect(lines).toHaveLength(48);
    expect(lines.some((line) => line.width === 60)).toBe(true);
  });

  it('低演出のライブスナップショットでも全敵と敵弾を保持する', () => {
    const snapshots: BattleSnapshot[] = [];
    const scene = new moduleUnderTest.BattleScene(options({ effectsLevel: 'minimum', callbacks: {
      onStatus() {}, onUpgrade() {}, onFinish() {}, onPauseRequest() {},
      onSnapshot: (snapshot: BattleSnapshot) => snapshots.push(snapshot),
    } }));
    const enemies = privateValue<unknown[]>(scene, 'enemies');
    for (let id = 1; id <= 180; id += 1) enemies.push(new moduleUnderTest.Enemy(id, id === 1 ? 'lattice' : 'shard', 0, 300));
    const addProjectile = privateValue<(config: Record<string, unknown>) => unknown>(scene, 'addProjectile').bind(scene);
    for (let id = 1; id <= 80; id += 1) addProjectile({ id, kind: 'enemy', x: 300, y: 0, vx: -1, vy: 0, radius: 9, damage: 1, life: 2, piercing: 0, enemyProjectile: true });
    privateValue<(force: boolean) => void>(scene, 'emitSnapshot').bind(scene)(true);
    const snapshot = snapshots.at(-1);
    expect(snapshot?.effectsLevel).toBe('minimum');
    expect(snapshot?.enemies).toHaveLength(180);
    expect(snapshot?.enemies.find((enemy) => enemy.type === 'lattice')?.shieldHits).toBe(8);
    expect(snapshot?.projectiles.filter((projectile) => projectile.enemyProjectile)).toHaveLength(80);
  });

  it('連鎖終端破裂と回転冠の盾が軸上・境界で一貫する', () => {
    const results: number[] = [];
    for (const y of [0, 0.001]) {
      const scene = new moduleUnderTest.BattleScene(options());
      const chain = privateValue<{ id: string; level: number; branch: string | null }[]>(scene, 'weapons')[0];
      if (!chain) throw new Error('initial weapon was not created');
      chain.id = 'chain'; chain.level = 3; chain.branch = 'burst';
      const enemy = new moduleUnderTest.Enemy(1, 'shell', 0, 100) as Record<string, number | boolean>;
      enemy.y = y;
      privateValue<unknown[]>(scene, 'enemies').push(enemy);
      privateValue<(weapon: unknown) => void>(scene, 'fireWeapon').bind(scene)(chain);
      results.push(95 - Number(enemy.hp));
    }
    expect(results[0]).toBeCloseTo(36.5);
    expect(results[1]).toBeCloseTo(36.5);

    const crown = new moduleUnderTest.Enemy(1, 'crown', 0, 196) as { shieldRotation: number; damage: (amount: number, elapsed: number, angle: number) => { blocked: boolean } };
    crown.shieldRotation = 0;
    expect(crown.damage(10, 0, 4 * Math.PI / 3).blocked).toBe(true);
    expect(crown.damage(10, 0, -2 * Math.PI / 3).blocked).toBe(true);
  });

  it('直線光線と周回刃は見える攻撃方向で盾を判定する', () => {
    const rayScene = new moduleUnderTest.BattleScene(options());
    const ray = privateValue<{ id: string; slot: number }[]>(rayScene, 'weapons')[0];
    if (!ray) throw new Error('initial weapon was not created');
    ray.id = 'ray';
    const rayTarget = new moduleUnderTest.Enemy(1, 'crown', 0, 196) as Record<string, number | boolean>;
    rayTarget.x = 200; rayTarget.y = 40;
    rayTarget.shieldRotation = 0;
    privateValue<unknown[]>(rayScene, 'enemies').push(rayTarget);
    privateValue<(weapon: unknown, startX: number, startY: number, angle: number, length: number, width: number, damage: number) => void>(rayScene, 'hitRaySegment').bind(rayScene)(ray, 300, 0, Math.PI, 200, 18, 28);
    expect(rayTarget.hp).toBe(900);

    const orbitScene = new moduleUnderTest.BattleScene(options());
    const orbit = privateValue<{ id: string; slot: number }[]>(orbitScene, 'weapons')[0];
    if (!orbit) throw new Error('initial weapon was not created');
    orbit.id = 'orbit';
    const orbitTarget = new moduleUnderTest.Enemy(1, 'crown', 0, 196) as Record<string, number | boolean>;
    orbitTarget.x = 108; orbitTarget.y = 29;
    orbitTarget.shieldRotation = 0;
    privateValue<unknown[]>(orbitScene, 'enemies').push(orbitTarget);
    privateValue<(weapon: unknown, damage: number) => void>(orbitScene, 'fireOrbit').bind(orbitScene)(orbit, 20);
    expect(orbitTarget.hp).toBeLessThan(900);
  });

  it('重力崩壊は生成時の実効威力を使い、研究倍率が比例する', () => {
    const damages: number[] = [];
    for (const multiplier of [1, 2]) {
      const scene = new moduleUnderTest.BattleScene(options({ researchEffects: { ...options().researchEffects as Record<string, number>, powerMultiplier: multiplier } }));
      const weapon = privateValue<{ id: string; level: number; branch: string | null }[]>(scene, 'weapons')[0];
      weapon.id = 'gravity'; weapon.level = 3; weapon.branch = 'collapse';
      const enemy = new moduleUnderTest.Enemy(1, 'shard', 0, 260) as Record<string, number | boolean>;
      enemy.hp = 100; enemy.maxHp = 100;
      privateValue<unknown[]>(scene, 'enemies').push(enemy);
      privateValue<(weapon: unknown) => void>(scene, 'fireWeapon').bind(scene)(weapon);
      const fields = privateValue<{ life: number; damageTimer: number }[]>(scene, 'gravityFields');
      const field = fields[0];
      if (!field) throw new Error('gravity field was not created');
      field.life = 0; field.damageTimer = 1;
      privateValue<(seconds: number) => void>(scene, 'updateGravityFields').bind(scene)(1 / 60);
      damages.push(100 - Number(enemy.hp));
    }
    expect(damages[0]).toBeGreaterThan(0);
    expect(damages[1]).toBeCloseTo((damages[0] ?? 0) * 2);
  });

  it('群集弾の分裂型は着弾後に3つの子弾を生成する', () => {
    const scene = new moduleUnderTest.BattleScene(options());
    const weapon = privateValue<{ id: string; level: number; branch: string | null }[]>(scene, 'weapons')[0];
    if (!weapon) throw new Error('initial weapon was not created');
    weapon.id = 'cluster'; weapon.level = 3; weapon.branch = 'split';
    privateValue<(weapon: unknown, target: unknown, angle: number, damage: number) => void>(scene, 'fireCluster').bind(scene)(weapon, null, 0, 100);
    const projectiles = privateValue<Array<{ active: boolean; kind: string; life: number; clusterSplitChild: boolean }>>(scene, 'projectiles');
    const parent = projectiles[0];
    if (!parent) throw new Error('cluster projectile was not created');
    parent.life = 0;
    privateValue<(seconds: number) => void>(scene, 'updateProjectiles').bind(scene)(0);
    const children = projectiles.filter((projectile) => projectile.active && projectile.kind === 'cluster' && projectile.clusterSplitChild);
    expect(children).toHaveLength(3);
    expect(projectiles.filter((projectile) => projectile.active && !projectile.clusterSplitChild)).toHaveLength(0);
  });

  it('反発輪の強反発型は距離だけでなく威力も増やす', () => {
    const scene = new moduleUnderTest.BattleScene(options());
    const weapon = privateValue<{ id: string; level: number; branch: string | null }[]>(scene, 'weapons')[0];
    if (!weapon) throw new Error('initial weapon was not created');
    weapon.id = 'repulse'; weapon.level = 3; weapon.branch = 'strong-push';
    const enemy = new moduleUnderTest.Enemy(1, 'shard', 0, 100) as Record<string, number | boolean>;
    enemy.hp = 100; enemy.maxHp = 100;
    privateValue<unknown[]>(scene, 'enemies').push(enemy);
    privateValue<(weapon: unknown, damage: number) => void>(scene, 'fireRepulse').bind(scene)(weapon, 20);
    expect(enemy.hp).toBeCloseTo(75);
    expect(enemy.distanceToCore).toBeGreaterThan(100);
  });

  it('制動環は残留型と重力点の減速時間を延ばす', () => {
    const residueScene = new moduleUnderTest.BattleScene(options());
    const residueWeapon = privateValue<{ id: string; level: number; branch: string | null; slot: number }[]>(residueScene, 'weapons')[0];
    if (!residueWeapon) throw new Error('initial weapon was not created');
    residueWeapon.id = 'cluster'; residueWeapon.level = 3; residueWeapon.branch = 'residue'; residueWeapon.slot = 1;
    const residueSupport = new moduleUnderTest.SupportModule('brake', 0);
    residueSupport.level = 3;
    privateValue<unknown[]>(residueScene, 'supports').push(residueSupport);
    privateValue<(weapon: unknown, target: unknown, angle: number, damage: number) => void>(residueScene, 'fireCluster').bind(residueScene)(residueWeapon, null, 0, 10);
    const residueProjectile = privateValue<Array<{ life: number }>>(residueScene, 'projectiles')[0];
    if (!residueProjectile) throw new Error('residue projectile was not created');
    residueProjectile.life = 0;
    privateValue<(seconds: number) => void>(residueScene, 'updateProjectiles').bind(residueScene)(0);
    const residueField = privateValue<Array<{ slowDuration: number }>>(residueScene, 'gravityFields')[0];
    if (!residueField) throw new Error('residue field was not created');
    expect(residueField.slowDuration).toBeCloseTo(0.55 * 1.28);

    const gravityScene = new moduleUnderTest.BattleScene(options());
    const gravityWeapon = privateValue<{ id: string; level: number; branch: string | null; slot: number }[]>(gravityScene, 'weapons')[0];
    if (!gravityWeapon) throw new Error('initial weapon was not created');
    gravityWeapon.id = 'gravity'; gravityWeapon.level = 3; gravityWeapon.slot = 1;
    const gravitySupport = new moduleUnderTest.SupportModule('brake', 0);
    gravitySupport.level = 3;
    privateValue<unknown[]>(gravityScene, 'supports').push(gravitySupport);
    privateValue<(weapon: unknown, target: unknown, angle: number, damage: number) => void>(gravityScene, 'fireGravity').bind(gravityScene)(gravityWeapon, null, 0, 10);
    const gravityField = privateValue<Array<{ slowDuration: number }>>(gravityScene, 'gravityFields')[0];
    if (!gravityField) throw new Error('gravity field was not created');
    expect(gravityField.slowDuration).toBeCloseTo(0.4 * 1.28);
  });

  it('実戦処理から通常射撃・重攻撃・撃破の音キューを発行する', () => {
    const cues: string[] = [];
    const scene = new moduleUnderTest.BattleScene(options({ callbacks: {
      onStatus() {}, onUpgrade() {}, onFinish() {}, onSnapshot() {}, onPauseRequest() {},
      onAudioCue: (cue: string) => cues.push(cue),
    } }));
    const weapon = privateValue<{ id: string; level: number; branch: string | null }[]>(scene, 'weapons')[0];
    if (!weapon) throw new Error('initial weapon was not created');
    const fireNeedle = privateValue<(weapon: unknown, angle: number, damage: number) => void>(scene, 'fireNeedle').bind(scene);
    fireNeedle(weapon, 0, 8);
    expect(cues).toContain('shot');
    weapon.id = 'ray';
    const fireRay = privateValue<(weapon: unknown, angle: number, damage: number) => void>(scene, 'fireRay').bind(scene);
    fireRay(weapon, 0, 28);
    expect(cues).toContain('heavy');
    const enemy = new moduleUnderTest.Enemy(1, 'shard', 0, 100) as Record<string, number | boolean>;
    privateValue<unknown[]>(scene, 'enemies').push(enemy);
    const destroy = privateValue<(enemy: unknown) => void>(scene, 'handleEnemyDestroyed').bind(scene);
    enemy.active = false;
    destroy(enemy);
    expect(cues).toContain('defeat');
  });

  it('スナップショットに通常・無限の時間種別を持たせる', () => {
    const snapshots: Array<{ timeLimit: number; isEndless: boolean }> = [];
    const makeScene = (stageId: string): unknown => new moduleUnderTest.BattleScene(options({ stageId, callbacks: {
      onStatus() {}, onUpgrade() {}, onFinish() {}, onPauseRequest() {},
      onSnapshot: (snapshot: { timeLimit: number; isEndless: boolean }) => snapshots.push({ timeLimit: snapshot.timeLimit, isEndless: snapshot.isEndless }),
    } }));
    const normal = makeScene('stage-1');
    privateValue<(force: boolean) => void>(normal, 'emitSnapshot').bind(normal)(true);
    const endless = makeScene('endless');
    privateValue<(force: boolean) => void>(endless, 'emitSnapshot').bind(endless)(true);
    expect(snapshots).toEqual([{ timeLimit: 180, isEndless: false }, { timeLimit: Infinity, isEndless: true }]);
  });

  it('競技スコアへ生存時間と残HPを混ぜず、通常モードの旧式得点は維持する', () => {
    const makeScene = (competitive: boolean): { scene: unknown; snapshots: Array<{ score: number }>; results: BattleResult[] } => {
      const snapshots: Array<{ score: number }> = [];
      const results: BattleResult[] = [];
      const scene = new moduleUnderTest.BattleScene(options({ competitive, callbacks: {
        onStatus() {}, onUpgrade() {}, onPauseRequest() {},
        onSnapshot: (snapshot: { score: number }) => snapshots.push(snapshot),
        onFinish: (result: BattleResult) => results.push(result),
      } }));
      const recorder = privateValue<{ score: number; survivalTime: number }>(scene, 'recorder');
      recorder.score = 123;
      recorder.survivalTime = 10;
      (scene as Record<string, unknown>).elapsed = 10;
      privateValue<(force: boolean) => void>(scene, 'emitSnapshot').bind(scene)(true);
      privateValue<(outcome: BattleResult['outcome'], cause: string) => void>(scene, 'finish').bind(scene)('defeat', '検査終了');
      return { scene, snapshots, results };
    };
    const competitive = makeScene(true);
    expect(competitive.snapshots.at(-1)?.score).toBe(123);
    expect(competitive.results[0]?.score).toBe(123);
    const normal = makeScene(false);
    expect(normal.snapshots.at(-1)?.score).toBe(2_173);
    expect(normal.results[0]?.score).toBe(2_173);
  });

  it('強化候補を表示しても経験値とレベルを消費せず、確定は同じ選択番号で一度だけ行う', () => {
    const upgrades: Array<{ selectionId: number; candidates: Array<{ id: string; isExisting: boolean; canBan?: boolean }> }> = [];
    const scene = new moduleUnderTest.BattleScene(options({ callbacks: {
      onStatus() {}, onFinish() {}, onSnapshot() {}, onPauseRequest() {},
      onUpgrade: (payload: { selectionId: number; candidates: Array<{ id: string; isExisting: boolean; canBan?: boolean }> }) => upgrades.push(payload),
    } }));
    const progression = privateValue<{ addExperience(amount: number): void; level: number; experience: number }>(scene, 'progression');
    progression.addExperience(25);
    privateValue<() => void>(scene, 'openUpgrade').bind(scene)();
    const first = upgrades.at(-1);
    if (!first) throw new Error('upgrade payload was not emitted');
    expect(progression.level).toBe(1);
    expect(progression.experience).toBe(25);
    const candidate = first.candidates.find((item) => item.isExisting && item.canBan !== false);
    if (!candidate) throw new Error('ordinary candidate was not emitted');
    const choice = first.candidates.find((item) => item.id === candidate.id);
    if (!choice) throw new Error('candidate lookup failed');
    const fullCandidate = { ...choice, title: '', description: '', before: '', after: '', role: '', kind: 'weapon' as const, targetId: 'needle' as const };
    (scene as unknown as { chooseUpgrade(candidate: unknown, selectionId: number): void }).chooseUpgrade(fullCandidate, first.selectionId);
    const levelAfterFirstChoice = progression.level;
    const experienceAfterFirstChoice = progression.experience;
    (scene as unknown as { chooseUpgrade(candidate: unknown, selectionId: number): void }).chooseUpgrade(fullCandidate, first.selectionId);
    expect(progression.level).toBe(levelAfterFirstChoice);
    expect(progression.experience).toBe(experienceAfterFirstChoice);
  });

  it('古い候補と無効な配置先は経験値・装備を変更しない', () => {
    const upgrades: Array<{ selectionId: number; candidates: Array<{ id: string; isExisting: boolean; placementSlots?: number[] }> }> = [];
    const scene = new moduleUnderTest.BattleScene(options({ callbacks: {
      onStatus() {}, onFinish() {}, onSnapshot() {}, onPauseRequest() {},
      onUpgrade: (payload: { selectionId: number; candidates: Array<{ id: string; isExisting: boolean; placementSlots?: number[] }> }) => upgrades.push(payload),
    } }));
    const progression = privateValue<{ addExperience(amount: number): void; level: number; experience: number }>(scene, 'progression');
    progression.addExperience(25);
    privateValue<() => void>(scene, 'openUpgrade').bind(scene)();
    const first = upgrades.at(-1);
    if (!first) throw new Error('upgrade payload was not emitted');
    const newCandidate = first.candidates.find((candidate) => !candidate.isExisting);
    if (!newCandidate) throw new Error('new candidate was not emitted');
    const weaponsBefore = privateValue<Array<{ id: string; slot: number }>>(scene, 'weapons').map((weapon) => ({ ...weapon }));
    (scene as unknown as { chooseUpgrade(candidate: unknown, selectionId: number): void }).chooseUpgrade(newCandidate, first.selectionId);
    expect(progression.experience).toBe(25);
    expect(privateValue<Array<{ id: string; slot: number }>>(scene, 'weapons')).toEqual(weaponsBefore);
  });

  it('継続強化しかないとき、同じ内容の引き直しで回数を消費しない', () => {
    const payloads: UpgradePayload[] = [];
    const scene = new moduleUnderTest.BattleScene(options({ callbacks: {
      onStatus() {}, onFinish() {}, onSnapshot() {}, onPauseRequest() {},
      onUpgrade: (payload: UpgradePayload) => payloads.push(payload),
    } }));
    const progression = privateValue<{ addExperience(amount: number): void }>(scene, 'progression');
    const ordinary = privateValue<() => UpgradeCandidate[]>(scene, 'createCandidates').bind(scene)()
      .filter((candidate) => candidate.canBan !== false);
    const banned = privateValue<Set<string>>(scene, 'banned');
    for (const candidate of ordinary) banned.add(candidate.id);
    for (const id of WEAPON_ORDER) banned.add(`weapon:${id}:new`);
    for (const id of SUPPORT_ORDER) banned.add(`support:${id}:new`);
    banned.add('weapon:needle:level');
    banned.add('weapon:needle:focus');
    (scene as unknown as { bansLeft: number }).bansLeft = 99;
    progression.addExperience(25);
    privateValue<() => boolean>(scene, 'openUpgrade').bind(scene)();
    const payload = payloads.at(-1);
    if (!payload || payload.phase !== 'selection') throw new Error('continuous selection payload was not emitted');
    expect(payload.candidates.every((candidate) => candidate.kind === 'continuous')).toBe(true);
    const before = privateValue<number>(scene, 'rerollsLeft');
    (scene as unknown as { rerollUpgrade(selectionId: number): void }).rerollUpgrade(payload.selectionId);
    const after = payloads.at(-1);
    expect(privateValue<number>(scene, 'rerollsLeft')).toBe(before);
    expect(after?.selectionId).toBe(payload.selectionId);
  });

  it('P16-04/X09: 3600回の更新でも敵・弾・攻撃待ち・予告・HP・戦闘時間が完全停止する', () => {
    const scene = new moduleUnderTest.BattleScene(options());
    privateValue<{ addExperience(amount: number): void }>(scene, 'progression').addExperience(25);
    privateValue<() => void>(scene, 'openUpgrade').bind(scene)();
    privateValue<unknown[]>(scene, 'enemies').push(new moduleUnderTest.Enemy(1, 'dropper', 0, 220));
    privateValue<(config: Record<string, unknown>) => unknown>(scene, 'addProjectile').bind(scene)({
      kind: 'needle', x: 80, y: 0, vx: 100, vy: 0, radius: 6, damage: 2, life: 2, piercing: 0, sourceWeaponId: 'needle',
    });
    (scene as Record<string, unknown>).specialWaveWarning = { angle: 1, life: 1.2, maxLife: 1.2 };
    privateValue<Array<{ cooldown: number }>>(scene, 'weapons')[0]!.cooldown = 2.5;
    (scene as Record<string, unknown>).designerWave = { angle: 2, life: 0.9, maxLife: 1.2 };
    privateValue<unknown[]>(scene, 'gravityFields').push({
      x: 150, y: 0, life: 2, maxLife: 3, radius: 50, damage: 5, pullStrength: 20,
      safeDistance: 80, damageTimer: 0.2, collapse: false, collapseDamage: 9, slowDuration: 0.5,
    });
    const capture = (): string => JSON.stringify(Object.fromEntries(
      ['elapsed', 'core', 'enemies', 'projectiles', 'weapons', 'gravityFields', 'specialWaveWarning',
        'spawnDirector', 'progression', 'upgradePayload', 'rng', 'designerWave', 'orbitAngles', 'orbitHits', 'targetLocks'].map((key) => [key, privateValue<unknown>(scene, key)]),
    ));
    const before = capture();
    const step = privateValue<(seconds: number) => void>(scene, 'step').bind(scene);
    for (let frame = 0; frame < 3600; frame += 1) step(1 / 60);
    expect(capture()).toBe(before);
  });

  it('X08: 同じ戦闘更新内の弾による撃破と致死被害は終了を優先する', () => {
    let upgradeCount = 0;
    let finishCount = 0;
    const scene = new moduleUnderTest.BattleScene(options({ callbacks: {
      onStatus() {}, onFinish: () => { finishCount += 1; }, onSnapshot() {}, onPauseRequest() {},
      onUpgrade: () => { upgradeCount += 1; },
    } }));
    const progression = privateValue<{ addExperience(amount: number): void; experience: number }>(scene, 'progression');
    progression.addExperience(24);
    const victim = new moduleUnderTest.Enemy(1, 'shard', 0, 200) as Record<string, number | boolean>;
    victim.hp = 1;
    privateValue<unknown[]>(scene, 'enemies').push(victim);
    privateValue<{ health: number }>(scene, 'core').health = 1;
    const add = privateValue<(config: Record<string, unknown>) => unknown>(scene, 'addProjectile').bind(scene);
    add({ kind: 'needle', x: 200, y: 0, vx: 0, vy: 0, radius: 10, damage: 999, life: 2, piercing: 0, sourceWeaponId: 'needle' });
    add({ kind: 'enemy', x: 0, y: 20, vx: 0, vy: 0, radius: 9, damage: 100, life: 2, piercing: 0, enemyProjectile: true });
    privateValue<(seconds: number) => void>(scene, 'step').bind(scene)(1 / 60);
    expect(victim.active).toBe(false);
    expect(progression.experience).toBeGreaterThanOrEqual(25);
    expect(privateValue<{ health: number }>(scene, 'core').health).toBe(0);
    expect(finishCount).toBe(1);
    expect(upgradeCount).toBe(0);
    expect(privateValue<string>(scene, 'state')).toBe('finished');
    expect(privateValue<unknown>(scene, 'upgradePayload')).toBeNull();
  });

  it('3回選択後に保留でき、再開操作で残りの強化を新しい撃破なしに選べる', () => {
    const payloads: UpgradePayload[] = [];
    const scene = new moduleUnderTest.BattleScene(options({ callbacks: {
      onStatus() {}, onFinish() {}, onSnapshot() {}, onPauseRequest() {},
      onUpgrade: (payload: UpgradePayload) => payloads.push(payload),
    } }));
    const progression = privateValue<{ addExperience(amount: number): void; pendingChoices: number }>(scene, 'progression');
    // Lv1から4回分: 25 + 34 + 43 + 52 = 154.
    progression.addExperience(154);
    privateValue<() => void>(scene, 'openUpgrade').bind(scene)();
    for (let choice = 0; choice < 3; choice += 1) {
      const payload = payloads.at(-1);
      if (!payload || payload.phase !== 'selection') throw new Error('selection payload was not emitted');
      const candidate = payload.candidates.find((item) => item.kind === 'continuous') ?? payload.candidates[0];
      if (!candidate) throw new Error('candidate was not emitted');
      (scene as unknown as { chooseUpgrade(candidate: UpgradeCandidate, selectionId: number): void }).chooseUpgrade(candidate, payload.selectionId);
    }
    const breakPayload = payloads.at(-1);
    expect(breakPayload?.phase).toBe('break');
    expect(progression.pendingChoices).toBe(1);
    if (!breakPayload) throw new Error('break payload was not emitted');
    (scene as unknown as { deferUpgrade(selectionId: number): void }).deferUpgrade(breakPayload.selectionId);
    expect(privateValue<string>(scene, 'state')).toBe('playing');
    expect(progression.pendingChoices).toBe(1);

    const request = privateValue<(id: number) => void>(scene, 'requestPendingUpgrade').bind(scene);
    const beforeRequest = JSON.stringify(privateValue<unknown>(scene, 'rng'));
    request(breakPayload.selectionId - 1);
    expect(privateValue<boolean>(scene, 'pendingUpgradeDeferred')).toBe(true);
    request(breakPayload.selectionId);
    request(breakPayload.selectionId);
    expect(JSON.stringify(privateValue<unknown>(scene, 'rng'))).toBe(beforeRequest);
    expect(privateValue<string>(scene, 'state')).toBe('playing');
    privateValue<(seconds: number) => void>(scene, 'step').bind(scene)(1 / 60);
    const resumed = payloads.at(-1);
    if (!resumed || resumed.phase !== 'selection') throw new Error('resumed selection payload was not emitted');
    expect(resumed.pendingCount).toBe(1);
    const finalCandidate = resumed.candidates.find((item) => item.kind === 'continuous') ?? resumed.candidates[0];
    if (!finalCandidate) throw new Error('resumed candidate was not emitted');
    (scene as unknown as { chooseUpgrade(candidate: UpgradeCandidate, selectionId: number): void }).chooseUpgrade(finalCandidate, resumed.selectionId);
    expect(progression.pendingChoices).toBe(0);
    expect(privateValue<string>(scene, 'state')).toBe('playing');
    progression.addExperience(61);
    const enemy = new moduleUnderTest.Enemy(2, 'shard', 0, 300);
    privateValue<(enemy: unknown) => void>(scene, 'handleEnemyDestroyed').bind(scene)(enemy);
    privateValue<(seconds: number) => void>(scene, 'step').bind(scene)(1 / 60);
    expect(privateValue<string>(scene, 'state')).toBe('upgrade');

  });

  it('P16-02/06: 保留中の追加撃破は経験値と回数だけを増やし、停止や無効入力で乱数を消費しない', () => {
    const scene = new moduleUnderTest.BattleScene(options());
    const progression = privateValue<{ addExperience(amount: number): void; pendingChoices: number; experience: number }>(scene, 'progression');
    progression.addExperience(154);
    privateValue<() => void>(scene, 'openUpgrade').bind(scene)();
    for (let round = 0; round < 2; round += 1) {
      for (let choice = 0; choice < 3; choice += 1) {
        const payload = privateValue<UpgradePayload>(scene, 'upgradePayload');
        const candidate = payload.candidates.find((item) => item.kind === 'continuous') ?? payload.candidates[0];
        if (!candidate) throw new Error('missing candidate');
        privateValue<(candidate: UpgradeCandidate, id: number) => void>(scene, 'chooseUpgrade').bind(scene)(candidate, payload.selectionId);
      }
      const payload = privateValue<UpgradePayload>(scene, 'upgradePayload');
      expect(payload.phase).toBe('break');
      privateValue<(id: number) => void>(scene, 'deferUpgrade').bind(scene)(payload.selectionId);
      const pending = progression.pendingChoices;
      const experience = progression.experience;
      const randomState = JSON.stringify(privateValue<unknown>(scene, 'rng'));
      for (let kill = 0; kill < 100; kill += 1) {
        privateValue<(enemy: unknown) => void>(scene, 'handleEnemyDestroyed').bind(scene)(new moduleUnderTest.Enemy(kill + 10, 'shard', 0, 300));
      }
      privateValue<(seconds: number) => void>(scene, 'step').bind(scene)(1 / 60);
      expect(progression.experience).toBeGreaterThan(experience);
      expect(progression.pendingChoices).toBeGreaterThan(pending);
      expect(privateValue<string>(scene, 'state')).toBe('playing');
      expect(privateValue<unknown>(scene, 'upgradePayload')).toBeNull();
      privateValue<() => void>(scene, 'pause').bind(scene)();
      privateValue<(id: number) => void>(scene, 'requestPendingUpgrade').bind(scene)(payload.selectionId);
      privateValue<(seconds: number) => void>(scene, 'step').bind(scene)(60);
      expect(privateValue<string>(scene, 'state')).toBe('paused');
      privateValue<() => void>(scene, 'resume').bind(scene)();
      privateValue<(id: number) => void>(scene, 'requestPendingUpgrade').bind(scene)(payload.selectionId - 1);
      expect(JSON.stringify(privateValue<unknown>(scene, 'rng'))).toBe(randomState);
      privateValue<(id: number) => void>(scene, 'requestPendingUpgrade').bind(scene)(payload.selectionId);
      privateValue<(seconds: number) => void>(scene, 'step').bind(scene)(1 / 60);
      const offered = JSON.stringify(privateValue<unknown>(scene, 'upgradePayload'));
      const rng = JSON.stringify(privateValue<unknown>(scene, 'rng'));
      privateValue<(id: number) => void>(scene, 'requestPendingUpgrade').bind(scene)(payload.selectionId);
      expect(JSON.stringify(privateValue<unknown>(scene, 'upgradePayload'))).toBe(offered);
      expect(JSON.stringify(privateValue<unknown>(scene, 'rng'))).toBe(rng);
    }
    privateValue<() => void>(scene, 'retire').bind(scene)();
    privateValue<(id: number) => void>(scene, 'requestPendingUpgrade').bind(scene)(1);
    expect(privateValue<string>(scene, 'state')).toBe('finished');
    expect(privateValue<unknown>(scene, 'upgradePayload')).toBeNull();
  });

  it('P16-03: GameHostは前プレイの同じ選択番号と終了後の入力を拒否する', () => {
    const host = new moduleUnderTest.GameHost();
    let resultCount = 0;
    const start = (runId: number): unknown => {
      host.startBattle({}, options({ runId, callbacks: {
        onStatus() {}, onUpgrade() {}, onSnapshot() {}, onPauseRequest() {},
        onFinish() { resultCount += 1; },
      } }));
      const scene = privateValue<unknown>(host, 'scene');
      privateValue<{ addExperience(amount: number): void }>(scene, 'progression').addExperience(154);
      privateValue<() => void>(scene, 'openUpgrade').bind(scene)();
      for (let choice = 0; choice < 3; choice += 1) {
        const payload = privateValue<UpgradePayload>(scene, 'upgradePayload');
        const candidate = payload.candidates[0];
        if (!candidate) throw new Error('missing candidate');
        host.chooseUpgrade(candidate, payload.selectionId, runId);
      }
      const payload = privateValue<UpgradePayload>(scene, 'upgradePayload');
      privateValue<(id: number) => void>(scene, 'deferUpgrade').bind(scene)(payload.selectionId);
      return scene;
    };
    const oldScene = start(1);
    const oldId = privateValue<number>(oldScene, 'upgradeSequence');
    const scene = start(2);
    const currentId = privateValue<number>(scene, 'upgradeSequence');
    expect(currentId).toBe(oldId);
    const before = JSON.stringify(privateValue<unknown>(scene, 'progression'));
    host.requestPendingUpgrade(oldId, 1);
    host.pause(1);
    host.retire(1);
    expect(privateValue<boolean>(scene, 'pendingUpgradeDeferred')).toBe(true);
    expect(privateValue<string>(scene, 'state')).toBe('playing');
    expect(JSON.stringify(privateValue<unknown>(scene, 'progression'))).toBe(before);
    expect(resultCount).toBe(0);
    host.requestPendingUpgrade(currentId, 2);
    privateValue<(seconds: number) => void>(scene, 'step').bind(scene)(1 / 60);
    const payload = privateValue<UpgradePayload>(scene, 'upgradePayload');
    const candidate = payload.candidates[0];
    if (!candidate) throw new Error('missing candidate');
    host.chooseUpgrade(candidate, payload.selectionId, 1);
    expect(JSON.stringify(privateValue<unknown>(scene, 'progression'))).toBe(before);
    host.chooseUpgrade(candidate, payload.selectionId, 2);
    expect(privateValue<{ pendingChoices: number }>(scene, 'progression').pendingChoices).toBe(0);
    host.retire(2);
    host.retire(2);
    host.requestPendingUpgrade(currentId, 2);
    expect(resultCount).toBe(1);
    expect(privateValue<string>(scene, 'state')).toBe('finished');
    host.stop();
    host.requestPendingUpgrade(currentId, 2);
    expect(resultCount).toBe(1);
  });

  it('部品確保は結果確定で一度だけ精算し、リタイアでは精算しない', () => {
    type WeaponProgression = { id: string; slot: number; level: number; precisionBonus: number; definition: { maxLevel: number } };
    type SupportProgression = { level: number; definition: { maxLevel: number } };
    const fillOrdinaryCaps = (run: unknown): void => {
      const weapons = privateValue<WeaponProgression[]>(run, 'weapons');
      for (const weapon of weapons) { weapon.level = weapon.definition.maxLevel; weapon.precisionBonus = 2; }
      for (const [id, slot] of [['ray', 1], ['cluster', 2]] as const) {
        const weapon = new moduleUnderTest.Weapon(id, slot) as unknown as WeaponProgression;
        weapon.level = weapon.definition.maxLevel;
        weapon.precisionBonus = 2;
        weapons.push(weapon);
      }
      const supports = privateValue<SupportProgression[]>(run, 'supports');
      for (const [id, slot] of [['output', 0], ['rhythm', 1], ['brake', 2]] as const) {
        const support = new moduleUnderTest.SupportModule(id, slot) as unknown as SupportProgression;
        support.level = support.definition.maxLevel;
        supports.push(support);
      }
    };
    const results: BattleResult[] = [];
    const scene = new moduleUnderTest.BattleScene(options({ callbacks: {
      onStatus() {}, onUpgrade() {}, onSnapshot() {}, onPauseRequest() {},
      onFinish: (result: BattleResult) => results.push(result),
    } }));
    fillOrdinaryCaps(scene);
    const progression = privateValue<{ addExperience(amount: number): void }>(scene, 'progression');
    progression.addExperience(25);
    privateValue<() => void>(scene, 'openUpgrade').bind(scene)();
    const payload = privateValue<UpgradePayload | null>(scene, 'upgradePayload');
    if (!payload) throw new Error('upgrade payload was not emitted');
    const parts = payload.candidates.find((candidate) => candidate.id === 'continuous:parts');
    if (!parts) throw new Error('parts candidate was not emitted');
    (scene as unknown as { chooseUpgrade(candidate: UpgradeCandidate, selectionId: number): void }).chooseUpgrade(parts, payload.selectionId);
    privateValue<(outcome: BattleResult['outcome'], cause: string) => void>(scene, 'finish').bind(scene)('victory', '');
    privateValue<(outcome: BattleResult['outcome'], cause: string) => void>(scene, 'finish').bind(scene)('victory', '');
    expect(results).toHaveLength(1);
    expect(results[0]?.partsEarned).toBe(21);

    const retiredResults: BattleResult[] = [];
    const retiredScene = new moduleUnderTest.BattleScene(options({ callbacks: {
      onStatus() {}, onUpgrade() {}, onSnapshot() {}, onPauseRequest() {},
      onFinish: (result: BattleResult) => retiredResults.push(result),
    } }));
    fillOrdinaryCaps(retiredScene);
    const retiredProgression = privateValue<{ addExperience(amount: number): void }>(retiredScene, 'progression');
    retiredProgression.addExperience(25);
    privateValue<() => void>(retiredScene, 'openUpgrade').bind(retiredScene)();
    const retiredPayload = privateValue<UpgradePayload | null>(retiredScene, 'upgradePayload');
    if (!retiredPayload) throw new Error('retire upgrade payload was not emitted');
    const retiredParts = retiredPayload.candidates.find((candidate) => candidate.id === 'continuous:parts');
    if (!retiredParts) throw new Error('retire parts candidate was not emitted');
    (retiredScene as unknown as { chooseUpgrade(candidate: UpgradeCandidate, selectionId: number): void }).chooseUpgrade(retiredParts, retiredPayload.selectionId);
    retiredScene.retire();
    expect(retiredResults).toHaveLength(1);
    expect(retiredResults[0]?.partsEarned).toBe(0);
  });

  it('V3の追加4武器はそれぞれ固有の実戦オブジェクトを生成する', () => {
    const scene = new moduleUnderTest.BattleScene(options());
    const weapons = privateValue<Array<{ id: string; level: number; slot: number; instanceId: string }>>(scene, 'weapons');
    const fireWeapon = privateValue<(weapon: unknown) => void>(scene, 'fireWeapon').bind(scene);
    const lanceCharge = privateValue<Map<string, number>>(scene, 'lanceCharge');
    const projectiles = privateValue<Array<{ kind: string; sourceWeaponId: string | null }>>(scene, 'projectiles');
    const mines = privateValue<unknown[]>(scene, 'mines');
    const drones = privateValue<Map<string, unknown[]>>(scene, 'drones');
    for (const id of ['grid', 'mine', 'lance', 'drone']) {
      const weapon = new moduleUnderTest.Weapon(id, 1) as unknown as { id: string; level: number; slot: number; instanceId: string };
      weapon.level = 8;
      weapons.push(weapon);
      if (id === 'lance') lanceCharge.set(weapon.instanceId, 1);
      fireWeapon(weapon);
    }
    expect(projectiles.some((projectile) => projectile.kind === 'grid' && projectile.sourceWeaponId === 'grid')).toBe(true);
    expect(projectiles.some((projectile) => projectile.kind === 'lance' && projectile.sourceWeaponId === 'lance')).toBe(true);
    expect(mines).toHaveLength(1);
    expect(drones.get(weapons.find((weapon) => weapon.id === 'drone')?.instanceId ?? '')).toHaveLength(2);
  });

  it('V5の追加25武器は個体ごとの発射元を保ったまま実戦へ入る', () => {
    const scene = new moduleUnderTest.BattleScene(options());
    const weapons = privateValue<Array<{ id: string; level: number; slot: number; instanceId: string }>>(scene, 'weapons');
    const fireWeapon = privateValue<(weapon: unknown) => void>(scene, 'fireWeapon').bind(scene);
    const projectiles = privateValue<Array<{ active: boolean; sourceWeaponId: string | null; sourceWeaponInstanceId: string | null }>>(scene, 'projectiles');
    const v5Ids = WEAPON_ORDER.slice(-25);

    for (const [index, id] of v5Ids.entries()) {
      const weapon = new moduleUnderTest.Weapon(id, index % 3) as unknown as { id: string; level: number; slot: number; instanceId: string };
      weapon.level = 8;
      weapons.push(weapon);
      fireWeapon(weapon);
      expect(projectiles.some((projectile) => projectile.active && projectile.sourceWeaponId === id && projectile.sourceWeaponInstanceId === weapon.instanceId)).toBe(true);
    }
    expect(new Set(projectiles.filter((projectile) => projectile.active).map((projectile) => projectile.sourceWeaponId))).toEqual(new Set(v5Ids));
  });

  it('追加武器のLv3分岐は共通射撃でも本数・角度または貫通を変える', () => {
    const scene = new moduleUnderTest.BattleScene(options());
    const fireAdditional = privateValue<(weapon: unknown, target: unknown, angle: number, damage: number) => void>(scene, 'fireAdditionalWeapon').bind(scene);
    const projectiles = privateValue<Array<{ kind: string; vx: number; vy: number; piercing: number; bounces: number }>>(scene, 'projectiles');
    const spreadWeapon = new moduleUnderTest.Weapon('swell', 0) as unknown as { level: number; branch: string | null };
    spreadWeapon.branch = 'spread';
    fireAdditional(spreadWeapon, null, 0, 100);
    expect(projectiles).toHaveLength(2);
    expect(projectiles[0]?.vy).not.toBe(projectiles[1]?.vy);

    projectiles.length = 0;
    const piercingWeapon = new moduleUnderTest.Weapon('swell', 0) as unknown as { level: number; branch: string | null };
    piercingWeapon.branch = 'piercing';
    fireAdditional(piercingWeapon, null, 0, 100);
    expect(projectiles).toHaveLength(1);
    expect(projectiles[0]?.piercing).toBe(2);

    projectiles.length = 0;
    const bouncingWeapon = new moduleUnderTest.Weapon('mirror', 0) as unknown as { level: number; branch: string | null };
    bouncingWeapon.branch = 'piercing';
    fireAdditional(bouncingWeapon, null, 0, 100);
    expect(projectiles[0]?.kind).toBe('disc');
    expect(projectiles[0]?.piercing).toBe(0);
    expect(projectiles[0]?.bounces).toBe(4);
  });

  it('追加武器の弾寿命は有効射程と弾速に一致する', () => {
    const scene = new moduleUnderTest.BattleScene(options());
    const weapon = new moduleUnderTest.Weapon('mortar', 0) as unknown as { branch: string | null };
    const fireAdditional = privateValue<(weapon: unknown, target: unknown, angle: number, damage: number) => void>(scene, 'fireAdditionalWeapon').bind(scene);
    fireAdditional(weapon, null, 0, 100);
    const projectile = privateValue<Array<{ life: number }>>(scene, 'projectiles')[0];
    expect(projectile?.life).toBeCloseTo(500 / 300);
  });

  it('長槍型は射程・幅・初期表示を実際に広げる', () => {
    const fireScenario = (branch: string | null): { radius: number; life: number; lineWidth: number; lineLength: number } => {
      const scene = new moduleUnderTest.BattleScene(options());
      const weapon = new moduleUnderTest.Weapon('lance', 0) as unknown as { branch: string | null; instanceId: string };
      weapon.branch = branch;
      privateValue<Map<string, number>>(scene, 'lanceCharge').set(weapon.instanceId, 1);
      privateValue<(weapon: unknown, angle: number, damage: number) => void>(scene, 'fireLance').bind(scene)(weapon, 0, 100);
      const projectile = privateValue<Array<{ radius: number; life: number }>>(scene, 'projectiles')[0];
      const line = privateValue<Array<{ width: number; length?: number }>>(scene, 'lines').at(-1);
      if (!projectile || !line) throw new Error('lance attack was not created');
      return { radius: projectile.radius, life: projectile.life, lineWidth: line.width, lineLength: line.length ?? 0 };
    };
    const regular = fireScenario(null);
    const long = fireScenario('long');
    expect(long.radius).toBe(regular.radius + 4);
    expect(long.lineWidth).toBe(regular.lineWidth + 4);
    expect(long.lineLength).toBe(140);
    expect(long.life).toBeCloseTo(regular.life * 1.18);
  });

  it('連針砲の分散は重なった敵を一弾一体だけ、貫通型は追加対象まで処理する', () => {
    const fireNeedleScenario = (branch: 'spread' | 'piercing'): {
      projectiles: Array<{ active: boolean; x: number; y: number; piercing: number }>;
      enemies: Array<{ active: boolean; hp: number; x: number; y: number; hitRadius: number; id: number }>;
    } => {
      const scene = new moduleUnderTest.BattleScene(options());
      const weapon = privateValue<Array<{ id: string; level: number; branch: string | null }>>(scene, 'weapons')[0];
      if (!weapon) throw new Error('initial needle was not created');
      weapon.level = 3;
      weapon.branch = branch;
      privateValue<(weapon: unknown, angle: number, damage: number) => void>(scene, 'fireNeedle').bind(scene)(weapon, 0, 10);
      const projectiles = privateValue<Array<{ active: boolean; x: number; y: number; piercing: number }>>(scene, 'projectiles');
      const firstProjectile = projectiles[0];
      if (!firstProjectile) throw new Error('needle projectile was not created');
      const enemies = [1, 2, 3, 4].map((id) => {
        const enemy = new moduleUnderTest.Enemy(id, 'shard', 0, 100) as unknown as { active: boolean; hp: number; x: number; y: number; hitRadius: number; id: number };
        enemy.x = firstProjectile.x;
        enemy.y = firstProjectile.y;
        return enemy;
      });
      return { projectiles, enemies };
    };

    const spread = fireNeedleScenario('spread');
    expect(spread.projectiles).toHaveLength(3);
    expect(spread.projectiles.every((projectile) => projectile.piercing === 0)).toBe(true);
    const spreadEvents = collideProjectiles([spread.projectiles[0]! as never], spread.enemies as never, 0);
    expect(spreadEvents).toHaveLength(1);
    expect(spread.enemies[0]?.hp).toBe(14);
    expect(spread.enemies[1]?.hp).toBe(24);

    const piercing = fireNeedleScenario('piercing');
    expect(piercing.projectiles).toHaveLength(1);
    expect(piercing.projectiles[0]?.piercing).toBe(3);
    const piercingEvents = collideProjectiles([piercing.projectiles[0]! as never], piercing.enemies as never, 0);
    expect(piercingEvents).toHaveLength(4);
    expect(piercing.enemies.every((enemy) => enemy.hp < 24)).toBe(true);
    expect(piercing.projectiles[0]?.active).toBe(false);
  });

  it('誘爆環は印または燃焼が付いた敵の撃破時だけ一度発動する', () => {
    const scene = new moduleUnderTest.BattleScene(options());
    const supports = privateValue<Array<{ id: string; level: number }>>(scene, 'supports');
    const ignite = new moduleUnderTest.SupportModule('ignite', 0) as unknown as { id: string; level: number };
    ignite.level = 3;
    supports.push(ignite);
    const destroy = privateValue<(enemy: unknown) => void>(scene, 'handleEnemyDestroyed').bind(scene);
    const recorder = privateValue<{ supportUsage: Partial<Record<string, number>> }>(scene, 'recorder');
    const unmarked = new moduleUnderTest.Enemy(41, 'shard', 0, 180) as unknown as { active: boolean; markedUntil: number; burningUntil: number };
    unmarked.active = false;
    destroy(unmarked);
    expect(recorder.supportUsage.ignite ?? 0).toBe(0);

    const marked = new moduleUnderTest.Enemy(42, 'shard', 0, 180) as unknown as { active: boolean; markedUntil: number; burningUntil: number };
    marked.active = false;
    marked.markedUntil = 10;
    destroy(marked);
    destroy(marked);
    expect(recorder.supportUsage.ignite).toBe(1);
  });

  it('迎撃格子は方向上限内の敵弾を消し、機雷は侵入時に一度だけ爆発する', () => {
    const scene = new moduleUnderTest.BattleScene(options());
    const weapons = privateValue<Array<{ id: string; level: number; slot: number }>>(scene, 'weapons');
    const grid = new moduleUnderTest.Weapon('grid', 1) as unknown as { id: string; level: number; slot: number };
    grid.level = 8;
    weapons.push(grid);
    const origin = privateValue<(weapon: unknown) => { x: number; y: number }>(scene, 'weaponOrigin').bind(scene)(grid);
    const addProjectile = privateValue<(config: Record<string, unknown>) => unknown>(scene, 'addProjectile').bind(scene);
    addProjectile({ kind: 'enemy', x: origin.x, y: origin.y - 120, vx: 0, vy: 0, radius: 9, damage: 1, life: 2, piercing: 0, enemyProjectile: true });
    privateValue<(weapon: unknown) => void>(scene, 'fireWeapon').bind(scene)(grid);
    expect(privateValue<Array<{ active: boolean }>>(scene, 'projectiles').some((projectile) => projectile.active === false)).toBe(true);
    const mine = new moduleUnderTest.Weapon('mine', 2) as unknown as { id: string; level: number; slot: number };
    mine.level = 8;
    weapons.push(mine);
    privateValue<(weapon: unknown) => void>(scene, 'fireWeapon').bind(scene)(mine);
    const fields = privateValue<Array<{ x: number; y: number; life: number }>>(scene, 'mines');
    expect(fields.length).toBeGreaterThan(0);
    const enemy = new moduleUnderTest.Enemy(77, 'shard', 0, Math.hypot(fields[0]!.x, fields[0]!.y));
    enemy.x = fields[0]!.x; enemy.y = fields[0]!.y;
    privateValue<unknown[]>(scene, 'enemies').push(enemy);
    privateValue<(seconds: number) => void>(scene, 'updateMines').bind(scene)(1 / 60);
    expect(fields).toHaveLength(0);
  });

  it('停止中の移設・入替は個体のレベルと待ち時間を保ち、入力台帳へ一度ずつ記録する', () => {
    const snapshots: unknown[] = [];
    const scene = new moduleUnderTest.BattleScene(options({ callbacks: {
      onStatus() {}, onUpgrade() {}, onFinish() {}, onPauseRequest() {}, onSnapshot: (snapshot: unknown) => snapshots.push(snapshot),
    } }));
    const weapons = privateValue<Array<{ id: string; instanceId: string; slot: number; level: number; cooldown: number }>>(scene, 'weapons');
    const graph = privateValue<{ install(instanceId: string, kind: 'weapon', slot: number): boolean }>(scene, 'buildGraph');
    const first = weapons[0]!;
    first.level = 4; first.cooldown = 1.25;
    const second = new moduleUnderTest.Weapon('ray', 1) as unknown as { id: string; instanceId: string; slot: number; level: number; cooldown: number };
    second.level = 3; second.cooldown = 0.75;
    weapons.push(second);
    expect(graph.install(second.instanceId, 'weapon', 1)).toBe(true);
    (scene as Record<string, unknown>).state = 'paused';
    expect((scene as unknown as { moveDevice(id: string, slot: number): boolean }).moveDevice(first.instanceId, 2)).toBe(true);
    expect(first.slot).toBe(2);
    expect(first.cooldown).toBe(1.25);
    expect((scene as unknown as { swapDevices(first: string, second: string): boolean }).swapDevices(first.instanceId, second.instanceId)).toBe(true);
    expect(first.slot).toBe(1);
    expect(second.slot).toBe(2);
    expect(privateValue<{ inputRecorder: { snapshot(): unknown[] } }>(scene, 'recorder').inputRecorder.snapshot().filter((event: { kind: string }) => event.kind === 'build')).toHaveLength(2);
    expect(snapshots.length).toBeGreaterThanOrEqual(2);
    (scene as Record<string, unknown>).state = 'playing';
    expect((scene as unknown as { moveDevice(id: string, slot: number): boolean }).moveDevice(first.instanceId, 0)).toBe(false);
  });

  it('満枠テスト構成の交換候補を安全に確定し、旧弾の帰属を保存復帰でも保つ', () => {
    const payloads: UpgradePayload[] = [];
    const checkpoints: unknown[] = [];
    const scene = new moduleUnderTest.BattleScene(options({
      competitive: true,
      testMode: true,
      testFullLoadout: true,
      callbacks: {
        onStatus() {}, onFinish() {}, onSnapshot() {}, onPauseRequest() {},
        onUpgrade: (payload: UpgradePayload) => payloads.push(payload),
        onCheckpoint: (checkpoint: unknown) => checkpoints.push(checkpoint),
      },
    }));
    const weapons = privateValue<Array<{ id: string; instanceId: string; slot: number; level: number }>>(scene, 'weapons');
    const supports = privateValue<Array<{ id: string; instanceId: string; slot: number; level: number }>>(scene, 'supports');
    const graph = privateValue<{ unlockedLayer: number }>(scene, 'buildGraph');
    const capacity = privateValue<{ used: number }>(scene, 'buildCapacity');
    expect(weapons).toHaveLength(9);
    expect(supports).toHaveLength(9);
    expect(weapons.every((weapon) => weapon.level >= 3)).toBe(true);
    expect(supports.every((support) => support.level >= 3)).toBe(true);
    expect(graph.unlockedLayer).toBe(3);
    expect(capacity.used).toBe(18);

    privateValue<{ addExperience(amount: number): void; experience: number; pendingChoices: number }>(scene, 'progression').addExperience(25);
    privateValue<() => void>(scene, 'openUpgrade').bind(scene)();
    let payload = payloads.at(-1);
    if (!payload || payload.phase !== 'selection') throw new Error('replacement payload was not emitted');
    let replacement = payload.candidates.find((candidate) => candidate.kind === 'weapon' && candidate.replacementTargets?.length);
    // The normal draw exposes one replacement addition at a time. Advance the
    // candidate stream in this integration fixture until the weapon side is
    // shown, then use that still token-bound payload for the selection test.
    if (!replacement) {
      const createCandidates = privateValue<() => UpgradeCandidate[]>(scene, 'createCandidates').bind(scene);
      for (let attempt = 0; attempt < 256 && !replacement; attempt += 1) {
        const candidates = createCandidates();
        replacement = candidates.find((candidate) => candidate.kind === 'weapon' && candidate.replacementTargets?.length);
        if (replacement) {
          payload = { ...payload, candidates };
          (scene as Record<string, unknown>).upgradePayload = payload;
        }
      }
    }
    if (!replacement || !replacement.replacementTargets?.[0]) throw new Error('replacement candidate was not emitted');
    const target = replacement.replacementTargets[0];
    expect(replacement.replacementSlots).toContain(target.slot);
    expect(replacement.replacementBranchOptions?.length).toBeGreaterThan(0);
    const outgoing = weapons.find((weapon) => weapon.instanceId === target.instanceId);
    if (!outgoing) throw new Error('replacement target is not live');
    const addProjectile = privateValue<(config: Record<string, unknown>) => unknown>(scene, 'addProjectile').bind(scene);
    addProjectile({
      kind: 'needle', x: 80, y: 0, vx: 100, vy: 0, radius: 6, damage: 2, life: 2, piercing: 0,
      sourceWeaponId: outgoing.id, sourceWeaponInstanceId: outgoing.instanceId,
    });
    const beforeExperience = privateValue<{ experience: number }>(scene, 'progression').experience;
    const branch = replacement.replacementBranchOptions?.[0]?.id;
    const choose = privateValue<(candidate: UpgradeCandidate, selectionId: number) => void>(scene, 'chooseUpgrade').bind(scene);
    choose({ ...replacement, placementSlot: target.slot, replacementTargetInstanceId: 'stale-target', replacementBranch: branch }, payload.selectionId);
    expect(privateValue<{ experience: number }>(scene, 'progression').experience).toBe(beforeExperience);
    expect(weapons.some((weapon) => weapon.instanceId === target.instanceId)).toBe(true);

    choose({ ...replacement, placementSlot: target.slot, replacementTargetInstanceId: target.instanceId, replacementBranch: branch }, payload.selectionId);
    expect(privateValue<string>(scene, 'state')).toBe('playing');
    expect(weapons.some((weapon) => weapon.instanceId === target.instanceId)).toBe(false);
    expect(weapons.some((weapon) => weapon.id === replacement.targetId && weapon.slot === target.slot)).toBe(true);
    const upgradeInput = privateValue<{ inputRecorder: { snapshot(): Array<Record<string, unknown>> } }>(scene, 'recorder')
      .inputRecorder.snapshot().find((event) => event.kind === 'upgrade');
    expect(upgradeInput).toMatchObject({
      replacementTargetInstanceId: target.instanceId,
      replacementBranch: branch,
    });
    const retiredWeapons = privateValue<Map<string, unknown>>(scene, 'retiredWeapons');
    expect(retiredWeapons.has(target.instanceId)).toBe(true);
    const projectile = privateValue<Array<{ active: boolean; sourceWeaponInstanceId: string | null }>>(scene, 'projectiles')
      .find((item) => item.sourceWeaponInstanceId === target.instanceId);
    if (!projectile) throw new Error('old-source projectile was not retained');
    expect(privateValue<(projectile: unknown) => unknown>(scene, 'weaponForProjectile').bind(scene)(projectile)).toBe(outgoing);

    // The final choice is live-playing, but it must still publish a stable
    // pause-on-reload checkpoint immediately; otherwise a tab close in this
    // narrow interval loses the replacement and its outgoing source table.
    const choiceCheckpoint = checkpoints.at(-1) as Record<string, unknown> | undefined;
    if (!choiceCheckpoint) throw new Error('replacement choice checkpoint was not emitted');
    expect(choiceCheckpoint.phase).toBe('paused');
    expect((choiceCheckpoint.snapshot as Record<string, unknown>).retiredWeaponSources).toEqual(expect.arrayContaining([
      expect.objectContaining({ instanceId: target.instanceId }),
    ]));
    const choiceResumed = new moduleUnderTest.BattleScene(options({ competitive: true, resumeCheckpoint: choiceCheckpoint }));
    const choiceRestoredProjectile = privateValue<Array<{ sourceWeaponInstanceId: string | null }>>(choiceResumed, 'projectiles')
      .find((item) => item.sourceWeaponInstanceId === target.instanceId);
    expect(choiceRestoredProjectile).toBeDefined();
    expect(privateValue<string>(choiceResumed, 'state')).toBe('paused');
    choiceResumed.resume();
    expect(privateValue<string>(choiceResumed, 'state')).toBe('playing');

    privateValue<() => void>(scene, 'pause').bind(scene)();
    const checkpoint = checkpoints.at(-1) as Record<string, unknown> | undefined;
    if (!checkpoint) throw new Error('replacement checkpoint was not emitted');
    const checkpointSnapshot = checkpoint.snapshot as Record<string, unknown>;
    expect((checkpointSnapshot.retiredWeaponSources as unknown[] | undefined)?.some((item) => (item as Record<string, unknown>).instanceId === target.instanceId)).toBe(true);
    const resumed = new moduleUnderTest.BattleScene(options({ competitive: true, resumeCheckpoint: checkpoint }));
    const restoredProjectile = privateValue<Array<{ active: boolean; sourceWeaponInstanceId: string | null }>>(resumed, 'projectiles')
      .find((item) => item.sourceWeaponInstanceId === target.instanceId);
    if (!restoredProjectile) throw new Error('old-source projectile did not restore');
    const restoredSource = privateValue<(projectile: unknown) => unknown>(resumed, 'weaponForProjectile').bind(resumed)(restoredProjectile) as { instanceId: string } | undefined;
    expect(restoredSource?.instanceId).toBe(target.instanceId);
    resumed.resume();
    expect(privateValue<string>(resumed, 'state')).toBe('playing');
  });

  it('競技モードは強い照準補助設定でも標準の照準保持時間を使う', () => {
    const scene = new moduleUnderTest.BattleScene(options({ competitive: true, aimAssist: 'strong' }));
    (scene as Record<string, unknown>).scale = { displayScale: { x: 1 } };
    (scene as Record<string, unknown>).aimPointerId = 1;
    (scene as Record<string, unknown>).aimStart = { x: 0, y: 0 };
    (scene as Record<string, unknown>).elapsed = 5;
    privateValue<(pointer: unknown) => void>(scene, 'handlePointerMove').bind(scene)({ id: 1, x: 100, y: 0 });
    expect(privateValue<number>(scene, 'aimReleaseAt')).toBeCloseTo(5.8);
  });
});
