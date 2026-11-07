import { apiRequest } from '../../shared/data-access/api-client';
import { Injectable } from '@angular/core';
import { BracketHistoryListResponse, BracketHistoryResponse, FinaleOptions } from './history.models';

@Injectable({ providedIn: 'root' })
export class HistoryApiService {
  private readonly baseUrl = '/api';

  getBrackets(signal?: AbortSignal): Promise<BracketHistoryListResponse> {
    return apiRequest(`${this.baseUrl}/brackets`, {signal});
  }
  getBracket(bracketId: number, signal?: AbortSignal): Promise<BracketHistoryResponse> {
    return apiRequest(`${this.baseUrl}/brackets/${bracketId}`, {signal});
  }
  getFinaleOptions(bracketId: number, signal?: AbortSignal): Promise<FinaleOptions> {
    return apiRequest(`${this.baseUrl}/brackets/${bracketId}/finale-options`, {signal});
  }

  async startFinale(bracketId: number, adminUserId: number, startRoundNumber: number, participantIds: number[]): Promise<void> {
    await this.post(`/brackets/${bracketId}/finale`, { adminUserId, startRoundNumber, participantIds });
  }

  async setFinaleMode(bracketId: number, adminUserId: number, action: 'exit' | 'resume'): Promise<void> {
    await this.post(`/brackets/${bracketId}/finale/${action}`, { adminUserId });
  }

  async updateFinaleParticipants(bracketId: number, adminUserId: number, participantIds: number[], nonFinaleParticipantIds: number[]): Promise<void> {
    await this.post(`/brackets/${bracketId}/finale/participants`, { adminUserId, participantIds, nonFinaleParticipantIds });
  }

  async saveFinaleVotes(bracketId: number, adminUserId: number, matchupId: number, ballots: Array<{ userId: number; selectedEntryId: number | null }>, tieBreakEntryId?: number | 'random'): Promise<{ tied: boolean; winnerEntryId: number | null; voteCount: number; participantCount: number; allVotesRecorded: boolean }> {
    return this.post(`/brackets/${bracketId}/finale/votes`, { adminUserId, matchupId, ballots, tieBreakEntryId });
  }

  private post<T = unknown>(path: string, body: unknown): Promise<T> {
    return apiRequest(`${this.baseUrl}${path}`, {method: 'POST', json: body});
  }
}
