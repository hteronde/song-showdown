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

export function decidedTieMethod({winner, votesForA, votesForB, policy, songASeed, songBSeed}) {
  if (winner == null || votesForA !== votesForB) return null;
  return ['seed', 'seed_low'].includes(policy) && Number(songASeed) === Number(songBSeed) ? 'random' : policy;
}

export function matchupTieExplanation(row, ballots, defaultPolicy, inFinale) {
  if (row.winnerEntryId == null) return null;
  let method = row.tieBreakMethod;
  if (!method) {
    if (row.randomTiebreakerVoteEntryId != null) {
      method = row.adminTieBreakEntryId != null || (!inFinale && defaultPolicy === 'admin_pick') ? 'admin_pick' : 'random';
    } else {
      const count = entryId => ballots.filter(ballot => ballot.selectedEntryId === Number(entryId)).length;
      const a = Number(row.reportedVoteCountA ?? count(row.songAEntryId));
      const b = Number(row.reportedVoteCountB ?? count(row.songBEntryId));
      if (a !== b) return null;
      const winnerSeed = Number(row.winnerEntryId) === Number(row.songAEntryId) ? row.songASeed : row.songBSeed;
      const otherSeed = Number(row.winnerEntryId) === Number(row.songAEntryId) ? row.songBSeed : row.songASeed;
      method = a > 0 ? 'unknown' : null;
      if (!inFinale && winnerSeed != null && otherSeed != null) {
        if (defaultPolicy === 'seed' && Number(winnerSeed) < Number(otherSeed)) method = 'seed';
        if (defaultPolicy === 'seed_low' && Number(winnerSeed) > Number(otherSeed)) method = 'seed_low';
      }
    }
  }

  if (!method) return null;
  const descriptions = {
    random: 'A random draw decided the winner.',
    seed: 'The higher-ranked seed won the tiebreaker.',
    seed_low: 'The lower-ranked seed won the tiebreaker.',
    admin_pick: 'The commissioner or admin decided the winner.',
    unknown: 'The tiebreaker method was not recorded.'
  };
  return `The participant votes were tied. ${descriptions[method] ?? descriptions.unknown}`;
}
