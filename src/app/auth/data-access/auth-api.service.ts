import { Injectable } from '@angular/core';

export interface AuthUser {
  userId: number;
  displayName: string;
  email: string;
  role: 'owner' | 'member' | null;
}

interface AuthResponse {
  authenticated?: boolean;
  user?: AuthUser | null;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly baseUrl = '/api/auth';

  async getCurrentUser(): Promise<AuthUser | null> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/session`, { credentials: 'include', signal: AbortSignal.timeout(5000) });
    } catch {
      throw new Error('Could not reach the login service. Check that npm run start:api is running.');
    }
    const payload = await response.json() as AuthResponse;
    if (!response.ok) throw new Error(payload.error || 'Could not check the login session.');
    return payload.authenticated ? payload.user ?? null : null;
  }

  signIn(username: string, password: string): Promise<AuthUser> {
    return this.send('/login', { username, password });
  }

  requestPasswordReset(username: string): Promise<void> {
    return this.resetRequest('/forgot-password', { username });
  }

  resetPassword(token: string, password: string): Promise<void> {
    return this.resetRequest('/reset-password', { token, password });
  }

  private async resetRequest(path: string, body: unknown): Promise<void> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000)
    });
    const payload = await response.json() as AuthResponse;
    if (!response.ok) throw new Error(payload.error || 'Could not reset your password.');
  }

  async signOut(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/logout`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}'
    });
    const payload = await response.json() as AuthResponse;
    if (!response.ok) throw new Error(payload.error || 'Could not log out.');
  }

  private async send(path: string, body: unknown): Promise<AuthUser> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } catch {
      throw new Error('The login service is unavailable. Start it with npm run start:api.');
    }
    const payload = await response.json() as AuthResponse;
    if (!response.ok || !payload.user) throw new Error(payload.error || 'Could not sign in.');
    return payload.user;
  }
}
