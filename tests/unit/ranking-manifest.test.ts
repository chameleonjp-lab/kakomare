import { describe, expect, it } from 'vitest';
import manifest from '../../ranking-manifest.json';
import { RANKING_CONFIG } from '../../src/data/rankingConfig';
import { validateRankingManifest } from '../../src/validation/rankingManifest';

describe('ranking manifest', () => {
  it('matches the common v1 shape and exposes only the representative endless slug', () => {
    expect(validateRankingManifest(manifest)).toEqual({ valid: true, errors: [] });
    expect(RANKING_CONFIG.gameId).toBe('kakomare');
    expect(RANKING_CONFIG.representativeSlug).toBe('kakomare_endless');
    expect(RANKING_CONFIG.startRpc).toBe('start_game_play_v1');
    expect(RANKING_CONFIG.scoreRpc).toBe('submit_score_idempotent_v1');
  });

  it('rejects a manifest whose representative slug is not registered', () => {
    const invalid = { ...manifest, lab: { representative_slug: 'missing' } };
    expect(validateRankingManifest(invalid).valid).toBe(false);
  });
});
