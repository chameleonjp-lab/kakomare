import type { StageDefinition, StageId } from '../types/content';

export const STAGES: Record<StageId, StageDefinition> = {
  'stage-1': {
    id: 'stage-1', name: '包囲開始', timeLimit: 180,
    description: '基本照準、強化、回転冠を理解する最初の防衛。',
    enemies: ['shard', 'runner', 'lattice', 'spore'], boss: 'crown', clearBonus: 3_000,
    budgetBase: 1.3, budgetRise: 0.012, enemyLimit: 90, bossAt: 145, difficultyFactor: 0.003,
  },
  'stage-2': {
    id: 'stage-2', name: '断続波', timeLimit: 210,
    description: '外殻と標識体が作る組み合わせへ、武器の役割を合わせます。',
    enemies: ['shard', 'runner', 'shell', 'spore', 'marker', 'dropper', 'charger'], boss: 'designer', clearBonus: 5_000,
    budgetBase: 1.7, budgetRise: 0.016, enemyLimit: 125, bossAt: 170, difficultyFactor: 0.0038,
  },
  'stage-3': {
    id: 'stage-3', name: '閉鎖環', timeLimit: 240,
    description: 'すべての敵と反響核に対応し、組み上げた装置を完成させます。',
    enemies: ['shard', 'runner', 'lattice', 'shell', 'spore', 'marker', 'dropper', 'phase', 'charger', 'guard', 'repair'], boss: 'echo', clearBonus: 8_000,
    budgetBase: 2, budgetRise: 0.02, enemyLimit: 160, bossAt: 195, difficultyFactor: 0.0045,
  },
  'stage-4': {
    id: 'stage-4', name: '交差射線', timeLimit: 270,
    description: '敵弾の迎撃と射手の処理を切り替え、交差する予告線を読みます。',
    enemies: ['shard', 'runner', 'dropper', 'marker', 'guard', 'charger', 'phase'], boss: 'gate', clearBonus: 10_000,
    budgetBase: 2.2, budgetRise: 0.022, enemyLimit: 180, bossAt: 220, difficultyFactor: 0.0048,
  },
  'stage-5': {
    id: 'stage-5', name: '再生群', timeLimit: 300,
    description: '修復体と造兵体を先に止め、有限の支援網を崩します。',
    enemies: ['shard', 'runner', 'shell', 'spore', 'repair', 'factory', 'guard', 'marker'], boss: 'weaver', clearBonus: 12_000,
    budgetBase: 2.4, budgetRise: 0.024, enemyLimit: 190, bossAt: 245, difficultyFactor: 0.005,
  },
  'stage-6': {
    id: 'stage-6', name: '多重包囲', timeLimit: 330,
    description: '突進・遠隔・支援が同時に現れる完成構成向けの混成戦です。',
    enemies: ['shard', 'runner', 'shell', 'lattice', 'spore', 'marker', 'dropper', 'phase', 'charger', 'guard', 'repair', 'factory'], boss: 'reactor', clearBonus: 15_000,
    budgetBase: 2.7, budgetRise: 0.026, enemyLimit: 200, bossAt: 270, difficultyFactor: 0.0052,
  },
  endless: {
    id: 'endless', name: '無限モード', timeLimit: Number.POSITIVE_INFINITY,
    description: '5分ごとに危険度が上がる、制限時間のない記録挑戦です。',
    enemies: ['shard', 'runner', 'shell', 'lattice', 'spore', 'marker', 'dropper', 'phase', 'charger', 'guard', 'repair', 'factory'], boss: 'echo', clearBonus: 0,
    budgetBase: 1.8, budgetRise: 0.018, enemyLimit: 180, bossAt: 300, difficultyFactor: 0.0045, isEndless: true,
  },
};

// Endless remains the direct post-stage-3 unlock.  Stages 4–6 are a separate
// branch unlocked at the same clear, so existing saves and the original
// infinite-mode route remain valid.
export const STAGE_ORDER: StageId[] = ['stage-1', 'stage-2', 'stage-3', 'endless', 'stage-4', 'stage-5', 'stage-6'];

export function stageIsUnlocked(stageId: StageId, unlockedStages: StageId[]): boolean {
  return unlockedStages.includes(stageId);
}

export function nextStageId(stageId: StageId): StageId | null {
  if (stageId === 'stage-1') return 'stage-2';
  if (stageId === 'stage-2') return 'stage-3';
  if (stageId === 'stage-3') return 'endless';
  if (stageId === 'stage-4') return 'stage-5';
  if (stageId === 'stage-5') return 'stage-6';
  return null;
}
