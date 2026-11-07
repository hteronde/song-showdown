import { Injectable } from '@angular/core';
import { apiRequest } from '../../shared/data-access/api-client';
import { AdminBallotEdits, AdminBallotEditorData, AdminBallotSaveResult } from './admin-ballots.model';

@Injectable({ providedIn: 'root' })
export class AdminBallotsApiService {
  get(bracketId: number, matchupId: number, signal?: AbortSignal): Promise<AdminBallotEditorData> {
    return apiRequest(this.url(bracketId, matchupId), {signal});
  }

  save(bracketId: number, matchupId: number, edits: AdminBallotEdits, signal?: AbortSignal): Promise<AdminBallotSaveResult> {
    return apiRequest(this.url(bracketId, matchupId), {method: 'PUT', json: edits, signal});
  }

  private url(bracketId: number, matchupId: number): string {
    return `/api/admin/brackets/${bracketId}/matchups/${matchupId}/ballots`;
  }
}
