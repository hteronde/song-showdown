import { randomInt } from 'node:crypto';
export const tiebreakerOptions = ['random', 'seed', 'seed_low', 'admin_pick'];

export function validateSeedTiebreaker(option, seedingSize) {
  if (['seed','seed_low'].includes(option) && seedingSize == null) throw new Error('Select Use Seeds before choosing a seed tiebreaker.');
}

export function resolveWinner({ votesForA, votesForB, songAEntryId, songBEntryId, tiebreakerOption, songASeed, songBSeed, adminPick = null }, draw = () => randomInt(2)) {
  if (votesForA !== votesForB) return votesForA > votesForB ? songAEntryId : songBEntryId;
  if (tiebreakerOption === 'random') return draw() === 0 ? songAEntryId : songBEntryId;
  if (['seed','seed_low'].includes(tiebreakerOption)) {
    // A higher-ranked seed has a lower number (#1 outranks #2).
    if (songASeed !== songBSeed) return (tiebreakerOption === 'seed' ? songASeed < songBSeed : songASeed > songBSeed) ? songAEntryId : songBEntryId;
    return draw() === 0 ? songAEntryId : songBEntryId;
  }
  return [songAEntryId, songBEntryId].includes(adminPick) ? adminPick : null;
}

// The system vote is recorded separately from participant votes.
export function randomTiebreakerVote(matchup, winnerEntryId) {
  return matchup.tiebreakerOption === 'random' && matchup.votesForA === matchup.votesForB
    ? winnerEntryId : null;
}
