import { Injectable } from '@angular/core';
import { apiRequest } from '../../shared/data-access/api-client';
import { PlaylistBracket, PlaylistInput, PlaylistRecord } from './playlist.model';

@Injectable({ providedIn: 'root' })
export class PlaylistsApiService {
  async getAll(signal?: AbortSignal): Promise<PlaylistRecord[]> {
    const payload = await apiRequest<{playlists?: PlaylistRecord[]}>('/api/playlists', {signal});
    return payload.playlists ?? [];
  }
  async getBrackets(signal?: AbortSignal): Promise<PlaylistBracket[]> {
    const payload = await apiRequest<{brackets?: PlaylistBracket[]}>('/api/playlist-options', {signal});
    return payload.brackets ?? [];
  }
  async create(input: PlaylistInput): Promise<void> {
    await apiRequest('/api/playlists', {method: 'POST', json: input});
  }
  async update(playlistId: number, input: PlaylistInput): Promise<void> {
    await apiRequest(`/api/playlists/${playlistId}`, {method: 'PUT', json: input});
  }
  async remove(playlistId: number): Promise<void> {
    await apiRequest(`/api/playlists/${playlistId}`, {method: 'DELETE'});
  }
}
