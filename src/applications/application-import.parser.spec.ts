import {
  mapApplicationColumns,
  mapApplicationObject,
  parseCsv,
} from './application-import.parser';

describe('application import parser', () => {
  it('parses BOM, quoted commas, escaped quotes, and embedded newlines', () => {
    expect(
      parseCsv(
        '\uFEFFCompany,Position,Notes\r\n"Acme, Inc.",Engineer,"said ""hello""\nnext"',
      ),
    ).toEqual([
      { line: 1, cells: ['Company', 'Position', 'Notes'] },
      { line: 2, cells: ['Acme, Inc.', 'Engineer', 'said "hello"\nnext'] },
    ]);
  });

  it('maps differently-cased and common column names to application fields', () => {
    expect(
      mapApplicationColumns(
        ['Company', 'Job Title', 'Applied Date', 'Job URL'],
        ['Acme', 'Engineer', '2026-01-02T00:00:00.000Z', 'https://example.com'],
      ),
    ).toEqual({
      company: 'Acme',
      position: 'Engineer',
      appliedAt: '2026-01-02T00:00:00.000Z',
      jobUrl: 'https://example.com',
    });
    expect(
      mapApplicationObject({
        COMPANY: 'Acme',
        Position: 'Engineer',
        id: 'ignored',
      }),
    ).toEqual({
      company: 'Acme',
      position: 'Engineer',
    });
  });

  it('rejects malformed quoting', () => {
    expect(() => parseCsv('Company,Position\n"Acme,Engineer')).toThrow(
      'Unclosed quoted field',
    );
  });
});
