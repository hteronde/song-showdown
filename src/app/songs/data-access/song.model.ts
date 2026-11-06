export interface SongRecord {
  songId: number;
  artist: string;
  title: string;
  album: string | null;
  year: number | null;
  category: string | null;
  youtubeUrl: string | null;
  spotifyUrl: string | null;
}

export interface SongInput {
  artist: string;
  title: string;
  album: string;
  year: number | null;
  category: string;
  youtubeUrl: string;
  spotifyUrl: string;
}
