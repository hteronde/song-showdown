import { apiRequest } from '../../shared/data-access/api-client';
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
  canManage?:boolean;
  isCommissioner?:boolean;
  canParticipateOnline?: boolean;
  isUpcoming?: boolean;
  playlists?:Array<{weekNumber:number;playlistName:string;playlistUrl:string}>;
  awaitingFinale: boolean;
  canViewBallots: boolean;
  ballotEditingRound: number | null;
  bracket: { automaticEmailsDisabled?:boolean; startAt?: string | null; bracketId: number; title: string; artist: string; logoUrl?: string | null; bracketYear: number | null; status: string; sessionDurationMinutes: number | null; finaleAt: string | null; finaleStartRound: number | null; pausedAt: string | null; randomizationMode: 'none' | 'round1' | 'each_round'; songCount: number };
  finaleModeActive: boolean;
  currentWeekNumber: number | null;
  weeks: VotingWeek[];
}

export interface AdvanceWeekPlan {weekId:number;weekNumber:number;nextWeekId:number|null;nextWeekNumber:number|null;nextClosesAt:string|null;noTimer:boolean;}

@Injectable({ providedIn: 'root' })
export class ActiveBracketApiService {
  setAutomaticEmailsDisabled(bracketId:number, automaticEmailsDisabled:boolean): Promise<{automaticEmailsDisabled:boolean}> {
    return apiRequest(`/api/admin/brackets/${bracketId}/automatic-emails`, {method:'PUT',json:{automaticEmailsDisabled}});
  }
  sendEmail(bracketId: number, subject: string, body: string, requestId: string): Promise<{sent:number;failed:number}> {
    return apiRequest(`/api/admin/brackets/${bracketId}/email`, {method:'POST', json:{subject,body,requestId}, timeoutMs:120000});
  }
  getVotingPage(bracketId: number, signal?: AbortSignal): Promise<ActiveBracketVotingData> {
    return apiRequest(`/api/brackets/${bracketId}/voting`, {signal});
  }
  getAdvanceWeekPlan(bracketId: number, signal?: AbortSignal): Promise<AdvanceWeekPlan> {
    return apiRequest(`/api/admin/brackets/${bracketId}/advance-week`, {signal});
  }
  async advanceWeek(bracketId: number, weekId: number, nextClosesAt: string | null): Promise<void> {
    await apiRequest(`/api/admin/brackets/${bracketId}/advance-week`, {method: 'POST', json: {weekId, nextClosesAt}});
  }
  async setPaused(bracketId: number, paused: boolean): Promise<void> {
    await apiRequest(`/api/admin/brackets/${bracketId}/${paused ? 'pause' : 'resume'}`, {method: 'POST'});
  }
  async saveVote(matchupId: number, userId: number, selectedEntryId: number, comment: string): Promise<void> {
    await apiRequest(`/api/matchups/${matchupId}/votes`, {method: 'POST', json: {userId, selectedEntryId, comment}});
  }
}
