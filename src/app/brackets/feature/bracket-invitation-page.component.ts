import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { apiRequest } from '../../shared/data-access/api-client';
import { ActiveBracketPageComponent } from './active-bracket-page.component';

interface Invitation {
  bracketId: number;
  title: string;
  artist: string;
  startAt: string | null;
  invitationStatus: 'pending' | 'accepted' | 'declined' | null;
  canAccess: boolean;
}

@Component({
  selector: 'app-bracket-invitation-page', standalone: true,
  imports: [CommonModule, ActiveBracketPageComponent],
  template: `
    <p *ngIf="loading" role="status">Loading your invitation…</p>
    <p *ngIf="error" role="alert">{{ error }}</p>
    <section class="invitation" *ngIf="invitation && !showBracket">
      <p class="eyebrow">SONG SHOWDOWN · BRACKET INVITATION</p>
      <h1>You're invited to {{ invitation.title }}</h1>
      <p><strong>Theme:</strong> {{ invitation.artist }}</p>
      <p><strong>Starts:</strong> {{ invitation.startAt | date:'fullDate' }} at {{ invitation.startAt | date:'shortTime' }} (your local time)</p>
      <ng-container *ngIf="invitation.invitationStatus === 'pending'">
        <p>Accept to join this bracket. Songs, matchups, and other bracket details stay hidden until you accept.</p>
        <div class="actions">
          <button type="button" [disabled]="saving" (click)="respond('accepted')">{{ saving ? 'Saving…' : 'Accept invitation' }}</button>
          <button type="button" class="secondary" [disabled]="saving" (click)="respond('declined')">Decline invitation</button>
        </div>
      </ng-container>
      <p *ngIf="invitation.invitationStatus === 'declined'">You declined this invitation. Contact your admin if you change your mind.</p>
      <button *ngIf="invitation.canAccess" class="secondary" type="button" (click)="showBracket=true">View bracket as admin</button>
    </section>
    <app-active-bracket-page *ngIf="showBracket" (toastMessage)="toastMessage.emit($event)"></app-active-bracket-page>
  `,
  styles: [`:host{display:block}.invitation{max-width:720px;margin:48px auto;padding:36px;background:#fffdf7;border:1px solid #deddd3;border-radius:16px}.eyebrow{font-size:12px;letter-spacing:2px}h1{font-size:32px;line-height:1.2}.actions{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}button{padding:12px 20px;border-radius:8px;background:#293f32;color:white;border:1px solid #293f32;cursor:pointer}.secondary{background:transparent;color:#293f32}button:disabled{opacity:.6;cursor:wait}`]
})
export class BracketInvitationPageComponent implements OnInit, OnDestroy {
  @Output() toastMessage = new EventEmitter<string>();
  invitation: Invitation | null = null;
  loading = true;
  saving = false;
  showBracket = false;
  error = '';
  private controller = new AbortController();
  private subscription?: { unsubscribe(): void };
  private version = 0;
  constructor(private route: ActivatedRoute, private changeDetector: ChangeDetectorRef) {}
  ngOnInit(): void {
    this.subscription = this.route.paramMap.subscribe(params => { void this.load(Number(params.get('bracketId'))); });
  }
  private async load(id: number): Promise<void> {
    const version = ++this.version;
    this.controller.abort(); this.controller = new AbortController();
    this.loading = true; this.error = ''; this.invitation = null; this.showBracket = false;
    try {
      const invitation = await apiRequest<Invitation>(`/api/brackets/${id}/invitation`, { signal: this.controller.signal });
      if(version !== this.version) return;
      this.invitation = invitation;
      this.showBracket = invitation.canAccess && invitation.invitationStatus !== 'pending' && invitation.invitationStatus !== 'declined';
    } catch(error) {
      if(version === this.version) this.error = error instanceof Error ? error.message : 'Could not load invitation.';
    } finally { if(version === this.version) { this.loading = false; this.changeDetector.markForCheck(); } }
  }
  async respond(response: 'accepted' | 'declined'): Promise<void> {
    if (!this.invitation || this.saving) return;
    const id = this.invitation.bracketId, version = this.version;
    this.saving = true; this.error = '';
    try {
      await apiRequest(`/api/brackets/${id}/invitation`, { method: 'POST', json: { response }, signal: this.controller.signal });
      if(version === this.version) await this.load(id);
    } catch(error) {
      if(version === this.version) this.error = error instanceof Error ? error.message : 'Could not save response.';
    } finally { this.saving = false; this.changeDetector.markForCheck(); }
  }
  ngOnDestroy(): void { this.version++; this.controller.abort(); this.subscription?.unsubscribe(); }
}
