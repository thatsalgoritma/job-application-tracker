import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext } from '../auth/auth-context';
import type { AuthContextValue } from '../auth/auth-types';
import { TOKEN_STORAGE_KEY } from '../api/http-client';
import { ApplicationDetailPage } from './application-detail-page';

const application = {
  id: 'application-1', userId: 'user-1', company: 'Acme',
  position: 'Backend Engineer', jobUrl: null, location: 'Remote', source: null,
  status: 'APPLIED', appliedAt: '2026-09-10T12:00:00.000Z',
  statusChangedAt: '2026-09-10T12:00:00.000Z', notes: null,
  createdAt: '2026-09-10T12:00:00.000Z', updatedAt: '2026-09-10T12:00:00.000Z',
};

const interview = {
  id: 'interview-1', applicationId: 'application-1', type: 'TECHNICAL',
  scheduledAt: '2026-10-10T10:00:00.000Z', notes: 'System design',
  outcome: null, createdAt: '2026-09-20T12:00:00.000Z',
};

function authValue(): AuthContextValue {
  return {
    user: { id: 'user-1', email: 'person@example.com', createdAt: '2026-09-10T12:00:00.000Z' },
    isLoading: false,
    login: vi.fn(), register: vi.fn(), logout: vi.fn(),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ApplicationDetailPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('loads a job and its interview history, then schedules an interview', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-token');
    const calls: Array<{ url: string; method: string; body?: string }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body?.toString() });
      if (url.endsWith('/applications/application-1') && method === 'GET') {
        return jsonResponse(application);
      }
      if (url.endsWith('/interviews') && method === 'GET') return jsonResponse([interview]);
      if (url.endsWith('/interviews') && method === 'POST') return jsonResponse(interview, 201);
      throw new Error(`Unexpected request: ${method} ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthContext.Provider value={authValue()}>
        <MemoryRouter initialEntries={['/applications/application-1']}>
          <Routes><Route path="/applications/:applicationId" element={<ApplicationDetailPage />} /></Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(await screen.findByText('System design')).toBeInTheDocument();
    expect(screen.getAllByText('Technical interview')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Date and time *'), {
      target: { value: '2026-10-18T09:30' },
    });
    fireEvent.change(screen.getByLabelText('Interview type *'), {
      target: { value: 'HR' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule interview' }));

    await waitFor(() => expect(calls.some((call) => call.method === 'POST')).toBe(true));
    expect(calls.find((call) => call.method === 'POST')?.body).toContain('"type":"HR"');
    expect(await screen.findByRole('status')).toHaveTextContent('Interview scheduled.');
  });
});
