import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_STORAGE_KEY } from '../api/http-client';
import { ApplicationImportDialog } from './application-import-dialog';
import type { ImportReport } from './applications-api';

const previewReport: ImportReport = {
  dryRun: true,
  created: 1,
  skipped: 1,
  failed: 1,
  rows: [
    { row: 2, outcome: 'created' },
    { row: 3, outcome: 'skipped', reason: 'Application already exists for this user' },
    { row: 4, outcome: 'failed', reason: 'position should not be empty' },
  ],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function renderDialog(onImported = vi.fn(), onClose = vi.fn()) {
  return render(<ApplicationImportDialog onClose={onClose} onImported={onImported} />);
}

function selectCsv() {
  const file = new File(['Company,Position\nAcme,Engineer'], 'applications.csv', { type: 'text/csv' });
  fireEvent.change(screen.getByLabelText('Applications file'), { target: { files: [file] } });
}

describe('ApplicationImportDialog', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('starts idle with the sample template and no enabled actions until a file is selected', () => {
    renderDialog();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Import applications');
    expect(screen.getByLabelText('Applications file')).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Download sample CSV template' })).toHaveAttribute('download', 'application-import-template.csv');
    expect(screen.getByRole('button', { name: 'Run dry run' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirm import' })).toBeDisabled();
  });

  it('previews created, duplicate, and invalid rows with their reasons', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-token');
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(previewReport));
    vi.stubGlobal('fetch', fetchMock);
    renderDialog();
    selectCsv();
    fireEvent.click(screen.getByRole('button', { name: 'Run dry run' }));

    const preview = await screen.findByRole('region', { name: 'Dry run preview' });
    expect(within(preview).getAllByText('To be created').length).toBeGreaterThan(0);
    expect(within(preview).getByText('Duplicate')).toBeInTheDocument();
    expect(within(preview).getByText('Invalid')).toBeInTheDocument();
    expect(within(preview).getByText('Application already exists for this user')).toBeInTheDocument();
    expect(within(preview).getByText('position should not be empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm import' })).toBeDisabled();
    expect(screen.getByText(/all-or-nothing/)).toBeInTheDocument();

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/applications\/import\?dryRun=true$/);
    expect(options.method).toBe('POST');
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer test-token');
    expect(new Headers(options.headers).has('Content-Type')).toBe(false);
    expect((options.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('shows a request error without losing the dialog', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ message: 'Import file must be 2 MB or smaller' }, 413)));
    renderDialog();
    selectCsv();
    fireEvent.click(screen.getByRole('button', { name: 'Run dry run' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Import file must be 2 MB or smaller');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('confirms a clean preview, shows the final counts, and refreshes the board', async () => {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, 'test-token');
    const cleanPreview: ImportReport = { dryRun: true, created: 1, skipped: 0, failed: 0, rows: [{ row: 2, outcome: 'created' }] };
    const finalReport: ImportReport = { ...cleanPreview, dryRun: false };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(cleanPreview))
      .mockResolvedValueOnce(jsonResponse(finalReport));
    vi.stubGlobal('fetch', fetchMock);
    const onImported = vi.fn();
    renderDialog(onImported);
    selectCsv();
    fireEvent.click(screen.getByRole('button', { name: 'Run dry run' }));
    await screen.findByRole('region', { name: 'Dry run preview' });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }));

    const report = await screen.findByRole('region', { name: 'Import results' });
    expect(within(report).getByText('Import finished.')).toBeInTheDocument();
    expect(within(report).getAllByText('Created').length).toBeGreaterThan(0);
    expect(onImported).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toMatch(/dryRun=false$/);
  });

  it('rejects a file with an unsupported extension or one larger than 2 MB', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Applications file'), {
      target: { files: [new File(['x'], 'applications.txt', { type: 'text/plain' })] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a .csv or .json file.');
    fireEvent.change(screen.getByLabelText('Applications file'), {
      target: { files: [new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.csv', { type: 'text/csv' })] },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('The file must be 2 MB or smaller.');
  });
});
