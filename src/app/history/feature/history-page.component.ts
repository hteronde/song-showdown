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
  styles: [`
    .history-tournament{display:grid;gap:24px;overflow-x:auto;padding:4px 0 18px;align-items:start}.history-round{min-width:0}.history-round h3{height:34px;box-sizing:border-box;margin:0;font:600 13px 'DM Mono',monospace;letter-spacing:.08em;color:#9a674f;text-transform:uppercase}.history-round-games{display:grid;grid-template-rows:repeat(var(--history-row-count),minmax(180px,auto))}.history-match{position:relative;align-self:center;height:auto;min-height:140px;box-sizing:border-box;min-width:0;background:#fff;border:1px solid #e5e3db;border-radius:5px;padding:10px 12px;display:flex;flex-direction:column;justify-content:center;overflow-wrap:anywhere}.history-game-label{font:8px 'DM Mono',monospace;color:#aaa79c;letter-spacing:.07em;margin-bottom:6px}.history-team{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #f0eee8;font-size:11px;color:#77776e}.history-team>span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.history-team.game-winner{color:#30312b;font-weight:650}.history-team b{color:#66816a}.history-result{font:9px/1.4 'DM Mono',monospace;color:#66816a;margin-top:7px}.history-result.pending{color:#aaa79c}.history-round:not(:last-child) .history-match:after{content:'';position:absolute;left:100%;top:50%;width:12px;border-top:1px solid #cfcbbf}.history-round:not(:first-child) .history-match:before{content:'';position:absolute;right:100%;top:calc(50% - var(--feeder-offset));width:12px;height:calc(2 * var(--feeder-offset));border-left:1px solid #cfcbbf;background:linear-gradient(#cfcbbf,#cfcbbf) left center/100% 1px no-repeat;pointer-events:none}.history-match.finale-ready{cursor:pointer;outline:1px solid #b2c2ae;outline-offset:1px}.history-match.finale-ready:hover,.history-match.finale-selected{box-shadow:0 0 0 2px #88a188}.history-match.admin-editable{cursor:pointer}.history-match.admin-editable:hover{border-color:#b2c2ae}.history-match:focus-visible{outline:2px solid #66816a;outline-offset:2px}
    .history-match{cursor:pointer}.history-match:hover{border-color:#b2c2ae;box-shadow:0 0 0 1px #b2c2ae}.view-votes-hint{margin-top:8px;font:8px 'DM Mono',monospace;color:#9a674f}.history-votes-dialog{box-sizing:border-box;width:min(680px,calc(100vw - 32px));max-height:calc(100dvh - 40px);overflow-y:auto;padding:24px;border:1px solid #e5e3db;border-radius:6px;background:#fcfbf8;color:#30312b;box-shadow:0 20px 70px #24251e33}.history-votes-dialog::backdrop{background:#24251e80}.history-votes-dialog h2{font:600 22px 'Space Grotesk',sans-serif;margin:8px 0 16px}.history-votes-label{font:9px 'DM Mono',monospace;color:#9a674f}.history-vote-columns{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:18px}.history-vote-song{padding:16px;background:#fff;border:1px solid #e5e3db;border-radius:5px;overflow-wrap:anywhere}.history-vote-song h3{font:600 16px 'Space Grotesk',sans-serif;margin:0 0 8px}.history-vote-song ul{padding-left:18px;margin:10px 0 0}.history-vote-song li{font-size:13px;padding:5px 0}.history-vote-song p{font-size:12px;color:#77776e;margin:8px 0}.history-vote-song.history-vote-winner{border-color:#b2c2ae}.history-vote-tally{font:10px 'DM Mono',monospace;color:#66816a}.history-votes-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}.history-votes-actions button{padding:10px 14px;border:1px solid #d8d4c8;border-radius:4px;background:#fff;color:#30312b;font:11px 'DM Mono',monospace;cursor:pointer}.history-votes-actions button.primary{background:#30312b;color:#fff}.system-vote{color:#9a5538}.no-vote-history{font-size:13px;line-height:1.6;color:#77776e}@media(max-width:460px){.history-vote-columns{grid-template-columns:1fr}}
    .history-champion .champion-album-cover{width:72px;height:72px;object-fit:cover;border-radius:4px;margin-left:auto;flex:none;box-shadow:0 3px 10px #24251e22}.history-vote-album-cover{display:block;width:160px;max-width:100%;aspect-ratio:1;object-fit:cover;border-radius:4px;margin:0 auto 16px;box-shadow:0 3px 10px #24251e18}
    .unknown-voters{margin-top:18px;padding:16px;border:1px solid #e4d6c2;border-radius:5px;background:#f8f2e9}.unknown-voters h3{font:600 15px 'Space Grotesk',sans-serif;margin:0 0 8px;color:#785b3e}.unknown-voters p{font-size:12px;line-height:1.5;color:#8b705e;margin:8px 0 0}.unknown-voters ul{display:flex;flex-wrap:wrap;gap:7px;list-style:none;margin:10px 0 0;padding:0}.unknown-voters li{padding:5px 9px;border:1px solid #e4d6c2;background:#fffdf9;border-radius:4px;font-size:12px;color:#785b3e}
    .history-tournament.redrawn-rounds .history-match:before,.history-tournament.redrawn-rounds .history-match:after{display:none}
    .history-tournament{position:relative}.history-tournament .history-match:before,.history-tournament .history-match:after{display:none}.history-match{z-index:1}.bracket-connectors{position:absolute;top:0;left:0;z-index:0;pointer-events:none;overflow:visible}.bracket-connectors path{fill:none;stroke:#c7c2b5;stroke-width:1;vector-effect:non-scaling-stroke}
    .history-vote-song app-song-album-art{margin:0 auto 16px}
  `]
})
export class HistoryPageComponent implements OnInit {
  constructor(
    private readonly historyApi: HistoryApiService,
    private readonly authApi: AuthApiService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {}

  get hasRandomTies(): boolean { return this.historyRounds.some(round => round.matches.some(match => match.randomTiebreakerVoteEntryId != null)); }
  matchVotes(match: PastMatch, entryId: number): number {
    const reported=entryId===match.leftEntryId?match.reportedVoteCountA:match.reportedVoteCountB;
    const aggregate=entryId===match.leftEntryId?match.voteCountA:match.voteCountB;
    return reported ?? aggregate ?? match.ballots.filter(ballot => ballot.selectedEntryId === entryId).length;
  }
  matchTally(match: PastMatch): string {
    const left = this.matchVotes(match,match.leftEntryId), right = this.matchVotes(match,match.rightEntryId);
    return match.winnerEntryId === match.rightEntryId ? `${right}–${left} votes` : `${left}–${right} votes`;
  }

  firstVisibleRound = 1;
  get visibleRounds(): PastRound[] { return this.historyRounds.filter(round => round.roundNumber >= this.firstVisibleRound); }

  visibleRoundSpan(roundNumber: number): number { return 2 ** (roundNumber - (this.visibleRounds[0]?.roundNumber ?? 1)); }

  get connectorMatches(): PastMatch[] {return this.historyRounds.flatMap(round=>round.matches);}
  @ViewChild('historyVotesDialog') historyVotesDialog?: ElementRef<HTMLDialogElement>;
  voteHistoryMatch: PastMatch | null = null;
  canViewBallots=true;
  readonly failedAlbumCovers = new Set<string>();
  albumCoverFailed(url:string): void { this.failedAlbumCovers.add(url); }
  openHistoryVotes(match: PastMatch): void {
    this.voteHistoryMatch = match;
    this.historyVotesDialog?.nativeElement.showModal();
  }
  closeHistoryVotes(): void { this.historyVotesDialog?.nativeElement.close(); }
  votersFor(match: PastMatch,entryId: number): PastMatch['ballots'] { return match.ballots.filter(ballot=>ballot.selectedEntryId===entryId); }
  voterLabel(ballot: PastMatch['ballots'][number]): string {
    return ballot.displayName || this.bracketMembers.find(member=>member.userId===ballot.userId)?.displayName || 'Participant';
  }
  unknownVoters(match: PastMatch): BracketHistoryResponse['participants'] {
    const finaleRound=!!this.finaleOptions?.session && match.roundNumber>=this.finaleStartRound;
    const recorded=new Set(match.ballots.filter(ballot=>ballot.userId!==null).map(ballot=>ballot.userId));
    return this.bracketMembers.filter(person=>(finaleRound?person.finaleParticipant:person.nonFinaleParticipant)&&!recorded.has(person.userId));
  }
  editViewedVotes(match: PastMatch): void { this.closeHistoryVotes(); this.editHistoryMatch(match); }

  @ViewChild(AdminBallotEditorComponent) ballotEditor?: AdminBallotEditorComponent;
  ballotEditingRound=1;
  canEditHistoryBallots(match: PastMatch): boolean { return this.isAdmin && match.roundNumber>=this.ballotEditingRound-1 && match.roundNumber<=this.ballotEditingRound; }
  editHistoryMatch(match: PastMatch): void {
    if (!this.canEditHistoryBallots(match) || !this.selectedBracket) return;
    void this.ballotEditor?.open(this.selectedBracket.bracketId,match.matchupId);
  }
  async historyBallotsSaved(): Promise<void> { if (this.selectedBracket) await this.loadBracketDetails(this.selectedBracket.bracketId); }

  @Output() returnToBracket = new EventEmitter<void>();
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
      if (bracketId > 0) void this.loadBracketDetails(bracketId);
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
    } catch {
      this.isAdmin = false;
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  private async loadBrackets(): Promise<void> {
    this.historyLoading = true;
    this.historyError = '';
    try {
      const payload = await this.historyApi.getBrackets();
      this.historyBrackets = payload.brackets;
    } catch (error) {
      this.historyError = error instanceof TypeError
        ? 'The bracket database API is not running. Start it with npm run start:api after configuring .env.'
        : error instanceof Error ? error.message : 'Could not load bracket history.';
    } finally {
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
      if (this.selectedBracket?.bracketId !== payload.bracket.bracketId) {this.firstVisibleRound = 1;this.celebrateChampion = false;}
      this.celebrateChampion = this.celebrateChampion || (this.selectedBracket?.bracketId === payload.bracket.bracketId && this.selectedBracket?.status !== 'complete' && !!payload.champion);
      this.selectedBracket = payload.bracket;
      this.ballotEditingRound=payload.ballotEditingRound ?? 1;
      this.bracketSongs = payload.songs;
      this.bracketPlaylists = payload.playlists;
      this.bracketChampion = payload.champion;
      this.canViewBallots=payload.canViewBallots!==false;
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
          voteCountA:match.voteCountA,
          voteCountB:match.voteCountB,
          reportedVoteCountA:match.reportedVoteCountA,
          reportedVoteCountB:match.reportedVoteCountB,
          randomTiebreakerVoteEntryId: match.randomTiebreakerVoteEntryId,
          selectedEntryId: match.selectedEntryId,
          ballots: match.ballots,
          span: 2 ** (round.roundNumber - 1)
        }))
      }));
      this.isBracketDetailOpen = true;
      
    } catch (error) {
      this.historyError = error instanceof TypeError
        ? 'The bracket database API is not running. Start it with npm run start:api after configuring .env.'
        : error instanceof Error ? error.message : 'Could not load bracket history.';
    } finally {
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
    if (!this.isAdmin || !this.selectedBracket || !this.finaleParticipantIds.length) return;
    this.finaleSaving = true;
    try {
      await this.historyApi.updateFinaleParticipants(this.selectedBracket.bracketId, this.adminUserId, this.finaleParticipantIds, this.nonFinaleParticipantIds);
      this.editParticipantsOpen = false;
      this.finaleNotice = 'Finale participants updated. Existing ballots from retained participants are preserved.';
      await this.refreshSelectedBracket();
    } catch (error) { this.historyError = error instanceof Error ? error.message : 'Could not update finale participants.'; }
    finally { this.finaleSaving = false; }
  }

  get finaleSessionActive(): boolean { return this.finaleOptions?.session?.status === 'active'; }
  get finaleSessionPaused(): boolean { return this.finaleOptions?.session?.status === 'paused'; }
  matchupWeekLabel(match: PastMatch): string {
    const finaleRound = this.finaleOptions?.session?.startRoundNumber ?? this.selectedBracket?.finaleStartRound;
    return finaleRound != null && match.roundNumber >= finaleRound ? 'Finale Week' : `Week ${match.weekNumber}`;
  }

  get finaleStartRound(): number { return this.finaleOptions?.session?.startRoundNumber ?? 99; }

  canOpenMatch(roundNumber: number): boolean {
    if (!this.isAdmin || !this.finaleSessionActive || roundNumber < this.finaleStartRound || roundNumber < this.ballotEditingRound-1 || roundNumber > this.ballotEditingRound) return false;
    return this.historyRounds.filter(round => round.roundNumber >= this.finaleStartRound && round.roundNumber < roundNumber)
      .every(round => round.matches.every(match => !!match.winnerEntryId));
  }

  async beginFinale(): Promise<void> {
    if (!this.isAdmin || !this.selectedBracket) return;
    this.finaleSaving = true;
    try {
      await this.historyApi.startFinale(this.selectedBracket.bracketId, this.adminUserId, this.finaleRoundNumber, this.finaleParticipantIds);
      await this.refreshSelectedBracket();
      this.finaleSetupOpen = false;
      this.finaleNotice = 'Finale mode is ready. Select a matchup to enter the in-person ballots.';
    } catch (error) { this.historyError = error instanceof Error ? error.message : 'Could not start finale mode.'; }
    finally { this.finaleSaving = false; }
  }

  async exitFinale(): Promise<void> {
    if (!this.isAdmin || !this.selectedBracket) return;
    this.finaleSaving = true;
    try {
      await this.historyApi.setFinaleMode(this.selectedBracket.bracketId, this.adminUserId, 'exit');
        this.finaleNotice = 'Finale mode paused. Your recorded ballots and winners are saved.';
      await this.refreshSelectedBracket();
    } catch (error) { this.historyError = error instanceof Error ? error.message : 'Could not exit finale mode.'; }
    finally { this.finaleSaving = false; }
  }

  async resumeFinale(): Promise<void> {
    if (!this.isAdmin || !this.selectedBracket) return;
    this.finaleSaving = true;
    try {
      await this.historyApi.setFinaleMode(this.selectedBracket.bracketId, this.adminUserId, 'resume');
      this.finaleNotice = 'Finale mode resumed.';
      await this.refreshSelectedBracket();
    } catch (error) { this.historyError = error instanceof Error ? error.message : 'Could not resume finale mode.'; }
    finally { this.finaleSaving = false; }
  }

  private async refreshSelectedBracket(): Promise<void> {
    if (!this.selectedBracket) return;
    const bracket = this.selectedBracket;
    await this.loadBracketDetails(bracket.bracketId);
  }
}
