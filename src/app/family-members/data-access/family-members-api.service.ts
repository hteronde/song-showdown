import { Injectable } from '@angular/core';
import { FamilyMemberInput, FamilyMemberRecord } from './family-member.model';

@Injectable({ providedIn: 'root' })
export class FamilyMembersApiService {
  private readonly baseUrl = '/api/family-members';

  async getAll(): Promise<FamilyMemberRecord[]> {
    const response = await fetch(this.baseUrl, { credentials: 'include' });
    const payload = await response.json() as { members?: FamilyMemberRecord[]; error?: string };
    if (!response.ok) throw new Error(payload.error || 'Could not load family members.');
    return payload.members ?? [];
  }

  async create(input: FamilyMemberInput): Promise<void> {
    await this.send(this.baseUrl, 'POST', input);
  }

  async update(userId: number, input: FamilyMemberInput): Promise<void> {
    await this.send(`${this.baseUrl}/${userId}`, 'PUT', input);
  }

  async remove(member: FamilyMemberRecord): Promise<void> {
    await this.send(`${this.baseUrl}/${member.userId}`, 'DELETE');
  }

  private async send(url: string, method: string, body?: FamilyMemberInput): Promise<void> {
    const response = await fetch(url, {
      method,
      credentials: 'include',
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) throw new Error(payload.error || 'Could not save family member changes.');
  }
}
