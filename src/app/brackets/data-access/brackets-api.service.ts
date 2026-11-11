import { apiRequest, ApiRequestOptions } from '../../shared/data-access/api-client';
import { Injectable } from '@angular/core';
import { SessionPlaylist, BracketSessionsData, BracketAlbum, BracketSong, BracketDetail, BracketInput, BracketParticipant, BracketRecord } from './bracket.model';

export interface InvitationParticipant { userId:number; displayName:string; email:string; status:'pending'|'accepted'|'declined'; delivery:'unsent'|'sending'|'sent'|'failed'; sentAt:string|null; }
export interface InvitationDelivery {sent:number;failed:number;}

@Injectable({ providedIn: 'root' })
export class BracketsApiService {
  private readonly baseUrl = '/api/admin/brackets';

  getInvitations(id:number):Promise<{participants:InvitationParticipant[]}> { return this.request(`${this.baseUrl}/${id}/invitations`); }
  sendInvitations(id:number):Promise<{participants:InvitationParticipant[];delivery:InvitationDelivery}> { return this.request(`${this.baseUrl}/${id}/invitations`,{method:'POST',timeoutMs:120000}); }

  async getAll(signal?: AbortSignal): Promise<BracketRecord[]> {
    const data = await this.request<{ brackets?: BracketRecord[] }>(this.baseUrl, {signal});
    return data.brackets ?? [];
  }

  saveParticipants(bracketId:number|null,input:{participantIds:number[];changes:Array<{userId:number;email:string;previousEmail:string}>;title:string;artist:string}):Promise<{bracketId:number;participantIds:number[];members:Array<{userId:number;email:string}>;invitations?:InvitationDelivery}> {
    return this.request(`${this.baseUrl}${bracketId?'/'+bracketId:''}/participants`,{method:'PUT',body:JSON.stringify(input),timeoutMs:120000});
  }

  saveSessionPlaylists(bracketId:number,sessionPlaylists:SessionPlaylist[]):Promise<{sessionPlaylists:SessionPlaylist[]}> {
    return this.request(`${this.baseUrl}/${bracketId}/session-playlists`,{method:'PUT',body:JSON.stringify({sessionPlaylists})});
  }

  async getSessions(bracketId:number, signal?: AbortSignal):Promise<BracketSessionsData> {return this.request(`${this.baseUrl}/${bracketId}/sessions`, {signal});}
  async saveSessions(bracketId:number,revision:string,sessions:Array<{weekId:number;opensAt:string|null;closesAt:string|null}>):Promise<BracketSessionsData> {
    return this.request(`${this.baseUrl}/${bracketId}/sessions`,{method:'PUT',body:JSON.stringify({revision,sessions})});
  }

  async saveDraftSessionSettings(bracketId:number,input:Record<string,unknown>):Promise<void> {
    await this.request(`${this.baseUrl}/${bracketId}/session-settings`,{method:'PUT',body:JSON.stringify(input)});
  }

  async getParticipants(signal?: AbortSignal): Promise<BracketParticipant[]> {
    const data = await this.request<{ members?: BracketParticipant[] }>(`${this.baseUrl}/participants`, {signal});
    return data.members ?? [];
  }

  async saveParticipantEmails(changes: Array<{userId:number;email:string;previousEmail:string}>): Promise<Array<{userId:number;email:string}>> {
    const data = await this.request<{members:Array<{userId:number;email:string}>}>(`${this.baseUrl}/participants/emails`, {method:'PUT',body:JSON.stringify({changes})});
    return data.members;
  }

  async get(bracketId: number, signal?: AbortSignal): Promise<BracketDetail> {
    const data = await this.request<{ bracket: BracketDetail }>(`${this.baseUrl}/${bracketId}`, {signal});
    return data.bracket;
  }

  async saveDraft(bracketId: number|null,input:Record<string,unknown>):Promise<{bracketId:number}> {
    return this.request(`${this.baseUrl}${bracketId?'/'+bracketId:''}/draft`,{method:bracketId?'PUT':'POST',body:JSON.stringify(input)});
  }

  async create(input: BracketInput): Promise<{invitations?:InvitationDelivery}> {
    return this.request(this.baseUrl, { method: 'POST', body: JSON.stringify(input),timeoutMs:120000 });
  }

  async update(bracketId: number, input: BracketInput): Promise<{invitations?:InvitationDelivery}> {
    return this.request(`${this.baseUrl}/${bracketId}`, { method: 'PUT', body: JSON.stringify(input),timeoutMs:120000 });
  }

  async saveSongs(bracketId: number | null, songs: BracketSong[], title: string, artist: string, resetHistory = false): Promise<{ bracketId: number; songs: BracketSong[]; needsSetup: boolean }> {
    return this.request(`${this.baseUrl}${bracketId ? '/' + bracketId : ''}/songs`, { method: 'PUT', body: JSON.stringify({ songs, title, artist, resetHistory }) });
  }

  async saveAlbum(bracketId: number | null, album: Omit<BracketAlbum,'albumId'> & { albumId?: number }, title: string, artist: string): Promise<{bracketId:number;albums:BracketAlbum[]}> {
    return this.request(`${this.baseUrl}${bracketId ? '/' + bracketId : ''}/albums${album.albumId ? '/' + album.albumId : ''}`, {method:album.albumId ? 'PUT':'POST',body:JSON.stringify({album,title,artist})});
  }

  async removeAlbum(bracketId:number,albumId:number):Promise<{albums:BracketAlbum[];affectedSongIds:number[]}> {
    return this.request(`${this.baseUrl}/${bracketId}/albums/${albumId}`,{method:'DELETE'});
  }

  async setPaused(bracketId: number, paused: boolean): Promise<void> {
    await this.request(`${this.baseUrl}/${bracketId}/${paused ? 'pause' : 'resume'}`, { method: 'POST' });
  }

  async duplicate(bracketId:number,input:Record<string,unknown>={}):Promise<{bracketId:number;title:string;status:string}> {
    return this.request(`${this.baseUrl}/${bracketId}/duplicate`,{method:'POST',body:JSON.stringify(input)});
  }

  async remove(bracketId: number): Promise<void> {
    await this.request(`${this.baseUrl}/${bracketId}`, { method: 'DELETE' });
  }

  private request<T = unknown>(url: string, options: ApiRequestOptions = {}): Promise<T> {
    return apiRequest<T>(url, {errorMessage: 'Could not complete the bracket request.', ...options});
  }
}
