import { RANKING_CONFIG, RANKING_MANIFEST } from '../data/rankingConfig';
import type {
  RankingFinishInput,
  RankingFinishRequest,
  RankingFinishResponse,
  RankingGateway,
  RankingSession,
  RankingSnapshot,
  RankingStartRequest,
  RankingStartResponse,
  RankingSubmitRequest,
  RankingSubmitResponse,
  RankingSubmission,
  RankingStatus,
} from '../types/ranking';
import type { StorageLike } from './SaveService';

export const RANKING_SESSION_KEY = 'kakomare-ranking-session-v1';
export const RANKING_PENDING_KEY = 'kakomare-ranking-pending-v1';
export const RANKING_START_PENDING_KEY = 'kakomare-ranking-start-pending-v1';

export interface RankingClientOptions {
  gateway?: RankingGateway;
  storage?: StorageLike | null;
  onChange?: (snapshot: RankingSnapshot) => void;
}

export class RankingError extends Error {
  public constructor(public readonly code: string, public readonly retryable: boolean, public readonly httpStatus?: number) {
    super(code);
    this.name = 'RankingError';
  }
}

interface RankingClientStorage {
  session: RankingSession | null;
  submission: RankingSubmission | null;
  startPending: RankingStartRequest | null;
}

function getStorage(): StorageLike | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* fall through */ }
  // This value is an idempotency key, never a server-issued play_id.
  return `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedText(value: unknown, max = 160): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function storedSession(value: unknown): RankingSession | null {
  if (!isRecord(value) || !isBoundedText(value.startId) || !isBoundedText(value.playId) || !isBoundedText(value.displayName, 20) || !isBoundedText(value.gameSlug, 80) || !isBoundedText(value.clientVersion, 80) || !isBoundedText(value.ruleVersion, 120) || !isTimestamp(value.startedAt)) return null;
  return { startId: value.startId, playId: value.playId, displayName: value.displayName, gameSlug: value.gameSlug, clientVersion: value.clientVersion, ruleVersion: value.ruleVersion, startedAt: value.startedAt };
}

function storedSubmission(value: unknown): RankingSubmission | null {
  if (!isRecord(value) || !isBoundedText(value.submissionId) || !isBoundedText(value.playId) || !isBoundedText(value.displayName, 20) || !isBoundedText(value.gameSlug, 80) || !isBoundedText(value.clientVersion, 80) || !isBoundedText(value.ruleVersion, 120) || typeof value.score !== 'number' || !Number.isSafeInteger(value.score) || value.score < 0 || !isBoundedText(value.resultType, 40) || !isTimestamp(value.createdAt) || typeof value.attemptCount !== 'number' || !Number.isSafeInteger(value.attemptCount) || value.attemptCount < 0 || value.attemptCount > 1000 || typeof value.finishAcknowledged !== 'boolean' || !isScoreBreakdown(value.scoreBreakdown)) return null;
  return { submissionId: value.submissionId, playId: value.playId, displayName: value.displayName, gameSlug: value.gameSlug, clientVersion: value.clientVersion, ruleVersion: value.ruleVersion, score: value.score, resultType: value.resultType, createdAt: value.createdAt, attemptCount: value.attemptCount, finishAcknowledged: value.finishAcknowledged, scoreBreakdown: { ...value.scoreBreakdown } };
}

function isScoreBreakdown(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'number' && Number.isSafeInteger(item) && item >= 0);
}

function storedStart(value: unknown): RankingStartRequest | null {
  if (!isRecord(value) || !isBoundedText(value.startId) || !isBoundedText(value.displayName, 20) || !isBoundedText(value.gameSlug, 80) || !isBoundedText(value.clientVersion, 80) || !isBoundedText(value.ruleVersion, 120)) return null;
  return { startId: value.startId, displayName: value.displayName, gameSlug: value.gameSlug, clientVersion: value.clientVersion, ruleVersion: value.ruleVersion };
}

export class UnavailableRankingGateway implements RankingGateway {
  public async startPlay(_request: RankingStartRequest): Promise<RankingStartResponse> {
    throw new RankingError('ranking_endpoint_unconfigured', false);
  }
  public async finishPlay(_request: RankingFinishRequest): Promise<RankingFinishResponse> {
    throw new RankingError('ranking_endpoint_unconfigured', false);
  }
  public async submitScore(_request: RankingSubmitRequest): Promise<RankingSubmitResponse> {
    throw new RankingError('ranking_endpoint_unconfigured', false);
  }
}

interface HttpRankingGatewayOptions {
  endpoint: string;
  publishableKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof globalThis.fetch;
}

/** REST adapter for the approved RPC contract. It is opt-in and never reads a service key. */
export class HttpRankingGateway implements RankingGateway {
  private readonly endpoint: string;
  private readonly publishableKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;

  public constructor(options: HttpRankingGatewayOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, '');
    this.publishableKey = options.publishableKey;
    this.timeoutMs = options.timeoutMs ?? RANKING_CONFIG.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  public startPlay(request: RankingStartRequest): Promise<RankingStartResponse> {
    return this.rpc(RANKING_CONFIG.startRpc, {
      start_id: request.startId,
      display_name: request.displayName,
      game_slug: request.gameSlug,
      client_version: request.clientVersion,
      rule_version: request.ruleVersion,
    }).then((value) => {
      if (!isRecord(value) || value.accepted !== true || typeof value.play_id !== 'string' || typeof value.game_slug !== 'string' || typeof value.client_version !== 'string') throw new RankingError('invalid_start_response', false);
      return { accepted: true, playId: value.play_id, gameSlug: value.game_slug, clientVersion: value.client_version };
    });
  }

  public finishPlay(request: RankingFinishRequest): Promise<RankingFinishResponse> {
    return this.rpc(RANKING_CONFIG.finishRpc, {
      play_id: request.playId,
      game_slug: request.gameSlug,
      client_version: request.clientVersion,
      rule_version: request.ruleVersion,
      result_type: request.resultType,
      score: request.score,
      score_breakdown: request.scoreBreakdown,
    }).then((value) => {
      if (!isRecord(value) || value.accepted !== true || typeof value.play_id !== 'string') throw new RankingError('invalid_finish_response', false);
      return { accepted: true, playId: value.play_id };
    });
  }

  public submitScore(request: RankingSubmitRequest): Promise<RankingSubmitResponse> {
    return this.rpc(RANKING_CONFIG.scoreRpc, {
      submission_id: request.submissionId,
      play_id: request.playId,
      display_name: request.displayName,
      game_slug: request.gameSlug,
      client_version: request.clientVersion,
      rule_version: request.ruleVersion,
      result_type: request.resultType,
      score: request.score,
      score_breakdown: request.scoreBreakdown,
    }).then((value) => {
      if (!isRecord(value) || value.accepted !== true || typeof value.submission_id !== 'string' || typeof value.play_id !== 'string' || typeof value.game_slug !== 'string' || typeof value.client_version !== 'string' || typeof value.score !== 'number' || !Number.isSafeInteger(value.score)) throw new RankingError('invalid_submit_response', false);
      return { accepted: true, submissionId: value.submission_id, playId: value.play_id, gameSlug: value.game_slug, clientVersion: value.client_version, score: value.score };
    });
  }

  private async rpc(name: string, body: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl.call(globalThis, `${this.endpoint}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { apikey: this.publishableKey, Authorization: `Bearer ${this.publishableKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const parsed: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new RankingError(`http_${response.status}`, response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500, response.status);
      // RPC responses may be a single row or a one-row array. The contract
      // requires exactly one accepted row for all three operations.
      if (Array.isArray(parsed) && parsed.length !== 1) throw new RankingError('invalid_rpc_payload', false, response.status);
      const value = Array.isArray(parsed) ? parsed[0] : parsed;
      if (!isRecord(value)) throw new RankingError('invalid_rpc_payload', false, response.status);
      return value;
    } catch (error) {
      if (error instanceof RankingError) throw error;
      throw new RankingError(error instanceof DOMException && error.name === 'AbortError' ? 'timeout' : 'network_error', true);
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }
}

export function createBrowserRankingGateway(): RankingGateway {
  const config = (globalThis as typeof globalThis & { __KAKOMARE_RANKING__?: { endpoint?: string; publishableKey?: string } }).__KAKOMARE_RANKING__;
  if (!config?.endpoint || !config.publishableKey) return new UnavailableRankingGateway();
  return new HttpRankingGateway({ endpoint: config.endpoint, publishableKey: config.publishableKey });
}

export class RankingClient {
  private readonly storage: StorageLike | null;
  private readonly gateway: RankingGateway;
  private readonly onChange?: (snapshot: RankingSnapshot) => void;
  private session: RankingSession | null;
  private submission: RankingSubmission | null;
  private startPending: RankingStartRequest | null;
  private status: RankingStatus = 'idle';
  private diagnosticCode: string | undefined;
  private inFlight = false;

  public constructor(options: RankingClientOptions = {}) {
    this.storage = options.storage === undefined ? getStorage() : options.storage;
    this.gateway = options.gateway ?? createBrowserRankingGateway();
    this.onChange = options.onChange;
    const loaded = this.readStorage();
    this.session = loaded.session;
    this.submission = loaded.submission;
    this.startPending = loaded.startPending;
    if (this.submission) this.status = 'retryable_failed';
  }

  public snapshot(): RankingSnapshot {
    return {
      status: this.status,
      session: this.session ? { ...this.session } : null,
      submission: this.submission ? { ...this.submission } : null,
      ...(this.diagnosticCode ? { diagnosticCode: this.diagnosticCode } : {}),
    };
  }

  public async start(displayName: string): Promise<RankingSnapshot> {
    const normalized = displayName.trim();
    if ([...normalized].length < 1 || [...normalized].length > 20) return this.fail('invalid_display_name', false);
    if (this.submission) {
      // A pending submission belongs to the previous finished run. Keep it
      // durable for retry, but never carry its server-issued session into a
      // new local run or checkpoint.
      this.session = null;
      this.removeSession();
      return this.fail('pending_submission_exists', true);
    }
    if (this.session && this.session.displayName === normalized && this.session.gameSlug === RANKING_CONFIG.representativeSlug
      && this.session.clientVersion === RANKING_CONFIG.clientVersion && this.session.ruleVersion === RANKING_CONFIG.ruleVersion) return this.snapshot();
    const startId = this.startPending && this.startPending.displayName === normalized
      && this.startPending.gameSlug === RANKING_CONFIG.representativeSlug
      && this.startPending.clientVersion === RANKING_CONFIG.clientVersion
      && this.startPending.ruleVersion === RANKING_CONFIG.ruleVersion
      ? this.startPending.startId
      : uuid();
    const request: RankingStartRequest = { startId, displayName: normalized, gameSlug: RANKING_CONFIG.representativeSlug, clientVersion: RANKING_CONFIG.clientVersion, ruleVersion: RANKING_CONFIG.ruleVersion };
    this.startPending = request;
    this.persistStartPending();
    try {
      const response = await this.gateway.startPlay(request);
      this.assertStart(response);
      this.session = { startId, playId: response.playId, displayName: normalized, gameSlug: request.gameSlug, clientVersion: request.clientVersion, ruleVersion: request.ruleVersion, startedAt: new Date().toISOString() };
      this.submission = null;
      this.startPending = null;
      this.status = 'idle';
      this.diagnosticCode = undefined;
      this.persistSession();
      this.removeStartPending();
      this.emit();
    } catch (error) { return this.failFromError(error); }
    return this.snapshot();
  }

  /** Begin a new ranking-eligible run. A repeated `start` remains idempotent. */
  public async begin(displayName: string): Promise<RankingSnapshot> {
    // A retryable result is durable state. Never discard it merely because the
    // player starts another local run; the original submission_id and score
    // must remain available for a safe retry.
    if (this.submission) {
      this.session = null;
      this.removeSession();
      return this.fail('pending_submission_exists', true);
    }
    this.session = null;
    this.status = 'idle';
    this.diagnosticCode = undefined;
    this.removeSession();
    this.emit();
    return this.start(displayName);
  }

  public async retryStart(displayName = this.startPending?.displayName ?? ''): Promise<RankingSnapshot> {
    return this.start(displayName);
  }

  /** Reattach a server-issued session stored alongside an unfinished run. */
  public restoreSession(session: RankingSession, displayName: string): RankingSnapshot {
    const normalized = displayName.trim();
    if (this.submission) return this.fail('pending_submission_exists', true);
    if (!storedSession(session) || session.displayName !== normalized || session.gameSlug !== RANKING_CONFIG.representativeSlug
      || session.clientVersion !== RANKING_CONFIG.clientVersion || session.ruleVersion !== RANKING_CONFIG.ruleVersion) return this.fail('invalid_saved_session', false);
    this.session = { ...session };
    this.startPending = null;
    this.status = 'idle';
    this.diagnosticCode = undefined;
    this.persistSession();
    this.removeStartPending();
    this.emit();
    return this.snapshot();
  }

  public async finish(input: RankingFinishInput): Promise<RankingSnapshot> {
    if (this.status === 'submitted') return this.snapshot();
    const session = this.session;
    if (!session || !input.playId || input.playId !== session.playId) return this.fail('missing_server_play_id', false);
    const result = input.result;
    if (result.stageId !== 'endless' || (result.outcome !== 'victory' && result.outcome !== 'defeat') || typeof result.retired !== 'boolean'
      || !Number.isFinite(result.score) || !Number.isSafeInteger(result.kills) || result.kills < 0 || !Number.isSafeInteger(result.bossesDefeated) || result.bossesDefeated < 0
      || !Number.isFinite(result.survivalTime) || result.survivalTime < 0 || !Number.isFinite(result.coreRemaining) || result.coreRemaining < 0) return this.fail('invalid_result_payload', false);
    if (result.retired) return this.fail('retire_not_eligible', false);
    const resultType = result.outcome === 'victory' ? 'clear' : 'game_over';
    const entry = RANKING_MANIFEST.ranking_entries.find((candidate) => candidate.game_slug === session.gameSlug);
    if (!entry || !entry.ranked_results.includes(resultType)) return this.fail('result_not_ranked', false);
    const score = Math.round(result.score);
    if (!Number.isSafeInteger(score) || score < entry.score_min || score > entry.score_max) return this.fail('score_out_of_range', false);
    const normalizedName = input.displayName.trim();
    if (normalizedName !== session.displayName) return this.fail('display_name_conflict', false);
    const breakdown = scoreBreakdown(result);
    if (!isScoreBreakdown(breakdown)) return this.fail('invalid_score_breakdown', false);
    if (!this.submission) {
      this.submission = {
        submissionId: uuid(),
        playId: session.playId,
        displayName: normalizedName,
        gameSlug: session.gameSlug,
        clientVersion: session.clientVersion,
        ruleVersion: session.ruleVersion,
        score,
        resultType,
        createdAt: new Date().toISOString(),
        attemptCount: 0,
        finishAcknowledged: false,
        scoreBreakdown: breakdown,
      };
      this.persistSubmission();
    } else if (this.submission.score !== score || this.submission.resultType !== resultType || this.submission.playId !== session.playId
      || this.submission.displayName !== normalizedName || !sameBreakdown(this.submission.scoreBreakdown, breakdown)) return this.fail('submission_payload_conflict', false);
    await this.transmit(result);
    return this.snapshot();
  }

  public async retry(result: BattleResultLike): Promise<RankingSnapshot> {
    if (this.status !== 'retryable_failed' || !this.submission) return this.snapshot();
    await this.transmit(result);
    return this.snapshot();
  }

  private async transmit(_result: BattleResultLike): Promise<void> {
    if (!this.submission || this.inFlight) return;
    this.inFlight = true;
    this.status = 'submitting';
    this.diagnosticCode = undefined;
    this.submission = { ...this.submission, attemptCount: this.submission.attemptCount + 1 };
    this.persistSubmission();
    const submission = this.submission;
    const breakdown = { ...this.submission.scoreBreakdown };
    try {
      if (!submission.finishAcknowledged) {
        const finishResponse = await this.gateway.finishPlay({ playId: submission.playId, gameSlug: submission.gameSlug, clientVersion: submission.clientVersion, ruleVersion: submission.ruleVersion, resultType: submission.resultType, score: submission.score, scoreBreakdown: breakdown });
        this.assertFinish(finishResponse, submission.playId);
        submission.finishAcknowledged = true;
        this.submission = { ...submission };
        this.persistSubmission();
      }
      const response = await this.gateway.submitScore({ submissionId: submission.submissionId, playId: submission.playId, displayName: submission.displayName, gameSlug: submission.gameSlug, clientVersion: submission.clientVersion, ruleVersion: submission.ruleVersion, resultType: submission.resultType, score: submission.score, scoreBreakdown: breakdown });
      this.assertSubmit(response, submission);
      this.status = 'submitted';
      this.diagnosticCode = undefined;
      this.removePendingSubmission();
      this.submission = null;
      this.emit();
    } catch (error) {
      this.failFromError(error);
    } finally {
      this.inFlight = false;
    }
  }

  private assertStart(response: RankingStartResponse): void {
    if (response.accepted !== true || !response.playId || response.gameSlug !== RANKING_CONFIG.representativeSlug || response.clientVersion !== RANKING_CONFIG.clientVersion) throw new RankingError('invalid_start_contract', false);
  }
  private assertFinish(response: RankingFinishResponse, playId: string): void { if (response.accepted !== true || response.playId !== playId) throw new RankingError('invalid_finish_contract', false); }
  private assertSubmit(response: RankingSubmitResponse, submission: RankingSubmission): void { if (response.accepted !== true || response.submissionId !== submission.submissionId || response.playId !== submission.playId || response.gameSlug !== submission.gameSlug || response.clientVersion !== submission.clientVersion || response.score !== submission.score) throw new RankingError('invalid_submit_contract', false); }

  private fail(code: string, retryable: boolean): RankingSnapshot { this.status = retryable ? 'retryable_failed' : 'permanent_failed'; this.diagnosticCode = code; this.emit(); return this.snapshot(); }
  private failFromError(error: unknown): RankingSnapshot { if (error instanceof RankingError) return this.fail(error.code, error.retryable); return this.fail('ranking_error', true); }
  private emit(): void { this.onChange?.(this.snapshot()); }

  private readStorage(): RankingClientStorage {
    if (!this.storage) return { session: null, submission: null, startPending: null };
    try {
      const sessionRaw = this.storage.getItem(RANKING_SESSION_KEY);
      const pendingRaw = this.storage.getItem(RANKING_PENDING_KEY);
      const startRaw = this.storage.getItem(RANKING_START_PENDING_KEY);
      return { session: sessionRaw ? storedSession(JSON.parse(sessionRaw)) : null, submission: pendingRaw ? storedSubmission(JSON.parse(pendingRaw)) : null, startPending: startRaw ? storedStart(JSON.parse(startRaw)) : null };
    } catch { return { session: null, submission: null, startPending: null }; }
  }
  private persistSession(): void { try { this.storage?.setItem(RANKING_SESSION_KEY, JSON.stringify(this.session)); } catch { /* gameplay remains local */ } }
  private persistSubmission(): void { try { if (this.submission) this.storage?.setItem(RANKING_PENDING_KEY, JSON.stringify(this.submission)); } catch { /* retry state remains in memory */ } }
  private removePendingSubmission(): void { try { this.storage?.removeItem(RANKING_PENDING_KEY); } catch { /* best effort */ } }
  private persistStartPending(): void { try { if (this.startPending) this.storage?.setItem(RANKING_START_PENDING_KEY, JSON.stringify(this.startPending)); } catch { /* gameplay remains local */ } }
  private removeStartPending(): void { try { this.storage?.removeItem(RANKING_START_PENDING_KEY); } catch { /* best effort */ } }
  private removeSession(): void { try { this.storage?.removeItem(RANKING_SESSION_KEY); } catch { /* best effort */ } }
}

type BattleResultLike = RankingFinishInput['result'];

function scoreBreakdown(result: BattleResultLike): Record<string, number> {
  return {
    kills: Math.max(0, Math.round(result.kills)),
    bossesDefeated: Math.max(0, Math.round(result.bossesDefeated)),
    survivalTimeSeconds: Math.max(0, Math.round(result.survivalTime)),
    coreRemaining: Math.max(0, Math.round(result.coreRemaining)),
  };
}

function sameBreakdown(first: Record<string, number>, second: Record<string, number>): boolean {
  const firstKeys = Object.keys(first).sort();
  const secondKeys = Object.keys(second).sort();
  return firstKeys.length === secondKeys.length && firstKeys.every((key, index) => key === secondKeys[index] && first[key] === second[key]);
}
