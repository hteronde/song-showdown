import { Injectable } from '@angular/core';

export interface VotingSong {
  albumCoverUrl: string | null;
  entryId: number | null;
  title: string;
  album: string | null;
  year: number | null;
  seed: number | null;
  youtubeUrl: string | null;
  spotifyUrl: string | null;
}

export interface VotingMatchup {
  matchupId: number;
  matchupNumber: number;
  nextMatchupId: number | null;
  drawPending: boolean;
  roundNumber: number;
  bracketSongATitle: string;
  bracketSongBTitle: string;
  songA: VotingSong;
  songB: VotingSong;
  winnerEntryId: number | null;
  voteCountA?: number;
  voteCountB?: number;
  reportedVoteCountA?: number | null;
  reportedVoteCountB?: number | null;
  randomTiebreakerVoteEntryId: number | null;
  winnerTitle: string | null;
  selectedEntryId: number | null;
  comment: string | null;
  ballots: Array<{ displayName: string; selectedEntryId: number }>;
}

export interface VotingWeek {
  weekNumber: number;
  roundNumber: number;
  roundName: string;
  opensAt: string | null;
  closesAt: string | null;
  isCurrent: boolean;
  isReady: boolean;
  isClosed: boolean;
  isUpcoming: boolean;
  matchups: VotingMatchup[];
}

export interface ActiveBracketVotingData {
  canParticipateOnline?: boolean;
  isUpcoming?: boolean;
  playlists?:Array<{weekNumber:number;playlistName:string;playlistUrl:string}>;
  awaitingFinale: boolean;
  canViewBallots: boolean;
  ballotEditingRound: number | null;
  bracket: { startAt?: string | null; bracketId: number; title: string; artist: string; logoUrl?: string | null; bracketYear: number | null; status: string; sessionDurationMinutes: number | null; finaleAt: string | null; finaleStartRound: number | null; pausedAt: string | null; randomizationMode: 'none' | 'round1' | 'each_round'; songCount: number };
  finaleModeActive: boolean;
  currentWeekNumber: number | null;
  weeks: VotingWeek[];
}

export interface AdvanceWeekPlan {weekId:number;weekNumber:number;nextWeekId:number|null;nextWeekNumber:number|null;nextClosesAt:string|null;noTimer:boolean;}

@Injectable({ providedIn: 'root' })
export class ActiveBracketApiService {
  async getVotingPage(bracketId: number): Promise<ActiveBracketVotingData> {
    const response = await fetch(`/api/brackets/${bracketId}/voting`, { credentials: 'include' });
    const payload = await response.json() as ActiveBracketVotingData & { error?: string };
    if (!response.ok) throw new Error(payload.error || 'Could not load this week’s bracket.');
    return payload;
  }

  async getAdvanceWeekPlan(bracketId:number):Promise<AdvanceWeekPlan> {
    const response=await fetch(`/api/admin/brackets/${bracketId}/advance-week`,{credentials:'include'});
    const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Could not load the next session.');return payload;
  }
  async advanceWeek(bracketId:number,weekId:number,nextClosesAt:string|null):Promise<void> {
    const response=await fetch(`/api/admin/brackets/${bracketId}/advance-week`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({weekId,nextClosesAt})});
    const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Could not advance the week.');
  }

  async setPaused(bracketId: number, paused: boolean): Promise<void> {
    const response = await fetch(`/api/admin/brackets/${bracketId}/${paused ? 'pause' : 'resume'}`, { method: 'POST', credentials: 'include' });
    const payload = await response.json() as { error?: string };
    if (!response.ok) throw new Error(payload.error || 'Could not change bracket hold status.');
  }

  async saveVote(matchupId: number, userId: number, selectedEntryId: number, comment: string): Promise<void> {
    const response = await fetch(`/api/matchups/${matchupId}/votes`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, selectedEntryId, comment })
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) throw new Error(payload.error || 'Could not save this vote.');
  }
}
