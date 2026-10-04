export interface ParsedCsvRow {
  line: number;
  cells: string[];
}

export function parseCsv(input: string): ParsedCsvRow[] {
  const source = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: ParsedCsvRow[] = [];
  let cells: string[] = [];
  let field = '';
  let quoted = false;
  let quoteClosed = false;
  let line = 1;
  let rowLine = 1;

  const finishRow = () => {
    cells.push(field);
    if (cells.some((cell) => cell.trim() !== '')) {
      rows.push({ line: rowLine, cells });
    }
    cells = [];
    field = '';
    quoteClosed = false;
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        quoteClosed = true;
      } else {
        field += character;
        if (character === '\n') line += 1;
      }
      continue;
    }

    if (character === '"') {
      if (field.length > 0 || quoteClosed) {
        throw new Error(`Unexpected quote on CSV line ${line}`);
      }
      quoted = true;
    } else if (character === ',') {
      cells.push(field);
      field = '';
      quoteClosed = false;
    } else if (character === '\n' || character === '\r') {
      finishRow();
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      line += 1;
      rowLine = line;
    } else {
      if (quoteClosed) {
        throw new Error(`Unexpected character after quote on CSV line ${line}`);
      }
      field += character;
    }
  }

  if (quoted) throw new Error(`Unclosed quoted field on CSV line ${rowLine}`);
  if (field.length > 0 || cells.length > 0 || quoteClosed) finishRow();
  return rows;
}

export function mapApplicationColumns(
  headers: string[],
  cells: unknown[],
): Record<string, unknown> {
  const aliases: Record<string, string> = {
    company: 'company',
    employer: 'company',
    position: 'position',
    title: 'position',
    jobtitle: 'position',
    joburl: 'jobUrl',
    url: 'jobUrl',
    location: 'location',
    source: 'source',
    status: 'status',
    appliedat: 'appliedAt',
    applieddate: 'appliedAt',
    notes: 'notes',
  };
  const result: Record<string, unknown> = {};

  headers.forEach((header, index) => {
    const normalized = header.toLowerCase().replace(/[^a-z0-9]/g, '');
    const property = aliases[normalized];
    const value = cells[index];
    if (!property || value === undefined || value === null) return;
    if (typeof value === 'string' && value.trim() === '') return;
    result[property] = typeof value === 'string' ? value.trim() : value;
  });

  return result;
}

export function mapApplicationObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return mapApplicationColumns(
    Object.keys(value),
    Object.values(value as Record<string, unknown>),
  );
}
