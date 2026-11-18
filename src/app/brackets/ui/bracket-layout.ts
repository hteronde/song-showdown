export function mirrorBracketRounds<Round, Match>(
    rounds: readonly Round[],
    matches: (round: Round) => readonly Match[],
    withMatches: (round: Round, matches: Match[]) => Round
): Round[] {
    const championship = rounds.at(-1);
    if (!championship) return [];

    const left: Round[] = [];
    const right: Round[] = [];
    for (const round of rounds.slice(0, -1)) {
        const entries = matches(round);
        const middle = Math.ceil(entries.length / 2);
        left.push(withMatches(round, entries.slice(0, middle)));
        right.push(withMatches(round, entries.slice(middle)));
    }
    return [...left, championship, ...right.reverse()];
}

export function positionalBracketLinks<Match extends {matchupId: number; drawPending?: boolean}>(
    rounds: ReadonlyArray<readonly Match[]>
) {
    return rounds.flatMap((matches, index) => matches.map((match, position) => ({
        matchupId: match.matchupId,
        nextMatchupId: rounds[index + 1]?.[Math.floor(position / 2)]?.matchupId ?? null,
        drawPending: match.drawPending ?? false
    })));
}
