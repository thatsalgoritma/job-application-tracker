import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_STORAGE_KEY } from '../api/http-client';
import { AuthContext } from '../auth/auth-context';
import type { AuthContextValue } from '../auth/auth-types';
import { SettingsPage } from './settings-page';

const currentSettings = { emailDigestEnabled: true, followUpDays: 7 };

function authValue(): AuthContextValue {
  return {
    user: { id: 'user-1', email: 'person@example.com', createdAt: '2026-09-10T12:00:00.000Z' },
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderPage() {
  return render(
    <AuthContext.Provider value={authValue()}>
      <MemoryRouter><SettingsPage /></MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('SettingsPage', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('loads settings and saves the digest toggle and follow-up days', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(currentSettings))
      .mockResolvedValueOnce(jsonResponse({ emailDigestEnabled: false, followUpDays: 14 }));
    vi.stubGlobal('fetch', fetchMock);
    renderPage();

    const digestToggle = await screen.findByRole('checkbox', { name: 'Weekly email digest' });
    expect(digestToggle).toBeChecked();
    expect(screen.getByLabelText('Follow-up after days')).toHaveAttribute('min', '1');
    expect(screen.getByLabelText('Follow-up after days')).toHaveAttribute('max', '3650');
    expect(screen.getByText(/switch off “Weekly email digest” and save/)).toBeInTheDocument();

    fireEvent.click(digestToggle);
    fireEvent.change(screen.getByLabelText('Follow-up after days'), { target: { value: '14' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Settings saved.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, options] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toMatch(/\/me\/settings$/);
    expect(options.method).toBe('PATCH');
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer test-token');
    expect(options.body).toBe(JSON.stringify({ emailDigestEnabled: false, followUpDays: 14 }));
  });

  it('shows a clear message when settings cannot be saved', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse(currentSettings))
      .mockResolvedValueOnce(jsonResponse({ message: 'Settings service unavailable' }, 503)));
    renderPage();
    const page = within(await screen.findByRole('main'));
    await page.findByRole('checkbox', { name: 'Weekly email digest' });
    fireEvent.click(page.getByRole('button', { name: 'Save settings' }));
    expect(await page.findByRole('alert')).toHaveTextContent('Settings service unavailable');
  });

  it('can retry after the settings request fails', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('network failure'))
      .mockResolvedValueOnce(jsonResponse(currentSettings));
    vi.stubGlobal('fetch', fetchMock);
    renderPage();
    const page = within(await screen.findByRole('main'));
    expect(await page.findByRole('alert')).toHaveTextContent('Settings could not be loaded');
    fireEvent.click(page.getByRole('button', { name: 'Try again' }));
    expect(await page.findByRole('checkbox', { name: 'Weekly email digest' })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
