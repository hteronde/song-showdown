export interface SessionPlaylist {weekNumber:number;playlistName:string;playlistUrl:string;}
export type RandomizationMode = 'none' | 'round1' | 'each_round';

export interface BracketAlbum { albumId: number; title: string; year: number | null; albumCoverUrl: string | null; }

export type TiebreakerOption = 'random' | 'seed' | 'seed_low' | 'admin_pick';

export interface BracketSong { reorderLocked?: boolean; position?: number; assignedSeed?: number | null; albumId?: number | null; albumCoverUrl?: string; bracketSongId?: number; seed?: number | null; title: string; category: string; album: string; year: number | null; youtubeUrl: string; spotifyUrl: string; }

export interface BracketRecord {
  sessionPlaylists?:SessionPlaylist[];
  sessionSchedule?: Array<{weekNumber:number;opensAt:string|null;closesAt:string|null}>;
  finaleAt?: string | null;
  finaleStartRound?: number | null;
  anonymous?: boolean;
  randomizationMode?: RandomizationMode;
  seedingSize?: number | null;
  bracketId: number;
  title: string;
  artist: string;
  logoUrl?: string | null;
  status: string;
  pausedAt?: string | null;
  startAt: string | null;
  songCount: number;
  songsPerSession?: number;
  sessionDurationMinutes?: number | null;
  tiebreakerOption: TiebreakerOption;
}

export interface BracketParticipant {
  email: string;
  userId: number;
  displayName: string;
}

export interface BracketDetail extends BracketRecord {
  canAssignRoles?:boolean;
  participantRoles?:Record<number,'member'|'commissioner'>;
  durationValue?: number;
  durationUnit?: 'minutes' | 'hours' | 'days' | 'weeks';
  albums: BracketAlbum[];
  songList: string;
  songs?: BracketSong[];
  participantIds: number[];
}

export interface BracketInput {
  participantRoles?:Record<number,'member'|'commissioner'>;
  sessionPlaylists?:SessionPlaylist[];
  sessionSchedule?: Array<{weekNumber:number;opensAt:string|null;closesAt:string|null}>;
  sessionScheduleRevision?:string;
  finaleAt?: string | null;
  finaleStartRound?: number | null;
  anonymous?: boolean;
  randomizationMode?: RandomizationMode;
  seedingSize?: number | null;
  resetHistory?: boolean;
  title: string;
  artist: string;
  logoUrl?: string | null;
  songCount: number;
  songList: string;
  songs?: BracketSong[];
  participantIds: number[];
  startAt: string;
  songsPerSession: number;
  sessionDurationMinutes: number | null;
  tiebreakerOption: TiebreakerOption;
}

export interface BracketSession {matchups?:Array<{matchupNumber:number;songA:string|null;songB:string|null}>;weekId:number;weekNumber:number;roundNumber:number;roundName:string;opensAt:string|null;closesAt:string|null;matchupCount:number;decidedCount:number;isFinale:boolean;state:string;}
export interface BracketSessionsData {isDraft?:boolean;effectiveAt?:string;bracketId:number;startAt:string|null;status:string;noTimer:boolean;paused:boolean;revision:string;sessions:BracketSession[];}
