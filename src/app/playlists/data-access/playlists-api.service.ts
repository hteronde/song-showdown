import { Injectable } from '@angular/core';
import { PlaylistBracket, PlaylistInput, PlaylistRecord } from './playlist.model';

@Injectable({ providedIn: 'root' })
export class PlaylistsApiService {
  private readonly baseUrl = '/api';

  async getAll(): Promise<PlaylistRecord[]> {
    const response = await fetch(`${this.baseUrl}/playlists`, { credentials: 'include' });
    const payload = await response.json() as { playlists?: PlaylistRecord[]; error?: string };
    if (!response.ok) throw new Error(payload.error || 'Could not load playlists.');
    return payload.playlists ?? [];
  }

  async getBrackets(): Promise<PlaylistBracket[]> {
    const response = await fetch(`${this.baseUrl}/playlist-options`, { credentials: 'include' });
    const payload = await response.json() as { brackets?: PlaylistBracket[]; error?: string };
    if (!response.ok) throw new Error(payload.error || 'Could not load brackets.');
    return payload.brackets ?? [];
  }

  create(input: PlaylistInput): Promise<void> { return this.send(`${this.baseUrl}/playlists`, 'POST', input); }
  update(playlistId: number, input: PlaylistInput): Promise<void> {
    return this.send(`${this.baseUrl}/playlists/${playlistId}`, 'PUT', input);
  }
  remove(playlistId: number): Promise<void> { return this.send(`${this.baseUrl}/playlists/${playlistId}`, 'DELETE'); }

  private async send(url: string, method: string, body?: PlaylistInput): Promise<void> {
    const response = await fetch(url, {
      method,
      credentials: 'include',
      ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
    });
    const payload = await response.json() as { error?: string };
    if (!response.ok) throw new Error(payload.error || 'Could not save playlist changes.');
  }
}
