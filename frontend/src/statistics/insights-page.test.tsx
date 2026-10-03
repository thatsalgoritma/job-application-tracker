import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth/auth-context';
import type { AuthContextValue } from '../auth/auth-types';
import { TOKEN_STORAGE_KEY } from '../api/http-client';
import { InsightsPage } from './insights-page';

const stats = {
  totalApplications: 4,
  countsByStatus: {
    APPLIED: 1, SCREENING: 1, INTERVIEW: 1, OFFER: 0, REJECTED: 1, WITHDRAWN: 0,
  },
  responseRate: {
    respondedApplications: 3, eligibleApplications: 4, percentage: 75,
  },
};

const followUp = {
  id: 'application-1', userId: 'user-1', company: 'Acme',
  position: 'Backend Engineer', jobUrl: null, location: null, source: null,
  status: 'APPLIED', appliedAt: '2026-09-01T12:00:00.000Z',
  statusChangedAt: '2026-09-20T12:00:00.000Z', notes: null,
  createdAt: '2026-09-01T12:00:00.000Z', updatedAt: '2026-09-20T12:00:00.000Z',
};

function authValue(): AuthContextValue {
  return {
    user: { id: 'user-1', email: 'person@example.com', createdAt: '2026-09-10T12:00:00.000Z' },
    isLoading: false,
    login: vi.fn(), register: vi.fn(), logout: vi.fn(),
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('InsightsPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('shows status metrics and reloads follow-ups when the age filter changes', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-token');
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/applications/stats')) return jsonResponse(stats);
      if (url.includes('/applications/follow-up')) return jsonResponse([followUp]);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthContext.Provider value={authValue()}>
        <MemoryRouter><InsightsPage /></MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(await screen.findByText('75%')).toBeInTheDocument();
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('Applications by status')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Follow-up age in days'), {
      target: { value: '30' },
    });

    await waitFor(() => expect(calls.some((url) => url.includes('days=30'))).toBe(true));
    expect(calls.filter((url) => url.endsWith('/applications/stats'))).toHaveLength(2);
  });
});
