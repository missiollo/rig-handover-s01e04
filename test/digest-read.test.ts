import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight', () => {
  const digest = readNight('runs', '2026-10-28');

  it('reads 2026-10-28 into 5 rows in job order, with 1 bad line', () => {
    expect(digest).not.toBeNull();
    expect(digest!.badLines).toBe(1);
    expect(digest!.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts parsed lines per status', () => {
    expect(digest!.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('counts runs, retries, last status and the latest error', () => {
    const refresh = digest!.rows.find((r) => r.job === 'fixtures/refresh');
    expect(refresh).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(digest!.rows.find((r) => r.job === 'notes/backup')?.lastStatus).toBe('fail');
  });

  it('keeps a null owner', () => {
    const render = digest!.rows.find((r) => r.job === 'digest/render');
    expect(render?.owner).toBeNull();
  });

  it('keeps the log times as written, offset and all', () => {
    const refresh = digest!.rows.find((r) => r.job === 'fixtures/refresh');
    expect(refresh?.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(refresh?.lastAt).toBe('2026-10-29T01:37:00+01:00');
    for (const row of digest!.rows) {
      expect(row.firstAt.endsWith('+01:00')).toBe(true);
      expect(row.lastAt.endsWith('+01:00')).toBe(true);
    }
  });

  it('returns null for a night with no file', () => {
    expect(readNight('runs', '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    expect(readNight('runs', '../runs/2026-10-28')).toBeNull();
    expect(readNight('runs', '2026-10-28.jsonl')).toBeNull();
  });

  it('reads an empty file as an empty digest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
    try {
      writeFileSync(join(dir, '2026-10-30.jsonl'), '');
      expect(readNight(dir, '2026-10-30')).toEqual({ rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 } });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
