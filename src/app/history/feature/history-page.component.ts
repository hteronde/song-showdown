import { BracketChampionComponent } from '../../brackets/ui/bracket-champion.component';
import { BracketConnectorsDirective } from '../../brackets/ui/bracket-connectors.directive';
import { SongAlbumArtComponent } from '../../brackets/ui/song-album-art.component';
import { AdminBallotEditorComponent } from '../../brackets/ui/admin-ballot-editor.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthApiService } from '../../auth/data-access/auth-api.service';
import { BracketHistoryInfo, BracketHistoryResponse, FinaleOptions, PastMatch, PastRound } from '../data-access/history.models';
import { HistoryApiService } from '../data-access/history-api.service';
@Component({
    selector: 'app-history-page',
    standalone: true,
    imports: [BracketChampionComponent, BracketConnectorsDirective, CommonModule, FormsModule, AdminBallotEditorComponent, SongAlbumArtComponent],
    templateUrl: './history-page.component.html',
    styleUrls: ['./history-page.component.css', '../../brackets/ui/bracket-connectors.css']
})
export class HistoryPageComponent implements OnInit {
    constructor(private readonly historyApi: HistoryApiService, private readonly authApi: AuthApiService, private readonly changeDetector: ChangeDetectorRef, private readonly route: ActivatedRoute, private readonly router: Router) { }
    get hasRandomTies(): boolean { return this.historyRounds.some(round => round.matches.some(match => match.randomTiebreakerVoteEntryId != null)); }
    matchVotes(match: PastMatch, entryId: number): number {
        const reported = entryId === match.leftEntryId ? match.reportedVoteCountA : match.reportedVoteCountB;
        const aggregate = entryId === match.leftEntryId ? match.voteCountA : match.voteCountB;
        return reported ?? aggregate ?? match.ballots.filter(ballot => ballot.selectedEntryId === entryId).length;
    }
    matchTally(match: PastMatch): string {
        const left = this.matchVotes(match, match.leftEntryId), right = this.matchVotes(match, match.rightEntryId);
        return match.winnerEntryId === match.rightEntryId ? `${right}–${left} votes` : `${left}–${right} votes`;
    }
    firstVisibleRound = 1;
    get visibleRounds(): PastRound[] { return this.historyRounds.filter(round => round.roundNumber >= this.firstVisibleRound); }
    visibleRoundSpan(roundNumber: number): number { return 2 ** (roundNumber - (this.visibleRounds[0]?.roundNumber ?? 1)); }
    get connectorMatches(): PastMatch[] { return this.historyRounds.flatMap(round => round.matches); }
    @ViewChild('historyVotesDialog')
    historyVotesDialog?: ElementRef<HTMLDialogElement>;
    voteHistoryMatch: PastMatch | null = null;
    canViewBallots = true;
    readonly failedAlbumCovers = new Set<string>();
    albumCoverFailed(url: string): void { this.failedAlbumCovers.add(url); }
    openHistoryVotes(match: PastMatch): void {
        this.voteHistoryMatch = match;
        this.historyVotesDialog?.nativeElement.showModal();
    }
    closeHistoryVotes(): void { this.historyVotesDialog?.nativeElement.close(); }
    votersFor(match: PastMatch, entryId: number): PastMatch['ballots'] { return match.ballots.filter(ballot => ballot.selectedEntryId === entryId); }
    voterLabel(ballot: PastMatch['ballots'][number]): string {
        return ballot.displayName || this.bracketMembers.find(member => member.userId === ballot.userId)?.displayName || 'Participant';
    }
    unknownVoters(match: PastMatch): BracketHistoryResponse['participants'] {
        const finaleRound = !!this.finaleOptions?.session && match.roundNumber >= this.finaleStartRound;
        const recorded = new Set(match.ballots.filter(ballot => ballot.userId !== null).map(ballot => ballot.userId));
        return this.bracketMembers.filter(person => (finaleRound ? person.finaleParticipant : person.nonFinaleParticipant) && !recorded.has(person.userId));
    }
    editViewedVotes(match: PastMatch): void { this.closeHistoryVotes(); this.editHistoryMatch(match); }
    @ViewChild(AdminBallotEditorComponent)
    ballotEditor?: AdminBallotEditorComponent;
    ballotEditingRound = 1;
    canEditHistoryBallots(match: PastMatch): boolean { return this.isAdmin && match.roundNumber >= this.ballotEditingRound - 1 && match.roundNumber <= this.ballotEditingRound; }
    editHistoryMatch(match: PastMatch): void {
        if (!this.canEditHistoryBallots(match) || !this.selectedBracket)
            return;
        void this.ballotEditor?.open(this.selectedBracket.bracketId, match.matchupId);
    }
    async historyBallotsSaved(): Promise<void> {
        if (this.selectedBracket)
            await this.loadBracketDetails(this.selectedBracket.bracketId);
    }
    @Output()
    returnToBracket = new EventEmitter<void>();
    isBracketDetailOpen = false;
    historyBrackets: BracketHistoryInfo[] = [];
    selectedBracket: BracketHistoryInfo | null = null;
    bracketSongs: string[] = [];
    bracketPlaylists: BracketHistoryResponse['playlists'] = [];
    bracketChampion: BracketHistoryResponse['champion'] = null;
    celebrateChampion = false;
    historyRounds: PastRound[] = [];
    historyLoading = true;
    historyError = '';
    isAdmin = false;
    finaleSetupOpen = false;
    editParticipantsOpen = false;
    finaleOptions: FinaleOptions | null = null;
    bracketMembers: BracketHistoryResponse['participants'] = [];
    finaleParticipants: BracketHistoryResponse['participants'] = [];
    finaleRoundNumber = 1;
    finaleParticipantIds: number[] = [];
    nonFinaleParticipantIds: number[] = [];
    finaleSaving = false;
    finaleNotice = '';
    readonly adminUserId = 1;
    private permissionsReady: Promise<void> = Promise.resolve();
    get matchupCount(): number {
        return this.historyRounds.reduce((count, round) => count + round.matches.length, 0);
    }
    ngOnInit(): void {
        this.permissionsReady = this.loadPermissions();
        void this.loadBrackets();
        this.route.queryParamMap.subscribe(params => {
            if (params.get('finale') === 'setup') {
                void this.permissionsReady.then(() => {
                    if (this.isAdmin) {
                        this.finaleSetupOpen = true;
                        this.changeDetector.markForCheck();
                    }
                });
            }
        });
        this.route.paramMap.subscribe(params => {
            const bracketId = Number(params.get('bracketId'));
            if (bracketId > 0)
                void this.loadBracketDetails(bracketId);
            else {
                this.isBracketDetailOpen = false;
                this.selectedBracket = null;
            }
        });
    }
    private async loadPermissions(): Promise<void> {
        try {
            const user = await this.authApi.getCurrentUser();
            this.isAdmin = user?.role === 'owner';
        }
        catch {
            this.isAdmin = false;
        }
        finally {
            this.changeDetector.markForCheck();
        }
    }
    private async loadBrackets(): Promise<void> {
        this.historyLoading = true;
        this.historyError = '';
        try {
            const payload = await this.historyApi.getBrackets();
            this.historyBrackets = payload.brackets;
        }
        catch (error) {
            this.historyError = error instanceof TypeError
                ? 'The bracket database API is not running. Start it with npm run start:api after configuring .env.'
                : error instanceof Error ? error.message : 'Could not load bracket history.';
        }
        finally {
            this.historyLoading = false;
            this.changeDetector.markForCheck();
        }
    }
    async openBracket(bracket: BracketHistoryInfo): Promise<void> {
        await this.router.navigate(bracket.status === 'active' ? ['/brackets', bracket.bracketId] : ['/history', bracket.bracketId]);
    }
    async showAllBrackets(): Promise<void> {
        await this.router.navigate(['/history']);
    }
    private async loadBracketDetails(bracketId: number): Promise<void> {
        this.historyLoading = true;
        this.historyError = '';
        try {
            await this.permissionsReady;
            const payload = await this.historyApi.getBracket(bracketId);
            if (!this.isAdmin && payload.bracket.status !== 'complete') {
                await this.router.navigate(['/brackets', bracketId]);
                return;
            }
            if (this.selectedBracket?.bracketId !== payload.bracket.bracketId) {
                this.firstVisibleRound = 1;
                this.celebrateChampion = false;
            }
            this.celebrateChampion = this.celebrateChampion || (this.selectedBracket?.bracketId === payload.bracket.bracketId && this.selectedBracket?.status !== 'complete' && !!payload.champion);
            this.selectedBracket = payload.bracket;
            this.ballotEditingRound = payload.ballotEditingRound ?? 1;
            this.bracketSongs = payload.songs;
            this.bracketPlaylists = payload.playlists;
            this.bracketChampion = payload.champion;
            this.canViewBallots = payload.canViewBallots !== false;
            this.finaleOptions = await this.historyApi.getFinaleOptions(bracketId);
            this.bracketMembers = payload.participants;
            this.finaleParticipants = payload.participants.filter(person => person.finaleParticipant);
            this.nonFinaleParticipantIds = payload.participants.filter(person => person.nonFinaleParticipant).map(person => person.userId);
            this.finaleRoundNumber = payload.finaleSession?.startRoundNumber ?? payload.bracket.finaleStartRound ?? Math.max(1, payload.rounds.length - 3);
            this.finaleParticipantIds = this.finaleOptions.session
                ? this.finaleParticipants.map(person => person.userId)
                : this.finaleOptions.participants.filter(user => user.selectedByDefault).map(user => user.userId);
            this.historyRounds = payload.rounds.map(round => ({
                roundNumber: round.roundNumber,
                name: round.name.toUpperCase(),
                matches: round.matchups.map(match => ({
                    matchupId: match.matchupId,
                    nextMatchupId: match.nextMatchupId,
                    roundNumber: round.roundNumber,
                    weekNumber: match.weekNumber,
                    matchupNumber: match.matchupNumber,
                    left: match.songA?.title ?? 'TBD',
                    leftAlbumCoverUrl: match.songA?.albumCoverUrl ?? null,
                    rightAlbumCoverUrl: match.songB?.albumCoverUrl ?? null,
                    right: match.songB?.title ?? 'TBD',
                    winner: match.winner?.title ?? '',
                    leftEntryId: match.songA?.entryId ?? 0,
                    rightEntryId: match.songB?.entryId ?? 0,
                    winnerEntryId: match.winnerEntryId,
                    voteCountA: match.voteCountA,
                    voteCountB: match.voteCountB,
                    reportedVoteCountA: match.reportedVoteCountA,
                    reportedVoteCountB: match.reportedVoteCountB,
                    randomTiebreakerVoteEntryId: match.randomTiebreakerVoteEntryId,
                    selectedEntryId: match.selectedEntryId,
                    ballots: match.ballots,
                    span: 2 ** (round.roundNumber - 1)
                }))
            }));
            this.isBracketDetailOpen = true;
        }
        catch (error) {
            this.historyError = error instanceof TypeError
                ? 'The bracket database API is not running. Start it with npm run start:api after configuring .env.'
                : error instanceof Error ? error.message : 'Could not load bracket history.';
        }
        finally {
            this.historyLoading = false;
            this.changeDetector.markForCheck();
        }
    }
    toggleParticipant(userId: number): void {
        this.finaleParticipantIds = this.finaleParticipantIds.includes(userId)
            ? this.finaleParticipantIds.filter(id => id !== userId) : [...this.finaleParticipantIds, userId];
    }
    openParticipantEditor(): void {
        this.finaleParticipantIds = this.finaleParticipants.map(person => person.userId);
        this.nonFinaleParticipantIds = this.bracketMembers.filter(person => person.nonFinaleParticipant).map(person => person.userId);
        this.editParticipantsOpen = true;
    }
    cancelParticipantEdits(): void {
        this.finaleParticipantIds = this.finaleParticipants.map(person => person.userId);
        this.nonFinaleParticipantIds = this.bracketMembers.filter(person => person.nonFinaleParticipant).map(person => person.userId);
        this.editParticipantsOpen = false;
    }
    toggleNonFinaleParticipant(userId: number): void {
        this.nonFinaleParticipantIds = this.nonFinaleParticipantIds.includes(userId)
            ? this.nonFinaleParticipantIds.filter(id => id !== userId) : [...this.nonFinaleParticipantIds, userId];
    }
    async saveParticipantEdits(): Promise<void> {
        if (!this.isAdmin || !this.selectedBracket || !this.finaleParticipantIds.length)
            return;
        this.finaleSaving = true;
        try {
            await this.historyApi.updateFinaleParticipants(this.selectedBracket.bracketId, this.adminUserId, this.finaleParticipantIds, this.nonFinaleParticipantIds);
            this.editParticipantsOpen = false;
            this.finaleNotice = 'Finale participants updated. Existing ballots from retained participants are preserved.';
            await this.refreshSelectedBracket();
        }
        catch (error) {
            this.historyError = error instanceof Error ? error.message : 'Could not update finale participants.';
        }
        finally {
            this.finaleSaving = false;
        }
    }
    get finaleSessionActive(): boolean { return this.finaleOptions?.session?.status === 'active'; }
    get finaleSessionPaused(): boolean { return this.finaleOptions?.session?.status === 'paused'; }
    matchupWeekLabel(match: PastMatch): string {
        const finaleRound = this.finaleOptions?.session?.startRoundNumber ?? this.selectedBracket?.finaleStartRound;
        return finaleRound != null && match.roundNumber >= finaleRound ? 'Finale Week' : `Week ${match.weekNumber}`;
    }
    get finaleStartRound(): number { return this.finaleOptions?.session?.startRoundNumber ?? 99; }
    canOpenMatch(roundNumber: number): boolean {
        if (!this.isAdmin || !this.finaleSessionActive || roundNumber < this.finaleStartRound || roundNumber < this.ballotEditingRound - 1 || roundNumber > this.ballotEditingRound)
            return false;
        return this.historyRounds.filter(round => round.roundNumber >= this.finaleStartRound && round.roundNumber < roundNumber)
            .every(round => round.matches.every(match => !!match.winnerEntryId));
    }
    async beginFinale(): Promise<void> {
        if (!this.isAdmin || !this.selectedBracket)
            return;
        this.finaleSaving = true;
        try {
            await this.historyApi.startFinale(this.selectedBracket.bracketId, this.adminUserId, this.finaleRoundNumber, this.finaleParticipantIds);
            await this.refreshSelectedBracket();
            this.finaleSetupOpen = false;
            this.finaleNotice = 'Finale mode is ready. Select a matchup to enter the in-person ballots.';
        }
        catch (error) {
            this.historyError = error instanceof Error ? error.message : 'Could not start finale mode.';
        }
        finally {
            this.finaleSaving = false;
        }
    }
    async exitFinale(): Promise<void> {
        if (!this.isAdmin || !this.selectedBracket)
            return;
        this.finaleSaving = true;
        try {
            await this.historyApi.setFinaleMode(this.selectedBracket.bracketId, this.adminUserId, 'exit');
            this.finaleNotice = 'Finale mode paused. Your recorded ballots and winners are saved.';
            await this.refreshSelectedBracket();
        }
        catch (error) {
            this.historyError = error instanceof Error ? error.message : 'Could not exit finale mode.';
        }
        finally {
            this.finaleSaving = false;
        }
    }
    async resumeFinale(): Promise<void> {
        if (!this.isAdmin || !this.selectedBracket)
            return;
        this.finaleSaving = true;
        try {
            await this.historyApi.setFinaleMode(this.selectedBracket.bracketId, this.adminUserId, 'resume');
            this.finaleNotice = 'Finale mode resumed.';
            await this.refreshSelectedBracket();
        }
        catch (error) {
            this.historyError = error instanceof Error ? error.message : 'Could not resume finale mode.';
        }
        finally {
            this.finaleSaving = false;
        }
    }
    private async refreshSelectedBracket(): Promise<void> {
        if (!this.selectedBracket)
            return;
        const bracket = this.selectedBracket;
        await this.loadBracketDetails(bracket.bracketId);
    }
}
