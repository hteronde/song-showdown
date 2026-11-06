export interface PlaylistWeek {
  weekId: number;
  weekNumber: number;
}

export interface PlaylistBracket {
  bracketId: number;
  title: string;
  artist: string;
  weeks: PlaylistWeek[];
}

export interface PlaylistRecord {
  playlistId: number;
  bracketId: number;
  bracketTitle: string;
  bracketArtist: string;
  weekId: number | null;
  weekNumber: number | null;
  playlistName: string;
  playlistUrl: string;
}

export interface PlaylistInput {
  bracketId: number;
  weekId: number | null;
  playlistName: string;
  playlistUrl: string;
}
