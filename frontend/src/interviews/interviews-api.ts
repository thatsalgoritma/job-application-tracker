import { request } from '../api/http-client';
import type { Interview, InterviewInput } from './interview-types';

export function listInterviews(applicationId: string): Promise<Interview[]> {
  return request<Interview[]>(`/applications/${applicationId}/interviews`);
}

export function createInterview(
  applicationId: string,
  interview: InterviewInput,
): Promise<Interview> {
  return request<Interview>(`/applications/${applicationId}/interviews`, {
    method: 'POST',
    body: JSON.stringify(interview),
  });
}

export function updateInterview(
  applicationId: string,
  interviewId: string,
  changes: Partial<InterviewInput>,
): Promise<Interview> {
  return request<Interview>(
    `/applications/${applicationId}/interviews/${interviewId}`,
    { method: 'PATCH', body: JSON.stringify(changes) },
  );
}

export function deleteInterview(
  applicationId: string,
  interviewId: string,
): Promise<void> {
  return request<void>(
    `/applications/${applicationId}/interviews/${interviewId}`,
    { method: 'DELETE' },
  );
}
