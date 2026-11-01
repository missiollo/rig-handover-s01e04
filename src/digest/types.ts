// Plan morning-digest § 1. The contract the reader, the page and the JSON route share.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job in runs/<night>.jsonl. Times are the log's own strings, offset kept, never UTC.
export type DigestRow = {
  job: string;
  owner: string | null; // null in the log stays null; the view shows `—`
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError?: string; // the latest `error` seen for the job; absent if none
  firstAt: string;
  lastAt: string;
};

// rows sorted by job; badLines counts lines that didn't parse (never thrown).
// An empty file is { rows: [], badLines: 0 }.
export type Digest = { rows: DigestRow[]; badLines: number };

// null = no file for that night (the page answers 404).
export type ReadNight = (runsDir: string, night: string) => Digest | null;
