import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Digest, DigestRow, ReadNight, RunStatus, StatusCounts } from './types.js';

type Line = { at: string; job: string; status: RunStatus; owner: string | null; error?: string };

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: readonly string[] = ['ok', 'retry', 'fail'];

// One log line, or null if it isn't valid JSON with the fields the log promises.
function parseLine(text: string): Line | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.at !== 'string' || v.at === '') return null;
  if (typeof v.job !== 'string' || v.job === '') return null;
  if (typeof v.status !== 'string' || !STATUSES.includes(v.status)) return null;
  if (!('owner' in v) || (v.owner !== null && typeof v.owner !== 'string')) return null;
  if (v.error !== undefined && typeof v.error !== 'string') return null;
  const line: Line = { at: v.at, job: v.job, status: v.status as RunStatus, owner: v.owner };
  if (v.error !== undefined) line.error = v.error;
  return line;
}

function readFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

// runs/<night>.jsonl -> one row per job, sorted by job. null if the night has no file
// or isn't a YYYY-MM-DD name (no path traversal). Times stay the log's own strings.
export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  const text = readFile(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const rows = new Map<string, DigestRow>();
  let badLines = 0;
  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line === null) {
      badLines++;
      continue;
    }
    counts[line.status]++;
    const row = rows.get(line.job);
    if (row === undefined) {
      const first: DigestRow = {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        lastStatus: line.status,
        firstAt: line.at,
        lastAt: line.at,
      };
      if (line.error !== undefined) first.lastError = line.error;
      rows.set(line.job, first);
      continue;
    }
    row.runs++;
    if (line.status === 'retry') row.retries++;
    row.lastStatus = line.status;
    row.owner = line.owner;
    row.lastAt = line.at;
    if (line.error !== undefined) row.lastError = line.error;
  }

  const sorted = [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  const digest: Digest = { rows: sorted, badLines, counts };
  return digest;
};
