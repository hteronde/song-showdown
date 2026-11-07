import type { VotingMatchup } from '../data-access/active-bracket-api.service';

export class VoteDrafts {
  readonly picks: Record<number, number | null> = {};
  readonly comments: Record<number, string> = {};

  clear(): void {
    for (const key of Object.keys(this.picks)) delete this.picks[Number(key)];
    for (const key of Object.keys(this.comments)) delete this.comments[Number(key)];
  }

  selection(match: VotingMatchup): number | null {
    return Object.hasOwn(this.picks, match.matchupId) ? this.picks[match.matchupId]! : match.selectedEntryId;
  }

  comment(match: VotingMatchup): string {
    return this.comments[match.matchupId] ?? match.comment ?? '';
  }

  select(match: VotingMatchup, entryId: number, saving: boolean): void {
    if (entryId === match.selectedEntryId && !saving) delete this.picks[match.matchupId];
    else this.picks[match.matchupId] = entryId;
  }

  editComment(match: VotingMatchup, comment: string, saving: boolean): void {
    if (comment === (match.comment ?? '') && !saving) delete this.comments[match.matchupId];
    else this.comments[match.matchupId] = comment;
  }

  clearSaved(match: VotingMatchup): void {
    if (this.picks[match.matchupId] === match.selectedEntryId) delete this.picks[match.matchupId];
    if (this.comments[match.matchupId] === (match.comment ?? '')) delete this.comments[match.matchupId];
  }
}

// A version distinguishes A → B → A navigation from the original A request.
export class BracketRequests {
  bracketId: number | null = null;
  version = 0;
  pollingVersion: number | null = null;

  begin(bracketId: number): number {
    this.bracketId = bracketId;
    return ++this.version;
  }

  isCurrent(version: number, bracketId: number): boolean {
    return this.version === version && this.bracketId === bracketId;
  }

  invalidate(): void {
    this.bracketId = null;
    ++this.version;
  }
}
