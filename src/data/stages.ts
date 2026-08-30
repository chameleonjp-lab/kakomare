import type { StageDefinition, StageId } from '../types/content';

export const STAGES: Record<StageId, StageDefinition> = {
  'stage-1': {
    id: 'stage-1',
    name: '包囲開始',
    timeLimit: 180,
    description: '基本照準、強化、回転冠を理解する最初の防衛。',
    enemies: ['shard', 'runner', 'lattice', 'spore'],
    boss: 'crown',
    clearBonus: 3000,
  },
};

export const STAGE_ORDER: StageId[] = ['stage-1'];
