import { BracketSession } from '../data-access/bracket.model';
export interface SessionSettings {
    songCount: number;
    startAt: string;
    matchups: number;
    minutes: number | null;
    finaleRound: number | null;
    finaleDate: string;
}
export function sessionTimingKey(settings: SessionSettings): string { return JSON.stringify([settings.songCount, settings.startAt, settings.matchups, settings.minutes]); }
export function previewSessionSchedule(settings: SessionSettings, saved: BracketSession[], baseline: SessionSettings | null, now = new Date()): BracketSession[] {
    const isFinale = (round: number) => settings.finaleRound != null && round >= settings.finaleRound;
    const label = (row: BracketSession) => ({ ...row, isFinale: isFinale(row.roundNumber), state: row.state === 'Decided' ? 'Decided' : isFinale(row.roundNumber) ? 'Finale' : row.state === 'Finale' ? 'Upcoming' : row.state });
    const structureSame = baseline && baseline.songCount === settings.songCount && baseline.startAt === settings.startAt && baseline.matchups === settings.matchups;
    if (saved.length && structureSame) {
        if (baseline.minutes === settings.minutes)
            return saved.map(label);
        let previousOldClose: Date | null = null, previousNewClose: Date | null = null, started = false;
        return saved.map(row => {
            const oldOpen = row.opensAt ? new Date(row.opensAt) : null, oldClose = row.closesAt ? new Date(row.closesAt) : null;
            if (row.decidedCount > 0 || (oldClose && oldClose <= now))
                return label(row);
            let opens: Date | null, closes: Date | null;
            if (settings.minutes === null) {
                opens = started ? null : oldOpen ?? now;
                closes = null;
            }
            else {
                const gap = previousOldClose && oldOpen ? Math.max(0, oldOpen.getTime() - previousOldClose.getTime()) : 0;
                opens = previousNewClose ? new Date(previousNewClose.getTime() + gap) : oldOpen ?? now;
                closes = Number.isFinite(settings.minutes) && settings.minutes > 0 ? new Date(Math.max(opens.getTime() + settings.minutes * 60000, now.getTime() + 1000)) : null;
            }
            started = true;
            previousOldClose = oldClose;
            previousNewClose = closes;
            return label({ ...row, opensAt: opens?.toISOString() ?? null, closesAt: closes?.toISOString() ?? null });
        });
    }
    const rows: BracketSession[] = [];
    if (![4, 8, 16, 32, 64, 128].includes(settings.songCount) || ![2, 4, 8].includes(settings.matchups))
        return rows;
    const start = new Date(settings.startAt);
    let cursor = Number.isFinite(start.getTime()) ? start : null;
    for (let round = 1; round <= Math.log2(settings.songCount); round++) {
        const field = settings.songCount / 2 ** (round - 1), games = field / 2;
        const name = field === 2 ? 'Championship' : field === 4 ? 'Final Four' : field === 8 ? 'Elite 8' : field === 16 ? 'Sweet 16' : `Round of ${field}`;
        for (let offset = 0; offset < games; offset += settings.matchups) {
            const opens = settings.minutes === null && rows.length > 0 ? null : cursor;
            const closes = opens && settings.minutes != null && Number.isFinite(settings.minutes) && settings.minutes > 0 ? new Date(opens.getTime() + settings.minutes * 60000) : null;
            const week = rows.length + 1;
            rows.push({ weekId: -week, weekNumber: week, roundNumber: round, roundName: name, opensAt: opens?.toISOString() ?? null, closesAt: closes?.toISOString() ?? null, matchupCount: Math.min(settings.matchups, games - offset), decidedCount: 0, isFinale: isFinale(round), state: isFinale(round) ? 'Finale' : 'Planned' });
            cursor = closes;
        }
    }
    return rows;
}
export type DurationUnit = 'minutes' | 'hours' | 'days' | 'weeks';
export type SessionEditorRow = BracketSession & {
    startInput: string;
    endInput: string;
};
export function durationMinutes(value: number, unit: DurationUnit): number {
    return Math.round(value * { minutes: 1, hours: 60, days: 1440, weeks: 10080 }[unit]);
}
export function sessionDateInput(value: string | null): string {
    if (!value)
        return '';
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}
export function sessionEditorRows(sessions: BracketSession[]): SessionEditorRow[] {
    return sessions.map(session => ({ ...session, startInput: sessionDateInput(session.opensAt), endInput: sessionDateInput(session.closesAt) }));
}
export function sessionSchedulePayload(sessions: SessionEditorRow[]): Array<{
    weekNumber: number;
    opensAt: string | null;
    closesAt: string | null;
}> {
    const value = (input: string, original: string | null): string | null => input === sessionDateInput(original) ? original : input ? new Date(input).toISOString() : null;
    return sessions.map(session => ({ weekNumber: session.weekNumber, opensAt: value(session.startInput, session.opensAt), closesAt: value(session.endInput, session.closesAt) }));
}
export function summarizeFinaleSessions(sessions: BracketSession[]): {
    roundRange: string;
    matchupCount: number;
} | null {
    const finale = sessions.filter(session => session.isFinale);
    if (!finale.length)
        return null;
    const first = finale[0].roundName, last = finale[finale.length - 1].roundName;
    return { roundRange: first === last ? first : `${first} - ${last}`, matchupCount: finale.reduce((total, session) => total + Number(session.matchupCount), 0) };
}

// Keep subsequent voting windows contiguous while preserving their durations.
export function updateSessionEnd(rows: Array<SessionEditorRow & {startLocked?:boolean;endLocked?:boolean}>, index: number, value: string): void {
    const row = rows[index];
    if (!row || row.endLocked) return;
    row.endInput = value;
    if (value && !Number.isFinite(new Date(value).getTime())) return;
    for (let i = index + 1; i < rows.length; i++) {
        const previous = rows[i - 1], next = rows[i];
        if (next.startLocked || next.endLocked || next.isFinale || next.state === 'Decided' || next.state === 'Awaiting results') break;
        const duration = new Date(next.endInput).getTime() - new Date(next.startInput).getTime();
        next.startInput = previous.endInput;
        if (!next.startInput) break; // Untimed sessions open after the preceding session.
        if (Number.isFinite(duration) && duration > 0) {
            next.endInput = sessionDateInput(new Date(new Date(next.startInput).getTime() + duration).toISOString());
        } else if (!next.endInput) {
            // A session without a timer has no scheduled boundary to propagate.
            if (rows[i + 1] && !rows[i + 1].startLocked && !rows[i + 1].isFinale) rows[i + 1].startInput = '';
            break;
        } else break; // Keep invalid values visible for correction; server validation rejects them.
    }
}
