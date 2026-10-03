export const APPLICATION_STATUSES = [
  'APPLIED',
  'SCREENING',
  'INTERVIEW',
  'OFFER',
  'REJECTED',
  'WITHDRAWN',
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface Application {
  id: string;
  userId: string;
  company: string;
  position: string;
  jobUrl: string | null;
  location: string | null;
  source: string | null;
  status: ApplicationStatus;
  appliedAt: string;
  statusChangedAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationPage {
  data: Application[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ApplicationFilters {
  status: ApplicationStatus | '';
  company: string;
  search: string;
  appliedFrom: string;
  appliedTo: string;
}

export type NewApplication = Pick<Application, 'company' | 'position'> &
  Partial<Pick<Application, 'jobUrl' | 'location' | 'source' | 'notes' | 'appliedAt'>>;

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  INTERVIEW: 'Interview',
  OFFER: 'Offer',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

const ALLOWED_NEXT_STATUSES: Record<
  ApplicationStatus,
  readonly ApplicationStatus[]
> = {
  APPLIED: ['SCREENING', 'REJECTED', 'WITHDRAWN'],
  SCREENING: ['INTERVIEW', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW: ['OFFER', 'REJECTED', 'WITHDRAWN'],
  OFFER: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export function availableStatuses(
  current: ApplicationStatus,
): ApplicationStatus[] {
  return [current, ...ALLOWED_NEXT_STATUSES[current]];
}
