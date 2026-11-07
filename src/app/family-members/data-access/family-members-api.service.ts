import { Injectable } from '@angular/core';
import { apiRequest } from '../../shared/data-access/api-client';
import { FamilyMemberInput, FamilyMemberRecord } from './family-member.model';

@Injectable({ providedIn: 'root' })
export class FamilyMembersApiService {
  private readonly baseUrl = '/api/family-members';
  async getAll(signal?: AbortSignal): Promise<FamilyMemberRecord[]> {
    const payload = await apiRequest<{members?: FamilyMemberRecord[]}>(this.baseUrl, {signal});
    return payload.members ?? [];
  }
  async create(input: FamilyMemberInput): Promise<void> {
    await apiRequest(this.baseUrl, {method: 'POST', json: input});
  }
  async update(userId: number, input: FamilyMemberInput): Promise<void> {
    await apiRequest(`${this.baseUrl}/${userId}`, {method: 'PUT', json: input});
  }
  async remove(member: FamilyMemberRecord): Promise<void> {
    await apiRequest(`${this.baseUrl}/${member.userId}`, {method: 'DELETE'});
  }
}
