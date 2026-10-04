export const TOKEN_STORAGE_KEY = 'job-tracker.access-token';
export const UNAUTHORIZED_EVENT = 'job-tracker:unauthorized';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers,
  });
  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    handleUnauthorized(response);
    throw new ApiError(getErrorMessage(body), response.status);
  }

  return body as T;
}

export async function requestBlob(path: string): Promise<Blob> {
  const headers = new Headers();
  const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${apiBaseUrl}${path}`, { headers });
  if (!response.ok) {
    handleUnauthorized(response);
    const body: unknown = await response.json().catch(() => undefined);
    throw new ApiError(getErrorMessage(body), response.status);
  }
  return response.blob();
}

export async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const headers = new Headers();
  const token = window.localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: 'POST',
    headers,
    body: form,
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    handleUnauthorized(response);
    throw new ApiError(getErrorMessage(body), response.status);
  }
  return body as T;
}

function handleUnauthorized(response: Response): void {
  if (response.status !== 401) return;
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

function getErrorMessage(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('message' in body)) {
    return 'The request could not be completed. Please try again.';
  }

  const message = body.message;
  if (typeof message === 'string') {
    return message;
  }
  if (Array.isArray(message)) {
    return message.filter((item): item is string => typeof item === 'string').join(' ');
  }
  return 'The request could not be completed. Please try again.';
}
