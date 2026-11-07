import { Injectable } from '@angular/core';
import { apiRequest } from '../../shared/data-access/api-client';
import { SongInput, SongRecord } from './song.model';

@Injectable({ providedIn: 'root' })
export class SongsApiService {
  private readonly baseUrl = '/api/songs';
  async getAll(signal?: AbortSignal): Promise<SongRecord[]> {
    const payload = await apiRequest<{songs?: SongRecord[]}>(this.baseUrl, {signal});
    return payload.songs ?? [];
  }
  async create(input: SongInput): Promise<void> {
    await apiRequest(this.baseUrl, {method: 'POST', json: input});
  }
  async update(songId: number, input: SongInput): Promise<void> {
    await apiRequest(`${this.baseUrl}/${songId}`, {method: 'PUT', json: input});
  }
  async remove(songId: number): Promise<void> {
    await apiRequest(`${this.baseUrl}/${songId}`, {method: 'DELETE'});
  }
}
