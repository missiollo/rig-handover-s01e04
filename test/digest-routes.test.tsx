import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

const repoRuns = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'runs');
const JOBS = ['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs'];

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-digest-'));
  fs.writeFileSync(path.join(runsDir, '2026-10-28.jsonl'), fs.readFileSync(path.join(repoRuns, '2026-10-28.jsonl')));
  fs.writeFileSync(path.join(runsDir, '2026-10-30.jsonl'), '');
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
});

afterAll(() => {
  fs.rmSync(runsDir, { recursive: true, force: true });
});

type Json = { night: string; rows: DigestRow[]; badLines: number };

describe('digest page', () => {
  it('renders a night with all jobs, the bad line and — for a null owner', async () => {
    const res = await app.request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of JOBS) expect(html).toContain(job);
    expect(html).toMatch(/1 line didn(&#39;|')t parse/);
    const start = html.indexOf('digest/render');
    const end = html.indexOf('</tr>', start);
    expect(html.slice(start, end)).toContain('—');
  });

  it('404 when there is no file for the night', async () => {
    expect((await app.request('/digest/2026-10-31')).status).toBe(404);
  });

  it('says nothing ran on an empty night', async () => {
    const res = await app.request('/digest/2026-10-30');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });
});

describe('digest JSON', () => {
  it('returns 5 rows, badLines 1 and a null owner', async () => {
    const res = await app.request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as Json;
    expect(body.night).toBe('2026-10-28');
    expect(body.rows).toHaveLength(5);
    expect(body.badLines).toBe(1);
    expect(body.rows.find((r) => r.job === 'digest/render')?.owner).toBeNull();
  });

  it('404 when there is no file for the night', async () => {
    expect((await app.request('/api/digest/2026-10-31')).status).toBe(404);
  });

  it('has 0 rows on an empty night', async () => {
    const res = await app.request('/api/digest/2026-10-30');
    expect(res.status).toBe(200);
    expect(((await res.json()) as Json).rows).toHaveLength(0);
  });
});

describe('page and JSON agree', () => {
  it('lists the jobs in the same order', async () => {
    const html = await (await app.request('/digest/2026-10-28')).text();
    const body = (await (await app.request('/api/digest/2026-10-28')).json()) as Json;
    const jobs = body.rows.map((r) => r.job);
    const inHtml = [...jobs].sort((a, b) => html.indexOf(a) - html.indexOf(b));
    expect(jobs.every((j) => html.includes(j))).toBe(true);
    expect(inHtml).toEqual(jobs);
  });
});
