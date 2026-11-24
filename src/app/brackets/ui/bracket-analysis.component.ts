import { CommonModule } from '@angular/common';
import { Component, HostListener, Input, OnChanges } from '@angular/core';
import { RouterLink } from '@angular/router';

export type BracketView = 'bracket' | 'analysis';

@Component({
    selector: 'app-bracket-view-toggle',
    standalone: true,
    imports: [RouterLink],
    template: `
        <nav class="switch" aria-label="Bracket view">
            <a [routerLink]="bracketLink" [attr.aria-current]="view === 'bracket' ? 'page' : null">Bracket</a>
            <a [routerLink]="analysisLink" [attr.aria-current]="view === 'analysis' ? 'page' : null">Analysis</a>
        </nav>
    `,
    styles: [`
        :host { display: flex; justify-content: flex-end; }
        .switch { display: inline-flex; gap: 4px; padding: 4px; margin: 0 0 20px; border: 1px solid #dcd4c7; border-radius: 6px; background: #f1ede5; }
        a { text-decoration: none; padding: 7px 14px; border: 0; border-radius: 4px; background: transparent; color: #4e463e; cursor: pointer; font-size: 13px; }
        a[aria-current="page"] { background: #30312b; color: #fff; }
    `]
})
export class BracketViewToggleComponent {
    @Input() view: BracketView = 'bracket';
    @Input({required: true}) bracketLink: (string | number)[] = [];

    get analysisLink(): (string | number)[] { return [...this.bracketLink, 'analysis']; }
}

export interface AnalysisSong {
    entryId: number | null;
    title: string;
    album?: string | null;
    category?: string | null;
}

export interface AnalysisRound {
    name: string;
    slotCount: number;
    songs: readonly AnalysisSong[];
}

export function appendWinnerRound(rounds: AnalysisRound[], winnerEntryId: number | null | undefined): AnalysisRound[] {
    if (winnerEntryId == null) return rounds;
    const winner = rounds.at(-1)?.songs.find(song => song.entryId === winnerEntryId);
    return winner ? [...rounds, {name: 'Winner', slotCount: 1, songs: [winner]}] : rounds;
}

export interface AnalysisVote {
    roundNumber: number;
    roundName: string;
    userId: number;
    displayName: string;
    song: AnalysisSong;
}

export function analysisVotes(
    roundNumber: number,
    roundName: string,
    winnerEntryId: number | null,
    songs: readonly (AnalysisSong | null)[],
    ballots: readonly {userId?: number | null; displayName?: string; selectedEntryId: number}[]
): AnalysisVote[] {
    if (winnerEntryId == null) return [];
    return ballots.flatMap(ballot => {
        if (ballot.userId == null || !ballot.displayName) return [];
        const song = songs.find(entry => entry?.entryId === ballot.selectedEntryId);
        return song ? [{roundNumber, roundName, userId: ballot.userId, displayName: ballot.displayName, song}] : [];
    });
}

interface AnalysisChart {title: string; group: string; rows: ChartRow[];}

interface ChartRow { label: string; cells: Array<{count: number; share: number; tooltip: string | null}>; }

function chartRows(rounds: readonly AnalysisRound[], field: 'album' | 'category', fallback: string): ChartRow[] {
    const rows = new Map<string, {label: string; songsByRound: string[][]}>();
    for (const [index, round] of rounds.entries()) {
        for (const song of round.songs) {
            const value = song[field]?.trim();
            const key = value?.toLowerCase() || '';
            const row = rows.get(key) ?? {label: value || fallback, songsByRound: rounds.map(() => [])};
            row.songsByRound[index].push(song.title);
            rows.set(key, row);
        }
    }
    return [...rows.values()].map(({label, songsByRound}) => ({
        label,
        cells: songsByRound.map((songs, index) => ({
            count: songs.length,
            share: songs.length / Math.max(1, rounds[index].slotCount),
            tooltip: songs.length ? songs.join('\n') : null
        }))
    })).sort((a, b) => b.cells[0].count - a.cells[0].count || a.label.localeCompare(b.label));
}

@Component({
    selector: 'app-bracket-analysis',
    standalone: true,
    imports: [CommonModule],
    template: `
        <section class="analysis" aria-label="Bracket analysis">
            <h2>Bracket analysis</h2>
            <p>Bars show each group’s share of the round. The opening round shows the starting field.</p>
            <p *ngIf="partial">Only revealed songs are counted. Percentages use all slots in the round.</p>
            <p *ngIf="!rounds.length" role="status">Song counts will appear when matchups are available.</p>

            <ng-container *ngTemplateOutlet="chartGroup; context: {charts: charts, columns: rounds}"></ng-container>
            <section class="participant-analysis" *ngIf="participants.length">
                <h2>Participant voting</h2>
                <p>Counts show recorded votes in decided matchups. Each bar shows the share of this participant’s votes in that round.</p>
                <label for="analysis-participant">Participant</label>
                <select id="analysis-participant" #participant (change)="selectParticipant(+participant.value)">
                    <option *ngFor="let person of participants" [value]="person.userId" [selected]="person.userId === selectedUserId">{{ person.displayName }}</option>
                </select>
                <ng-container *ngTemplateOutlet="chartGroup; context: {charts: participantCharts, columns: participantColumns}"></ng-container>
            </section>

            <ng-template #chartGroup let-chartList="charts" let-columns="columns">
            <section class="chart" *ngFor="let chart of chartList; trackBy: trackChart">
                <h3>{{ chart.title }}</h3>
                <div class="chart-scroll" (scroll)="hideTooltip()" tabindex="0" role="region" [attr.aria-label]="chart.title">
                    <table [attr.aria-label]="chart.title">
                        <thead><tr>
                            <th scope="col">{{ chart.group }}</th>
                            <th scope="col" *ngFor="let round of columns">{{ round.name }}</th>
                        </tr></thead>
                        <tbody><tr *ngFor="let row of chart.rows">
                            <th scope="row">{{ row.label }}</th>
                            <td *ngFor="let cell of row.cells">
                                <div class="bar-cell" [attr.tabindex]="cell.tooltip ? 0 : null"
                                    [attr.aria-label]="cell.tooltip ? cell.count + ': ' + cell.tooltip : null"
                                    (mouseenter)="showTooltip($event, cell.tooltip)" (mousemove)="showTooltip($event, cell.tooltip)" (mouseleave)="hideTooltip()"
                                    (focus)="showTooltip($event, cell.tooltip)" (blur)="hideTooltip()"
                                    (keydown.escape)="hideTooltip()">
                                    <span aria-hidden="true" class="bar" [style.width.%]="cell.share * 100"></span>
                                    <span class="count">{{ cell.count }}</span>
                                </div>
                            </td>
                        </tr></tbody>
                    </table>
                </div>
            </section>
            </ng-template>
            <div class="songs-tooltip" *ngIf="tooltip as tip" aria-hidden="true"
                [style.left.px]="tip.left" [style.top.px]="tip.top" [style.max-height.px]="tip.maxHeight"
                [class.tooltip-above]="tip.above">
                <div class="tooltip-song" *ngFor="let song of tip.songs">{{ song }}</div>
            </div>
        </section>
    `,
    styles: [`
        .analysis { margin-bottom: 24px; }
        .participant-analysis { margin-top: 28px; }
        .participant-analysis label { margin-inline-end: 8px; font-size: 13px; font-weight: 600; }
        .participant-analysis select { max-width: 100%; padding: 6px 10px; border: 1px solid #c8bfb0; border-radius: 4px; background: #fffdf8; color: #30312b; font: inherit; }
        h2 { margin-bottom: 8px; }
        p { color: #5d554b; font-size: 13px; }
        .chart { margin: 22px 0; padding: 14px; border: 1px solid #dcd4c7; border-radius: 8px; background: #fffdf8; }
        h3 { margin: 0 0 10px; font-size: 16px; }
        .chart-scroll { overflow-x: auto; }
        table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; }
        th, td { padding: 7px 8px; border-bottom: 1px solid #eee7dd; text-align: left; }
        thead th { vertical-align: bottom; color: #5d554b; }
        th:first-child { position: sticky; left: 0; z-index: 1; background: #fffdf8; min-width: 96px; max-width: 190px; overflow-wrap: anywhere; }
        .bar-cell { position: relative; display: flex; align-items: center; min-width: 44px; min-height: 22px; background: #f1ede5; border-radius: 3px; }
        .bar { position: absolute; inset-block: 0; inset-inline-start: 0; background: #dec3a7; border-radius: 3px; }
        .bar-cell[tabindex] { cursor: default; }
        .songs-tooltip { position: fixed; z-index: 20; width: max-content; max-width: min(260px, calc(100vw - 16px)); padding: 8px 10px; border-radius: 5px; background: #30312b; color: #fff; font-size: 12px; line-height: 1.55; overflow: hidden; pointer-events: none; }
        .tooltip-song { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tooltip-above { transform: translateY(-100%); }
        .count {
            position: relative;
            margin: 2px 3px;
            padding: 1px 5px;
            color: #28221d;
            font-size: 13px;
            font-weight: 700;
            line-height: 1.2;
            font-variant-numeric: tabular-nums;
        }
    `]
})
export class BracketAnalysisComponent implements OnChanges {
    @Input() data: readonly AnalysisRound[] = [];
    @Input() partial = false;
    @Input() votes: readonly AnalysisVote[] = [];
    participants: Array<{userId: number; displayName: string}> = [];
    selectedUserId: number | null = null;
    participantCharts: AnalysisChart[] = [];
    participantColumns: AnalysisRound[] = [];
    rounds: AnalysisRound[] = [];
    charts: AnalysisChart[] = [];

    tooltip: {songs: string[]; left: number; top: number; maxHeight: number; above: boolean} | null = null;

    showTooltip(event: Event, text: string | null): void {
        if (!text || !(event.currentTarget instanceof HTMLElement)) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = document.documentElement.clientHeight;
        const width = Math.min(260, viewportWidth - 16);
        const x = event instanceof MouseEvent ? event.clientX : bounds.left;
        const y = event instanceof MouseEvent ? event.clientY : bounds.top;
        const songs = text.split('\n');
        const height = songs.length * 19 + 16;
        const above = y - 16 >= height || y >= viewportHeight / 2;
        this.tooltip = {
            songs,
            left: Math.max(8, Math.min(x, viewportWidth - width - 8)),
            top: above ? y - 8 : (event instanceof MouseEvent ? y : bounds.bottom) + 8,
            maxHeight: Math.max(0, above ? y - 16 : viewportHeight - (event instanceof MouseEvent ? y : bounds.bottom) - 16),
            above
        };
    }

    @HostListener('window:scroll')
    @HostListener('window:resize')
    hideTooltip(): void { this.tooltip = null; }

    trackChart(_index: number, chart: {title: string}): string { return chart.title; }

    selectParticipant(userId: number | null): void {
        this.selectedUserId = userId;
        this.hideTooltip();
        const rounds = new Map<number, {name: string; songs: AnalysisSong[]}>();
        for (const vote of this.votes) {
            const round = rounds.get(vote.roundNumber) ?? {name: vote.roundName, songs: []};
            if (vote.userId === userId) round.songs.push(vote.song);
            rounds.set(vote.roundNumber, round);
        }
        this.participantColumns = [...rounds.entries()].sort(([a], [b]) => a - b)
            .map(([, round]) => ({...round, slotCount: round.songs.length}));
        this.participantCharts = userId == null ? [] : this.makeCharts(this.participantColumns, 'Votes');
    }

    private makeCharts(rounds: readonly AnalysisRound[], title: string): AnalysisChart[] {
        const charts = [{title: title + ' by album', group: 'Album', rows: chartRows(rounds, 'album', 'Unknown album')}];
        if (rounds.some(round => round.songs.some(song => !!song.category?.trim()))) {
            charts.push({title: title + ' by category', group: 'Category', rows: chartRows(rounds, 'category', 'Uncategorized')});
        }
        return charts;
    }

    ngOnChanges(): void {
        this.rounds = this.data.map(round => ({
            name: round.name,
            slotCount: round.slotCount,
            songs: [...new Map(round.songs.filter(song => song.entryId != null).map(song => [song.entryId, song])).values()]
        })).filter(round => round.songs.length > 0);
        this.charts = this.rounds.length ? this.makeCharts(this.rounds, 'Songs') : [];
        const byId = new Map(this.votes.map(({userId, displayName}) => [userId, {userId, displayName}]));
        this.participants = [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName) || a.userId - b.userId);
        const selected = this.selectedUserId != null && byId.has(this.selectedUserId)
            ? this.selectedUserId : this.participants[0]?.userId ?? null;
        this.selectParticipant(selected);
    }
}
