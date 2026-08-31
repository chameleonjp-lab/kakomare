const SUPABASE_URL = 'https://mlpnjgezrnhdxsxolyzj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM';

async function callRpc(name: string, payload: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  const data: unknown = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  return data;
}

export interface OnlineRankingRow { rank_no?: number; display_name?: string; player_name?: string; score?: number; best_score?: number; }

export function submitScore(displayName: string, score: number): Promise<unknown> {
  return callRpc('submit_score', { p_display_name: displayName, p_game_slug: 'kakomare', p_score: Math.trunc(score), p_client_version: 'kakomare-2026-08-31-platform' });
}

export async function getTopScores(): Promise<OnlineRankingRow[]> {
  const data = await callRpc('get_best_score_ranking', { p_game_slug: 'kakomare', p_limit: 10 });
  return Array.isArray(data) ? data.slice(0, 10) as OnlineRankingRow[] : [];
}
