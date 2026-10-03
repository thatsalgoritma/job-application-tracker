export const INTERVIEW_TYPES = [
  'HR',
  'TECHNICAL',
  'ONSITE',
  'TAKE_HOME',
  'FINAL',
  'OTHER',
] as const;

export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export interface Interview {
  id: string;
  applicationId: string;
  type: InterviewType;
  scheduledAt: string;
  notes: string | null;
  outcome: string | null;
  createdAt: string;
}

export type InterviewInput = Pick<Interview, 'type' | 'scheduledAt'> &
  Partial<Pick<Interview, 'notes' | 'outcome'>>;

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  HR: 'HR interview',
  TECHNICAL: 'Technical interview',
  ONSITE: 'On-site interview',
  TAKE_HOME: 'Take-home assignment',
  FINAL: 'Final interview',
  OTHER: 'Other',
};
