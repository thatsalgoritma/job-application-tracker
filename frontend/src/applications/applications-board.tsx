import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ApiError } from '../api/http-client';
import { useAuth } from '../auth/auth-context';
import {
  APPLICATION_STATUSES,
  STATUS_LABELS,
  availableStatuses,
  type Application,
  type ApplicationFilters,
  type ApplicationStatus,
  type NewApplication,
} from './application-types';
import {
  createApplication,
  deleteApplication,
  listApplications,
  updateApplicationStatus,
} from './applications-api';
import { DeleteApplicationDialog } from './delete-application-dialog';

const INITIAL_FILTERS: ApplicationFilters = {
  status: '',
  company: '',
  search: '',
  appliedFrom: '',
  appliedTo: '',
};

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export function ApplicationsBoard() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [settledFilters, setSettledFilters] = useState(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [applications, setApplications] = useState<Application[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busyApplicationId, setBusyApplicationId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Application | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [successMessage, setSuccessMessage] = useState<string>(
    (location.state as { notice?: string } | null)?.notice ?? '',
  );

  useEffect(() => {
    const notice = (location.state as { notice?: string } | null)?.notice;
    if (notice) window.history.replaceState({}, document.title);
  }, [location.state]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettledFilters(filters), 250);
    return () => window.clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    let isCurrentRequest = true;
    setIsLoading(true);
    setLoadError('');

    void listApplications(settledFilters, page, pageSize)
      .then((result) => {
        if (!isCurrentRequest) return;
        setApplications(result.data);
        setTotal(result.meta.total);
        setTotalPages(result.meta.totalPages);
      })
      .catch((error: unknown) => {
        if (!isCurrentRequest) return;
        setLoadError(
          error instanceof ApiError
            ? error.message
            : 'Applications could not be loaded. Check your connection and try again.',
        );
      })
      .finally(() => {
        if (isCurrentRequest) setIsLoading(false);
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [settledFilters, page, pageSize, refreshKey]);

  const applicationsByStatus = useMemo(
    () =>
      APPLICATION_STATUSES.reduce(
        (groups, status) => {
          groups[status] = applications.filter((application) => application.status === status);
          return groups;
        },
        {} as Record<ApplicationStatus, Application[]>,
      ),
    [applications],
  );

  function updateFilter<Key extends keyof ApplicationFilters>(
    key: Key,
    value: ApplicationFilters[Key],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  async function handleStatusChange(
    application: Application,
    nextStatus: ApplicationStatus,
  ) {
    if (nextStatus === application.status) return;
    setBusyApplicationId(application.id);
    setActionError('');
    try {
      await updateApplicationStatus(application.id, nextStatus);
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? error.message
          : 'The status could not be updated. Please try again.',
      );
    } finally {
      setBusyApplicationId(null);
    }
  }

  async function handleCreate(application: NewApplication) {
    setIsCreating(true);
    setActionError('');
    try {
      await createApplication(application);
      setIsCreateOpen(false);
      setPage(1);
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? error.message
          : 'The application could not be created. Please try again.',
      );
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      await deleteApplication(deleteTarget.id);
      setApplications((current) => current.filter((item) => item.id !== deleteTarget.id));
      setTotal((current) => Math.max(0, current - 1));
      setSuccessMessage(`${deleteTarget.company} — ${deleteTarget.position} was deleted.`);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteError(error instanceof ApiError && error.status === 404
        ? 'This application was already deleted or is no longer available.'
        : error instanceof ApiError
          ? error.message
          : 'Could not delete this application. Check your connection and try again.');
    } finally {
      setIsDeleting(false);
    }
  }

  const firstVisible = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastVisible = Math.min(page * pageSize, total);

  return (
    <main className="board-page">
      <header className="board-topbar">
        <a className="board-brand" href="/applications" aria-label="Job Application Tracker home">
          <span className="board-brand-mark" aria-hidden="true">JT</span>
          <span>Job Application Tracker</span>
        </a>
        <nav className="topbar-navigation" aria-label="Main navigation">
          <Link className="active" to="/applications">Applications</Link>
          <Link to="/insights">Insights</Link>
        </nav>
        <div className="board-account">
          <span className="account-email">{user?.email}</span>
          <button className="text-button" type="button" onClick={logout}>Sign out</button>
        </div>
      </header>

      <section className="board-content">
        <div className="board-heading">
          <div>
            <p className="eyebrow">Your job search</p>
            <h1>Applications</h1>
            <p className="board-subtitle">Track progress and keep the next step in sight.</p>
          </div>
          <button
            className="primary-action"
            type="button"
            onClick={() => {
              setActionError('');
              setIsCreateOpen(true);
            }}
          >
            <span aria-hidden="true">＋</span> Add application
          </button>
        </div>

        <section className="board-filters" aria-label="Filter applications">
          <label className="filter-search">
            <span>Search</span>
            <input
              aria-label="Search applications"
              type="search"
              placeholder="Company, position, or notes"
              value={filters.search}
              onChange={(event) => updateFilter('search', event.target.value)}
            />
          </label>
          <label>
            <span>Company</span>
            <input
              aria-label="Filter by company"
              type="search"
              placeholder="Any company"
              value={filters.company}
              onChange={(event) => updateFilter('company', event.target.value)}
            />
          </label>
          <label>
            <span>Status</span>
            <select
              aria-label="Filter by status"
              value={filters.status}
              onChange={(event) =>
                updateFilter('status', event.target.value as ApplicationFilters['status'])
              }
            >
              <option value="">All statuses</option>
              {APPLICATION_STATUSES.map((status) => (
                <option key={status} value={status}>{STATUS_LABELS[status]}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Applied after</span>
            <input
              aria-label="Applied from"
              type="date"
              value={filters.appliedFrom}
              onChange={(event) => updateFilter('appliedFrom', event.target.value)}
            />
          </label>
          <label>
            <span>Applied before</span>
            <input
              aria-label="Applied to"
              type="date"
              value={filters.appliedTo}
              onChange={(event) => updateFilter('appliedTo', event.target.value)}
            />
          </label>
        </section>

        {actionError && <p className="board-error" role="alert">{actionError}</p>}
        {successMessage && <p className="success-message" role="status">{successMessage}</p>}

        <div className="board-summary" aria-live="polite">
          <span>{total} {total === 1 ? 'application' : 'applications'}</span>
          <label>
            <span>Per page</span>
            <select
              aria-label="Applications per page"
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        </div>

        {isLoading ? (
          <div className="board-state" role="status">Loading applications…</div>
        ) : loadError ? (
          <div className="board-state board-state-error" role="alert">
            <p>{loadError}</p>
            <button className="secondary-action" type="button" onClick={() => setRefreshKey((key) => key + 1)}>
              Try again
            </button>
          </div>
        ) : applications.length === 0 ? (
          <div className="board-state board-empty-state">
            <span className="empty-icon" aria-hidden="true">↗</span>
            <h2>{total === 0 && !hasActiveFilters(settledFilters) ? 'Start with your first application' : 'No applications match these filters'}</h2>
            <p>{total === 0 && !hasActiveFilters(settledFilters) ? 'Add a role to keep its status, interviews, and follow-ups together.' : 'Try changing your search or filters.'}</p>
            {total === 0 && !hasActiveFilters(settledFilters) && (
              <button className="primary-action" type="button" onClick={() => setIsCreateOpen(true)}>
                Add application
              </button>
            )}
          </div>
        ) : (
          <section className="kanban-board" aria-label="Applications by status">
            {APPLICATION_STATUSES.map((status) => (
              <section className={`kanban-column status-${status.toLowerCase()}`} key={status} aria-label={`${STATUS_LABELS[status]} applications`}>
                <header className="column-heading">
                  <span className="status-dot" aria-hidden="true" />
                  <h2>{STATUS_LABELS[status]}</h2>
                  <span className="column-count">{applicationsByStatus[status].length}</span>
                </header>
                <div className="column-cards">
                  {applicationsByStatus[status].length === 0 ? (
                    <p className="column-empty">No applications</p>
                  ) : (
                    applicationsByStatus[status].map((application) => (
                      <ApplicationCard
                        key={application.id}
                        application={application}
                        isUpdating={busyApplicationId === application.id}
                        onStatusChange={(nextStatus) => void handleStatusChange(application, nextStatus)}
                        onDelete={() => { setDeleteError(''); setDeleteTarget(application); }}
                      />
                    ))
                  )}
                </div>
              </section>
            ))}
          </section>
        )}

        <footer className="board-pagination">
          <span>Showing {firstVisible}–{lastVisible} of {total}</span>
          <div className="pagination-actions">
            <button
              className="secondary-action"
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </button>
            <span>Page {page} of {Math.max(totalPages, 1)}</span>
            <button
              className="secondary-action"
              type="button"
              disabled={page >= totalPages || isLoading}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </div>
        </footer>
      </section>

      {isCreateOpen && (
        <CreateApplicationDialog
          isSaving={isCreating}
          onClose={() => setIsCreateOpen(false)}
          onSubmit={handleCreate}
        />
      )}
      {deleteTarget && <DeleteApplicationDialog application={deleteTarget} isDeleting={isDeleting} error={deleteError} onCancel={() => setDeleteTarget(null)} onConfirm={handleDelete} />}
    </main>
  );
}

interface ApplicationCardProps {
  application: Application;
  isUpdating: boolean;
  onStatusChange(status: ApplicationStatus): void;
  onDelete(): void;
}

function ApplicationCard({ application, isUpdating, onStatusChange, onDelete }: ApplicationCardProps) {
  const appliedDate = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(application.appliedAt));

  return (
    <article className="application-card">
      <div className="card-company-row">
        <h3>{application.company}</h3>
        <span className="card-date">{appliedDate}</span>
      </div>
      <p className="card-position">{application.position}</p>
      <Link className="card-detail-link" to={`/applications/${application.id}`}>View details →</Link>
      {application.location && <p className="card-location">{application.location}</p>}
      {application.notes && <p className="card-notes">{application.notes}</p>}
      <label className="card-status-label">
        <span>Status</span>
        <select
          aria-label={`Change status for ${application.company}`}
          value={application.status}
          disabled={isUpdating}
          onChange={(event) => onStatusChange(event.target.value as ApplicationStatus)}
        >
          {availableStatuses(application.status).map((status) => (
            <option key={status} value={status}>{STATUS_LABELS[status]}</option>
          ))}
        </select>
      </label>
      <button className="text-button danger-text card-delete-action" type="button" onClick={onDelete}>Delete</button>
    </article>
  );
}

interface CreateApplicationDialogProps {
  isSaving: boolean;
  onClose(): void;
  onSubmit(application: NewApplication): Promise<void>;
}

function CreateApplicationDialog({ isSaving, onClose, onSubmit }: CreateApplicationDialogProps) {
  const [company, setCompany] = useState('');
  const [position, setPosition] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [location, setLocation] = useState('');
  const [source, setSource] = useState('');
  const [appliedAt, setAppliedAt] = useState('');
  const [notes, setNotes] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const application: NewApplication = {
      company: company.trim(),
      position: position.trim(),
      ...(jobUrl.trim() ? { jobUrl: jobUrl.trim() } : {}),
      ...(location.trim() ? { location: location.trim() } : {}),
      ...(source.trim() ? { source: source.trim() } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(appliedAt ? { appliedAt: new Date(`${appliedAt}T12:00:00`).toISOString() } : {}),
    };
    void onSubmit(application);
  }

  return (
    <div className="dialog-backdrop">
      <section className="application-dialog" role="dialog" aria-modal="true" aria-labelledby="create-application-title">
        <header className="dialog-heading">
          <div>
            <p className="eyebrow">New opportunity</p>
            <h2 id="create-application-title">Add application</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close dialog" onClick={onClose}>×</button>
        </header>
        <form className="application-form" onSubmit={submit}>
          <label>
            <span>Company *</span>
            <input value={company} onChange={(event) => setCompany(event.target.value)} maxLength={200} required />
          </label>
          <label>
            <span>Position *</span>
            <input value={position} onChange={(event) => setPosition(event.target.value)} maxLength={200} required />
          </label>
          <label>
            <span>Job URL</span>
            <input type="url" value={jobUrl} onChange={(event) => setJobUrl(event.target.value)} placeholder="https://…" />
          </label>
          <div className="form-row">
            <label>
              <span>Location</span>
              <input value={location} onChange={(event) => setLocation(event.target.value)} maxLength={200} />
            </label>
            <label>
              <span>Source</span>
              <input value={source} onChange={(event) => setSource(event.target.value)} maxLength={100} />
            </label>
          </div>
          <label>
            <span>Date applied</span>
            <input type="date" value={appliedAt} onChange={(event) => setAppliedAt(event.target.value)} />
          </label>
          <label>
            <span>Notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={5000} rows={3} />
          </label>
          <p className="dialog-hint">New applications start in Applied.</p>
          <div className="dialog-actions">
            <button className="secondary-action" type="button" onClick={onClose} disabled={isSaving}>Cancel</button>
            <button className="primary-action" type="submit" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save application'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function hasActiveFilters(filters: ApplicationFilters): boolean {
  return Boolean(
    filters.status ||
      filters.company.trim() ||
      filters.search.trim() ||
      filters.appliedFrom ||
      filters.appliedTo,
  );
}
