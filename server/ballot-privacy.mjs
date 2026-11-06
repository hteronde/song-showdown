// Counts may be public; participant-to-song associations remain private; the signed-in user can always see their own selection.
export function applyBallotPrivacy(matchup,anonymous,isAdmin,currentUserId=null) {
  const count=entryId=>entryId==null?0:matchup.ballots.filter(ballot=>ballot.selectedEntryId===Number(entryId)).length;
  const voteCountA=matchup.reportedVoteCountA ?? count(matchup.songA?.entryId);
  const voteCountB=matchup.reportedVoteCountB ?? count(matchup.songB?.entryId);
  const ownVote=currentUserId == null ? null : matchup.ballots.find(ballot=>ballot.userId != null && Number(ballot.userId)===Number(currentUserId));
  return {...matchup,selectedEntryId:matchup.selectedEntryId??ownVote?.selectedEntryId??null,voteCountA,voteCountB,ballots:anonymous&&!isAdmin?[]:matchup.ballots};
}
