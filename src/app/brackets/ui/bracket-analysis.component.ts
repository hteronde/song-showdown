import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, HostListener, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
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
    opponentTitle?: string | null;
}

export interface AnalysisRound {
    name: string;
    slotCount: number;
    songs: readonly AnalysisSong[];
    againstSongs?: readonly AnalysisSong[];
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
    opponent: AnalysisSong | null;
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
        if (!song) return [];
        const opponent = songs.find(entry => entry?.entryId != null && entry.entryId !== ballot.selectedEntryId);
        return [{roundNumber, roundName, userId: ballot.userId, displayName: ballot.displayName, song, opponent: opponent ?? null}];
    });
}

interface AnalysisChart {title: string; group: string; rows: ChartRow[];}

interface TooltipSong {title: string; opponentTitle?: string | null;}
interface ChartBar { count: number; share: number; tooltip: TooltipSong[]; description: string; kind: 'for' | 'against' | null; }
interface ChartRow { label: string; cells: ChartBar[][]; }

function chartRows(rounds: readonly AnalysisRound[], field: 'album' | 'category', fallback: string): ChartRow[] {
    const rows = new Map<string, {label: string; byRound: Array<{picked: TooltipSong[]; opposed: TooltipSong[]}>}>();
    for (const [index, round] of rounds.entries()) {
        const groups = [
            {key: 'picked', songs: round.songs},
            {key: 'opposed', songs: round.againstSongs ?? []}
        ] as const;
        for (const group of groups) {
            for (const song of group.songs) {
                const value = song[field]?.trim();
                const key = value?.toLowerCase() || '';
                const row = rows.get(key) ?? {label: value || fallback, byRound: rounds.map(() => ({picked: [], opposed: []}))};
                const tooltip = group.key === 'opposed' && song.opponentTitle
                    ? {title: song.opponentTitle, opponentTitle: song.title}
                    : {title: song.title, opponentTitle: song.opponentTitle};
                row.byRound[index][group.key].push(tooltip);
                rows.set(key, row);
            }
        }
    }

    const bar = (songs: TooltipSong[], round: AnalysisRound, kind: ChartBar['kind']): ChartBar => ({
        count: songs.length,
        share: songs.length / Math.max(1, round.slotCount),
        tooltip: songs,
        description: songs.map(song => song.opponentTitle ? `${song.title} over ${song.opponentTitle}` : song.title).join('; '),
        kind
    });
    return [...rows.values()].map(({label, byRound}) => ({
        label,
        cells: byRound.map(({picked, opposed}, index) => {
            const round = rounds[index];
            return round.againstSongs
                ? [bar(picked, round, 'for'), bar(opposed, round, 'against')]
                : [bar(picked, round, null)];
        })
    })).sort((a, b) =>
        b.cells[0].reduce((total, item) => total + item.count, 0) -
        a.cells[0].reduce((total, item) => total + item.count, 0) || a.label.localeCompare(b.label)
    );
}

@Component({
    selector: 'app-bracket-analysis',
    standalone: true,
    imports: [CommonModule],
    template: `
        <section class="analysis" aria-label="Bracket analysis">
            <h2>Bracket analysis</h2>
            <p>Bars show each group’s share of the round. The opening round shows the starting field.</p>
            <p *ngIf="rounds.length">Hover over a bar to preview the songs. Click or tap the bar to keep the list open while you scroll.</p>
            <p *ngIf="partial">Only revealed songs are counted. Percentages use all slots in the round.</p>
            <p *ngIf="!rounds.length" role="status">Song counts will appear when matchups are available.</p>

            <ng-container *ngTemplateOutlet="chartGroup; context: {charts: charts, columns: rounds}"></ng-container>
            <section class="participant-analysis" *ngIf="participants.length">
                <h2>Participant voting</h2>
                <p>Counts show recorded votes in decided matchups. Each bar shows the share of this participant’s votes in that round.</p>
                <label for="analysis-participant">Participant</label>
                <select id="analysis-participant" #participant (change)="selectParticipant(participant.value ? +participant.value : null)">
                    <option value="" [selected]="selectedUserId === null">Select a participant</option>
                    <option *ngFor="let person of participants" [value]="person.userId" [selected]="person.userId === selectedUserId">{{ person.displayName }}</option>
                </select>
                <div class="vote-legend" *ngIf="selectedUserId !== null" aria-label="Vote chart colors">
                    <span class="legend-for">Voted for</span><span class="legend-against">Voted against</span>
                </div>
                <ng-container *ngTemplateOutlet="chartGroup; context: {charts: participantCharts, columns: participantColumns}"></ng-container>
            </section>

            <ng-template #chartGroup let-chartList="charts" let-columns="columns">
            <section class="chart" *ngFor="let chart of chartList; trackBy: trackChart">
                <h3>{{ chart.title }}</h3>
                <div class="chart-scroll" (scroll)="dismissTooltipPreview()" tabindex="0" role="region" [attr.aria-label]="chart.title">
                    <table [attr.aria-label]="chart.title">
                        <thead><tr>
                            <th scope="col">{{ chart.group }}</th>
                            <th scope="col" *ngFor="let round of columns">{{ round.name }}</th>
                        </tr></thead>
                        <tbody><tr *ngFor="let row of chart.rows">
                            <th scope="row">{{ row.label }}</th>
                            <td *ngFor="let bars of row.cells">
                                <div class="bar-cell" *ngFor="let cell of bars" [class.bar-for]="cell.kind === 'for'" [class.bar-against]="cell.kind === 'against'" #barCell [attr.tabindex]="cell.count ? 0 : null"
                                    [attr.role]="cell.count ? 'button' : null"
                                    [attr.aria-pressed]="cell.count ? tooltipPinned && tooltipAnchor === barCell : null"
                                    (click)="toggleTooltipPin($event, cell.tooltip)"
                                    (keydown.enter)="toggleTooltipPin($event, cell.tooltip)"
                                    (keydown.space)="$event.preventDefault(); toggleTooltipPin($event, cell.tooltip)"
                                    [attr.aria-label]="cell.count ? (cell.kind === 'for' ? 'Voted for: ' : cell.kind === 'against' ? 'Voted against: ' : '') + cell.count + ': ' + cell.description : null"
                                    (mouseenter)="showTooltip($event, cell.tooltip)" (mousemove)="showTooltip($event, cell.tooltip)" (mouseleave)="scheduleTooltipClose()"
                                    (focus)="showTooltip($event, cell.tooltip)" (blur)="scheduleTooltipClose()"
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
            <div #songsTooltip class="songs-tooltip" *ngIf="tooltip as tip" tabindex="0" role="region" aria-label="Songs in this bar"
                (mouseenter)="cancelTooltipClose()" (mouseleave)="scheduleTooltipClose()"
                (focus)="cancelTooltipClose()" (blur)="scheduleTooltipClose()" (keydown.escape)="hideTooltip()"
                [style.left.px]="tip.left" [style.top.px]="tip.top" [style.max-height.px]="tip.maxHeight"
                [class.tooltip-above]="tip.above">
                <div class="tooltip-header">
                    <span>Song list</span>
                    <button type="button" (click)="tooltipPinned ? hideTooltip() : keepTooltipOpen()">{{ tooltipPinned ? 'Close' : 'Keep open' }}</button>
                </div>
                <small class="tooltip-scroll-hint" [hidden]="!tooltipOverflows">Scroll to see more songs ↓</small>
                <div class="tooltip-list" [class.tooltip-list-overflow]="tooltipOverflows" tabindex="0" aria-label="Song list">
                    <div class="tooltip-list-content">
                        <div class="tooltip-pick" *ngFor="let song of tip.songs">
                            <div class="tooltip-song" [title]="song.title">{{ song.title }}</div>
                            <div class="tooltip-song tooltip-opponent" *ngIf="song.opponentTitle" [title]="song.opponentTitle">over {{ song.opponentTitle }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `,
    styles: [`
        .analysis { margin-bottom: 24px; padding-bottom: 16px; }
        .participant-analysis { margin-top: 28px; }
        .participant-analysis label { margin-inline-end: 8px; font-size: 13px; font-weight: 600; }
        .participant-analysis select { max-width: 100%; padding: 6px 10px; border: 1px solid #c8bfb0; border-radius: 4px; background: #fffdf8; color: #30312b; font: inherit; }
        h2 { margin-bottom: 8px; }
        p { color: #5d554b; font-size: 13px; }
        .chart { margin: 22px 0; padding: 14px; border: 1px solid #dcd4c7; border-radius: 8px; background: #fffdf8; }
        h3 { margin: 0 0 10px; font-size: 16px; }
        .chart-scroll { overflow-x: auto; }
        .vote-legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 12px; font-size: 12px; }
        .vote-legend span::before { content: ''; display: inline-block; width: 9px; height: 9px; margin-inline-end: 5px; border-radius: 2px; }
        .legend-for::before, .bar-for .bar { background: #a6d4ae; }
        .legend-against::before, .bar-against .bar { background: #e5a6a2; }
        .bar-cell + .bar-cell { margin-top: 3px; }
        table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; }
        th, td { padding: 7px 8px; border-bottom: 1px solid #eee7dd; text-align: left; }
        thead th { vertical-align: bottom; color: #5d554b; }
        th:first-child { position: sticky; left: 0; z-index: 1; background: #fffdf8; min-width: 96px; max-width: 190px; overflow-wrap: anywhere; }
        .bar-cell { position: relative; display: flex; align-items: center; min-width: 44px; min-height: 22px; background: #f1ede5; border-radius: 3px; }
        .bar { position: absolute; inset-block: 0; inset-inline-start: 0; background: #dec3a7; border-radius: 3px; }
        .bar-cell[tabindex] { cursor: pointer; }
        .bar-cell[aria-pressed="true"] { outline: 2px solid #6f563f; outline-offset: 1px; }
        .tooltip-header { flex: none; display: flex; gap: 10px; align-items: center; justify-content: space-between; background: #30312b; padding-bottom: 5px; margin-bottom: 4px; color: #e6d6c6; font-weight: 600; }
        .tooltip-scroll-hint { display: block; flex: none; padding-bottom: 4px; color: #fff; font-size: 11px; font-weight: 700; }
        .tooltip-scroll-hint[hidden] { display: none; }
        .tooltip-header button { border: 1px solid #a79787; border-radius: 3px; padding: 1px 5px; color: #fff; background: transparent; cursor: pointer; }
        .songs-tooltip { position: fixed; z-index: 20; width: max-content; max-width: min(320px, calc(100vw - 16px)); padding: 8px 10px; border-radius: 5px; background: #30312b; color: #fff; font-size: 12px; line-height: 1.55; display: flex; flex-direction: column; }
        .tooltip-list { min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
        .tooltip-list-overflow { overflow-y: scroll; }
        @supports not selector(::-webkit-scrollbar) {
            .tooltip-list-overflow { scrollbar-color: #d5ad82 #4a4940; }
        }
        .tooltip-list-overflow::-webkit-scrollbar { width: 12px; }
        .tooltip-list-overflow::-webkit-scrollbar-track { background: #4a4940; }
        .tooltip-list-overflow::-webkit-scrollbar-thumb { background: #d5ad82; border: 2px solid #4a4940; border-radius: 8px; }
        .tooltip-song { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .tooltip-opponent { color: #e6d6c6; }
        .tooltip-pick:has(.tooltip-opponent):not(:last-child) { margin-bottom: 5px; }
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
export class BracketAnalysisComponent implements OnChanges, OnDestroy {
    constructor(private readonly changeDetector: ChangeDetectorRef) {}

    @Input() data: readonly AnalysisRound[] = [];
    @Input() partial = false;
    @Input() votes: readonly AnalysisVote[] = [];
    participants: Array<{userId: number; displayName: string}> = [];
    selectedUserId: number | null = null;
    participantCharts: AnalysisChart[] = [];
    participantColumns: AnalysisRound[] = [];
    rounds: AnalysisRound[] = [];
    charts: AnalysisChart[] = [];

    tooltip: {songs: readonly TooltipSong[]; left: number; top: number; maxHeight: number; above: boolean} | null = null;

    tooltipPinned = false;
    tooltipAnchor: HTMLElement | null = null;
    private tooltipCloseTimer?: ReturnType<typeof setTimeout>;

    scheduleTooltipClose(): void {
        if (this.tooltipPinned) return;
        this.cancelTooltipClose();
        this.tooltipCloseTimer = setTimeout(() => {
            this.hideTooltip();
            this.changeDetector.markForCheck();
        }, 450);
    }

    cancelTooltipClose(): void {
        clearTimeout(this.tooltipCloseTimer);
        this.tooltipCloseTimer = undefined;
    }

    tooltipOverflows = false;
    private tooltipObserver?: ResizeObserver;

    @ViewChild('songsTooltip')
    set renderedTooltip(ref: ElementRef<HTMLElement> | undefined) {
        this.tooltipObserver?.disconnect();
        const panel = ref?.nativeElement;
        const list = panel?.querySelector<HTMLElement>('.tooltip-list');
        const content = panel?.querySelector<HTMLElement>('.tooltip-list-content');
        const hint = panel?.querySelector<HTMLElement>('.tooltip-scroll-hint');
        if (!list || !content || !hint) return;

        this.tooltipObserver = new ResizeObserver(() => {
            if (!list.isConnected) return;
            const overflows = content.offsetHeight > list.clientHeight + hint.offsetHeight;
            if (overflows !== this.tooltipOverflows) {
                this.tooltipOverflows = overflows;
                this.changeDetector.markForCheck();
            }
        });
        this.tooltipObserver.observe(list);
        this.tooltipObserver.observe(content);
    }

    ngOnDestroy(): void {
        this.cancelTooltipClose();
        this.tooltipObserver?.disconnect();
    }

    showTooltip(event: Event, songs: readonly TooltipSong[]): void {
        if (this.tooltipPinned || !songs.length || !(event.currentTarget instanceof HTMLElement)) return;
        this.positionTooltip(event.currentTarget, songs, event instanceof MouseEvent ? event : undefined);
    }

    private positionTooltip(anchor: HTMLElement, songs: readonly TooltipSong[], pointer?: MouseEvent): void {
        this.cancelTooltipClose();
        this.tooltipAnchor = anchor;
        const bounds = anchor.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = document.documentElement.clientHeight;
        const width = Math.min(320, viewportWidth - 16);
        const x = pointer?.clientX ?? bounds.left;
        const y = pointer?.clientY ?? bounds.top;
        const bottom = pointer?.clientY ?? bounds.bottom;
        const height = songs.reduce((sum, song) => sum + (song.opponentTitle ? 43 : 19), 43);
        const above = y - 16 >= height || y >= viewportHeight / 2;
        const maxHeight = Math.max(0, above ? y - 16 : viewportHeight - bottom - 16);
        this.tooltip = {
            songs,
            left: Math.max(8, Math.min(x, viewportWidth - width - 8)),
            top: above ? y - 8 : bottom + 8,
            maxHeight,
            above
        };
    }

    toggleTooltipPin(event: Event, songs: readonly TooltipSong[]): void {
        if (!songs.length || !(event.currentTarget instanceof HTMLElement)) return;
        if (this.tooltipPinned && this.tooltipAnchor === event.currentTarget) {
            this.hideTooltip();
            return;
        }

        this.positionTooltip(event.currentTarget, songs);
        this.tooltipPinned = true;
    }

    keepTooltipOpen(): void {
        if (!this.tooltip || !this.tooltipAnchor) return;
        this.positionTooltip(this.tooltipAnchor, this.tooltip.songs);
        this.tooltipPinned = true;
    }

    @HostListener('window:scroll')
    dismissTooltipPreview(): void {
        if (!this.tooltipPinned) this.hideTooltip();
    }

    @HostListener('document:keydown.escape')
    closePinnedTooltip(): void {
        if (this.tooltipPinned) this.hideTooltip();
    }

    @HostListener('window:resize')
    hideTooltip(): void {
        this.cancelTooltipClose();
        this.tooltip = null;
        this.tooltipOverflows = false;
        this.tooltipPinned = false;
        this.tooltipAnchor = null;
    }

    trackChart(_index: number, chart: {title: string}): string { return chart.title; }

    selectParticipant(userId: number | null): void {
        if (this.selectedUserId !== userId) this.hideTooltip();
        this.selectedUserId = userId;
        const rounds = new Map<number, {name: string; songs: AnalysisSong[]; againstSongs: AnalysisSong[]}>();
        for (const vote of this.votes) {
            const round = rounds.get(vote.roundNumber) ?? {name: vote.roundName, songs: [], againstSongs: []};
            if (vote.userId === userId) {
                round.songs.push({...vote.song, opponentTitle: vote.opponent?.title});
                if (vote.opponent) round.againstSongs.push({...vote.opponent, opponentTitle: vote.song.title});
            }
            rounds.set(vote.roundNumber, round);
        }
        this.participantColumns = [...rounds.entries()].sort(([a], [b]) => a - b)
            .map(([, round]) => ({...round, slotCount: round.songs.length}));
        this.participantCharts = userId == null ? [] : this.makeCharts(this.participantColumns, 'Votes');
    }

    private makeCharts(rounds: readonly AnalysisRound[], title: string): AnalysisChart[] {
        const charts = [{title: title + ' by album', group: 'Album', rows: chartRows(rounds, 'album', 'Unknown album')}];
        if (rounds.some(round => [...round.songs, ...(round.againstSongs ?? [])].some(song => !!song.category?.trim()))) {
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
            ? this.selectedUserId : null;
        this.selectParticipant(selected);
    }
}
