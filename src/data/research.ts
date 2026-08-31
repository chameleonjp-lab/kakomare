import type { ResearchId, SaveData } from '../types/save';

export interface ResearchDefinition {
  id: ResearchId;
  section: 'コア' | '攻撃' | '選択' | '記録';
  name: string;
  description: string;
  maxLevel: number;
  costs: number[];
}

export const RESEARCH: Record<ResearchId, ResearchDefinition> = {
  'core-health': { id: 'core-health', section: 'コア', name: '耐久フレーム', description: 'コアの最大耐久力を1段階につき5増やします。', maxLevel: 3, costs: [30, 45, 60] },
  'part-yield': { id: 'part-yield', section: 'コア', name: '回収効率', description: '結果で得る部品を1段階につき5%増やします。', maxLevel: 2, costs: [35, 55] },
  'weapon-power': { id: 'weapon-power', section: '攻撃', name: '出力調整', description: 'すべての武器の基礎威力を1段階につき3%増やします。', maxLevel: 5, costs: [35, 45, 55, 65, 75] },
  'projectile-speed': { id: 'projectile-speed', section: '攻撃', name: '弾道安定', description: '弾を使う武器の速度を1段階につき5%増やします。', maxLevel: 2, costs: [35, 50] },
  reroll: { id: 'reroll', section: '選択', name: '再抽選枠', description: '強化候補の引き直し回数を1回増やします。最大2回。', maxLevel: 2, costs: [40, 60] },
  ban: { id: 'ban', section: '選択', name: '除外枠', description: '強化候補の除外回数を1回増やします。最大2回。', maxLevel: 2, costs: [40, 60] },
  'candidate-details': { id: 'candidate-details', section: '選択', name: '詳細解析', description: '強化候補に基準攻撃力と、選択後の役割を追加表示します。', maxLevel: 1, costs: [45] },
  'enemy-records': { id: 'enemy-records', section: '記録', name: '敵図鑑', description: '出会った敵の説明と撃破数を表示します。', maxLevel: 1, costs: [30] },
  'weapon-records': { id: 'weapon-records', section: '記録', name: '武器記録', description: '武器ごとの最高攻撃量を表示します。', maxLevel: 1, costs: [30] },
  'sector-records': { id: 'sector-records', section: '記録', name: '方向解析', description: 'ステージごとの方向別被害を表示します。', maxLevel: 1, costs: [30] },
};

export const RESEARCH_ORDER: ResearchId[] = [
  'core-health', 'part-yield', 'weapon-power', 'projectile-speed', 'reroll', 'ban',
  'candidate-details', 'enemy-records', 'weapon-records', 'sector-records',
];

export interface ResearchEffects {
  maxCore: number;
  partMultiplier: number;
  powerMultiplier: number;
  projectileSpeedMultiplier: number;
  rerolls: number;
  bans: number;
  candidateDetails: boolean;
  enemyRecords: boolean;
  weaponRecords: boolean;
  sectorRecords: boolean;
}

export function researchLevel(save: SaveData, id: ResearchId): number {
  return Math.max(0, Math.min(RESEARCH[id].maxLevel, Math.floor(save.progress.researchLevels[id] ?? 0)));
}

export function researchCost(save: SaveData, id: ResearchId): number | null {
  const definition = RESEARCH[id];
  const level = researchLevel(save, id);
  return level >= definition.maxLevel ? null : definition.costs[level] ?? null;
}

export function getResearchEffects(save: SaveData): ResearchEffects {
  const level = (id: ResearchId): number => researchLevel(save, id);
  return {
    maxCore: 100 + level('core-health') * 5,
    partMultiplier: 1 + level('part-yield') * 0.05,
    powerMultiplier: 1 + level('weapon-power') * 0.03,
    projectileSpeedMultiplier: 1 + level('projectile-speed') * 0.05,
    rerolls: level('reroll'),
    bans: level('ban'),
    candidateDetails: level('candidate-details') > 0,
    enemyRecords: level('enemy-records') > 0,
    weaponRecords: level('weapon-records') > 0,
    sectorRecords: level('sector-records') > 0,
  };
}

export function purchaseResearch(save: SaveData, id: ResearchId): SaveData | null {
  const cost = researchCost(save, id);
  if (cost === null || save.progress.parts < cost) return null;
  const nextLevel = researchLevel(save, id) + 1;
  return {
    ...save,
    progress: {
      ...save.progress,
      parts: save.progress.parts - cost,
      researchLevels: { ...save.progress.researchLevels, [id]: nextLevel },
    },
  };
}

