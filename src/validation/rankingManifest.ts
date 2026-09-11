export interface RankingManifestEntry {
  mode_id: string;
  game_slug: string;
  title: string;
  display_order: number;
  top_ranking_type: 'first' | 'best';
  score_order: 'asc' | 'desc';
  score_unit: string;
  score_scale: number;
  score_decimals: number;
  score_label: string;
  first_score_label: string;
  best_score_label: string;
  score_min: number;
  score_max: number;
  ranked_results: string[];
}

export interface RankingManifest {
  schema_version: 'chameleonjp-ranking-manifest-v1';
  game_id: string;
  title: string;
  description: string;
  share_text: string;
  canonical_url: string;
  release_date: string;
  client_version: string;
  submission_mode: 'shared' | 'verified';
  lab: { representative_slug: string };
  player_name: { required_before_start: true; min_length: 1; max_length: 20; storage_key: string };
  play_count: { count_at: 'start'; rpc: string; idempotency: true };
  submission: { rpc: string; automatic: true; idempotency: true; timeout_ms: number };
  ranking_entries: RankingManifestEntry[];
}

export interface ManifestValidationResult { valid: boolean; errors: string[] }

function isString(value: unknown, min = 1, max = Number.POSITIVE_INFINITY): value is string {
  return typeof value === 'string' && value.length >= min && value.length <= max;
}

export function validateRankingManifest(value: unknown): ManifestValidationResult {
  const errors: string[] = [];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { valid: false, errors: ['manifest must be an object'] };
  const manifest = value as Record<string, unknown>;
  if (manifest.schema_version !== 'chameleonjp-ranking-manifest-v1') errors.push('schema_version');
  if (!isString(manifest.game_id, 1, 64) || !/^[a-z0-9][a-z0-9_]*$/.test(manifest.game_id)) errors.push('game_id');
  for (const key of ['title', 'description', 'share_text', 'client_version']) if (!isString(manifest[key])) errors.push(key);
  if (!isString(manifest.canonical_url) || !/^https:\/\/[^?# ]+\/$/.test(manifest.canonical_url)) errors.push('canonical_url');
  if (typeof manifest.release_date !== 'string') errors.push('release_date');
  if (manifest.submission_mode !== 'shared' && manifest.submission_mode !== 'verified') errors.push('submission_mode');
  const lab = manifest.lab;
  if (!isRecord(lab) || !isString(lab.representative_slug) || !/^[a-z0-9][a-z0-9_]*$/.test(lab.representative_slug)) errors.push('lab.representative_slug');
  const player = manifest.player_name;
  if (!isRecord(player) || player.required_before_start !== true || player.min_length !== 1 || player.max_length !== 20 || !isString(player.storage_key)) errors.push('player_name');
  const play = manifest.play_count;
  if (!isRecord(play) || play.count_at !== 'start' || !isString(play.rpc) || play.idempotency !== true) errors.push('play_count');
  const submission = manifest.submission;
  if (!isRecord(submission) || !isString(submission.rpc) || submission.automatic !== true || submission.idempotency !== true || !Number.isInteger(submission.timeout_ms) || (submission.timeout_ms as number) < 1000 || (submission.timeout_ms as number) > 30000) errors.push('submission');
  const entries = manifest.ranking_entries;
  if (!Array.isArray(entries) || entries.length === 0) errors.push('ranking_entries');
  else {
    const slugs = new Set<string>();
    for (const [index, item] of entries.entries()) {
      if (!isRecord(item)) { errors.push(`ranking_entries[${index}]`); continue; }
      for (const key of ['mode_id', 'game_slug', 'title', 'score_unit', 'score_label', 'first_score_label', 'best_score_label']) if (!isString(item[key])) errors.push(`ranking_entries[${index}].${key}`);
      if (typeof item.game_slug === 'string' && slugs.has(item.game_slug)) errors.push(`ranking_entries[${index}].game_slug.duplicate`);
      if (typeof item.game_slug === 'string') slugs.add(item.game_slug);
      if (!Number.isInteger(item.display_order) || (item.display_order as number) < 1) errors.push(`ranking_entries[${index}].display_order`);
      if (item.top_ranking_type !== 'first' && item.top_ranking_type !== 'best') errors.push(`ranking_entries[${index}].top_ranking_type`);
      if (item.score_order !== 'asc' && item.score_order !== 'desc') errors.push(`ranking_entries[${index}].score_order`);
      if (!Number.isInteger(item.score_scale) || (item.score_scale as number) < 1) errors.push(`ranking_entries[${index}].score_scale`);
      if (!Number.isInteger(item.score_decimals) || (item.score_decimals as number) < 0 || (item.score_decimals as number) > 3) errors.push(`ranking_entries[${index}].score_decimals`);
      if (!Number.isInteger(item.score_min) || !Number.isInteger(item.score_max) || (item.score_min as number) > (item.score_max as number)) errors.push(`ranking_entries[${index}].score_range`);
      if (!Array.isArray(item.ranked_results) || item.ranked_results.length === 0 || !item.ranked_results.every((result) => isString(result))) errors.push(`ranking_entries[${index}].ranked_results`);
    }
    if (typeof lab === 'object' && lab !== null && !Array.isArray(lab) && typeof (lab as Record<string, unknown>).representative_slug === 'string' && !slugs.has((lab as Record<string, unknown>).representative_slug as string)) errors.push('lab.representative_slug.not-listed');
  }
  return { valid: errors.length === 0, errors };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

