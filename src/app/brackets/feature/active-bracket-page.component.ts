import { BracketChampionComponent, BracketChampion } from '../ui/bracket-champion.component';
import { BracketConnectorsDirective } from '../ui/bracket-connectors.directive';
import { SongAlbumArtComponent } from '../ui/song-album-art.component';
import { AdminBallotEditorComponent } from '../ui/admin-ballot-editor.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthApiService } from '../../auth/data-access/auth-api.service';
import { AdvanceWeekPlan, ActiveBracketApiService, ActiveBracketVotingData, VotingMatchup, VotingWeek } from '../data-access/active-bracket-api.service';

interface RevealedRound {
  roundNumber: number;
  roundName: string;
  matchups: Array<{ matchup: VotingMatchup; weekNumber: number; isUpcoming: boolean }>;
}

@Component({
  selector: 'app-active-bracket-page', standalone: true, imports: [FormsModule, BracketChampionComponent, BracketConnectorsDirective, CommonModule, AdminBallotEditorComponent, SongAlbumArtComponent],
  templateUrl: './active-bracket-page.component.html',
  styles: [`
    .upcoming-bracket-message{max-width:700px;margin:64px auto;padding:32px;text-align:center}.upcoming-bracket-message h1{font-size:clamp(25px,4vw,38px);line-height:1.25}.upcoming-bracket-message p{font-size:16px;line-height:1.8;color:#77776e}.upcoming-bracket-message time{color:#354e45;font-weight:600}
    .next-session-end{display:flex;flex-direction:column;gap:8px;font-size:13px;margin:18px 0}.next-session-end input{padding:10px;border:1px solid #d9d6cb;border-radius:4px;background:white;color:#30312b;font:inherit}
    .listen-links a:focus-visible{outline:2px solid #b96c4b;outline-offset:3px;border-radius:2px}
    .album-tile img{width:100%;height:100%;object-fit:cover;position:absolute;inset:0;z-index:1}.album-tile:has(img):before{display:none}
    :host{display:block}.vote-actions{display:flex;justify-content:flex-end;margin-top:12px}.vote-actions button{border:0;border-radius:5px;background:#30312b;color:#fff;padding:10px 16px;font:600 11px 'DM Mono',monospace;letter-spacing:.04em;cursor:pointer}.vote-actions button:disabled{opacity:.45;cursor:default}.admin-finale-entry{display:flex;justify-content:flex-end;margin:-14px 0 24px}.admin-finale-entry button{border:1px solid #d8c3b4;background:#fffaf6;color:#9a5538;border-radius:5px;padding:8px 12px;font:600 10px 'DM Mono',monospace;letter-spacing:.04em;cursor:pointer}.week-section{margin:30px 0}.week-section h2{font:600 22px 'Space Grotesk',sans-serif;margin:5px 0 16px;color:#30312b}.song-choice{cursor:pointer}.song-choice:focus-visible{outline:2px solid #b96c4b;outline-offset:2px}.song-choice.picked{border-color:#b96c4b;background:#fbf5f1}.page-error{background:#fff0ed;border:1px solid #efc7be;color:#9f3324;padding:12px 15px;border-radius:5px;margin:16px 0}.page-success{background:#edf6ee;border:1px solid #c8dfc9;color:#315b3a;padding:12px 15px;border-radius:5px;margin:16px 0}.no-matchups{padding:24px;background:#f2f1eb;border:1px solid #e5e3db;color:#77776e;border-radius:5px}.week-label{font:8px 'DM Mono',monospace;letter-spacing:.1em;color:#b96c4b;text-transform:uppercase}.active-view-toggle{justify-content:flex-end;margin:12px 0 26px}.bracket-visibility-note{font-size:12px;color:#8b897f;margin:-8px 0 18px}.revealed-bracket{display:flex;align-items:flex-start;gap:18px;overflow-x:auto;padding:4px 0 18px}.revealed-round{flex:0 0 220px;display:flex;flex-direction:column;gap:12px}.revealed-round h3{font:600 13px 'DM Mono',monospace;letter-spacing:.08em;color:#9a674f;text-transform:uppercase;margin:0 0 2px}.revealed-game{background:#fff;border:1px solid #e5e3db;border-radius:5px;padding:10px 12px}.revealed-game-label{font:8px 'DM Mono',monospace;color:#aaa79c;letter-spacing:.07em;margin-bottom:6px}.revealed-team{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #f0eee8;font-size:11px;color:#77776e}.revealed-team:last-of-type{border-bottom:0}.revealed-winner{color:#30312b;font-weight:650}.revealed-winner b{color:#66816a}.revealed-result{font:9px 'DM Mono',monospace;color:#66816a;margin-top:7px}.revealed-result.pending{color:#aaa79c}
    .revealed-round-games{display:flex;flex-direction:column;gap:12px}.full-tournament-bracket{--connector-half-gap:12px;display:grid;grid-template-columns:repeat(var(--bracket-round-count),minmax(0,1fr));gap:calc(2 * var(--connector-half-gap));overflow-x:visible;width:100%}.full-tournament-bracket .revealed-round{min-width:0;gap:0}.full-tournament-bracket .revealed-round h3{font-size:clamp(9px,1vw,13px);overflow-wrap:anywhere;height:34px;box-sizing:border-box;margin:0;display:flex;align-items:flex-start}.full-tournament-bracket .revealed-round-games{display:grid;grid-template-rows:repeat(var(--bracket-row-count),minmax(180px,auto));gap:0}.full-tournament-bracket .revealed-game{min-width:0;width:100%;overflow-wrap:anywhere;height:auto;min-height:140px;box-sizing:border-box;align-self:center;position:relative;display:flex;flex-direction:column;justify-content:center}.full-tournament-bracket .revealed-team>span{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.full-tournament-bracket .revealed-result{line-height:1.4}.full-tournament-bracket .revealed-round:not(:last-child) .revealed-game:after{content:'';position:absolute;left:100%;top:50%;width:var(--connector-half-gap);border-top:1px solid #cfcbbf}.full-tournament-bracket .revealed-round:not(:first-child) .revealed-game:before{content:'';position:absolute;right:100%;top:calc(50% - var(--feeder-offset));width:var(--connector-half-gap);height:calc(2 * var(--feeder-offset));border-left:1px solid #cfcbbf;background:linear-gradient(#cfcbbf,#cfcbbf) left center/100% 1px no-repeat;pointer-events:none}
    .bracket-hold-banner{display:flex;align-items:center;gap:18px;background:#a62e28;color:#fff;border:1px solid #8e231f;border-radius:6px;padding:24px;margin:20px 0;box-shadow:0 3px 12px #a62e281a}.bracket-hold-banner strong{display:block;font:600 22px 'Space Grotesk',sans-serif;margin-bottom:7px}.bracket-hold-banner p{font-size:14px;line-height:1.6;margin:0;color:#fff}.hold-icon{flex:none;font-size:30px;font-weight:700}.song-choice.voting-disabled{cursor:default}.song-choice.voting-disabled:hover{border-color:#eceae3;background:#fbfaf7}.song-choice.voting-disabled.chosen:hover{background:#f7f1e9;border-color:#c9946f}.comment-field textarea:disabled{cursor:not-allowed}@media(max-width:460px){.bracket-hold-banner{padding:18px;gap:12px}.bracket-hold-banner strong{font-size:19px}}
    .revealed-game.admin-editable{cursor:pointer}.revealed-game.admin-editable:hover{border-color:#b2c2ae;box-shadow:0 0 0 1px #b2c2ae}.revealed-game.admin-editable:focus-visible{outline:2px solid #66816a;outline-offset:2px}.admin-ballot-entry{display:flex;justify-content:flex-end;margin:5px 0 10px}.admin-ballot-entry button{border:1px solid #d8c3b4;border-radius:4px;background:#fffaf6;color:#9a5538;padding:7px 10px;font:10px 'DM Mono',monospace;cursor:pointer}
    .finale-view-banner{padding:20px 24px;margin:20px 0;border:1px solid #d3decd;border-radius:6px;background:#edf3e9;color:#3d5744}.finale-view-banner strong{font:600 18px 'Space Grotesk',sans-serif}.finale-view-banner p{font-size:13px;line-height:1.6;margin:8px 0 0}
    .full-tournament-bracket.redrawn-rounds .revealed-game:before,.full-tournament-bracket.redrawn-rounds .revealed-game:after{display:none}
    .revealed-game{cursor:pointer}.revealed-game:hover{border-color:#b2c2ae}.revealed-game:focus-visible{outline:2px solid #66816a;outline-offset:2px}.admin-ballot-entry{gap:8px;flex-wrap:wrap}.matchup-details-dialog{box-sizing:border-box;width:min(680px,calc(100vw - 32px));max-height:calc(100dvh - 40px);overflow-y:auto;padding:24px;border:1px solid #e5e3db;border-radius:6px;background:#fcfbf8;color:#30312b;box-shadow:0 20px 70px #24251e33}.matchup-details-dialog::backdrop{background:#24251e80}.matchup-details-dialog h2{font:600 22px 'Space Grotesk',sans-serif;margin:8px 0 16px}.details-songs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:18px}.details-song{padding:16px;border:1px solid #e5e3db;border-radius:5px;background:#fff;overflow-wrap:anywhere}.details-song.winner{border-color:#b2c2ae}.details-song app-song-album-art{margin:0 auto 14px}.details-song h3{font:600 16px 'Space Grotesk',sans-serif;margin:0 0 8px}.details-song p,.details-note{font-size:12px;line-height:1.6;color:#77776e}.details-song ul{padding-left:18px;margin:10px 0 0}.details-song li{font-size:13px;padding:5px 0}.details-tally{font:10px 'DM Mono',monospace;color:#66816a}.details-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}.details-actions button{padding:10px 14px;border:1px solid #d8d4c8;border-radius:4px;background:#fff;color:#30312b;font:11px 'DM Mono',monospace;cursor:pointer}.details-actions button.primary{background:#30312b;color:#fff}@media(max-width:460px){.details-songs{grid-template-columns:1fr}}
    .details-song .listen-links{font-size:9px;height:auto;min-height:26px;gap:10px;flex-wrap:wrap;margin:4px 0 10px}
    .full-tournament-bracket{position:relative}.full-tournament-bracket .revealed-game:before,.full-tournament-bracket .revealed-game:after{display:none}.full-tournament-bracket .revealed-game{z-index:1}.bracket-connectors{position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;overflow:visible}.bracket-connectors path{fill:none;stroke:#c7c2b5;stroke-width:1;vector-effect:non-scaling-stroke}.bracket-connectors path.pending-draw{stroke-dasharray:4 3;stroke:#c7b8a8}
  `]
})
export class ActiveBracketPageComponent implements OnInit, OnDestroy {
  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly api: ActiveBracketApiService,
    private readonly authApi: AuthApiService,
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  data: ActiveBracketVotingData | null = null;
  get sessionPlaylists():NonNullable<ActiveBracketVotingData['playlists']> {
    return (this.data?.playlists??[]).filter(row=>this.finaleModeActive||this.awaitingFinale?this.data?.weeks.some(week=>week.weekNumber===row.weekNumber && week.roundNumber>=(this.data?.bracket.finaleStartRound??999)):row.weekNumber===this.currentWeek?.weekNumber);
  }

  currentMemberId: number | null = null;
  isAdmin = false;
  loading = true;
  savingMatchupId: number | null = null;
  error = '';
  notice = '';
  @Output() toastMessage = new EventEmitter<string>();
  viewMode: 'vote' | 'bracket' = 'vote';
  readonly picks: Record<number, number | null> = {};
  readonly comments: Record<number, string> = {};

  trackRound(_index:number,round:RevealedRound):number {return round.roundNumber;}
  trackMatch(_index:number,item:RevealedRound['matchups'][number]):number {return item.matchup.matchupId;}
  get champion(): BracketChampion | null {
    const final = this.revealedRounds.at(-1)?.matchups[0]?.matchup;
    if (!final?.winnerEntryId) return null;
    return final.winnerEntryId === final.songA.entryId ? final.songA : final.songB;
  }
  get connectorMatches(): VotingMatchup[] {return (this.data?.weeks ?? []).flatMap(week=>week.matchups);}
  @ViewChild('matchupDetailsDialog') matchupDetailsDialog?: ElementRef<HTMLDialogElement>;
  detailsMatch: VotingMatchup | null = null;
  detailsWeek: VotingWeek | null = null;
  openMatchupDetails(match: VotingMatchup): void {
    this.detailsMatch=match;
    this.detailsWeek=this.data?.weeks.find(week=>week.matchups.some(item=>item.matchupId===match.matchupId))??null;
    this.matchupDetailsDialog?.nativeElement.showModal();
  }
  closeMatchupDetails(): void {this.matchupDetailsDialog?.nativeElement.close();}
  get detailsResultsVisible():boolean {return !!this.detailsWeek?.isClosed || this.detailsMatch?.winnerEntryId!=null;}
  detailsVotes(match:VotingMatchup,side:'A'|'B'):number {
    return (side==='A'?match.voteCountA??match.reportedVoteCountA:match.voteCountB??match.reportedVoteCountB) ?? this.detailsVoters(match,side).length;
  }
  detailsVoters(match:VotingMatchup,side:'A'|'B'):VotingMatchup['ballots'] {
    return match.ballots.filter(ballot=>ballot.selectedEntryId===(side==='A'?match.songA.entryId:match.songB.entryId));
  }
  editDetailsVotes(match:VotingMatchup):void {if(this.canEditBallots(match)){this.closeMatchupDetails();this.openBallotEditor(match);}}
  private refreshMatchupDetails():void {
    if(!this.detailsMatch) return;
    const week=this.data?.weeks.find(week=>week.matchups.some(match=>match.matchupId===this.detailsMatch?.matchupId));
    this.detailsWeek=week??null;
    this.detailsMatch=week?.matchups.find(match=>match.matchupId===this.detailsMatch?.matchupId)??null;
  }

  @ViewChild(AdminBallotEditorComponent) ballotEditor?: AdminBallotEditorComponent;
  canEditBallots(match: VotingMatchup): boolean {
    const currentRound=this.data?.ballotEditingRound ?? 1;
    return this.isAdmin && match.roundNumber >= currentRound-1 && match.roundNumber <= currentRound;
  }
  openBallotEditor(match: VotingMatchup): void {
    if (this.canEditBallots(match) && this.data) void this.ballotEditor?.open(this.data.bracket.bracketId,match.matchupId);
  }
  async ballotsSaved(matchupId: number): Promise<void> {
    delete this.picks[matchupId];
    await this.refresh();
    this.notice = 'Participant votes saved.';
    this.changeDetector.markForCheck();
  }
  @ViewChild('advanceWeekDialog') advanceWeekDialog?:ElementRef<HTMLDialogElement>;
  advancePlan:AdvanceWeekPlan|null=null;
  nextSessionEnd='';
  nextSessionUntimed=false;
  advancing=false;advanceLoading=false;advanceError='';
  get canAdvanceWeek():boolean {
    return this.isAdmin && this.data?.bracket.status==='active' && !this.paused && !this.finaleModeActive && !this.awaitingFinale && !!this.data?.weeks.some(week=>week.opensAt && week.isReady && week.matchups.some(match=>!match.winnerEntryId) && (this.data?.bracket.finaleStartRound==null||week.roundNumber<this.data.bracket.finaleStartRound));
  }
  async openAdvanceWeek():Promise<void> {
    if(!this.canAdvanceWeek||!this.data)return;
    this.advanceLoading=true;this.advanceError='';this.advancePlan=null;this.advanceWeekDialog?.nativeElement.showModal();
    try {
      this.advancePlan=await this.api.getAdvanceWeekPlan(this.data.bracket.bracketId);
      this.nextSessionUntimed=this.advancePlan.noTimer && !this.advancePlan.nextClosesAt;
      const end=this.advancePlan.nextClosesAt?new Date(this.advancePlan.nextClosesAt):new Date(Date.now()+86400000);
      this.nextSessionEnd=new Date(end.getTime()-end.getTimezoneOffset()*60000).toISOString().slice(0,19);
    }catch(error){this.advanceError=error instanceof Error?error.message:'Could not load the next session.';}
    finally{this.advanceLoading=false;this.changeDetector.markForCheck();}
  }
  closeAdvanceWeek():void {if(!this.advancing)this.advanceWeekDialog?.nativeElement.close();}
  async confirmAdvanceWeek():Promise<void> {
    if(!this.advancePlan||!this.data||this.advancing)return;
    const end=this.advancePlan.nextWeekId!=null&&!this.nextSessionUntimed?new Date(this.nextSessionEnd):null;
    if(end && (!Number.isFinite(end.getTime())||end<=new Date())){this.advanceError='The next session must end in the future.';return;}
    this.advancing=true;this.advanceError='';
    try {
      await this.api.advanceWeek(this.data.bracket.bracketId,this.advancePlan.weekId,end?.toISOString()??null);
      this.advanceWeekDialog?.nativeElement.close();await this.refresh();this.notice='Voting week advanced.';
    }catch(error){this.advanceError=error instanceof Error?error.message:'Could not advance the week.';}
    finally{this.advancing=false;this.changeDetector.markForCheck();}
  }
  pauseSaving = false;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private refreshInFlight = false;
  private loadedBracketId: number | null = null;
  get isComplete(): boolean { return this.data?.bracket.status === 'complete'; }
  get awaitingFinale(): boolean {return this.data?.awaitingFinale??false;}
  get paused(): boolean { return !!this.data?.bracket.pausedAt; }
  get frozenTimeRemaining(): string {
    const closes = this.currentWeek?.closesAt;
    const pause = this.data?.bracket.pausedAt;
    if (!closes || !pause) return 'Timer on hold';
    const seconds = Math.max(0,Math.ceil((new Date(closes).getTime()-new Date(pause).getTime())/1000));
    return `${Math.floor(seconds/60)}m ${seconds%60}s remaining`;
  }
  async togglePaused(): Promise<void> {
    if (!this.isAdmin || !this.data || this.pauseSaving) return;
    this.pauseSaving = true; this.error = '';
    try {
      await this.api.setPaused(this.data.bracket.bracketId,!this.paused);
      await this.refresh();
    } catch (error) { this.error = error instanceof Error ? error.message : 'Could not change hold status.'; }
    finally { this.pauseSaving = false; this.changeDetector.markForCheck(); }
  }
  private async refresh(): Promise<void> {
    if (!this.loadedBracketId || this.refreshInFlight) return;
    const bracketId = this.loadedBracketId;
    this.refreshInFlight = true;
    try {
      const data = await this.api.getVotingPage(bracketId);
      if (this.loadedBracketId === bracketId) { if ((data.awaitingFinale && !this.data?.awaitingFinale) || (data.bracket.status === 'complete' && !this.isComplete)) this.firstVisibleRound = 1; this.data = data; this.refreshMatchupDetails();  if (!this.hasOnlineVoting && this.viewMode === 'vote') this.viewMode = 'bracket'; }
    } finally { this.refreshInFlight = false; this.changeDetector.markForCheck(); }
  }
  ngOnDestroy(): void { clearInterval(this.refreshTimer); this.loadedBracketId = null; }

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
    if (!this.isAdmin || !this.data) return;
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
      for (const matchup of week.matchups) round.matchups.push({ matchup, weekNumber: week.weekNumber, isUpcoming: week.isUpcoming });
    }
    return [...rounds.values()].sort((a, b) => a.roundNumber - b.roundNumber);
  }

  ngOnInit(): void {
    this.refreshTimer = setInterval(() => { if (!this.loading) void this.refresh().catch(() => {}); },5000);
    this.route.paramMap.subscribe(params => {
      const bracketId = Number(params.get('bracketId'));
      if (bracketId > 0) void this.load(bracketId);
    });
  }

  readonly failedCoverUrls = new Set<string>();
  coverFailed(url: string): void { this.failedCoverUrls.add(url); }

  songPick(match: VotingMatchup): number | null {
    return this.picks[match.matchupId] ?? match.selectedEntryId;
  }

  pick(match: VotingMatchup, entryId: number | null): void {
    if (this.isComplete || this.finaleModeActive || this.awaitingFinale || this.paused || entryId === null) return;
    this.picks[match.matchupId] = entryId;
    this.notice = '';
  }

  commentValue(match: VotingMatchup): string {
    return this.comments[match.matchupId] ?? match.comment ?? '';
  }

  updateComment(match: VotingMatchup, event: Event): void {
    if (this.isComplete || this.finaleModeActive || this.awaitingFinale || this.paused) return;
    this.comments[match.matchupId] = (event.target as HTMLTextAreaElement).value;
  }

  async saveVote(match: VotingMatchup): Promise<void> {
    if (this.isComplete || this.finaleModeActive || this.awaitingFinale || this.paused) return;
    const selectedEntryId = this.songPick(match);
    if (!selectedEntryId || !this.currentMemberId) {
      this.error = 'Choose a song before saving your vote.';
      return;
    }
    this.savingMatchupId = match.matchupId;
    this.error = '';
    this.notice = '';
    try {
      await this.api.saveVote(match.matchupId, this.currentMemberId, selectedEntryId, this.commentValue(match));
      match.selectedEntryId = selectedEntryId;
      match.comment = this.commentValue(match);
      delete this.picks[match.matchupId];
      delete this.comments[match.matchupId];
      this.toastMessage.emit('Your vote has been saved.');
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not save your vote.';
    } finally {
      this.savingMatchupId = null;
      this.changeDetector.markForCheck();
    }
  }

  songName(match: VotingMatchup, entryId: number | null): string {
    if (!entryId) return 'No winner recorded';
    if (match.songA.entryId === entryId) return match.songA.title;
    if (match.songB.entryId === entryId) return match.songB.title;
    return match.winnerTitle || 'Winner recorded';
  }

  resultTally(match: VotingMatchup): string {
    const votesForA = match.voteCountA ?? match.reportedVoteCountA ?? match.ballots.filter(ballot => ballot.selectedEntryId === match.songA.entryId).length;
    const votesForB = match.voteCountB ?? match.reportedVoteCountB ?? match.ballots.filter(ballot => ballot.selectedEntryId === match.songB.entryId).length;
    if (match.winnerEntryId === match.songA.entryId) return `${votesForA}–${votesForB} votes`;
    if (match.winnerEntryId === match.songB.entryId) return `${votesForB}–${votesForA} votes`;
    return `${votesForA}–${votesForB} votes`;
  }

  private async load(bracketId: number): Promise<void> {
    this.loadedBracketId = bracketId;
    this.loading = true;
    this.error = '';
    try {
      const [data, user] = await Promise.all([this.api.getVotingPage(bracketId), this.authApi.getCurrentUser()]);
      this.firstVisibleRound = 1;
      this.data = data;
      this.viewMode = this.hasOnlineVoting ? 'vote' : 'bracket';
      this.currentMemberId = user?.userId ?? null;
      this.isAdmin = user?.role === 'owner';
      for (const week of data.weeks) {
        for (const match of week.matchups) {
          if (match.selectedEntryId) this.picks[match.matchupId] = match.selectedEntryId;
          if (match.comment) this.comments[match.matchupId] = match.comment;
        }
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not load this bracket.';
    } finally {
      this.loading = false;
      this.changeDetector.markForCheck();
    }
  }
}
