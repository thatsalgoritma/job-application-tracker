import { useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/http-client';
import { importApplications, type ImportReport, type ImportRowResult } from './applications-api';
import sampleCsvTemplate from './application-import-template.csv?raw';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const ACCEPTED_MIME_TYPES = {
  csv: ['text/csv', 'application/csv'],
  json: ['application/json'],
} as const;

interface ApplicationImportDialogProps {
  onClose(): void;
  onImported(): void;
}

export function ApplicationImportDialog({ onClose, onImported }: ApplicationImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportReport | null>(null);
  const [finalReport, setFinalReport] = useState<ImportReport | null>(null);
  const [busyAction, setBusyAction] = useState<'preview' | 'import' | null>(null);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busyAction);
  closeRef.current = onClose;
  busyRef.current = busyAction;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    fileInputRef.current?.focus();
    function handleKeyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (!busyRef.current) closeRef.current();
        event.preventDefault();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), a[href]:not([aria-disabled="true"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        last.focus();
        event.preventDefault();
      } else if (!event.shiftKey && document.activeElement === last) {
        first.focus();
        event.preventDefault();
      }
    }
    document.addEventListener('keydown', handleKeyboard);
    return () => {
      document.removeEventListener('keydown', handleKeyboard);
      previouslyFocused?.focus();
    };
  }, []);

  function selectFile(candidate: File | undefined) {
    setError('');
    setPreview(null);
    setFinalReport(null);
    if (!candidate) {
      setFile(null);
      return;
    }
    const extension = candidate.name.toLowerCase().split('.').pop();
    const format = extension === 'csv' || extension === 'json' ? extension : null;
    if (!format) {
      setFile(null);
      setError('Choose a .csv or .json file.');
      return;
    }
    if (candidate.size > MAX_FILE_BYTES) {
      setFile(null);
      setError('The file must be 2 MB or smaller.');
      return;
    }
    const allowedTypes: readonly string[] = ACCEPTED_MIME_TYPES[format];
    if (candidate.type && !allowedTypes.includes(candidate.type.toLowerCase())) {
      setFile(null);
      setError(`This ${format.toUpperCase()} file has an unsupported content type.`);
      return;
    }
    setFile(candidate.type ? candidate : new File([candidate], candidate.name, { type: ACCEPTED_MIME_TYPES[format][0] }));
  }

  async function runPreview() {
    if (!file) return;
    setBusyAction('preview');
    setError('');
    setFinalReport(null);
    try {
      setPreview(await importApplications(file, true));
    } catch (cause) {
      setError(errorMessage(cause, 'The file could not be checked. Confirm its format and try again.'));
    } finally {
      setBusyAction(null);
    }
  }

  async function confirmImport() {
    if (!file || !preview || preview.failed > 0) return;
    setBusyAction('import');
    setError('');
    try {
      const result = await importApplications(file, false);
      setFinalReport(result);
      if (result.failed === 0) onImported();
    } catch (cause) {
      setError(errorMessage(cause, 'The import could not be completed. Check your connection and try again.'));
    } finally {
      setBusyAction(null);
    }
  }

  const report = finalReport ?? preview;
  const canConfirm = Boolean(preview && preview.failed === 0 && !finalReport);

  return (
    <div className="dialog-backdrop">
      <section ref={dialogRef} className="application-dialog import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" aria-describedby="import-description">
        <header className="dialog-heading">
          <div><p className="eyebrow">Move your records</p><h2 id="import-title">Import applications</h2></div>
          <button className="icon-button" type="button" aria-label="Close import dialog" onClick={onClose} disabled={Boolean(busyAction)}>×</button>
        </header>
        <p id="import-description" className="import-description">Choose a CSV or JSON file. We’ll check every row before anything is added.</p>
        {!finalReport && (
          <div className="import-file-row">
            <label className="import-file-picker">
              <span>Applications file</span>
              <input ref={fileInputRef} aria-label="Applications file" type="file" accept=".csv,.json,text/csv,application/csv,application/json" disabled={Boolean(busyAction)} onChange={(event) => selectFile(event.target.files?.[0])} />
            </label>
            <a className="sample-template-link" href={`data:text/csv;charset=utf-8,${encodeURIComponent(sampleCsvTemplate)}`} download="application-import-template.csv">Download sample CSV template</a>
          </div>
        )}
        {file && !finalReport && <p className="selected-file">Selected: <strong>{file.name}</strong> ({formatSize(file.size)})</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {busyAction && <p className="import-progress" role="status">{busyAction === 'preview' ? 'Checking rows…' : 'Importing applications…'}</p>}
        {report && <ImportReportView report={report} isFinal={Boolean(finalReport)} />}
        {preview && preview.failed > 0 && !finalReport && (
          <p className="import-atomic-warning" role="note">Fix the invalid rows before importing. This import is all-or-nothing, so one invalid row would prevent every valid row from being added.</p>
        )}
        <div className="dialog-actions import-actions">
          {finalReport ? <button className="primary-action" type="button" onClick={onClose}>Done</button> : <>
            <button className="secondary-action" type="button" onClick={onClose} disabled={Boolean(busyAction)}>Cancel</button>
            <button className="secondary-action" type="button" onClick={() => void runPreview()} disabled={!file || Boolean(busyAction)}>{busyAction === 'preview' ? 'Checking…' : 'Run dry run'}</button>
            <button className="primary-action" type="button" onClick={() => void confirmImport()} disabled={!canConfirm || Boolean(busyAction)}>{busyAction === 'import' ? 'Importing…' : 'Confirm import'}</button>
          </>}
        </div>
      </section>
    </div>
  );
}

function ImportReportView({ report, isFinal }: { report: ImportReport; isFinal: boolean }) {
  return (
    <section className="import-report" aria-label={isFinal ? 'Import results' : 'Dry run preview'}>
      <div className="import-report-heading"><h3>{isFinal ? 'Import report' : 'Dry run preview'}</h3><p>{isFinal ? 'Import finished.' : 'Nothing has been added yet.'}</p></div>
      <dl className="import-counts">
        <div><dt>{isFinal ? 'Created' : 'To be created'}</dt><dd>{report.created}</dd></div>
        <div><dt>Skipped</dt><dd>{report.skipped}</dd></div>
        <div><dt>Failed</dt><dd>{report.failed}</dd></div>
      </dl>
      <div className="import-table-wrap"><table className="import-table">
        <thead><tr><th scope="col">Row</th><th scope="col">Result</th><th scope="col">Reason</th></tr></thead>
        <tbody>{report.rows.map((row) => <ImportReportRow key={row.row} row={row} isFinal={isFinal} />)}</tbody>
      </table></div>
    </section>
  );
}

function ImportReportRow({ row, isFinal }: { row: ImportRowResult; isFinal: boolean }) {
  const result = row.outcome === 'failed' ? 'Invalid'
    : row.outcome === 'skipped' ? isDuplicateReason(row.reason) ? 'Duplicate' : 'Skipped'
      : isFinal ? 'Created' : 'To be created';
  return <tr><td>{row.row}</td><td><span className={`import-outcome import-outcome-${row.outcome}`}>{result}</span></td><td>{row.reason ?? '—'}</td></tr>;
}

function isDuplicateReason(reason?: string): boolean {
  return Boolean(reason && /duplicate|already exists/i.test(reason));
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}
