import { readFile } from 'node:fs/promises';

const path = new URL('../ranking-manifest.json', import.meta.url);
const raw = await readFile(path, 'utf8');
const manifest = JSON.parse(raw);
const errors = [];
const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value, max = Infinity) => typeof value === 'string' && value.length > 0 && value.length <= max;

if (!isObject(manifest)) errors.push('manifest must be an object');
if (manifest.schema_version !== 'chameleonjp-ranking-manifest-v1') errors.push('schema_version');
if (manifest.game_id !== 'kakomare' || !/^[a-z0-9][a-z0-9_]*$/.test(manifest.game_id)) errors.push('game_id');
if (!isString(manifest.canonical_url) || !/^https:\/\/[^?# ]+\/$/.test(manifest.canonical_url)) errors.push('canonical_url');
if (!isString(manifest.client_version, 80)) errors.push('client_version');
if (!isObject(manifest.lab) || !isString(manifest.lab.representative_slug, 80)) errors.push('lab.representative_slug');
if (!isObject(manifest.player_name) || manifest.player_name.required_before_start !== true || manifest.player_name.min_length !== 1 || manifest.player_name.max_length !== 20 || !isString(manifest.player_name.storage_key, 120)) errors.push('player_name');
if (!isObject(manifest.play_count) || manifest.play_count.count_at !== 'start' || manifest.play_count.idempotency !== true || manifest.play_count.rpc !== 'start_game_play_v1') errors.push('play_count');
if (!isObject(manifest.submission) || manifest.submission.automatic !== true || manifest.submission.idempotency !== true || manifest.submission.rpc !== 'submit_score_idempotent_v1' || !Number.isInteger(manifest.submission.timeout_ms) || manifest.submission.timeout_ms < 1000 || manifest.submission.timeout_ms > 30000) errors.push('submission');
if (!Array.isArray(manifest.ranking_entries) || manifest.ranking_entries.length === 0) errors.push('ranking_entries');
else {
  const slugs = new Set();
  for (const [index, entry] of manifest.ranking_entries.entries()) {
    if (!isObject(entry) || !isString(entry.mode_id, 80) || !isString(entry.game_slug, 80) || slugs.has(entry.game_slug) || !Number.isInteger(entry.display_order) || entry.display_order < 1 || entry.top_ranking_type !== 'best' || entry.score_order !== 'desc' || !Number.isInteger(entry.score_min) || !Number.isInteger(entry.score_max) || entry.score_min < 0 || entry.score_max < entry.score_min || !Array.isArray(entry.ranked_results) || entry.ranked_results.length === 0) errors.push(`ranking_entries[${index}]`);
    if (isString(entry?.game_slug, 80)) slugs.add(entry.game_slug);
  }
  if (!slugs.has(manifest.lab?.representative_slug)) errors.push('representative_slug_not_listed');
}

if (errors.length > 0) {
  console.error(`ranking-manifest.json 検査失敗: ${errors.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('ranking-manifest.json を確認しました。');
}
