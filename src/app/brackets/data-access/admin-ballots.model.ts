export interface BallotPerson { userId: number; displayName: string; selectedEntryId: number | null; }
export interface AdminBallotEditorData {
  matchupId: number; weekNumber: number; matchupNumber: number;
  songAEntryId: number; songBEntryId: number; songATitle: string; songBTitle: string;
  songAYoutubeUrl: string|null; songASpotifyUrl: string|null; songBYoutubeUrl: string|null; songBSpotifyUrl: string|null;
  songAYear: number|null; songBYear: number|null;
  songAAlbum: string|null; songBAlbum: string|null; songAAlbumCoverUrl: string|null; songBAlbumCoverUrl: string|null;
  tieBreakEntryId: number|null;
  participants: BallotPerson[]; revision: string; canEdit: boolean; editRestriction: string; inFinale: boolean; seedingSize: number|null; tiebreakerOption: 'random'|'seed'|'seed_low'|'admin_pick';
}
export type TieBreakSelection = number | 'admin_vote' | 'random' | 'seed' | 'seed_low' | null;

export interface AdminBallotEdits {
  revision: string;
  ballots: Array<{userId: number; selectedEntryId: number | null}>;
  tieBreakEntryId: TieBreakSelection;
  resetLaterRounds: boolean;
}

export interface AdminBallotSaveResult {
  winnerEntryId: number | null;
  randomTiebreakerVoteEntryId: number | null;
  participantVotesA: number;
  participantVotesB: number;
  voteCountA: number;
  voteCountB: number;
}
