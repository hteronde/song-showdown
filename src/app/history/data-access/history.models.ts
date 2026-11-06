export interface PastMatch {
  selectedEntryId?: number | null;
  matchupId: number;
  nextMatchupId: number | null;
  roundNumber: number;
  weekNumber: number;
  matchupNumber: number;
  left: string;
  leftAlbumCoverUrl: string | null;
  rightAlbumCoverUrl: string | null;
  right: string;
  winner: string;
  leftEntryId: number;
  rightEntryId: number;
  winnerEntryId: number | null;
  voteCountA?: number;
  voteCountB?: number;
  reportedVoteCountA?: number | null;
  reportedVoteCountB?: number | null;
  randomTiebreakerVoteEntryId: number | null;
  ballots: Array<{ userId: number | null; displayName?: string; selectedEntryId: number }>;
  span: number;
}

export interface PastRound {
  roundNumber: number;
  name: string;
  matches: PastMatch[];
}

export interface BracketHistoryInfo {
  finaleAt?: string | null;
  finaleStartRound?: number | null;
  randomizationMode?: 'none' | 'round1' | 'each_round';
  bracketId: number;
  title: string;
  artist: string;
  logoUrl?: string | null;
  bracketYear: number | null;
  status: string;
  familyName: string;
  songCount: number;
  roundCount: number;
}

export interface BracketHistoryListResponse {
  brackets: BracketHistoryInfo[];
}

export interface BracketHistoryResponse {
  canViewBallots: boolean;
  ballotEditingRound: number | null;
  bracket: BracketHistoryInfo;
  songs: string[];
  playlists: Array<{
    playlistId: number;
    playlistName: string;
    playlistUrl: string;
    weekNumber: number | null;
  }>;
  champion: { title: string; album: string | null; year: number | null; albumCoverUrl: string | null } | null;
  finaleSession: { startRoundNumber: number; status: string } | null;
  participants: Array<{ userId: number; displayName: string; finaleParticipant: boolean; nonFinaleParticipant: boolean }>;
  rounds: Array<{
    roundId: number;
    roundNumber: number;
    name: string;
    matchups: Array<{
      selectedEntryId?: number | null;
  matchupId: number;
  nextMatchupId: number | null;
      weekNumber: number;
      matchupNumber: number;
      songA: { title: string; entryId: number; albumCoverUrl: string | null } | null;
      songB: { title: string; entryId: number; albumCoverUrl: string | null } | null;
      winner: { title: string; albumCoverUrl: string | null } | null;
      winnerEntryId: number | null;
  voteCountA?: number;
  voteCountB?: number;
  reportedVoteCountA?: number | null;
  reportedVoteCountB?: number | null;
      randomTiebreakerVoteEntryId: number | null;
      ballots: Array<{ userId: number | null; displayName?: string; selectedEntryId: number }>;
    }>;
  }>;
}

export interface FinaleOptions {
  rounds: Array<{ roundNumber: number; name: string }>;
  participants: Array<{ userId: number; displayName: string; voteCount: number; selectedByDefault: boolean }>;
  session: { startRoundNumber: number; status: string } | null;
}
