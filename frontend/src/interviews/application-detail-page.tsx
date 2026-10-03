import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError } from '../api/http-client';
import { useAuth } from '../auth/auth-context';
import {
  STATUS_LABELS,
  availableStatuses,
  type Application,
  type ApplicationStatus,
} from '../applications/application-types';
import { getApplication, updateApplication } from '../applications/applications-api';
import {
  createInterview,
  deleteInterview,
  listInterviews,
  updateInterview,
} from './interviews-api';
import {
  INTERVIEW_TYPE_LABELS,
  INTERVIEW_TYPES,
  type Interview,
  type InterviewInput,
  type InterviewType,
} from './interview-types';

interface ApplicationFormState {
  company: string;
  position: string;
  jobUrl: string;
  location: string;
  source: string;
  status: ApplicationStatus;
  appliedAt: string;
  notes: string;
}

interface InterviewFormState {
  type: InterviewType;
  scheduledAt: string;
  notes: string;
  outcome: string;
}

const EMPTY_INTERVIEW: InterviewFormState = {
  type: 'HR',
  scheduledAt: '',
  notes: '',
  outcome: '',
};

export function ApplicationDetailPage() {
  const { applicationId = '' } = useParams();
  const { user, logout } = useAuth();
  const [application, setApplication] = useState<Application | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [applicationForm, setApplicationForm] = useState<ApplicationFormState | null>(null);
  const [interviewForm, setInterviewForm] = useState<InterviewFormState>(EMPTY_INTERVIEW);
  const [editingInterviewId, setEditingInterviewId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingApplication, setIsSavingApplication] = useState(false);
  const [isSavingInterview, setIsSavingInterview] = useState(false);
  const [deletingInterviewId, setDeletingInterviewId] = useState<string | null>(null);
  const [pageError, setPageError] = useState('');
  const [applicationError, setApplicationError] = useState('');
  const [interviewError, setInterviewError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setPageError('');
    Promise.all([getApplication(applicationId), listInterviews(applicationId)])
      .then(([loadedApplication, loadedInterviews]) => {
        if (!active) return;
        setApplication(loadedApplication);
        setInterviews(loadedInterviews);
        setApplicationForm(toApplicationForm(loadedApplication));
      })
      .catch((error: unknown) => {
        if (active) setPageError(errorMessage(error, 'Could not load this application.'));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [applicationId]);

  function changeApplication<Key extends keyof ApplicationFormState>(
    key: Key,
    value: ApplicationFormState[Key],
  ) {
    setApplicationForm((current) => current ? { ...current, [key]: value } : current);
  }

  async function saveApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!applicationForm || !application) return;
    setIsSavingApplication(true);
    setApplicationError('');
    setSuccessMessage('');
    const changes = {
      company: applicationForm.company.trim(),
      position: applicationForm.position.trim(),
      jobUrl: applicationForm.jobUrl.trim() || null,
      location: applicationForm.location.trim() || null,
      source: applicationForm.source.trim() || null,
      status: applicationForm.status,
      appliedAt: new Date(`${applicationForm.appliedAt}T12:00:00`).toISOString(),
      notes: applicationForm.notes.trim() || null,
    };
    try {
      const updated = await updateApplication(application.id, changes);
      setApplication(updated);
      setApplicationForm(toApplicationForm(updated));
      setSuccessMessage('Application details saved.');
    } catch (error) {
      setApplicationError(errorMessage(error, 'Could not save application details.'));
    } finally {
      setIsSavingApplication(false);
    }
  }

  function startEditingInterview(interview: Interview) {
    setEditingInterviewId(interview.id);
    setInterviewForm({
      type: interview.type,
      scheduledAt: toDateTimeLocal(interview.scheduledAt),
      notes: interview.notes ?? '',
      outcome: interview.outcome ?? '',
    });
    setInterviewError('');
  }

  function resetInterviewForm() {
    setEditingInterviewId(null);
    setInterviewForm(EMPTY_INTERVIEW);
    setInterviewError('');
  }

  async function saveInterview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingInterview(true);
    setInterviewError('');
    setSuccessMessage('');
    const input: InterviewInput = {
      type: interviewForm.type,
      scheduledAt: new Date(interviewForm.scheduledAt).toISOString(),
      notes: interviewForm.notes.trim() || null,
      outcome: interviewForm.outcome.trim() || null,
    };
    try {
      if (editingInterviewId) {
        await updateInterview(applicationId, editingInterviewId, input);
      } else {
        await createInterview(applicationId, input);
      }
      setInterviews(await listInterviews(applicationId));
      resetInterviewForm();
      setSuccessMessage(editingInterviewId ? 'Interview updated.' : 'Interview scheduled.');
    } catch (error) {
      setInterviewError(errorMessage(error, 'Could not save this interview.'));
    } finally {
      setIsSavingInterview(false);
    }
  }

  async function removeInterview(interviewId: string) {
    setDeletingInterviewId(interviewId);
    setInterviewError('');
    try {
      await deleteInterview(applicationId, interviewId);
      setInterviews((current) => current.filter((interview) => interview.id !== interviewId));
      if (editingInterviewId === interviewId) resetInterviewForm();
      setSuccessMessage('Interview removed.');
    } catch (error) {
      setInterviewError(errorMessage(error, 'Could not remove this interview.'));
    } finally {
      setDeletingInterviewId(null);
    }
  }

  return (
    <main className="board-page">
      <header className="board-topbar">
        <Link className="board-brand" to="/applications" aria-label="Back to applications">
          <span className="board-brand-mark" aria-hidden="true">JT</span>
          <span>Job Application Tracker</span>
        </Link>
        <nav className="topbar-navigation" aria-label="Main navigation">
          <Link to="/applications">Applications</Link>
          <Link to="/insights">Insights</Link>
        </nav>
        <div className="board-account">
          <span className="account-email">{user?.email}</span>
          <button className="text-button" type="button" onClick={logout}>Sign out</button>
        </div>
      </header>

      <section className="detail-content">
        <Link className="back-link" to="/applications">← Back to applications</Link>
        {isLoading ? (
          <div className="board-state" role="status">Loading application details…</div>
        ) : pageError ? (
          <div className="board-state board-state-error" role="alert">{pageError}</div>
        ) : application && applicationForm ? (
          <>
            <div className="detail-heading">
              <div>
                <p className="eyebrow">Application details</p>
                <h1>{application.company}</h1>
                <p>{application.position}</p>
              </div>
              <span className={`detail-status status-${application.status.toLowerCase()}`}>
                {STATUS_LABELS[application.status]}
              </span>
            </div>

            {successMessage && <p className="success-message" role="status">{successMessage}</p>}

            <div className="detail-grid">
              <section className="detail-panel">
                <div className="panel-heading">
                  <div><p className="eyebrow">Role information</p><h2>Edit application</h2></div>
                </div>
                <form className="application-form" onSubmit={saveApplication}>
                  {applicationError && <p className="form-error" role="alert">{applicationError}</p>}
                  <label><span>Company *</span><input required maxLength={200} value={applicationForm.company} onChange={(event) => changeApplication('company', event.target.value)} /></label>
                  <label><span>Position *</span><input required maxLength={200} value={applicationForm.position} onChange={(event) => changeApplication('position', event.target.value)} /></label>
                  <label><span>Job URL</span><input type="url" value={applicationForm.jobUrl} onChange={(event) => changeApplication('jobUrl', event.target.value)} placeholder="https://…" /></label>
                  <div className="form-row">
                    <label><span>Location</span><input maxLength={200} value={applicationForm.location} onChange={(event) => changeApplication('location', event.target.value)} /></label>
                    <label><span>Source</span><input maxLength={100} value={applicationForm.source} onChange={(event) => changeApplication('source', event.target.value)} /></label>
                  </div>
                  <div className="form-row">
                    <label><span>Status</span><select value={applicationForm.status} onChange={(event) => changeApplication('status', event.target.value as ApplicationStatus)}>
                      {availableStatuses(application.status).map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
                    </select></label>
                    <label><span>Date applied</span><input type="date" required value={applicationForm.appliedAt} onChange={(event) => changeApplication('appliedAt', event.target.value)} /></label>
                  </div>
                  <label><span>Notes</span><textarea rows={4} maxLength={5000} value={applicationForm.notes} onChange={(event) => changeApplication('notes', event.target.value)} /></label>
                  <button className="primary-action" type="submit" disabled={isSavingApplication}>{isSavingApplication ? 'Saving…' : 'Save changes'}</button>
                </form>
              </section>

              <section className="detail-panel interview-panel">
                <div className="panel-heading">
                  <div><p className="eyebrow">Interview timeline</p><h2>Interviews <span className="interview-count">{interviews.length}</span></h2></div>
                </div>
                {interviewError && <p className="form-error" role="alert">{interviewError}</p>}
                <div className="interview-list">
                  {interviews.length === 0 ? (
                    <div className="interview-empty"><span aria-hidden="true">◷</span><p>No interviews scheduled yet.</p></div>
                  ) : interviews.map((interview) => (
                    <article className="interview-card" key={interview.id}>
                      <div className="interview-card-heading">
                        <div><span className="interview-type">{INTERVIEW_TYPE_LABELS[interview.type]}</span><time dateTime={interview.scheduledAt}>{formatDateTime(interview.scheduledAt)}</time></div>
                        <div className="interview-actions">
                          <button className="text-button" type="button" onClick={() => startEditingInterview(interview)}>Edit</button>
                          <button className="text-button danger-text" type="button" disabled={deletingInterviewId === interview.id} onClick={() => void removeInterview(interview.id)}>{deletingInterviewId === interview.id ? 'Removing…' : 'Delete'}</button>
                        </div>
                      </div>
                      {interview.notes && <p className="interview-notes">{interview.notes}</p>}
                      {interview.outcome && <p className="interview-outcome"><strong>Outcome:</strong> {interview.outcome}</p>}
                    </article>
                  ))}
                </div>

                <form className="application-form interview-form" onSubmit={saveInterview}>
                  <h3>{editingInterviewId ? 'Edit interview' : 'Schedule an interview'}</h3>
                  <label><span>Interview type *</span><select value={interviewForm.type} onChange={(event) => setInterviewForm((current) => ({ ...current, type: event.target.value as InterviewType }))}>
                    {INTERVIEW_TYPES.map((type) => <option key={type} value={type}>{INTERVIEW_TYPE_LABELS[type]}</option>)}
                  </select></label>
                  <label><span>Date and time *</span><input type="datetime-local" required value={interviewForm.scheduledAt} onChange={(event) => setInterviewForm((current) => ({ ...current, scheduledAt: event.target.value }))} /></label>
                  <label><span>Notes</span><textarea rows={3} maxLength={5000} value={interviewForm.notes} onChange={(event) => setInterviewForm((current) => ({ ...current, notes: event.target.value }))} /></label>
                  <label><span>Outcome</span><textarea rows={2} maxLength={1000} value={interviewForm.outcome} onChange={(event) => setInterviewForm((current) => ({ ...current, outcome: event.target.value }))} /></label>
                  <div className="dialog-actions">
                    {editingInterviewId && <button className="secondary-action" type="button" onClick={resetInterviewForm}>Cancel edit</button>}
                    <button className="primary-action" type="submit" disabled={isSavingInterview}>{isSavingInterview ? 'Saving…' : editingInterviewId ? 'Save interview' : 'Schedule interview'}</button>
                  </div>
                </form>
              </section>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}

function toApplicationForm(application: Application): ApplicationFormState {
  return {
    company: application.company,
    position: application.position,
    jobUrl: application.jobUrl ?? '',
    location: application.location ?? '',
    source: application.source ?? '',
    status: application.status,
    appliedAt: application.appliedAt.slice(0, 10),
    notes: application.notes ?? '',
  };
}

function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}
