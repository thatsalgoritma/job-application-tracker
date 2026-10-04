import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth/auth-context';
import type { AuthContextValue } from '../auth/auth-types';
import { TOKEN_STORAGE_KEY } from '../api/http-client';
import { ApplicationsBoard } from './applications-board';

const application = {
  id: 'application-1',
  userId: 'user-1',
  company: 'Acme',
  position: 'Backend Engineer',
  jobUrl: null,
  location: 'Remote',
  source: null,
  status: 'APPLIED' as const,
  appliedAt: '2026-09-10T12:00:00.000Z',
  statusChangedAt: '2026-09-10T12:00:00.000Z',
  notes: null,
  createdAt: '2026-09-10T12:00:00.000Z',
  updatedAt: '2026-09-10T12:00:00.000Z',
};

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
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ApplicationsBoard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('loads applications and refreshes the board after a legal status change', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [application], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(jsonResponse({ ...application, status: 'SCREENING' }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ ...application, status: 'SCREENING' }], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthContext.Provider value={authValue()}>
        <MemoryRouter><ApplicationsBoard /></MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Change status for Acme'), {
      target: { value: 'SCREENING' },
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'PATCH' });
    expect(fetchMock.mock.calls[1][1]?.body).toBe(JSON.stringify({ status: 'SCREENING' }));
    expect(await screen.findByLabelText('Change status for Acme')).toHaveValue('SCREENING');
  });

  it('confirms deleting a card, removes it without reloading, and announces success', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ data: [application], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AuthContext.Provider value={authValue()}><MemoryRouter><ApplicationsBoard /></MemoryRouter></AuthContext.Provider>);
    expect(await screen.findByText('Acme')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }));
    expect(screen.getByText(/all of its interviews/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete application' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('status')).toHaveTextContent('Acme — Backend Engineer was deleted.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'DELETE' });
  });
});
