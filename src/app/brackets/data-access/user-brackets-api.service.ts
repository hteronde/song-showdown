import { apiRequest } from '../../shared/data-access/api-client';
import { Injectable } from '@angular/core';

export interface UserBracketLink {
  bracketId: number;
  title: string;
  artist: string;
  startAt: string | null;
  navigationStatus: 'active' | 'upcoming';
}

@Injectable({ providedIn: 'root' })
export class UserBracketsApiService {
  async getParticipating(signal?: AbortSignal): Promise<UserBracketLink[]> {
    const payload = await apiRequest<{brackets?: UserBracketLink[]}>('/api/my/brackets', {signal});
    return payload.brackets ?? [];
  }
}
