import { DeterministicRng } from './SpawnDirector';

export const RANDOM_STREAM_NAMES = ['enemy-spawn', 'candidate-draw', 'combat-effect', 'presentation'] as const;
export type RandomStreamName = (typeof RANDOM_STREAM_NAMES)[number];

export interface CompetitiveRandomStreams {
  readonly enemySpawn: DeterministicRng;
  readonly candidateDraw: DeterministicRng;
  readonly combatEffect: DeterministicRng;
  readonly presentation: DeterministicRng;
  readonly seeds: Readonly<Record<RandomStreamName, number>>;
  for(name: RandomStreamName): DeterministicRng;
}

/**
 * Derive independent deterministic streams from one run seed. A draw in one
 * purpose cannot move the sequence used by an enemy, boss, or presentation.
 */
export function createCompetitiveRandomStreams(seed: number): CompetitiveRandomStreams {
  const safeSeed = normalizeSeed(seed);
  const seeds = Object.fromEntries(RANDOM_STREAM_NAMES.map((name) => [name, name === 'enemy-spawn' ? safeSeed : deriveSeed(safeSeed, name)])) as Record<RandomStreamName, number>;
  const streams = {
    enemySpawn: new DeterministicRng(seeds['enemy-spawn']),
    candidateDraw: new DeterministicRng(seeds['candidate-draw']),
    combatEffect: new DeterministicRng(seeds['combat-effect']),
    presentation: new DeterministicRng(seeds.presentation),
    seeds,
    for(name: RandomStreamName): DeterministicRng {
      if (name === 'enemy-spawn') return this.enemySpawn;
      if (name === 'candidate-draw') return this.candidateDraw;
      if (name === 'combat-effect') return this.combatEffect;
      return this.presentation;
    },
  } as CompetitiveRandomStreams;
  return streams;
}

export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 1;
  const normalized = Math.floor(seed) >>> 0;
  return normalized || 1;
}

function deriveSeed(seed: number, name: string): number {
  let hash = seed ^ 0x9e3779b9;
  for (const char of name) hash = Math.imul(hash ^ char.charCodeAt(0), 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash ^= hash >>> 16;
  return (hash >>> 0) || 1;
}
