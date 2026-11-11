import { apiSession } from './shared/data-access/api-client';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { BracketInvitationPageComponent } from './brackets/feature/bracket-invitation-page.component';
import { HomePageComponent } from './home/feature/home-page.component';
import { HistoryPageComponent } from './history/feature/history-page.component';
import type { BracketsPageComponent } from './brackets/feature/brackets-page.component';
import { FamilyMember } from './family-members/data-access/family-member.model';
import { AuthApiService, AuthUser } from './auth/data-access/auth-api.service';
import { UserBracketLink, UserBracketsApiService } from './brackets/data-access/user-brackets-api.service';

@Component({
  selector: 'ss-root',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterOutlet],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnDestroy {
  constructor(private readonly authApi: AuthApiService, private readonly changeDetector: ChangeDetectorRef, private readonly router: Router, private readonly userBracketsApi: UserBracketsApiService) {
    this.removeSessionListener = apiSession.onExpired(() => {
      this.clearSignedInState();
      this.setAuthMode('login');
      this.authError = 'Your session has expired. Please log in again.';
      this.authBusy = false;
      this.changeDetector.markForCheck();
    });
    void this.restoreSession();
  }

  currentMember: FamilyMember = { id: 'you', name: 'Family member', initials: 'FM', color: '#c47d51' };
  authUser: AuthUser | null = null;
  authState: 'checking' | 'signedOut' | 'signedIn' = 'checking';
  authMode: 'login' | 'forgot' | 'reset' = 'login';
  authNotice = '';
  resetToken = new URLSearchParams(window.location.hash.slice(1)).get('resetToken') || '';
  username = '';
  password = '';
  confirmPassword = '';
  authError = '';
  authBusy = false;
  userBrackets: UserBracketLink[] = [];
  get activeBrackets(): UserBracketLink[] { return this.userBrackets.filter(bracket => bracket.navigationStatus !== 'upcoming'); }
  get upcomingBrackets(): UserBracketLink[] { return this.userBrackets.filter(bracket => bracket.navigationStatus === 'upcoming').sort((a, b) => new Date(a.startAt!).getTime() - new Date(b.startAt!).getTime()); }
  inviteCopied = false;
  toast = '';
  private toastTimer?: ReturnType<typeof setTimeout>;
  private bracketLoadVersion = 0;
  private bracketRefreshTimer?: ReturnType<typeof setInterval>;
  private removeSessionListener?: () => void;
  private bracketsPage: Pick<BracketsPageComponent, 'showList'> | null = null;

  selectPage(page: 'home' | 'history' | 'familyMembers' | 'songs' | 'playlists' | 'brackets'): void {
    if (!this.isAdmin && ['familyMembers', 'songs', 'playlists', 'brackets'].includes(page)) return;
    const routes = { home: '/brackets', history: '/history', familyMembers: '/manage/family-members', songs: '/manage/songs', playlists: '/manage/playlists', brackets: '/manage/brackets' } as const;
    void this.router.navigateByUrl(routes[page]);
  }

  onRouteActivate(component: unknown): void {
    this.bracketsPage = component !== null && typeof component === 'object'
      && 'showList' in component && typeof component.showList === 'function'
      ? component as Pick<BracketsPageComponent, 'showList'> : null;
    if (component instanceof HomePageComponent) {
      component.currentMember = this.currentMember;
      component.toastMessage.subscribe(message => this.showToast(message));
    } else if (component instanceof BracketInvitationPageComponent) {
      component.toastMessage.subscribe(message => this.showToast(message));
    } else if (component instanceof HistoryPageComponent) {
      component.returnToBracket.subscribe(() => this.selectPage('home'));
    }
  }

  showBracketsList(): void {
    if (this.isAdmin) this.bracketsPage?.showList();
  }

  get activePage(): 'home' | 'history' | 'familyMembers' | 'songs' | 'playlists' | 'brackets' {
    const path = this.router.url.split('?')[0];
    if (path.startsWith('/history')) return 'history';
    if (path === '/manage/family-members' || path.startsWith('/manage/family-members/')) return 'familyMembers';
    if (path === '/manage/songs' || path.startsWith('/manage/songs/')) return 'songs';
    if (path === '/manage/playlists' || path.startsWith('/manage/playlists/')) return 'playlists';
    if (path === '/manage/brackets' || path.startsWith('/manage/brackets/')) return 'brackets';
    return 'home';
  }

  get activeBracketId(): number | null {
    const match = this.router.url.match(/^\/brackets\/(\d+)/);
    return match ? Number(match[1]) : null;
  }

  get pageTitle(): string {
    if (this.activeBracketId) return this.userBrackets.find(bracket => bracket.bracketId === this.activeBracketId)?.title ?? 'Bracket';
    return ({ home: 'Fleetwood Mac', history: 'History', familyMembers: 'Family members', songs: 'Songs', playlists: 'Playlists', brackets: 'Brackets' } as const)[this.activePage];
  }

  get isSignedIn(): boolean { return this.authState === 'signedIn' && this.authUser !== null; }
  get isAdmin(): boolean { return this.authUser?.role === 'owner'; }

  async submitAuth(): Promise<void> {
    if (this.authBusy) return;
    this.authError = '';
    this.authNotice = '';
    if (this.authMode === 'forgot' || this.authMode === 'reset') {
      if (this.authMode === 'reset' && (this.password.length < 12 || this.password !== this.confirmPassword)) {
        this.authError = 'Use at least 12 characters and make sure the passwords match.'; return;
      }
      this.authBusy = true;
      try {
        if (this.authMode === 'forgot') {
          if (!this.username.trim()) { this.authError = 'Enter your email address.'; return; }
          await this.authApi.requestPasswordReset(this.username);
          this.authNotice = 'If an account matches that email, a reset link has been sent. The link expires in 30 minutes.';
        } else {
          await this.authApi.resetPassword(this.resetToken, this.password);
          this.resetToken = '';
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          this.setAuthMode('login');
          this.authNotice = 'Your password has been reset. Log in with your new password.';
        }
      } catch (error) { this.authError = error instanceof Error ? error.message : 'Could not reset your password.'; }
      finally { this.authBusy = false; this.changeDetector.detectChanges(); }
      return;
    }
    if (!this.username.trim() || !this.password) {
      this.authError = 'Enter your email and password.';
      return;
    }
    this.authBusy = true;
    try {
      const user = await this.authApi.signIn(this.username, this.password);
      this.acceptLogin(user);
    } catch (error) {
      this.authError = error instanceof Error ? error.message : 'Could not sign in.';
    } finally { this.authBusy = false; this.changeDetector.detectChanges(); }
  }

  async logout(): Promise<void> {
    this.authBusy = true;
    try { await this.authApi.signOut(); }
    catch (error) { this.showToast(error instanceof Error ? error.message : 'Could not contact the login service.'); }
    finally {
      apiSession.end();
      this.clearSignedInState();
      void this.router.navigateByUrl('/brackets');
      this.authBusy = false;
      this.changeDetector.detectChanges();
    }
  }

  private clearSignedInState(): void {
    this.authUser = null;
    this.authState = 'signedOut';
    this.bracketLoadVersion++;
    if (this.bracketRefreshTimer) clearInterval(this.bracketRefreshTimer);
    this.bracketRefreshTimer = undefined;
    this.userBrackets = [];
    this.password = '';
    this.confirmPassword = '';
  }

  ngOnDestroy(): void {
    this.removeSessionListener?.();
    if (this.bracketRefreshTimer) clearInterval(this.bracketRefreshTimer);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    apiSession.end();
  }

  setAuthMode(mode: 'login' | 'forgot' | 'reset'): void {
    this.authMode = mode;
    this.authNotice = '';
    this.authError = '';
    this.password = '';
    this.confirmPassword = '';
  }

  private async restoreSession(): Promise<void> {
    if (this.resetToken) {
      this.authMode = 'reset'; this.authState = 'signedOut'; return;
    }
    try {
      const user = await this.authApi.getCurrentUser();
      if (user) this.acceptLogin(user);
      else this.authState = 'signedOut';
    } catch (error) {
      this.authState = 'signedOut';
      this.authError = error instanceof Error ? error.message : 'The login service is unavailable.';
    } finally {
      this.changeDetector.detectChanges();
    }
  }

  private acceptLogin(user: AuthUser): void {
    apiSession.start();
    this.authUser = user;
    const parts = user.displayName.trim().split(/\s+/).filter(Boolean);
    this.currentMember = {
      id: 'you',
      name: user.displayName,
      initials: parts.slice(0, 2).map(part => part[0].toUpperCase()).join('') || 'FM',
      color: '#c47d51'
    };
    this.username = user.email;
    this.password = '';
    this.confirmPassword = '';
    this.authError = '';
    this.authState = 'signedIn';
    void this.loadUserBrackets();
    if (this.bracketRefreshTimer) clearInterval(this.bracketRefreshTimer);
    this.bracketRefreshTimer = setInterval(() => {
      if (this.isSignedIn) void this.loadUserBrackets();
    }, 15_000);
    if (!this.isAdmin && this.router.url.startsWith('/manage/')) void this.router.navigateByUrl('/brackets');
    this.changeDetector.detectChanges();
  }

  private async loadUserBrackets(): Promise<void> {
    const version = ++this.bracketLoadVersion;
    try {
      const brackets = await this.userBracketsApi.getParticipating();
      if (version === this.bracketLoadVersion && this.isSignedIn) this.userBrackets = brackets;
    } catch {
      if (version === this.bracketLoadVersion) this.userBrackets = [];
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  async copyInvite(): Promise<void> {
    const inviteLink = new URL(window.location.href);
    inviteLink.searchParams.set('join', 'FLEETWOOD-2025');
    this.inviteCopied = true;
    try {
      await navigator.clipboard.writeText(inviteLink.toString());
      this.showToast('Demo invite link copied. Joining by invitation is not available yet.');
    } catch {
      this.inviteCopied = false;
      this.showToast('Clipboard access is unavailable in this browser.');
    }
    window.setTimeout(() => this.inviteCopied = false, 2200);
  }

  showToast(message: string): void {
    this.toast = message;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.changeDetector.markForCheck();
    this.toastTimer = setTimeout(() => {
      this.toast = '';
      this.changeDetector.markForCheck();
    }, 2400);
  }
}
