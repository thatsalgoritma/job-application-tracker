import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    cleanup();
    vi.restoreAllMocks();
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
    fireEvent.click(screen.getAllByRole('button', { name: /^Delete$/ }).at(-1)!);
    expect(screen.getByText(/all of its interviews/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete application' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('status')).toHaveTextContent('Acme — Backend Engineer was deleted.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'DELETE' });
  });

  it('exports the currently selected filters and downloads a dated CSV file', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-token');
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/applications/export?')) return new Response('Company,Position\nAcme,Engineer', { status: 200 });
      return jsonResponse({ data: [application], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:applications'), revokeObjectURL: vi.fn() });
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });

    render(<AuthContext.Provider value={authValue()}><MemoryRouter><ApplicationsBoard /></MemoryRouter></AuthContext.Provider>);
    await screen.findByText('Acme');
    fireEvent.change(screen.getByLabelText('Search applications'), { target: { value: 'backend role' } });
    fireEvent.change(screen.getByLabelText('Filter by company'), { target: { value: 'Acme' } });
    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'SCREENING' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.click(screen.getByRole('button', { name: 'CSV (.csv)' }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    const exportUrl = String(fetchMock.mock.calls.find(([input]) => String(input).includes('/applications/export?'))?.[0]);
    const query = new URLSearchParams(exportUrl.split('?')[1]);
    expect(query.get('status')).toBe('SCREENING');
    expect(query.get('company')).toBe('Acme');
    expect(query.get('q')).toBe('backend role');
    expect(query.get('format')).toBe('csv');
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(downloads[0]).toBe(`applications-${date}.csv`);
  });

  it('shows a useful error when export fails', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-token');
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input).includes('/applications/export?')
      ? jsonResponse({ message: 'Export unavailable' }, 503)
      : jsonResponse({ data: [application], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }));
    vi.stubGlobal('fetch', fetchMock);
    render(<AuthContext.Provider value={authValue()}><MemoryRouter><ApplicationsBoard /></MemoryRouter></AuthContext.Provider>);
    await screen.findByText('Acme');
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    fireEvent.click(screen.getByRole('button', { name: 'JSON (.json)' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Export unavailable');
  });

  it('opens the import dialog and refreshes the applications after confirmation', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-token');
    const report = { dryRun: true, created: 1, skipped: 0, failed: 0, rows: [{ row: 2, outcome: 'created' }] };
    let listCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/applications/import?dryRun=true')) return jsonResponse(report);
      if (url.includes('/applications/import?dryRun=false')) return jsonResponse({ ...report, dryRun: false });
      listCalls += 1;
      return jsonResponse({ data: [application], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<AuthContext.Provider value={authValue()}><MemoryRouter><ApplicationsBoard /></MemoryRouter></AuthContext.Provider>);
    await screen.findByText('Acme');
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(await screen.findByRole('dialog', { name: 'Import applications' })).toBeInTheDocument();
    const file = new File(['Company,Position\nAcme,Engineer'], 'applications.csv', { type: 'text/csv' });
    fireEvent.change(screen.getByLabelText('Applications file'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Run dry run' }));
    await screen.findByRole('region', { name: 'Dry run preview' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }));
    await screen.findByRole('region', { name: 'Import results' });
    await waitFor(() => expect(listCalls).toBe(2));
  });
});
