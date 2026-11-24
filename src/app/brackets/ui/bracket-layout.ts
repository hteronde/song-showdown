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

export function scrollBracket(viewport: HTMLElement, control: HTMLInputElement): void {
    const scrollDistance = viewport.scrollWidth - viewport.clientWidth;
    viewport.scrollLeft = scrollDistance * control.valueAsNumber / 100;
    if (!scrollDistance) control.value = '0';
}

export function syncBracketScroll(viewport: HTMLElement, control: HTMLInputElement): void {
    const scrollDistance = viewport.scrollWidth - viewport.clientWidth;
    control.valueAsNumber = scrollDistance ? viewport.scrollLeft * 100 / scrollDistance : 0;
}

export function bracketRoundLabel(name: string): string {
    switch (name.trim().toLowerCase()) {
        case 'round of 16':
        case 'sweet 16':
            return 'Sweet 16';
        case 'quarterfinals':
        case 'elite 8':
            return 'Elite 8';
        case 'semifinals':
        case 'final four':
        case 'final 4':
            return 'Final 4';
        default:
            return name;
    }
}
