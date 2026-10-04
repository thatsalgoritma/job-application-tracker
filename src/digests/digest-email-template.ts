import { ApplicationStatus, InterviewType } from '@prisma/client';

export interface FollowUpItem {
  company: string;
  position: string;
  status: ApplicationStatus;
  statusChangedAt: Date;
  jobUrl: string | null;
}

export interface UpcomingInterviewItem {
  company: string;
  position: string;
  type: InterviewType;
  scheduledAt: Date;
}

export interface DigestEmailData {
  followUps: FollowUpItem[];
  statusCounts: Record<ApplicationStatus, number>;
  upcomingInterviews: UpcomingInterviewItem[];
}

export function buildDigestEmail(data: DigestEmailData): {
  subject: string;
  text: string;
  html: string;
} {
  const followUpText = data.followUps.length
    ? data.followUps
        .map(
          (item) =>
            `- ${item.company} — ${item.position} (${item.status}, unchanged since ${formatDate(item.statusChangedAt)})${item.jobUrl ? `: ${item.jobUrl}` : ''}`,
        )
        .join('\n')
    : 'None';
  const interviewText = data.upcomingInterviews.length
    ? data.upcomingInterviews
        .map(
          (item) =>
            `- ${item.company} — ${item.position}: ${item.type} on ${formatDate(item.scheduledAt)}`,
        )
        .join('\n')
    : 'None';
  const statusText = Object.entries(data.statusCounts)
    .map(([status, count]) => `${status}: ${count}`)
    .join('\n');
  const followUpHtml = data.followUps.length
    ? `<ul>${data.followUps
        .map((item) => {
          const jobUrl = safeJobUrl(item.jobUrl);
          const link = jobUrl
            ? ` — <a href="${escapeHtml(jobUrl)}">Job posting</a>`
            : '';
          return `<li>${escapeHtml(item.company)} — ${escapeHtml(item.position)} (${item.status}, unchanged since ${formatDate(item.statusChangedAt)})${link}</li>`;
        })
        .join('')}</ul>`
    : '<p>None</p>';
  const interviewHtml = data.upcomingInterviews.length
    ? `<ul>${data.upcomingInterviews.map((item) => `<li>${escapeHtml(item.company)} — ${escapeHtml(item.position)}: ${item.type} on ${formatDate(item.scheduledAt)}</li>`).join('')}</ul>`
    : '<p>None</p>';
  const statusHtml = Object.entries(data.statusCounts)
    .map(([status, count]) => `<li>${status}: ${count}</li>`)
    .join('');

  return {
    subject: 'Your weekly job search digest',
    text: `Applications needing follow-up\n${followUpText}\n\nUpcoming interviews (next 7 days)\n${interviewText}\n\nApplications by status\n${statusText}`,
    html: `<main><h1>Your weekly job search digest</h1><h2>Applications needing follow-up</h2>${followUpHtml}<h2>Upcoming interviews (next 7 days)</h2>${interviewHtml}<h2>Applications by status</h2><ul>${statusHtml}</ul></main>`,
  };
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

function safeJobUrl(value: string | null): string | null {
  return value && /^https?:\/\//i.test(value) ? value : null;
}
