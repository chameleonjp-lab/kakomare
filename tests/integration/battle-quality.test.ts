import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

type BattleModule = {
  BattleScene: new (options: Record<string, unknown>) => unknown;
  Enemy: new (id: number, type: string, angle: number, distance: number) => unknown;
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
      contents: `export { BattleScene } from ${JSON.stringify(join(repositoryRoot, 'src/game/scenes/BattleScene.ts'))}; export { Enemy } from ${JSON.stringify(join(repositoryRoot, 'src/game/entities/Enemy.ts'))}; export { SupportModule } from ${JSON.stringify(join(repositoryRoot, 'src/game/entities/SupportModule.ts'))};`,
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
          contents: 'export default { Scene: class { constructor() {} } };',
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
});
