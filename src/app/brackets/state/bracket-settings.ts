export type BracketFieldErrors = Partial<Record<'title' | 'artist' | 'startAt' | 'participants' | 'songList', string>>;
export interface BracketValidationInput {
  title: string;
  artist: string;
  startAt: string;
  participantIds: number[];
  songList: string;
  songCount: number;
}

export function enteredSongCount(songList: string): number {
  return songList.split(/\r?\n/).map(song => song.trim()).filter(Boolean).length;
}

export function validateBracketSettings(input: BracketValidationInput): BracketFieldErrors {
  return {
    ...(!input.title.trim() ? { title: 'Title is required.' } : {}),
    ...(!input.artist.trim() ? { artist: 'Theme is required.' } : {}),
    ...(!input.startAt ? { startAt: 'Start date and time is required.' } : {}),
    ...(!input.participantIds.length ? { participants: 'Select at least one participant.' } : {}),
    ...(enteredSongCount(input.songList) !== input.songCount ? { songList: `Enter exactly ${input.songCount} songs using Add a song.` } : {})
  };
}

