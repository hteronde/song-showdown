import type { BracketSong } from '../data-access/bracket.model';

export function canReorderSong(songs: BracketSong[], index: number, target: number, saving: boolean): boolean {
  if (saving || target < 0 || target >= songs.length || index === target) return false;
  return !songs.slice(Math.min(index, target), Math.max(index, target) + 1).some(song => song.reorderLocked);
}

export function reorderSong(songs: BracketSong[], index: number, target: number): BracketSong[] {
  const ordered = [...songs];
  const [song] = ordered.splice(index, 1);
  ordered.splice(target, 0, song);
  return ordered;
}

export function seedGroupSongs(songs: BracketSong[], assignments: (number | null)[], rank: number | null, search: string): {index: number; song: BracketSong}[] {
  const query = search.trim().toLocaleLowerCase();
  return songs.map((song, index) => ({song, index})).filter(({song, index}) => assignments[index] === rank && (!query || `${song.title} ${song.album ?? ''} ${song.category ?? ''}`.toLocaleLowerCase().includes(query)));
}

export function seedAssignmentError(songs: BracketSong[], enabled: boolean, songCount: number, seedingSize: number): string {
  if (!enabled) return '';
  if (songs.some(song => song.assignedSeed == null)) return 'Assign a seed to every song.';
  const required = songCount / seedingSize;
  for (let rank = 1; rank <= seedingSize; rank++) {
    const assigned = songs.filter(song => song.assignedSeed === rank).length;
    if (assigned !== required) return `Seed ${rank} needs exactly ${required} song${required === 1 ? '' : 's'}; currently assigned ${assigned}.`;
  }
  return '';
}
