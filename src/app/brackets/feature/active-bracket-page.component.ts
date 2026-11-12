import { ApiError } from '../../shared/data-access/api-client';
import { BracketRequests, VoteDrafts } from '../state/voting-state';
import { BracketChampionComponent, BracketChampion } from '../ui/bracket-champion.component';
import { BracketConnectorsDirective } from '../ui/bracket-connectors.directive';
import { SongAlbumArtComponent } from '../ui/song-album-art.component';
import { AdminBallotEditorComponent } from '../ui/admin-ballot-editor.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthApiService } from '../../auth/data-access/auth-api.service';
import { AdvanceWeekPlan, ActiveBracketApiService, ActiveBracketVotingData, VotingMatchup, VotingWeek } from '../data-access/active-bracket-api.service';
interface RevealedRound {
    roundNumber: number;
    roundName: string;
    matchups: Array<{
        matchup: VotingMatchup;
        weekNumber: number;
        isUpcoming: boolean;
    }>;
}
@Component({
    selector: 'app-active-bracket-page', standalone: true, imports: [RouterLink, FormsModule, BracketChampionComponent, BracketConnectorsDirective, CommonModule, AdminBallotEditorComponent, SongAlbumArtComponent],
    templateUrl: './active-bracket-page.component.html',
    styleUrls: ['./active-bracket-page.component.css', '../ui/bracket-connectors.css']
})
export class ActiveBracketPageComponent implements OnInit, OnDestroy {
    constructor(private readonly route: ActivatedRoute, private readonly router: Router, private readonly api: ActiveBracketApiService, private readonly authApi: AuthApiService, private readonly changeDetector: ChangeDetectorRef) { }
    private readonly voteDrafts = new VoteDrafts();
    private readonly requests = new BracketRequests();
    data: ActiveBracketVotingData | null = null;
    get sessionPlaylists(): NonNullable<ActiveBracketVotingData['playlists']> {
        return (this.data?.playlists ?? []).filter(row => this.finaleModeActive || this.awaitingFinale ? this.data?.weeks.some(week => week.weekNumber === row.weekNumber && week.roundNumber >= (this.data?.bracket.finaleStartRound ?? 999)) : row.weekNumber === this.currentWeek?.weekNumber);
    }
    currentMemberId: number | null = null;
    isAdmin = false;
    loading = true;
    savingMatchupId: number | null = null;
    error = '';
    notice = '';
    @Output()
    toastMessage = new EventEmitter<string>();
    viewMode: 'vote' | 'bracket' = 'vote';
    get picks(): Record<number, number | null> { return this.voteDrafts.picks; }
    get comments(): Record<number, string> { return this.voteDrafts.comments; }
    trackRound(_index: number, round: RevealedRound): number { return round.roundNumber; }
    trackMatch(_index: number, item: RevealedRound['matchups'][number]): number { return item.matchup.matchupId; }
    get champion(): BracketChampion | null {
        const final = this.revealedRounds.at(-1)?.matchups[0]?.matchup;
        if (!final?.winnerEntryId)
            return null;
        return final.winnerEntryId === final.songA.entryId ? final.songA : final.songB;
    }
    get connectorMatches(): VotingMatchup[] { return (this.data?.weeks ?? []).flatMap(week => week.matchups); }
    emailSettingSaving = false;
    async setAutomaticEmailsDisabled(event:Event): Promise<void> {
        const checkbox=event.target as HTMLInputElement;
        const disabled=checkbox.checked;
        if (!this.data?.isCommissioner || this.emailSettingSaving) return;
        const data=this.data;
        this.emailSettingSaving=true;
        try {
            const result=await this.api.setAutomaticEmailsDisabled(data.bracket.bracketId,disabled);
            if(this.data?.bracket.bracketId===data.bracket.bracketId) {
                this.data.bracket.automaticEmailsDisabled=result.automaticEmailsDisabled;
                this.notice=disabled ? 'Automatic session emails disabled.' : 'Automatic session emails enabled for future events.';
            }
        } catch(error) { this.error=error instanceof Error ? error.message : 'Could not save email settings.'; }
        finally {checkbox.checked=!!this.data?.bracket.automaticEmailsDisabled;this.emailSettingSaving=false;this.changeDetector.markForCheck();}
    }
    @ViewChild('writeEmailDialog') writeEmailDialog?: ElementRef<HTMLDialogElement>;
    emailSubject = '';
    emailBody = '';
    emailSending = false;
    emailAttempted = false;
    emailSent = false;
    emailFeedback = '';
    private emailBracketId = 0;
    private emailRequestId = '';
    openWriteEmail(): void {
        if (!this.isAdmin || !this.data || this.emailSending) return;
        this.emailBracketId = this.data.bracket.bracketId;
        this.emailSubject = ''; this.emailBody = ''; this.emailFeedback = '';
        this.emailAttempted = false; this.emailSent = false;
        this.emailRequestId = crypto.randomUUID();
        this.writeEmailDialog?.nativeElement.showModal();
    }
    closeWriteEmail(): void {
        if (!this.emailSending) this.writeEmailDialog?.nativeElement.close();
    }
    async sendBracketEmail(): Promise<void> {
        if (!this.isAdmin || this.emailSending || this.emailSent || !this.emailSubject.trim() || !this.emailBody.trim()) return;
        this.emailSending = true; this.emailAttempted = true; this.emailFeedback = '';
        try {
            const result = await this.api.sendEmail(this.emailBracketId, this.emailSubject, this.emailBody, this.emailRequestId);
            this.emailSent = result.failed === 0;
            this.emailFeedback = result.failed
                ? `${result.sent} emails accepted for delivery; ${result.failed} failed. You can retry this message.`
                : `${result.sent} emails accepted for delivery.`;
            if (this.emailSent) {
                this.writeEmailDialog?.nativeElement.close();
                this.notice = this.emailFeedback;
                this.toastMessage.emit(this.emailFeedback);
            }
        } catch (error) {
            this.emailFeedback = error instanceof Error ? error.message : 'Could not send the email.';
        } finally {
            this.emailSending = false;
            this.changeDetector.markForCheck();
        }
    }
    @ViewChild('matchupDetailsDialog')
    matchupDetailsDialog?: ElementRef<HTMLDialogElement>;
    detailsMatch: VotingMatchup | null = null;
    detailsWeek: VotingWeek | null = null;
    openMatchupDetails(match: VotingMatchup): void {
        this.detailsMatch = match;
        this.detailsWeek = this.data?.weeks.find(week => week.matchups.some(item => item.matchupId === match.matchupId)) ?? null;
        this.matchupDetailsDialog?.nativeElement.showModal();
    }
    closeMatchupDetails(): void { this.matchupDetailsDialog?.nativeElement.close(); }
    get detailsResultsVisible(): boolean { return !!this.detailsWeek?.isClosed || this.detailsMatch?.winnerEntryId != null; }
    detailsVotes(match: VotingMatchup, side: 'A' | 'B'): number {
        return (side === 'A' ? match.voteCountA ?? match.reportedVoteCountA : match.voteCountB ?? match.reportedVoteCountB) ?? this.detailsVoters(match, side).length;
    }
    detailsVoters(match: VotingMatchup, side: 'A' | 'B'): VotingMatchup['ballots'] {
        return match.ballots.filter(ballot => ballot.selectedEntryId === (side === 'A' ? match.songA.entryId : match.songB.entryId));
    }
    editDetailsVotes(match: VotingMatchup): void {
        if (this.canEditBallots(match)) {
            this.closeMatchupDetails();
            this.openBallotEditor(match);
        }
    }
    private refreshMatchupDetails(): void {
        if (!this.detailsMatch)
            return;
        const week = this.data?.weeks.find(week => week.matchups.some(match => match.matchupId === this.detailsMatch?.matchupId));
        this.detailsWeek = week ?? null;
        this.detailsMatch = week?.matchups.find(match => match.matchupId === this.detailsMatch?.matchupId) ?? null;
    }
    @ViewChild(AdminBallotEditorComponent)
    ballotEditor?: AdminBallotEditorComponent;
    canEditBallots(match: VotingMatchup): boolean {
        const currentRound = this.data?.ballotEditingRound ?? 1;
        return this.isAdmin && match.roundNumber >= currentRound - 1 && match.roundNumber <= currentRound;
    }
    openBallotEditor(match: VotingMatchup): void {
        if (this.canEditBallots(match) && this.data)
            void this.ballotEditor?.open(this.data.bracket.bracketId, match.matchupId);
    }
    async ballotsSaved(matchupId: number): Promise<void> {
        delete this.picks[matchupId];
        await this.refresh();
        this.notice = 'Participant votes saved.';
        this.changeDetector.markForCheck();
    }
    @ViewChild('advanceWeekDialog')
    advanceWeekDialog?: ElementRef<HTMLDialogElement>;
    advancePlan: AdvanceWeekPlan | null = null;
    nextSessionEnd = '';
    nextSessionUntimed = false;
    advancing = false;
    advanceLoading = false;
    advanceError = '';
    get canAdvanceWeek(): boolean {
        return this.isAdmin && this.data?.bracket.status === 'active' && !this.paused && !this.finaleModeActive && !this.awaitingFinale && !!this.data?.weeks.some(week => week.opensAt && week.isReady && week.matchups.some(match => !match.winnerEntryId) && (this.data?.bracket.finaleStartRound == null || week.roundNumber < this.data.bracket.finaleStartRound));
    }
    async openAdvanceWeek(): Promise<void> {
        if (!this.canAdvanceWeek || !this.data)
            return;
        this.advanceLoading = true;
        this.advanceError = '';
        this.advancePlan = null;
        this.advanceWeekDialog?.nativeElement.showModal();
        try {
            this.advancePlan = await this.api.getAdvanceWeekPlan(this.data.bracket.bracketId);
            this.nextSessionUntimed = this.advancePlan.noTimer && !this.advancePlan.nextClosesAt;
            const end = this.advancePlan.nextClosesAt ? new Date(this.advancePlan.nextClosesAt) : new Date(Date.now() + 86400000);
            this.nextSessionEnd = new Date(end.getTime() - end.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
        }
        catch (error) {
            this.advanceError = error instanceof Error ? error.message : 'Could not load the next session.';
        }
        finally {
            this.advanceLoading = false;
            this.changeDetector.markForCheck();
        }
    }
    closeAdvanceWeek(): void {
        if (!this.advancing)
            this.advanceWeekDialog?.nativeElement.close();
    }
    async confirmAdvanceWeek(): Promise<void> {
        if (!this.advancePlan || !this.data || this.advancing)
            return;
        const end = this.advancePlan.nextWeekId != null && !this.nextSessionUntimed ? new Date(this.nextSessionEnd) : null;
        if (end && (!Number.isFinite(end.getTime()) || end <= new Date())) {
            this.advanceError = 'The next session must end in the future.';
            return;
        }
        this.advancing = true;
        this.advanceError = '';
        try {
            await this.api.advanceWeek(this.data.bracket.bracketId, this.advancePlan.weekId, end?.toISOString() ?? null);
            this.advanceWeekDialog?.nativeElement.close();
            await this.refresh();
            this.notice = 'Voting week advanced.';
        }
        catch (error) {
            this.advanceError = error instanceof Error ? error.message : 'Could not advance the week.';
        }
        finally {
            this.advancing = false;
            this.changeDetector.markForCheck();
        }
    }
    pauseSaving = false;
    private requestController = new AbortController();
    private refreshTimer?: ReturnType<typeof setInterval>;
    private routeSubscription?: {
        unsubscribe(): void;
    };
    get isComplete(): boolean { return this.data?.bracket.status === 'complete'; }
    get awaitingFinale(): boolean { return this.data?.awaitingFinale ?? false; }
    get paused(): boolean { return !!this.data?.bracket.pausedAt; }
    get frozenTimeRemaining(): string {
        const closes = this.currentWeek?.closesAt;
        const pause = this.data?.bracket.pausedAt;
        if (!closes || !pause)
            return 'Timer on hold';
        const seconds = Math.max(0, Math.ceil((new Date(closes).getTime() - new Date(pause).getTime()) / 1000));
        return `${Math.floor(seconds / 60)}m ${seconds % 60}s remaining`;
    }
    async togglePaused(): Promise<void> {
        if (!this.isAdmin || !this.data || this.pauseSaving)
            return;
        this.pauseSaving = true;
        this.error = '';
        try {
            await this.api.setPaused(this.data.bracket.bracketId, !this.paused);
            await this.refresh();
        }
        catch (error) {
            this.error = error instanceof Error ? error.message : 'Could not change hold status.';
        }
        finally {
            this.pauseSaving = false;
            this.changeDetector.markForCheck();
        }
    }
    private async refresh(): Promise<void> {
        if (!this.requests.bracketId || this.loading || this.requests.pollingVersion === this.requests.version)
            return;
        const bracketId = this.requests.bracketId;
        const version = this.requests.version;
        this.requests.pollingVersion = version;
        try {
            const data = await this.api.getVotingPage(bracketId, this.requestController.signal);
            if (!this.requests.isCurrent(version, bracketId))
                return;
            if ((data.awaitingFinale && !this.data?.awaitingFinale) || (data.bracket.status === 'complete' && !this.isComplete))
                this.firstVisibleRound = 1;
            this.data = data;
            this.isAdmin = !!data.canManage;
            for (const week of data.weeks)
                for (const match of week.matchups) {
                    if (this.savingMatchupId !== match.matchupId)
                        this.clearSavedOverrides(match);
                }
            this.refreshMatchupDetails();
            if (!this.hasOnlineVoting && this.viewMode === 'vote')
                this.viewMode = 'bracket';
        }
        catch (error) {
            if (this.requests.isCurrent(version, bracketId)) {
                if (error instanceof ApiError && [401,403,404].includes(error.status ?? 0)) {
                    this.data = null;
                    this.voteDrafts.clear();
                    this.closeMatchupDetails();
                    this.error = 'This bracket is no longer available to your account.';
                }
                throw error;
            }
        }
        finally {
            if (this.requests.pollingVersion === version)
                this.requests.pollingVersion = null;
            if (this.requests.isCurrent(version, bracketId))
                this.changeDetector.markForCheck();
        }
    }
    ngOnDestroy(): void {
        clearInterval(this.refreshTimer);
        this.routeSubscription?.unsubscribe();
        this.requests.invalidate();
        this.requestController.abort();
    }
    get currentWeek(): VotingWeek | null {
        return this.data?.weeks.find(week => week.isCurrent) ?? null;
    }
    get hasOnlineVoting(): boolean {
        return !this.isComplete && !this.finaleModeActive && !this.awaitingFinale
            && this.data?.canParticipateOnline === true && !!this.currentWeek?.isReady
            && this.currentWeek.matchups.some(match => match.winnerEntryId == null);
    }
    get savedPicks(): number {
        return this.currentWeek?.matchups.filter(match => match.selectedEntryId != null).length ?? 0;
    }
    get finaleModeActive(): boolean {
        return this.data?.finaleModeActive ?? false;
    }
    async enterFinaleMode(): Promise<void> {
        if (!this.isAdmin || !this.data)
            return;
        await this.router.navigate(['/history', this.data.bracket.bracketId], this.finaleModeActive ? {} : { queryParams: { finale: 'setup' } });
    }
    matchupWeekLabel(roundNumber: number, weekNumber: number | undefined): string {
        const finaleRound = this.data?.bracket.finaleStartRound;
        return finaleRound != null && roundNumber >= finaleRound ? 'Finale Week' : `Week ${weekNumber ?? ''}`;
    }
    firstVisibleRound = 1;
    get visibleRounds(): RevealedRound[] { return this.revealedRounds.filter(round => round.roundNumber >= this.firstVisibleRound); }
    bracketRoundSpan(roundNumber: number): number { return 2 ** (roundNumber - (this.visibleRounds[0]?.roundNumber ?? 1)); }
    get revealedRounds(): RevealedRound[] {
        const rounds = new Map<number, RevealedRound>();
        for (const week of this.data?.weeks ?? []) {
            let round = rounds.get(week.roundNumber);
            if (!round) {
                round = { roundNumber: week.roundNumber, roundName: week.roundName, matchups: [] };
                rounds.set(week.roundNumber, round);
            }
            for (const matchup of week.matchups)
                round.matchups.push({ matchup, weekNumber: week.weekNumber, isUpcoming: week.isUpcoming });
        }
        return [...rounds.values()].sort((a, b) => a.roundNumber - b.roundNumber);
    }
    ngOnInit(): void {
        this.refreshTimer = setInterval(() => {
            if (!this.loading)
                void this.refresh().catch(() => { });
        }, 5000);
        this.routeSubscription = this.route.paramMap.subscribe(params => {
            const bracketId = Number(params.get('bracketId'));
            if (bracketId > 0)
                void this.load(bracketId);
        });
    }
    readonly failedCoverUrls = new Set<string>();
    coverFailed(url: string): void { this.failedCoverUrls.add(url); }
    private clearSavedOverrides(match: VotingMatchup): void { this.voteDrafts.clearSaved(match); }
    songPick(match: VotingMatchup): number | null { return this.voteDrafts.selection(match); }
    pick(match: VotingMatchup, entryId: number | null): void {
        if (this.isComplete || this.finaleModeActive || this.awaitingFinale || this.paused || entryId === null)
            return;
        this.voteDrafts.select(match, entryId, this.savingMatchupId === match.matchupId);
        this.notice = '';
    }
    commentValue(match: VotingMatchup): string { return this.voteDrafts.comment(match); }
    updateComment(match: VotingMatchup, event: Event): void {
        if (this.isComplete || this.finaleModeActive || this.awaitingFinale || this.paused)
            return;
        const comment = (event.target as HTMLTextAreaElement).value;
        this.voteDrafts.editComment(match, comment, this.savingMatchupId === match.matchupId);
    }
    async saveVote(match: VotingMatchup): Promise<void> {
        if (this.isComplete || this.finaleModeActive || this.awaitingFinale || this.paused)
            return;
        const currentMatch = this.data?.weeks.flatMap(week => week.matchups).find(item => item.matchupId === match.matchupId) ?? match;
        const selectedEntryId = this.songPick(currentMatch);
        const comment = this.commentValue(currentMatch);
        const version = this.requests.version;
        const bracketId = this.requests.bracketId;
        if (!selectedEntryId || !this.currentMemberId) {
            this.error = 'Choose a song before saving your vote.';
            return;
        }
        this.savingMatchupId = match.matchupId;
        this.error = '';
        this.notice = '';
        try {
            await this.api.saveVote(match.matchupId, this.currentMemberId, selectedEntryId, comment);
            if (bracketId === null || !this.requests.isCurrent(version, bracketId))
                return;
            // Polling may have replaced the displayed matchup while the save was pending.
            const latestMatch = this.data?.weeks.flatMap(week => week.matchups).find(item => item.matchupId === match.matchupId);
            if (latestMatch) {
                latestMatch.selectedEntryId = selectedEntryId;
                latestMatch.comment = comment;
            }
            // Preserve any additional edits made while this submission was in flight.
            if (this.picks[match.matchupId] === selectedEntryId)
                delete this.picks[match.matchupId];
            if (this.comments[match.matchupId] === comment)
                delete this.comments[match.matchupId];
            this.toastMessage.emit('Your vote has been saved.');
        }
        catch (error) {
            if (bracketId !== null && this.requests.isCurrent(version, bracketId)) {
                const latestMatch = this.data?.weeks.flatMap(week => week.matchups).find(item => item.matchupId === match.matchupId);
                if (latestMatch)
                    this.clearSavedOverrides(latestMatch);
                this.error = error instanceof Error ? error.message : 'Could not save your vote.';
            }
        }
        finally {
            if (bracketId !== null && this.requests.isCurrent(version, bracketId)) {
                this.savingMatchupId = null;
                this.changeDetector.markForCheck();
            }
        }
    }
    songName(match: VotingMatchup, entryId: number | null): string {
        if (!entryId)
            return 'No winner recorded';
        if (match.songA.entryId === entryId)
            return match.songA.title;
        if (match.songB.entryId === entryId)
            return match.songB.title;
        return match.winnerTitle || 'Winner recorded';
    }
    resultTally(match: VotingMatchup): string {
        const votesForA = match.voteCountA ?? match.reportedVoteCountA ?? match.ballots.filter(ballot => ballot.selectedEntryId === match.songA.entryId).length;
        const votesForB = match.voteCountB ?? match.reportedVoteCountB ?? match.ballots.filter(ballot => ballot.selectedEntryId === match.songB.entryId).length;
        if (match.winnerEntryId === match.songA.entryId)
            return `${votesForA}–${votesForB} votes`;
        if (match.winnerEntryId === match.songB.entryId)
            return `${votesForB}–${votesForA} votes`;
        return `${votesForA}–${votesForB} votes`;
    }
    private async load(bracketId: number): Promise<void> {
        const version = this.requests.begin(bracketId);
        this.requestController.abort();
        this.requestController = new AbortController();
        this.loading = true;
        this.error = '';
        this.notice = '';
        this.savingMatchupId = null;
        this.data = null;
        this.currentMemberId = null;
        this.isAdmin = false;
        this.detailsMatch = null;
        this.detailsWeek = null;
        this.closeMatchupDetails();
        this.voteDrafts.clear();
        try {
            const [data, user] = await Promise.all([this.api.getVotingPage(bracketId, this.requestController.signal), this.authApi.getCurrentUser(this.requestController.signal)]);
            if (!this.requests.isCurrent(version, bracketId))
                return;
            this.firstVisibleRound = 1;
            this.data = data;
            this.isAdmin = !!data.canManage;
            this.viewMode = this.hasOnlineVoting ? 'vote' : 'bracket';
            this.currentMemberId = user?.userId ?? null;
            this.isAdmin = !!data.canManage;
        }
        catch (error) {
            if (this.requests.isCurrent(version, bracketId))
                this.error = error instanceof Error ? error.message : 'Could not load this bracket.';
        }
        finally {
            if (this.requests.isCurrent(version, bracketId)) {
                this.loading = false;
                this.changeDetector.markForCheck();
            }
        }
    }
}
