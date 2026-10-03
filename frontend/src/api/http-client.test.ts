import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  request,
  TOKEN_STORAGE_KEY,
  UNAUTHORIZED_EVENT,
} from './http-client';

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('API client', () => {
  it('clears the stored token and emits an event after a 401 response', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'expired-token');
    const onUnauthorized = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(request('/me')).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Unauthorized',
      status: 401,
    } satisfies Partial<ApiError>);

    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBeNull();
    expect(onUnauthorized).toHaveBeenCalledOnce();
    window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  });
});
