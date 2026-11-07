import { Injectable } from '@angular/core';
import { apiRequest } from '../../shared/data-access/api-client';

export interface AuthUser {
  userId: number;
  displayName: string;
  email: string;
  role: 'owner' | 'member' | null;
}
interface AuthResponse { authenticated?: boolean; user?: AuthUser | null; }

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  async getCurrentUser(signal?: AbortSignal): Promise<AuthUser | null> {
    const payload = await apiRequest<AuthResponse>('/api/auth/session', {signal, session: 'check'});
    return payload.authenticated ? payload.user ?? null : null;
  }
  async signIn(username: string, password: string, signal?: AbortSignal): Promise<AuthUser> {
    const payload = await apiRequest<AuthResponse>('/api/auth/login', {method: 'POST', json: {username, password}, session: 'public', signal});
    if (!payload.user) throw new Error('Could not sign in.');
    return payload.user;
  }
  async requestPasswordReset(username: string, signal?: AbortSignal): Promise<void> {
    await apiRequest('/api/auth/forgot-password', {method: 'POST', json: {username}, session: 'public', signal});
  }
  async resetPassword(token: string, password: string, signal?: AbortSignal): Promise<void> {
    await apiRequest('/api/auth/reset-password', {method: 'POST', json: {token, password}, session: 'public', signal});
  }
  async signOut(): Promise<void> {
    await apiRequest('/api/auth/logout', {method: 'POST', json: {}, session: 'public'});
  }
}
