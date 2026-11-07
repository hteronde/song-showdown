export type ApiErrorCode = 'http' | 'network' | 'timeout' | 'cancelled' | 'invalid-response';
export class ApiError extends Error {
  readonly requiresReset: boolean;
  constructor(message: string, readonly code: ApiErrorCode, readonly status = 0,
    readonly details: Record<string, unknown> = {}, readonly retryAfter: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.requiresReset = details['requiresReset'] === true;
  }
}
export const isApiCancelled = (error: unknown): boolean => error instanceof ApiError && error.code === 'cancelled';

export function apiErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  return isApiCancelled(error) ? '' : error instanceof Error ? error.message : fallback;
}

export class ApiSession {
  private controller = new AbortController();
  private active = false;
  private listeners = new Set<() => void>();
  generation = 0;
  get signal(): AbortSignal { return this.controller.signal; }
  start(): void { this.end(); this.active = true; }
  end(): void {
    this.active = false;
    this.generation++;
    this.controller.abort();
    this.controller = new AbortController();
  }
  expire(generation: number): void {
    if (!this.active || generation !== this.generation) return;
    this.end();
    for (const listener of this.listeners) listener();
  }
  onExpired(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
export interface ApiRequestOptions extends RequestInit {
  timeoutMs?: number;
  errorMessage?: string;
  session?: 'protected' | 'public' | 'check';
  json?: unknown;
}

export function createApiClient({ fetchImpl = (...args: Parameters<typeof fetch>) => fetch(...args), session = new ApiSession(), timeoutMs = 15000 } = {}) {
  return async function request<T = unknown>(url: string, options: ApiRequestOptions = {}): Promise<T> {
    const { timeoutMs: duration = timeoutMs, errorMessage = 'Could not complete the request.', session: policy = 'protected', json, signal: callerSignal, ...init } = options;
    const generation = session.generation;
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    const signals = [callerSignal, ...(policy === 'public' ? [] : [session.signal])].filter((signal): signal is AbortSignal => !!signal);
    for (const signal of signals) {
      if (signal.aborted) cancel();
      else signal.addEventListener('abort', cancel, {once: true});
    }
    const timer = setTimeout(() => { if (!controller.signal.aborted) { timedOut = true; cancel(); } }, duration);
    try {
      if (controller.signal.aborted) throw new ApiError('Request cancelled.', 'cancelled');
      const headers = new Headers(init.headers);
      headers.set('Accept', 'application/json');
      if (json !== undefined || typeof init.body === 'string') headers.set('Content-Type', 'application/json');
      const response = await fetchImpl(url, {...init, headers, credentials: 'include', signal: controller.signal, ...(json !== undefined ? {body: JSON.stringify(json)} : {})});
      if (controller.signal.aborted) throw new Error('Aborted');
      if (response.status === 401 && policy !== 'public') {
        session.expire(generation);
        throw new ApiError('Your session has expired. Please log in again.', 'http', 401, {}, response.headers.get('Retry-After'));
      }
      const text = response.status === 204 ? '' : await response.text();
      if (controller.signal.aborted) throw new Error('Aborted');
      let payload: unknown = {};
      let malformed = false;
      try { if (text) payload = JSON.parse(text); }
      catch { malformed = true; }
      const details = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
      if (!response.ok) {
        const message = response.status === 401 && policy !== 'public' ? 'Your session has expired. Please log in again.' : typeof details['error'] === 'string' ? details['error'] : errorMessage;
        throw new ApiError(message, 'http', response.status, details, response.headers.get('Retry-After'));
      }
      if (malformed || (!text && response.status !== 204)) throw new ApiError('The server returned an invalid response. Please try again.', 'invalid-response', response.status);
      if (policy === 'check' && details['authenticated'] === false) session.expire(generation);
      return payload as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) throw new ApiError(timedOut ? 'The request timed out. Please try again.' : 'Request cancelled.', timedOut ? 'timeout' : 'cancelled');
      throw new ApiError('Could not reach the server. Check your connection and try again.', 'network');
    } finally {
      clearTimeout(timer);
      for (const signal of signals) signal.removeEventListener('abort', cancel);
    }
  };
}
export const apiSession = new ApiSession();
export const apiRequest = createApiClient({session: apiSession});
