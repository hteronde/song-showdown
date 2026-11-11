import type { BracketParticipant } from '../data-access/bracket.model';

export class ParticipantEditor {
  ids: number[] = [];
  emails: Record<number, string> = {};
  error = '';
  saving = false;

  open(selectedIds: number[], members: BracketParticipant[]): void {
    this.ids = [...selectedIds];
    this.emails = Object.fromEntries(members.map(member => [member.userId, member.email]));
    this.error = '';
  }

  allSelected(members: BracketParticipant[]): boolean {
    return members.length > 0 && members.every(member => this.ids.includes(member.userId));
  }

  selectAll(members: BracketParticipant[]): void {
    this.ids = this.allSelected(members) ? [] : members.map(member => member.userId);
    this.error = '';
  }

  toggle(id: number, checked: boolean): void {
    this.ids = checked ? [...new Set([...this.ids, id])] : this.ids.filter(value => value !== id);
    this.error = '';
  }

  changes(members: BracketParticipant[], allowEmpty = false): {userId: number; email: string; previousEmail: string}[] | null {
    if (!this.ids.length && !allowEmpty) {
      this.error = 'Select at least one participant.';
      return null;
    }
    const changes = members.filter(member => this.emails[member.userId]?.trim() !== member.email).map(member => ({userId: member.userId, email: this.emails[member.userId]?.trim() ?? '', previousEmail: member.email}));
    if (changes.some(change => change.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(change.email))) {
      this.error = 'Enter a valid email address for each participant.';
      return null;
    }
    return changes;
  }
}
