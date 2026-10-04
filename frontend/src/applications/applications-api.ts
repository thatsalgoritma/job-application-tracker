import { request, requestBlob, requestForm } from '../api/http-client';
import type {
  Application,
  ApplicationFilters,
  ApplicationPage,
  NewApplication,
} from './application-types';

export function buildApplicationsQuery(
  filters: ApplicationFilters,
  page: number,
  pageSize: number,
): string {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  addApplicationFilters(params, filters);
  return params.toString();
}

export function buildApplicationsFilterQuery(filters: ApplicationFilters): string {
  const params = new URLSearchParams();
  addApplicationFilters(params, filters);
  return params.toString();
}

function addApplicationFilters(params: URLSearchParams, filters: ApplicationFilters): void {

  if (filters.status) params.set('status', filters.status);
  if (filters.company.trim()) params.set('company', filters.company.trim());
  if (filters.search.trim()) params.set('q', filters.search.trim());
  if (filters.appliedFrom) {
    params.set('appliedFrom', new Date(`${filters.appliedFrom}T00:00:00`).toISOString());
  }
  if (filters.appliedTo) {
    params.set('appliedTo', new Date(`${filters.appliedTo}T23:59:59.999`).toISOString());
  }
  params.set('sortBy', 'appliedAt');
  params.set('sortOrder', 'desc');
}

export function listApplications(
  filters: ApplicationFilters,
  page: number,
  pageSize: number,
): Promise<ApplicationPage> {
  const query = buildApplicationsQuery(filters, page, pageSize);
  return request<ApplicationPage>(`/applications?${query}`);
}

export function getApplication(applicationId: string): Promise<Application> {
  return request<Application>(`/applications/${applicationId}`);
}

export function updateApplication(
  applicationId: string,
  changes: Partial<NewApplication> & { status?: Application['status'] },
): Promise<Application> {
  return request<Application>(`/applications/${applicationId}`, {
    method: 'PATCH',
    body: JSON.stringify(changes),
  });
}

export function createApplication(
  application: NewApplication,
): Promise<Application> {
  return request<Application>('/applications', {
    method: 'POST',
    body: JSON.stringify(application),
  });
}

export function updateApplicationStatus(
  applicationId: string,
  status: Application['status'],
): Promise<Application> {
  return request<Application>(`/applications/${applicationId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function deleteApplication(applicationId: string): Promise<void> {
  return request<void>(`/applications/${applicationId}`, { method: 'DELETE' });
}

export type ApplicationExportFormat = 'csv' | 'json';

export interface ImportRowResult {
  row: number;
  outcome: 'created' | 'skipped' | 'failed';
  reason?: string;
}

export interface ImportReport {
  dryRun: boolean;
  created: number;
  skipped: number;
  failed: number;
  rows: ImportRowResult[];
}

export function importApplications(file: File, dryRun: boolean): Promise<ImportReport> {
  const form = new FormData();
  form.append('file', file);
  return requestForm<ImportReport>(`/applications/import?dryRun=${dryRun}`, form);
}

export function exportApplications(
  filters: ApplicationFilters,
  format: ApplicationExportFormat,
): Promise<Blob> {
  const params = new URLSearchParams(buildApplicationsFilterQuery(filters));
  params.set('format', format);
  return requestBlob(`/applications/export?${params.toString()}`);
}
