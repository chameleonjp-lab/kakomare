import type { CompetitiveRulesDesign } from '../types/expansion';

/**
 * V5 carries the complete content registry into the runtime contract. It does
 * not enable ranking submission; the actual experiment-site integration stays
 * in V6 behind a separate permission gate.
 */
export const COMPETITIVE_RULES: CompetitiveRulesDesign = {
  version: 'expansion-v5-runtime',
  initial: {
    coreHp: 100,
    baseDamage: 8,
    initialWeapon: 'needle',
    installedWeaponSlots: 3,
    installedSupportSlots: 3,
    capacity: 6,
    rerolls: 2,
    exclusions: 2,
  },
  candidateWeights: {
    newWeapon: 3,
    existingWeaponGrowth: 5,
    support: 4,
    expansion: 2,
    specialEvolution: 1,
    continuousProgress: 1,
  },
  score: {
    kill: 10,
    threatTier: 100,
    boss: 1000,
    challenge: 250,
    timeAndHpAreResultFields: true,
  },
  seedStreams: ['enemy-spawn', 'candidate-draw', 'combat-effect', 'presentation'],
  qualification: [
    '開始受付が発行したplay_idとルール版を保持する',
    'ランキング対象は研究・解放状況に依存しない共通初期条件で始める',
    '候補・除外・引き直しは有効性を再検証してから確定する',
    '終了種別と得点内訳を一度だけ確定し、同じ結果を再送しても増やさない',
    'V1では本番DBへ送信せず、V6で実際の共通規約と照合する',
  ],
};
