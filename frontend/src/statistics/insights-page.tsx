import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/http-client';
import { useAuth } from '../auth/auth-context';
import {
  APPLICATION_STATUSES,
  STATUS_LABELS,
  type Application,
  type ApplicationStatus,
} from '../applications/application-types';
import {
  getApplicationStats,
  getFollowUpApplications,
  type ApplicationStats,
} from './statistics-api';

const STATUS_COLORS: Record<ApplicationStatus, string> = {
  APPLIED: '#7790a8',
  SCREENING: '#5694cf',
  INTERVIEW: '#a17ac8',
  OFFER: '#36a57c',
  REJECTED: '#d36e6e',
  WITHDRAWN: '#8993a0',
};

export function InsightsPage() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState<ApplicationStats | null>(null);
  const [followUps, setFollowUps] = useState<Application[]>([]);
  const [days, setDays] = useState(7);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError('');
    Promise.all([getApplicationStats(), getFollowUpApplications(days)])
      .then(([loadedStats, loadedFollowUps]) => {
        if (!active) return;
        setStats(loadedStats);
        setFollowUps(loadedFollowUps);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            requestError instanceof ApiError
              ? requestError.message
              : 'Insights could not be loaded. Check your connection and try again.',
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [days, retryKey]);

  const maxCount = Math.max(1, ...(stats ? Object.values(stats.countsByStatus) : [0]));

  return (
    <main className="board-page">
      <header className="board-topbar">
        <Link className="board-brand" to="/applications" aria-label="Back to applications">
          <span className="board-brand-mark" aria-hidden="true">JT</span>
          <span>Job Application Tracker</span>
        </Link>
        <nav className="topbar-navigation" aria-label="Main navigation">
          <Link to="/applications">Applications</Link>
          <Link className="active" to="/insights">Insights</Link>
        </nav>
        <div className="board-account">
          <span className="account-email">{user?.email}</span>
          <button className="text-button" type="button" onClick={logout}>Sign out</button>
        </div>
      </header>

      <section className="insights-content">
        <div className="insights-heading">
          <div>
            <p className="eyebrow">Your job search</p>
            <h1>Insights</h1>
            <p className="board-subtitle">A quick look at your progress and next follow-ups.</p>
          </div>
          <Link className="secondary-action" to="/applications">View applications</Link>
        </div>

        {error && (
          <div className="board-state board-state-error" role="alert">
            <p>{error}</p>
            <button className="secondary-action" type="button" onClick={() => setRetryKey((value) => value + 1)}>Try again</button>
          </div>
        )}
        {isLoading ? (
          <div className="board-state" role="status">Loading insights…</div>
        ) : !error && stats && (
          <>
            <section className="metric-grid" aria-label="Application summary">
              <article className="metric-card">
                <span className="metric-label">Total applications</span>
                <strong>{stats.totalApplications}</strong>
                <span className="metric-caption">Across all statuses</span>
              </article>
              <article className="metric-card response-metric">
                <span className="metric-label">Response rate</span>
                <strong>{stats.responseRate.percentage}%</strong>
                <span className="metric-caption">
                  {stats.responseRate.respondedApplications} responses from {stats.responseRate.eligibleApplications} active or completed applications
                </span>
              </article>
              <article className="metric-card">
                <span className="metric-label">In progress</span>
                <strong>{stats.countsByStatus.APPLIED + stats.countsByStatus.SCREENING + stats.countsByStatus.INTERVIEW}</strong>
                <span className="metric-caption">Applied, screening, or interviewing</span>
              </article>
            </section>

            <div className="insights-grid">
              <section className="insights-panel" aria-labelledby="status-chart-title">
                <div className="panel-heading">
                  <div><p className="eyebrow">Application pipeline</p><h2 id="status-chart-title">Applications by status</h2></div>
                </div>
                {stats.totalApplications === 0 ? (
                  <div className="chart-empty">Add applications to see your status breakdown.</div>
                ) : (
                  <div className="status-chart" role="img" aria-label="Bar chart showing application counts by status">
                    {APPLICATION_STATUSES.map((status) => {
                      const count = stats.countsByStatus[status];
                      const width = count === 0 ? 0 : Math.max(4, (count / maxCount) * 100);
                      return (
                        <div className="chart-row" key={status}>
                          <span className="chart-label">{STATUS_LABELS[status]}</span>
                          <div className="chart-track" aria-hidden="true">
                            <span className="chart-bar" style={{ width: `${width}%`, backgroundColor: STATUS_COLORS[status] }} />
                          </div>
                          <strong className="chart-value">{count}</strong>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="insights-panel follow-up-panel" aria-labelledby="follow-up-title">
                <div className="panel-heading follow-up-heading">
                  <div><p className="eyebrow">Keep things moving</p><h2 id="follow-up-title">Follow-up needed</h2></div>
                  <label className="days-control">
                    <span>Unchanged for</span>
                    <select aria-label="Follow-up age in days" value={days} onChange={(event) => setDays(Number(event.target.value))}>
                      {[7, 14, 30, 60].map((value) => <option key={value} value={value}>{value} days</option>)}
                    </select>
                  </label>
                </div>
                {followUps.length === 0 ? (
                  <div className="follow-up-empty">
                    <span aria-hidden="true">✓</span>
                    <h3>Nothing needs a follow-up</h3>
                    <p>No active applications have been unchanged for {days} days.</p>
                  </div>
                ) : (
                  <ul className="follow-up-list">
                    {followUps.map((application) => (
                      <FollowUpItem key={application.id} application={application} />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

function FollowUpItem({ application }: { application: Application }) {
  return (
    <li className="follow-up-item">
      <div className="follow-up-item-main">
        <strong>{application.company}</strong>
        <span>{application.position}</span>
      </div>
      <div className="follow-up-item-meta">
        <span className={`follow-up-status status-${application.status.toLowerCase()}`}>{STATUS_LABELS[application.status]}</span>
        <span>Updated {formatRelativeDate(application.statusChangedAt)}</span>
      </div>
      <Link to={`/applications/${application.id}`} aria-label={`Open ${application.company} details`}>Open →</Link>
    </li>
  );
}

function formatRelativeDate(value: string): string {
  const elapsedDays = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (elapsedDays === 0) return 'today';
  if (elapsedDays === 1) return '1 day ago';
  return `${elapsedDays} days ago`;
}
