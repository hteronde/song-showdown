const hiddenSong=()=>({entryId:null,title:'TBD',album:null,year:null,seed:null,youtubeUrl:null,spotifyUrl:null,albumCoverUrl:null});

export function memberMatchupView(matchup,{isAdmin,roundNumber,isUpcoming,showFullFirstRound=false,revealedEntries,songAPending,songBPending}) {
  if(isAdmin) return matchup;
  const projected={...matchup};
  const revealFirstRoundSongs = roundNumber === 1 && showFullFirstRound;
  for(const [side,pending] of [['A',songAPending],['B',songBPending]]) {
    const songKey=`song${side}`,labelKey=`bracketSong${side}Title`;
    if (pending || (!revealFirstRoundSongs && ((roundNumber===1&&isUpcoming) || !revealedEntries.has(matchup[songKey].entryId)))) {
      projected[songKey]=hiddenSong();
      projected[labelKey]=pending && roundNumber>1 ? matchup[labelKey] : 'TBD';
    }
  }
  if(isUpcoming) { projected.selectedEntryId=null;projected.comment=null;projected.reportedVoteCountA=null;projected.reportedVoteCountB=null; }
  if(projected.winnerEntryId!=null&&!revealedEntries.has(projected.winnerEntryId)) {
    projected.winnerEntryId=null;projected.winnerTitle=null;projected.randomTiebreakerVoteEntryId=null;projected.ballots=[];
  }
  return projected;
}
