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
  async getParticipating(): Promise<UserBracketLink[]> {
    const response = await fetch('/api/my/brackets', { credentials: 'include' });
    const payload = await response.json() as { brackets?: UserBracketLink[]; error?: string };
    if (!response.ok) throw new Error(payload.error || 'Could not load your brackets.');
    return payload.brackets ?? [];
  }
}
