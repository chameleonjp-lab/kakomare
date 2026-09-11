import manifest from '../../ranking-manifest.json';
import type { RankingManifest } from '../validation/rankingManifest';

export const RANKING_MANIFEST = manifest as RankingManifest;

/**
 * Game-side constants are derived from the manifest. The finish RPC is kept
 * here because manifest v1 stores start and submit operations in separate
 * sections while the v1 common contract also requires an explicit finish.
 */
export const RANKING_CONFIG = Object.freeze({
  gameId: RANKING_MANIFEST.game_id,
  canonicalUrl: RANKING_MANIFEST.canonical_url,
  releaseId: 'kakomare-20260911-v6',
  clientVersion: RANKING_MANIFEST.client_version,
  submissionMode: RANKING_MANIFEST.submission_mode,
  representativeSlug: RANKING_MANIFEST.lab.representative_slug,
  playerNameStorageKey: RANKING_MANIFEST.player_name.storage_key,
  startRpc: RANKING_MANIFEST.play_count.rpc,
  finishRpc: 'finish_game_play_v1',
  scoreRpc: RANKING_MANIFEST.submission.rpc,
  ruleVersion: 'expansion-v5-runtime',
  timeoutMs: RANKING_MANIFEST.submission.timeout_ms,
});

export type RankingConfig = typeof RANKING_CONFIG;

