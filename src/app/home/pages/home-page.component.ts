import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DraftStore, Matchup, Song } from '../data-access/home.models';
import { FamilyMember } from '../../family-members/data-access/family-member.model';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home-page.component.html'
})
export class HomePageComponent {
  @Input({ required: true }) currentMember!: FamilyMember;
  @Output() toastMessage = new EventEmitter<string>();

  members: FamilyMember[] = [
    { id: 'you', name: 'Alex Morgan', initials: 'AM', color: '#c47d51' },
    { id: 'sam', name: 'Sam Morgan', initials: 'SM', color: '#607b74' },
    { id: 'jules', name: 'Jules Morgan', initials: 'JM', color: '#84749a' },
    { id: 'mama', name: 'Mama', initials: 'MA', color: '#be7180' }
  ];
  revealMode = false;
  bracketMode = false;
  votingOpen = true;
  currentRound = 1;
  roundName = 'Quarterfinals';
  activeWeek = 1;
  weeks = [1, 2];
  songs: Song[] = [
    { title: 'Dreams', album: 'Rumours', year: 1977, color: '#244b5a', initials: 'FM' },
    { title: 'The Chain', album: 'Rumours', year: 1977, color: '#9a4933', initials: 'FM' },
    { title: 'Landslide', album: 'Fleetwood Mac', year: 1975, color: '#aa8967', initials: 'FM' },
    { title: 'Go Your Own Way', album: 'Rumours', year: 1977, color: '#4e5b42', initials: 'FM' },
    { title: 'Rhiannon', album: 'Fleetwood Mac', year: 1975, color: '#664558', initials: 'FM' },
    { title: 'Silver Springs', album: 'Rumours (Deluxe)', year: 1977, color: '#647d8c', initials: 'FM' },
    { title: 'Everywhere', album: 'Tango in the Night', year: 1987, color: '#c28c46', initials: 'FM' },
    { title: 'Gypsy', album: 'Mirage', year: 1982, color: '#415457', initials: 'FM' }
  ];
  draftVotes: Record<number, string> = {};
  draftComments: Record<number, string> = {};
  submittedWeeks: number[] = [];
  matchups: Matchup[] = [
    { id: 1, week: 1, left: this.songs[0], right: this.songs[1], votes: { you: '', sam: 'left', jules: 'right', mama: 'left' }, comments: {} },
    { id: 2, week: 1, left: this.songs[2], right: this.songs[3], votes: { you: '', sam: 'right', jules: 'left', mama: 'right' }, comments: {} },
    { id: 3, week: 2, left: this.songs[4], right: this.songs[5], votes: { you: '', sam: 'right', jules: 'left', mama: 'left' }, comments: {} },
    { id: 4, week: 2, left: this.songs[6], right: this.songs[7], votes: { you: '', sam: 'left', jules: 'left', mama: 'right' }, comments: {} }
  ];

  constructor() {
    const savedSubmissions = localStorage.getItem('song-showdown-submissions');
    if (savedSubmissions) {
      try {
        const submission = JSON.parse(savedSubmissions) as { weeks?: number[]; picks?: Record<number, string>; comments?: Record<number, string> };
        this.submittedWeeks = submission.weeks ?? [];
        this.matchups.forEach(match => {
          if (submission.picks?.[match.id]) match.votes['you'] = submission.picks[match.id];
          if (submission.comments?.[match.id]) match.comments['you'] = submission.comments[match.id];
        });
      } catch { localStorage.removeItem('song-showdown-submissions'); }
    }

    const savedDraft = localStorage.getItem('song-showdown-draft');
    if (savedDraft) {
      try {
        const draft = JSON.parse(savedDraft) as DraftStore;
        this.draftVotes = draft.picks ?? {};
        this.draftComments = draft.comments ?? {};
      } catch { localStorage.removeItem('song-showdown-draft'); }
    } else {
      const oldVotes = localStorage.getItem('song-showdown-votes');
      if (oldVotes) {
        try { this.draftVotes = JSON.parse(oldVotes) as Record<number, string>; this.saveDraft(); }
        catch { localStorage.removeItem('song-showdown-votes'); }
      }
    }
  }

  get activeMatchups(): Matchup[] { return this.matchups.filter(match => match.week === this.activeWeek); }
  matchupsForWeek(week: number): number { return this.matchups.filter(match => match.week === week).length; }
  get isWeekSubmitted(): boolean { return this.submittedWeeks.includes(this.activeWeek); }
  get draftVotesCount(): number {
    return this.activeMatchups.filter(match => this.draftVotes[match.id] || (this.isWeekSubmitted && match.votes['you'])).length;
  }
  get myVotesCount(): number { return this.activeMatchups.filter(match => this.myVote(match)).length; }

  myVote(match: Matchup): string {
    if (this.currentMember.id === 'you') {
      if (this.revealMode) return match.votes['you'] ?? '';
      return this.isWeekSubmitted ? (match.votes['you'] ?? '') : (this.draftVotes[match.id] ?? '');
    }
    return match.votes[this.currentMember.id] ?? '';
  }

  castVote(match: Matchup, side: string): void {
    if (this.revealMode) return;
    if (this.currentMember.id !== 'you') {
      this.showToast('Switch to your profile to cast your picks.');
      return;
    }
    if (this.isWeekSubmitted) {
      this.showToast('Your picks for this week have already been submitted.');
      return;
    }
    this.draftVotes[match.id] = this.draftVotes[match.id] === side ? '' : side;
    this.saveDraft();
  }

  commentFor(match: Matchup): string {
    if (this.currentMember.id !== 'you') return match.comments[this.currentMember.id] ?? '';
    if (this.revealMode && !this.isWeekSubmitted) return '';
    return this.isWeekSubmitted ? (match.comments['you'] ?? '') : (this.draftComments[match.id] ?? '');
  }

  updateComment(match: Matchup, event: Event): void {
    if (this.currentMember.id !== 'you' || this.isWeekSubmitted) return;
    this.draftComments[match.id] = (event.target as HTMLTextAreaElement).value;
    this.saveDraft();
  }

  submitVotes(): void {
    if (this.currentMember.id !== 'you') {
      this.showToast('Switch to your profile before submitting.');
      return;
    }
    if (this.isWeekSubmitted) return;
    if (this.draftVotesCount !== this.activeMatchups.length) {
      this.showToast('Choose a song in each matchup before submitting.');
      return;
    }
    this.activeMatchups.forEach(match => {
      match.votes['you'] = this.draftVotes[match.id];
      match.comments['you'] = this.draftComments[match.id] ?? '';
      delete this.draftVotes[match.id];
      delete this.draftComments[match.id];
    });
    this.submittedWeeks = [...this.submittedWeeks, this.activeWeek];
    this.persistSubmissions();
    this.saveDraft();
    this.showToast('Your Week ' + this.activeWeek + ' votes are submitted.');
  }

  voteCount(match: Matchup, side: string): number { return Object.values(match.votes).filter(vote => vote === side).length; }
  totalVotes(match: Matchup): number { return this.voteCount(match, 'left') + this.voteCount(match, 'right'); }
  votePercent(match: Matchup, side: string): number { return this.totalVotes(match) ? Math.round(this.voteCount(match, side) / this.totalVotes(match) * 100) : 0; }
  memberVotes(match: Matchup): number { return Object.values(match.votes).filter(Boolean).length; }
  winnerSide(match: Matchup): string { return this.voteCount(match, 'left') >= this.voteCount(match, 'right') ? 'left' : 'right'; }
  seedFor(match: Matchup, side: string): string { return '#' + (match.id * 2 - (side === 'left' ? 1 : 0)).toString().padStart(2, '0'); }

  listeningUrl(song: Song, provider: 'youtube' | 'spotify'): string {
    const query = encodeURIComponent('Fleetwood Mac ' + song.title + ' ' + song.album + ' official audio');
    return provider === 'youtube'
      ? 'https://www.youtube.com/results?search_query=' + query
      : 'https://open.spotify.com/search/' + query;
  }

  private saveDraft(): void {
    localStorage.setItem('song-showdown-draft', JSON.stringify({ picks: this.draftVotes, comments: this.draftComments }));
  }

  private persistSubmissions(): void {
    localStorage.setItem('song-showdown-submissions', JSON.stringify({
      weeks: this.submittedWeeks,
      picks: Object.fromEntries(this.matchups.map(match => [match.id, match.votes['you']]).filter((entry): entry is [number, string] => Boolean(entry[1]))),
      comments: Object.fromEntries(this.matchups.map(match => [match.id, match.comments['you']]).filter((entry): entry is [number, string] => Boolean(entry[1])))
    }));
  }

  private showToast(message: string): void { this.toastMessage.emit(message); }
}
