import { Injectable } from '@angular/core';
import { SongInput, SongRecord } from './song.model';

@Injectable({ providedIn: 'root' })
export class SongsApiService {
  private readonly baseUrl = '/api/songs';

  async getAll(): Promise<SongRecord[]> {
    const response = await fetch(this.baseUrl, { credentials: 'include' });
    const payload = await response.json() as { songs?: SongRecord[]; error?: string };
    if (!response.ok) throw new Error(payload.error || 'Could not load songs.');
    return payload.songs ?? [];
  }

  create(input: SongInput): Promise<void> { return this.send(this.baseUrl, 'POST', input); }
  update(songId: number, input: SongInput): Promise<void> { return this.send(`${this.baseUrl}/${songId}`, 'PUT', input); }
  remove(songId: number): Promise<void> { return this.send(`${this.baseUrl}/${songId}`, 'DELETE'); }

  private async send(url: string, method: string, body?: SongInput): Promise<void> {
    const response = await fetch(url, {
      method,
      credentials: 'include',
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) throw new Error(payload.error || 'Could not save song changes.');
  }
}
