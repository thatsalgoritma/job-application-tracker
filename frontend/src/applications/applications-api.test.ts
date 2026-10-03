import { describe, expect, it } from 'vitest';
import { availableStatuses } from './application-types';
import { buildApplicationsQuery } from './applications-api';

describe('application board API helpers', () => {
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
});
