import { describe, expect, it, vi } from 'vitest';
import { availableStatuses } from './application-types';
import {
  buildApplicationsFilterQuery,
  buildApplicationsQuery,
  deleteApplication,
  exportApplications,
} from './applications-api';

describe('application board API helpers', () => {
  it('sends an authenticated DELETE request for an application', async () => {
    window.localStorage.setItem('job-tracker.access-token', 'test-token');
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await deleteApplication('app-1');
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/applications\/app-1$/);
    expect(options.method).toBe('DELETE');
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer test-token');
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('maps board filters and pagination to the backend query contract', () => {
    const query = new URLSearchParams(
      buildApplicationsQuery(
        {
          status: 'SCREENING',
          company: 'Acme Inc',
          search: 'backend engineer',
          appliedFrom: '2026-09-01',
          appliedTo: '2026-09-30',
        },
        2,
        20,
      ),
    );

    expect(query.get('status')).toBe('SCREENING');
    expect(query.get('company')).toBe('Acme Inc');
    expect(query.get('q')).toBe('backend engineer');
    expect(query.get('page')).toBe('2');
    expect(query.get('pageSize')).toBe('20');
    expect(query.get('sortBy')).toBe('appliedAt');
    expect(query.get('sortOrder')).toBe('desc');
    expect(new Date(query.get('appliedFrom')!).getTime()).toBe(
      new Date('2026-09-01T00:00:00').getTime(),
    );
    expect(new Date(query.get('appliedTo')!).getTime()).toBe(
      new Date('2026-09-30T23:59:59.999').getTime(),
    );
  });

  it('offers only legal next statuses, while keeping terminal states closed', () => {
    expect(availableStatuses('APPLIED')).toEqual(['APPLIED', 'SCREENING', 'REJECTED', 'WITHDRAWN']);
    expect(availableStatuses('INTERVIEW')).toEqual(['INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN']);
    expect(availableStatuses('OFFER')).toEqual(['OFFER']);
    expect(availableStatuses('REJECTED')).toEqual(['REJECTED']);
  });

  it('exports the active filters through an authenticated binary request', async () => {
    window.localStorage.setItem('job-tracker.access-token', 'test-token');
    const fetchMock = vi.fn().mockResolvedValue(new Response('company,position\nAcme,Engineer', {
      status: 200,
      headers: { 'Content-Type': 'text/csv; charset=utf-8' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const filters = {
      status: 'SCREENING' as const,
      company: ' Acme ',
      search: 'backend role',
      appliedFrom: '2026-09-01',
      appliedTo: '2026-09-30',
    };

    const blob = await exportApplications(filters, 'csv');
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const query = new URLSearchParams(url.split('?')[1]);
    expect(url).toContain('/applications/export?');
    expect(options.method).toBeUndefined();
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer test-token');
    expect(query.get('status')).toBe('SCREENING');
    expect(query.get('company')).toBe('Acme');
    expect(query.get('q')).toBe('backend role');
    expect(query.get('format')).toBe('csv');
    expect(query.get('page')).toBeNull();
    expect(query.get('pageSize')).toBeNull();
    expect(await blob.text()).toContain('Acme,Engineer');

    const filterQuery = new URLSearchParams(buildApplicationsFilterQuery(filters));
    expect(filterQuery.get('appliedFrom')).toBeDefined();
    expect(filterQuery.get('appliedTo')).toBeDefined();
    expect(filterQuery.get('sortOrder')).toBe('desc');
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });
});
