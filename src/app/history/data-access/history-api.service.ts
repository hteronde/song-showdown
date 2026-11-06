import { Injectable } from '@angular/core';
import { BracketHistoryListResponse, BracketHistoryResponse, FinaleOptions } from './history.models';

@Injectable({ providedIn: 'root' })
export class HistoryApiService {
  private readonly baseUrl = '/api';

  async getBrackets(): Promise<BracketHistoryListResponse> {
    const response = await fetch(`${this.baseUrl}/brackets?familyId=1`, {
      signal: AbortSignal.timeout(10_000), credentials: 'include'
    });
    const payload = await response.json() as BracketHistoryListResponse | { error?: string };
    if (!response.ok || !('brackets' in payload)) {
      throw new Error('error' in payload && payload.error ? payload.error : 'Could not load bracket history.');
    }
    return payload;
  }

  async getBracket(bracketId: number): Promise<BracketHistoryResponse> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/brackets/${bracketId}`, {
        signal: AbortSignal.timeout(10_000), credentials: 'include'
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TimeoutError') {
        throw new Error('The bracket request timed out. Check that MySQL is running and the API .env settings match your database.');
      }
      throw error;
    }
    const payload = await response.json() as BracketHistoryResponse | { error?: string };
    if (!response.ok || !('bracket' in payload)) {
      throw new Error('error' in payload && payload.error ? payload.error : 'Could not load bracket history.');
    }
    return payload;
  }

  async getFinaleOptions(bracketId: number): Promise<FinaleOptions> {
    const response = await fetch(`${this.baseUrl}/brackets/${bracketId}/finale-options`, { credentials: 'include' });
    const payload = await response.json() as FinaleOptions | { error?: string };
    if (!response.ok || !('rounds' in payload)) throw new Error('error' in payload && payload.error ? payload.error : 'Could not load finale setup.');
    return payload;
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

  private async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json() as T & { error?: string };
    if (!response.ok) throw new Error(payload.error || 'Could not save finale changes.');
    return payload;
  }
}
