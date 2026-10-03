import { request } from '../api/http-client';
import type { Application } from '../applications/application-types';

export interface ApplicationStats {
  totalApplications: number;
  countsByStatus: Record<Application['status'], number>;
  responseRate: {
    respondedApplications: number;
    eligibleApplications: number;
    percentage: number;
  };
}

export function getApplicationStats(): Promise<ApplicationStats> {
  return request<ApplicationStats>('/applications/stats');
}

export function getFollowUpApplications(days: number): Promise<Application[]> {
  const params = new URLSearchParams({ days: String(days) });
  return request<Application[]>(`/applications/follow-up?${params}`);
}
