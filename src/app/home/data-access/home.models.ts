export interface Song {
  title: string;
  album: string;
  year: number;
  color: string;
  initials: string;
}

export interface Matchup {
  id: number;
  week: number;
  left: Song;
  right: Song;
  votes: Record<string, string>;
  comments: Record<string, string>;
}

export interface DraftStore {
  picks: Record<number, string>;
  comments: Record<number, string>;
}
