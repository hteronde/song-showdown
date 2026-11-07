import { AdminBallotsApiService } from '../data-access/admin-ballots-api.service';
import { AdminBallotEditorData, TieBreakSelection } from '../data-access/admin-ballots.model';
import { ApiError, isApiCancelled } from '../../shared/data-access/api-client';
import { SongAlbumArtComponent } from './song-album-art.component';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, ElementRef, EventEmitter, OnDestroy, Output, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector:'app-admin-ballot-editor', standalone:true, imports:[CommonModule,FormsModule,SongAlbumArtComponent],
  template:`
    <dialog #dialog class="admin-ballot-dialog" aria-labelledby="admin-ballot-title" (cancel)="cancel($event)">
      <span class="eyebrow">ADMIN · MATCHUP BALLOTS</span><h2 id="admin-ballot-title">Edit participant votes</h2>
      <p *ngIf="loading" role="status">Loading ballots…</p>
      <ng-container *ngIf="data as match">
        <p class="match-label">{{ match.inFinale ? 'Finale Week' : 'Week ' + match.weekNumber }} · MATCHUP {{ match.matchupNumber }}</p>
        <div class="songs"><section class="song-summary"><app-song-album-art [url]="match.songAAlbumCoverUrl" [title]="match.songATitle"></app-song-album-art><strong>{{ match.songATitle }}</strong><small *ngIf="match.songAAlbum || match.songAYear">{{ match.songAAlbum }}<ng-container *ngIf="match.songAAlbum && match.songAYear"> · </ng-container>{{ match.songAYear }}</small><div class="listen-links" *ngIf="match.songAYoutubeUrl || match.songASpotifyUrl"><span>LISTEN</span><a *ngIf="match.songAYoutubeUrl" [href]="match.songAYoutubeUrl" target="_blank" rel="noopener noreferrer" [attr.aria-label]="'Listen to ' + match.songATitle + ' on YouTube'">YouTube ↗</a><a *ngIf="match.songASpotifyUrl" [href]="match.songASpotifyUrl" target="_blank" rel="noopener noreferrer" [attr.aria-label]="'Listen to ' + match.songATitle + ' on Spotify'">Spotify ↗</a></div></section><span class="song-versus">vs.</span><section class="song-summary"><app-song-album-art [url]="match.songBAlbumCoverUrl" [title]="match.songBTitle"></app-song-album-art><strong>{{ match.songBTitle }}</strong><small *ngIf="match.songBAlbum || match.songBYear">{{ match.songBAlbum }}<ng-container *ngIf="match.songBAlbum && match.songBYear"> · </ng-container>{{ match.songBYear }}</small><div class="listen-links" *ngIf="match.songBYoutubeUrl || match.songBSpotifyUrl"><span>LISTEN</span><a *ngIf="match.songBYoutubeUrl" [href]="match.songBYoutubeUrl" target="_blank" rel="noopener noreferrer" [attr.aria-label]="'Listen to ' + match.songBTitle + ' on YouTube'">YouTube ↗</a><a *ngIf="match.songBSpotifyUrl" [href]="match.songBSpotifyUrl" target="_blank" rel="noopener noreferrer" [attr.aria-label]="'Listen to ' + match.songBTitle + ' on Spotify'">Spotify ↗</a></div></section></div>
        <div class="winner-reveal" *ngIf="revealing" role="status" aria-live="polite" aria-atomic="true">
          <span>{{ revealHeading }}</span>
          <span>Participant votes · {{ match.songATitle }}: {{ revealVotesA }} · {{ match.songBTitle }}: {{ revealVotesB }}</span>
          <strong *ngIf="revealedWinner">{{ revealedWinner }}</strong>
          <span *ngIf="revealedWinner">Final tally · {{ revealFinalTally }}</span>
          <span class="reveal-suspense" *ngIf="!revealedWinner" aria-hidden="true">✦</span>
        </div>
        <div class="buttons" *ngIf="revealing && revealedWinner">
          <button type="button" class="primary" [disabled]="saving" (click)="close()">Close</button>
          <button type="button" *ngIf="unresolvedTie" [disabled]="saving" (click)="openCurrentBallots()">Resolve tie</button>
        </div>
        <p class="help" *ngIf="!revealing">Correct a vote or add a missed vote. Click Save changes to record your selections.</p>
        <p class="message" *ngIf="!match.canEdit">{{ match.editRestriction }}</p>
        <form *ngIf="!revealing" (ngSubmit)="save()">
          <fieldset [disabled]="saving || !match.canEdit || confirmReset">
            <div class="person" *ngFor="let person of match.participants"><span [id]="'voter-label-' + person.userId">{{ person.displayName }}</span>
              <select *ngIf="!match.inFinale" [attr.aria-labelledby]="'voter-label-' + person.userId" [name]="'participant-' + person.userId" [(ngModel)]="picks[person.userId]">
                <option [ngValue]="null">No vote</option><option [ngValue]="match.songAEntryId">{{ match.songATitle }}</option><option [ngValue]="match.songBEntryId">{{ match.songBTitle }}</option>
              </select>
              <div class="vote-options" *ngIf="match.inFinale" role="radiogroup" [attr.aria-labelledby]="'voter-label-' + person.userId">
                <label><input type="radio" [name]="'participant-' + person.userId" [value]="match.songAEntryId" [(ngModel)]="picks[person.userId]" [attr.aria-label]="match.songATitle">{{ match.songATitle }}</label>
                <label><input type="radio" [name]="'participant-' + person.userId" [value]="match.songBEntryId" [(ngModel)]="picks[person.userId]" [attr.aria-label]="match.songBTitle">{{ match.songBTitle }}</label>
                <label><input type="radio" [name]="'participant-' + person.userId" [value]="null" [(ngModel)]="picks[person.userId]">No vote</label>
              </div>
            </div>
            <p *ngIf="!match.participants.length">No participants are assigned to this matchup.</p>
            <label class="tie-choice" *ngIf="match.inFinale || match.tiebreakerOption === 'admin_pick'">Resolve a tie (used only when votes are even)
              <select name="tie-choice" [(ngModel)]="tiePick"><option [ngValue]="null">{{ match.inFinale ? 'No tie break' : 'Choose a tiebreaker' }}</option><option value="admin_vote">Use the admin’s vote (one extra vote)</option><option *ngIf="match.inFinale" value="random">Random</option><option *ngIf="match.inFinale && match.seedingSize" value="seed">Seed (higher seed wins, #1 beats #2)</option><option *ngIf="match.inFinale && match.seedingSize" value="seed_low">Seed (lower seed wins, #2 beats #1)</option><option [ngValue]="match.songAEntryId">{{ match.songATitle }}</option><option [ngValue]="match.songBEntryId">{{ match.songBTitle }}</option></select>
            </label>
          </fieldset>
          <p class="error" *ngIf="error" role="alert">{{ error }}</p>
          <div class="reset-warning" *ngIf="confirmReset" role="alert"><strong>Reset affected later rounds?</strong><p>{{ resetMessage }}</p><p>This cannot be undone. The later participants will need to vote again.</p></div>
          <div class="buttons">
            <button type="submit" class="primary" [disabled]="loading || saving || !match.canEdit || (!hasChanges && tiePick === (match.tieBreakEntryId ?? null))">{{ saving ? 'Saving…' : confirmReset ? 'Save and reset affected rounds' : 'Save changes' }}</button>
            <button type="button" [disabled]="saving" (click)="close()">Cancel</button>
          </div>
        </form>
      </ng-container>
      <p class="error" *ngIf="!data && error" role="alert">{{ error }}</p>
      <button type="button" *ngIf="!data" (click)="close()">Close</button>
    </dialog>
  `,
  styles:[`
    .admin-ballot-dialog{box-sizing:border-box;width:min(680px,calc(100vw - 32px));max-height:calc(100dvh - 40px);overflow-y:auto;border:1px solid #e5e3db;border-radius:6px;background:#fcfbf8;color:#30312b;padding:24px;box-shadow:0 20px 70px #24251e33}.admin-ballot-dialog::backdrop{background:#24251e80}h2{font:600 23px 'Space Grotesk',sans-serif;margin:10px 0 18px}.match-label{font:9px 'DM Mono',monospace;color:#9a674f}.songs{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.songs span{color:#aaa79c;font-size:11px}.help,.message{font-size:12px;line-height:1.6;color:#77776e}fieldset{padding:0;border:0;min-width:0}.person{display:grid;grid-template-columns:minmax(100px,1fr) minmax(0,2fr);gap:12px;align-items:center;padding:12px 0;border-top:1px solid #e5e3db;font-size:13px}select{width:100%;padding:10px;border:1px solid #d9d6cb;border-radius:4px;background:#fff;color:#30312b;font:12px 'DM Sans',sans-serif}.tie-choice{display:flex;flex-direction:column;gap:8px;margin:18px 0;font-size:12px}.buttons{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}button{border:1px solid #d9d6cb;background:#fff;border-radius:4px;padding:10px 14px;cursor:pointer;font:11px 'DM Mono',monospace}button.primary{background:#30312b;color:#fff;border-color:#30312b}button:disabled{opacity:.5;cursor:default}.error,.reset-warning{padding:12px;background:#fff0ed;border:1px solid #efc7be;border-radius:4px;color:#9f3324;font-size:12px;line-height:1.6}.reset-warning p{margin:8px 0 0}@media(max-width:420px){.person{grid-template-columns:1fr}}
    .songs{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:12px;margin:16px 0 22px;align-items:start}.song-summary{min-width:0;text-align:center;overflow-wrap:anywhere}.song-summary app-song-album-art{--album-art-size:140px;margin:0 auto 12px}.song-summary strong{display:block;font:600 15px 'Space Grotesk',sans-serif}.song-summary small{display:block;margin-top:5px;color:#77776e;font-size:11px}.songs .song-versus{align-self:center}
    .winner-reveal{margin:22px 0 8px;padding:28px 20px;min-height:110px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;background:#334a43;border:1px solid #bdad83;border-radius:6px;color:#f8f3e9}.winner-reveal>span:first-child{font:500 21px 'Space Grotesk',sans-serif}.winner-reveal strong{font:700 30px 'Space Grotesk',sans-serif;overflow-wrap:anywhere;color:#f4d69a}.reveal-suspense{font-size:28px;color:#f4d69a;animation:reveal-pulse 1s ease-in-out infinite}@keyframes reveal-pulse{50%{opacity:.25;transform:scale(.8)}}@media(prefers-reduced-motion:reduce){.reveal-suspense{animation:none}}
    .vote-options{display:flex;gap:10px;flex-wrap:wrap}.vote-options label{display:flex;align-items:center;gap:5px;padding:8px 9px;border:1px solid #d9d6cb;border-radius:4px;background:#fff;cursor:pointer;font-size:12px}.vote-options label:has(input:checked){border-color:#66816a;background:#edf2ec}.vote-options input{margin:0;accent-color:#334a43}.song-summary .song-letter{font:10px 'DM Mono',monospace;color:#9a674f;margin:0 0 6px}
    .song-summary .listen-links{font-size:9px;height:auto;min-height:26px;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:7px}
  `]
})
export class AdminBallotEditorComponent implements OnDestroy {
  constructor(private readonly changeDetector:ChangeDetectorRef, private readonly ballotsApi:AdminBallotsApiService) {}
  @ViewChild('dialog') dialog?:ElementRef<HTMLDialogElement>;
  @Output() saved=new EventEmitter<number>();
  data:AdminBallotEditorData|null=null;
  picks:Record<number,number|null>={};
  loading=false; saving=false; error=''; confirmReset=false; resetMessage='';
  tiePick:TieBreakSelection=null;
  revealing=false;
  revealedWinner='';
  unresolvedTie=false;
  revealHeading='';
  revealVotesA=0;
  revealVotesB=0;
  revealFinalTally='';
  private bracketId=0;
  private requestVersion=0;
  private requestController?: AbortController;
  get hasChanges():boolean { return this.data?.participants.some(p=>this.picks[p.userId]!==p.selectedEntryId)??false; }
  async open(bracketId:number,matchupId:number):Promise<void> {
    const requestVersion=++this.requestVersion;
    this.requestController?.abort();
    this.requestController=new AbortController();
    this.revealing=false;this.revealedWinner='';this.unresolvedTie=false;
    this.bracketId=bracketId;this.data=null;this.picks={};this.error='';this.confirmReset=false;this.tiePick=null;this.loading=true;
    if (!this.dialog?.nativeElement.open) this.dialog?.nativeElement.showModal();
    try {
      const payload=await this.ballotsApi.get(bracketId,matchupId,this.requestController.signal);
      if(requestVersion !== this.requestVersion) return;
      this.data=payload;
      this.tiePick=payload.inFinale
        ? payload.tiebreakerOption === 'admin_pick' ? 'admin_vote' : payload.tiebreakerOption
        : payload.tieBreakEntryId??null;
      for(const person of payload.participants) this.picks[person.userId]=person.selectedEntryId;
    } catch(error) {if(requestVersion === this.requestVersion && !isApiCancelled(error)) this.error=error instanceof Error?error.message:'Could not load ballots.';}
    finally {if(requestVersion === this.requestVersion) {this.loading=false;this.changeDetector.markForCheck();}}
  }
  ngOnDestroy():void {++this.requestVersion;this.requestController?.abort();}
  cancel(event: Event):void {if(this.saving) event.preventDefault(); else this.close();}
  close():void {if(!this.saving) {++this.requestVersion;this.requestController?.abort();this.dialog?.nativeElement.close();}}
  async openCurrentBallots():Promise<void> {
    if(this.data && !this.saving) await this.open(this.bracketId,this.data.matchupId);
  }
  async save():Promise<void> {
    if(!this.data||!this.data.canEdit||this.saving) return;
    this.saving=true;this.error='';
    try {
      const payload=await this.ballotsApi.save(this.bracketId,this.data.matchupId,{
        revision:this.data.revision,
        ballots:this.data.participants.filter(p=>this.picks[p.userId]!==p.selectedEntryId).map(p=>({userId:p.userId,selectedEntryId:this.picks[p.userId]})),
        tieBreakEntryId:this.tiePick,
        resetLaterRounds:this.confirmReset
      },this.requestController?.signal);
      const matchupId = this.data.matchupId;
      if (this.data.inFinale) {
        const version = this.requestVersion;
        const tied = payload.participantVotesA === payload.participantVotesB;
        this.revealVotesA = payload.participantVotesA;
        this.revealVotesB = payload.participantVotesB;
        this.revealHeading = tied
          ? payload.winnerEntryId == null ? 'We have a tie!'
            : this.tiePick === 'random' ? 'We have a tie! Resolving randomly. The winner is...'
            : 'We have a tie! Applying the tiebreaker. The winner is...'
          : 'The votes are in!';
        this.revealedWinner = '';
        this.revealFinalTally = '';
        this.revealing = true;
        if (tied) {
          this.changeDetector.detectChanges();
          await new Promise(resolve => setTimeout(resolve, 3000));
          if (version !== this.requestVersion) return;
        }
        this.revealedWinner = payload.winnerEntryId == null ? 'Tie — no winner yet'
          : `${payload.winnerEntryId === this.data.songAEntryId ? this.data.songATitle : this.data.songBTitle} wins!`;
        const winnerIsA = payload.winnerEntryId === this.data.songAEntryId;
        this.revealFinalTally = payload.winnerEntryId == null
          ? `${payload.voteCountA}–${payload.voteCountB}`
          : `${winnerIsA ? payload.voteCountA : payload.voteCountB}–${winnerIsA ? payload.voteCountB : payload.voteCountA}`;
        this.unresolvedTie = payload.winnerEntryId == null;
        this.changeDetector.detectChanges();
        this.saved.emit(matchupId);
        return;
      }
      this.dialog?.nativeElement.close();this.revealing=false;this.saved.emit(matchupId);
    } catch(error) {
      if(error instanceof ApiError && error.requiresReset) {this.confirmReset=true;this.resetMessage=error.message;}
      else if(!isApiCancelled(error)) this.error=error instanceof Error?error.message:'Could not save ballots.';
    }
    finally {this.saving=false;this.changeDetector.markForCheck();}
  }
}
