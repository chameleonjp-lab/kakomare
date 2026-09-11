import type { BattleResult } from './game';

export type RankingStatus = 'idle' | 'submitting' | 'submitted' | 'retryable_failed' | 'permanent_failed';

export interface RankingSession {
  startId: string;
  playId: string;
  displayName: string;
  gameSlug: string;
  clientVersion: string;
  ruleVersion: string;
  startedAt: string;
}

export interface RankingSubmission {
  submissionId: string;
  playId: string;
  displayName: string;
  gameSlug: string;
  clientVersion: string;
  ruleVersion: string;
  score: number;
  resultType: string;
  createdAt: string;
  attemptCount: number;
  finishAcknowledged: boolean;
  /** Frozen at first submission so retries cannot change the score payload. */
  scoreBreakdown: Record<string, number>;
}

export interface RankingSnapshot {
  status: RankingStatus;
  session: RankingSession | null;
  submission: RankingSubmission | null;
  diagnosticCode?: string;
}

export interface RankingStartRequest {
  startId: string;
  displayName: string;
  gameSlug: string;
  clientVersion: string;
  ruleVersion: string;
}

export interface RankingStartResponse {
  accepted: true;
  playId: string;
  gameSlug: string;
  clientVersion: string;
}

export interface RankingFinishRequest {
  playId: string;
  gameSlug: string;
  clientVersion: string;
  ruleVersion: string;
  resultType: string;
  score: number;
  scoreBreakdown: Record<string, number>;
}

export interface RankingFinishResponse {
  accepted: true;
  playId: string;
}

export interface RankingSubmitRequest {
  submissionId: string;
  playId: string;
  displayName: string;
  gameSlug: string;
  clientVersion: string;
  ruleVersion: string;
  resultType: string;
  score: number;
  scoreBreakdown: Record<string, number>;
}

export interface RankingSubmitResponse {
  accepted: true;
  submissionId: string;
  playId: string;
  gameSlug: string;
  clientVersion: string;
  score: number;
}

export interface RankingGateway {
  startPlay(request: RankingStartRequest): Promise<RankingStartResponse>;
  finishPlay(request: RankingFinishRequest): Promise<RankingFinishResponse>;
  submitScore(request: RankingSubmitRequest): Promise<RankingSubmitResponse>;
}

export interface RankingFinishInput {
  displayName: string;
  playId: string | null;
  result: BattleResult;
}
