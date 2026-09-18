import { describe, expect, it } from 'vitest';
import { HttpRankingGateway, RankingClient, RankingError } from '../../src/services/RankingClient';
import type { RankingGateway, RankingStartRequest, RankingFinishRequest, RankingSubmitRequest } from '../../src/types/ranking';
import type { BattleResult } from '../../src/types/game';
import type { StorageLike } from '../../src/services/SaveService';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public setItem(key: string, value: string): void { this.values.set(key, value); }
  public removeItem(key: string): void { this.values.delete(key); }
}

function result(score: number): BattleResult {
  return { stageId: 'endless', outcome: 'defeat', score, survivalTime: 12, coreRemaining: 8, kills: 3, bossDefeated: false, bossesDefeated: 0, bossId: 'echo', partsEarned: 20, weaponDamage: {}, supportUsage: {}, enemyKills: {}, sectorDamage: [0, 0, 0, 0, 0, 0], controlSeconds: { slowed: 0, pushed: 0, pulled: 0 }, mainCause: '確認', upgrades: [], branches: [], runSeed: 4, newUnlock: null, retired: false };
}

class FakeGateway implements RankingGateway {
  starts: RankingStartRequest[] = [];
  finishes: RankingFinishRequest[] = [];
  submissions: RankingSubmitRequest[] = [];
  failStart = false;
  failSubmitOnce = false;
  public async startPlay(request: RankingStartRequest) {
    this.starts.push(request);
    if (this.failStart) throw new RankingError('network_error', true);
    return { accepted: true as const, playId: 'server-play-1', gameSlug: request.gameSlug, clientVersion: request.clientVersion };
  }
  public async finishPlay(request: RankingFinishRequest) { this.finishes.push(request); return { accepted: true as const, playId: request.playId }; }
  public async submitScore(request: RankingSubmitRequest) {
    this.submissions.push(request);
    if (this.failSubmitOnce) { this.failSubmitOnce = false; throw new RankingError('timeout', true); }
    return { accepted: true as const, submissionId: request.submissionId, playId: request.playId, gameSlug: request.gameSlug, clientVersion: request.clientVersion, score: request.score };
  }
}

describe('RankingClient', () => {
  it('reuses the same start_id when a start request is retried', async () => {
    const gateway = new FakeGateway(); gateway.failStart = true;
    const client = new RankingClient({ gateway, storage: new MemoryStorage() });
    expect((await client.start('競技者')).status).toBe('retryable_failed');
    gateway.failStart = false;
    await client.retryStart('競技者');
    expect(gateway.starts).toHaveLength(2);
    expect(gateway.starts[0]!.startId).toBe(gateway.starts[1]!.startId);
  });

  it('freezes one submission id and score breakdown across a failed transmit and retry', async () => {
    const gateway = new FakeGateway(); gateway.failSubmitOnce = true;
    const client = new RankingClient({ gateway, storage: new MemoryStorage() });
    await client.start('競技者');
    const first = await client.finish({ displayName: '競技者', playId: 'server-play-1', result: result(120) });
    expect(first.status).toBe('retryable_failed');
    expect(first.submission?.submissionId).toBeTruthy();
    const submissionId = first.submission!.submissionId;
    await client.retry(result(999));
    expect(client.snapshot().status).toBe('submitted');
    expect(gateway.submissions).toHaveLength(2);
    expect(gateway.submissions[0]!.submissionId).toBe(submissionId);
    expect(gateway.submissions[1]!.submissionId).toBe(submissionId);
    expect(gateway.submissions[1]!.score).toBe(120);
    expect(gateway.submissions[1]!.scoreBreakdown).toEqual(gateway.submissions[0]!.scoreBreakdown);
    expect(gateway.finishes).toHaveLength(1);
  });

  it('keeps the game-side result available when the endpoint is not configured', async () => {
    const client = new RankingClient({ storage: new MemoryStorage() });
    const state = await client.start('競技者');
    expect(state.status).toBe('permanent_failed');
    expect(state.diagnosticCode).toBe('ranking_endpoint_unconfigured');
  });

  it('does not discard a retryable submission when another run is started', async () => {
    const gateway = new FakeGateway(); gateway.failSubmitOnce = true;
    const client = new RankingClient({ gateway, storage: new MemoryStorage() });
    await client.start('競技者');
    const failed = await client.finish({ displayName: '競技者', playId: 'server-play-1', result: result(120) });
    const submissionId = failed.submission!.submissionId;
    const next = await client.begin('競技者');
    expect(next.status).toBe('retryable_failed');
    expect(next.diagnosticCode).toBe('pending_submission_exists');
    expect(next.submission?.submissionId).toBe(submissionId);
    expect(next.session).toBeNull();
    await client.retry(result(999));
    expect(client.snapshot().status).toBe('submitted');
    expect(client.snapshot().submission).toBeNull();
  });

  it('maps the approved RPC payload names and rejects a non-single-row response', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const gateway = new HttpRankingGateway({
      endpoint: 'https://ranking.example.test/',
      publishableKey: 'public-key',
      fetchImpl: async (input, init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        calls.push({ url: String(input), body });
        const rpc = String(input).split('/').pop();
        const payload = rpc === 'start_game_play_v1'
          ? { accepted: true, play_id: 'server-play-1', game_slug: 'kakomare', client_version: 'kakomare-web-v9' }
          : rpc === 'finish_game_play_v1'
            ? { accepted: true, play_id: 'server-play-1' }
            : { accepted: true, result_submission_id: 'submission-1', result_play_id: 'server-play-1', result_display_name: '競技者', result_first_score: 120, result_best_score: 120, result_play_count: 1, is_first_play: true, is_new_best: true, was_duplicate: false };
        return { ok: true, status: 200, json: async () => payload } as Response;
      },
    });
    const startRequest: RankingStartRequest = { startId: 'start-1', displayName: '競技者', gameSlug: 'kakomare', clientVersion: 'kakomare-web-v9', ruleVersion: 'expansion-v8-endless' };
    await gateway.startPlay(startRequest);
    await gateway.finishPlay({ playId: 'server-play-1', displayName: '競技者', gameSlug: 'kakomare', clientVersion: 'kakomare-web-v9', ruleVersion: 'expansion-v8-endless', resultType: 'game_over', reachedWave: 1, score: 120, scoreBreakdown: { kills: 3 } });
    await gateway.submitScore({ submissionId: 'submission-1', playId: 'server-play-1', displayName: '競技者', gameSlug: 'kakomare', clientVersion: 'kakomare-web-v9', ruleVersion: 'expansion-v8-endless', resultType: 'game_over', score: 120, scoreBreakdown: { kills: 3 } });
    expect(calls.map((call) => call.body)).toEqual([
      { p_start_id: 'start-1', p_display_name: '競技者', p_game_slug: 'kakomare', p_client_version: 'kakomare-web-v9' },
      { p_play_id: 'server-play-1', p_display_name: '競技者', p_game_slug: 'kakomare', p_result_type: 'game_over', p_reached_wave: 1, p_score: 120, p_client_version: 'kakomare-web-v9', p_ranking_score: 120 },
      { p_play_id: 'server-play-1', p_submission_id: 'submission-1', p_display_name: '競技者', p_game_slug: 'kakomare', p_score: 120, p_client_version: 'kakomare-web-v9' },
    ]);

    const invalid = new HttpRankingGateway({
      endpoint: 'https://ranking.example.test',
      publishableKey: 'public-key',
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => [] }) as Response,
    });
    await expect(invalid.startPlay(startRequest)).rejects.toMatchObject({ code: 'invalid_rpc_payload' });
  });
});
