import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../api/http-client';
import { useAuth } from '../auth/auth-context';
import { getUserSettings, updateUserSettings, type UserSettings } from './settings-api';

const MIN_FOLLOW_UP_DAYS = 1;
const MAX_FOLLOW_UP_DAYS = 3650;

export function SettingsPage() {
  const { user, logout } = useAuth();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [followUpDays, setFollowUpDays] = useState('7');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let current = true;
    setIsLoading(true);
    setLoadError('');
    getUserSettings()
      .then((loaded) => {
        if (!current) return;
        setSettings(loaded);
        setFollowUpDays(String(loaded.followUpDays));
      })
      .catch((error: unknown) => {
        if (current) setLoadError(errorMessage(error, 'Settings could not be loaded. Check your connection and try again.'));
      })
      .finally(() => { if (current) setIsLoading(false); });
    return () => { current = false; };
  }, [retryKey]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    const days = Number(followUpDays);
    if (!Number.isInteger(days) || days < MIN_FOLLOW_UP_DAYS || days > MAX_FOLLOW_UP_DAYS) {
      setSaveError(`Enter a whole number from ${MIN_FOLLOW_UP_DAYS} to ${MAX_FOLLOW_UP_DAYS}.`);
      return;
    }
    setIsSaving(true);
    setSaveError('');
    setSuccessMessage('');
    try {
      const saved = await updateUserSettings({ ...settings, followUpDays: days });
      setSettings(saved);
      setFollowUpDays(String(saved.followUpDays));
      setSuccessMessage('Settings saved.');
    } catch (error) {
      setSaveError(errorMessage(error, 'Settings could not be saved. Check your connection and try again.'));
    } finally {
      setIsSaving(false);
    }
  }

  function toggleDigest(enabled: boolean) {
    setSettings((current) => current ? { ...current, emailDigestEnabled: enabled } : current);
    setSaveError('');
    setSuccessMessage('');
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
          <Link className="active" to="/settings" aria-current="page">Settings</Link>
        </nav>
        <div className="board-account">
          <span className="account-email">{user?.email}</span>
          <button className="text-button" type="button" onClick={logout}>Sign out</button>
        </div>
      </header>

      <section className="settings-content">
        <div className="settings-heading">
          <p className="eyebrow">Your preferences</p>
          <h1>Settings</h1>
          <p className="board-subtitle">Choose whether to receive a weekly job search digest and when an application needs follow-up.</p>
        </div>
        {isLoading ? <div className="board-state" role="status">Loading settings…</div> : loadError ? (
          <div className="board-state board-state-error" role="alert">
            <p>{loadError}</p>
            <button className="secondary-action" type="button" onClick={() => setRetryKey((value) => value + 1)}>Try again</button>
          </div>
        ) : settings && (
          <form className="settings-panel" onSubmit={save}>
            {saveError && <p className="form-error" role="alert">{saveError}</p>}
            {successMessage && <p className="success-message" role="status">{successMessage}</p>}
            <label className="settings-toggle-row">
              <span>
                <strong>Weekly email digest</strong>
                <span className="settings-description">Receive follow-ups, status counts, and interviews coming up in the next 7 days.</span>
              </span>
              <input aria-label="Weekly email digest" type="checkbox" checked={settings.emailDigestEnabled} disabled={isSaving} onChange={(event) => toggleDigest(event.target.checked)} />
            </label>
            <p className="settings-hint">To stop these emails, switch off “Weekly email digest” and save your settings.</p>
            <label className="settings-days-field">
              <span>Follow-up after (days)</span>
              <input aria-label="Follow-up after days" type="number" min={MIN_FOLLOW_UP_DAYS} max={MAX_FOLLOW_UP_DAYS} step="1" required value={followUpDays} disabled={isSaving} onChange={(event) => setFollowUpDays(event.target.value)} />
              <span className="settings-description">Applications unchanged for this many days are included in your follow-up list and digest.</span>
            </label>
            <div className="settings-actions">
              <button className="primary-action" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save settings'}</button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}
