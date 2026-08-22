import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SCHEMA, runMigrations, snapshotDatabase } from './database';

/**
 * Desktop → web publish. The desktop app and the hosted web terminal each own a
 * SEPARATE SQLite file: the app writes `<userData>/insider-tracker.db`, while the
 * site is built from `data/insider-tracker.db` in the repo checkout, which CI
 * commits back after every cloud run. Nothing connected the two, so a scrape run
 * from the desktop UI — including the login-gated options flow that only works
 * on a real machine — never reached the web at all.
 *
 * This copies the run's rows into the repo DB and pushes it. GitHub Actions
 * picks the push up and, seeing the DESKTOP_PUBLISH_MARKER in the commit
 * message, skips its own scrape and just rebuilds the site from the DB (see
 * .github/workflows/scrape.yml) — so the desktop's richer data is published as
 * it is instead of being overwritten by a redundant cloud scrape.
 *
 * Everything here is best-effort by contract: a scrape must never fail, or be
 * held up, because publishing did not work.
 */

/** CI greps the commit subject for this to take the no-scrape fast path. */
export const DESKTOP_PUBLISH_MARKER = '[desktop-publish]';

/** Tables copied to the repo DB, and the key that makes each copy idempotent. */
const COPIED_TABLES: { table: string; identity: string[] }[] = [
  // The alerts themselves — this is what the web terminal renders.
  { table: 'signals', identity: ['ticker', 'scraped_at'] },
  // Session list behind the web UI's run history + source-health panel.
  { table: 'scrape_log', identity: ['started_at'] },
  // The pipeline's trade memory, so a later cloud run inherits the window this
  // machine built rather than restarting from its own 14-day source horizon.
  { table: 'insider_trades', identity: ['ticker', 'insider_key', 'trade_date', 'value_cents'] },
];

const GIT_TIMEOUT_MS = 120_000;
/** Publish signals at least this fresh. Matches the web's active-signal window. */
const DEFAULT_SINCE_MS = 7 * 86_400_000;

export interface WebPublishResult {
  ok: boolean;
  /** Set when publishing deliberately did nothing (disabled, no repo, no changes). */
  skipped?: string;
  copied?: Record<string, number>;
  pushed?: boolean;
  error?: string;
}

// Single-flight: the scheduler and a manual scrape can finish close together,
// and two concurrent git pushes on one checkout corrupt each other's index.
let publishInFlight = false;

function git(repo: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: repo,
    timeout: GIT_TIMEOUT_MS,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/**
 * Locate the repo checkout that backs the website. The packaged desktop app
 * runs from Program Files and has no relationship to the repo, so this is a
 * user setting; `process.cwd()` only resolves it when running from source.
 */
export function resolveRepoPath(configured?: string): { path: string } | { error: string } {
  const isCheckout = (dir: string) =>
    fs.existsSync(path.join(dir, '.git')) && fs.existsSync(path.join(dir, 'package.json'));

  // An explicitly configured path that does not resolve is an ERROR, never a
  // reason to fall back to the working directory: falling back would quietly
  // publish into whatever checkout the app happens to be running from, which is
  // both wrong and invisible. Only an unset path may fall back.
  if (configured && configured.trim()) {
    const repo = path.resolve(configured.trim());
    if (isCheckout(repo)) return { path: repo };
    return { error: `Configured repo path is not a git checkout: ${repo}` };
  }
  const cwd = path.resolve(process.cwd());
  if (isCheckout(cwd)) return { path: cwd };
  return {
    error:
      'No repo path configured (Settings → Web publish) and the working directory is not a git checkout.',
  };
}

/**
 * Column names a table actually has. `schema` must be passed separately: the
 * schema-qualified PRAGMA form is `PRAGMA <schema>.table_info(<table>)` —
 * writing `PRAGMA table_info(src.signals)` parses but matches nothing, which
 * silently yields an empty column list and copies zero rows.
 */
function columnsOf(db: Database.Database, schema: string, table: string): string[] {
  try {
    const rows = db.prepare(`PRAGMA "${schema}".table_info("${table}")`).all() as { name: string }[];
    return rows.map((r) => r.name);
  } catch {
    return [];
  }
}

/**
 * Copy one table from the attached snapshot. Columns are intersected between the
 * two files so a repo DB on an older migration still receives what it can hold,
 * and `id` is dropped so the target assigns its own primary keys.
 */
function copyTable(
  target: Database.Database,
  table: string,
  identity: string[],
  sinceIso: string,
): number {
  const targetCols = columnsOf(target, 'main', table);
  const sourceCols = columnsOf(target, 'src', table);
  if (!targetCols.length || !sourceCols.length) return 0;
  const cols = targetCols.filter((c) => c !== 'id' && sourceCols.includes(c));
  if (!cols.length) return 0;

  const list = cols.map((c) => `"${c}"`).join(', ');
  // Idempotency: re-publishing the same run must not duplicate rows, and the
  // identity columns are what make a row the same row across the two files.
  // `IS` rather than `=` so a NULL on both sides still counts as a match.
  const notExists = identity.every((c) => cols.includes(c))
    ? `AND NOT EXISTS (SELECT 1 FROM main."${table}" t WHERE ${identity
        .map((c) => `t."${c}" IS s."${c}"`)
        .join(' AND ')})`
    : '';
  // Only `signals` carries scraped_at. Binding @since for a statement that does
  // not reference it makes better-sqlite3 throw on the unused parameter, so the
  // filter and the binding have to be decided together.
  const hasTime = cols.includes('scraped_at');
  const timeFilter = hasTime ? 'AND s."scraped_at" >= @since' : '';

  const sql = `INSERT INTO main."${table}" (${list})
               SELECT ${cols.map((c) => `s."${c}"`).join(', ')}
               FROM src."${table}" s
               WHERE 1=1 ${timeFilter} ${notExists}`;
  const info = hasTime ? target.prepare(sql).run({ since: sinceIso }) : target.prepare(sql).run();
  return info.changes;
}

export interface PublishOptions {
  /** Repo checkout from settings; falls back to cwd when running from source. */
  repoPath?: string;
  /** Only copy signals at least this fresh. Defaults to the last 7 days. */
  sinceIso?: string;
  /** When false, write the repo DB but leave pushing to the user. */
  push?: boolean;
  /**
   * Publish from this file instead of a live snapshot of the app's DB. Only for
   * tests — production must snapshot, or WAL-resident rows are missed.
   */
  sourceDbPathForTest?: string;
}

export async function publishToWeb(opts: PublishOptions = {}): Promise<WebPublishResult> {
  if (publishInFlight) return { ok: false, skipped: 'another publish is already running' };
  publishInFlight = true;
  let target: Database.Database | null = null;
  let tmpDir: string | null = null;
  try {
    const resolved = resolveRepoPath(opts.repoPath);
    if ('error' in resolved) return { ok: false, skipped: resolved.error };
    const repo = resolved.path;

    const dbDir = path.join(repo, 'data');
    fs.mkdirSync(dbDir, { recursive: true });
    const repoDbPath = path.join(dbDir, 'insider-tracker.db');

    // Snapshot the live DB rather than attaching it: publishing runs moments
    // after a scrape, when the newest rows are still in the -wal sidecar, and
    // attaching the app's own open file would add a second writer to it.
    let sourcePath: string;
    if (opts.sourceDbPathForTest) {
      sourcePath = opts.sourceDbPathForTest;
      if (!fs.existsSync(sourcePath)) return { ok: false, skipped: `source DB not found: ${sourcePath}` };
    } else {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iwt-publish-'));
      sourcePath = path.join(tmpDir, 'snapshot.db');
      await snapshotDatabase(sourcePath);
    }

    // Start from the remote tip so this appends to the shared history instead of
    // forking it — otherwise the push below is rejected and the run is wasted.
    if (opts.push !== false) {
      try {
        git(repo, ['fetch', 'origin', '--quiet']);
        git(repo, ['pull', '--ff-only', 'origin', 'main', '--quiet']);
      } catch {
        console.warn(
          '[web-publish] git pull --ff-only failed — continuing; the push may need a manual rebase.',
        );
      }
    }

    target = new Database(repoDbPath);
    target.pragma('journal_mode = WAL');
    // The repo DB may predate the newest migration (it is written by whichever
    // side ran last), so bring it up to date before naming any column.
    target.exec(SCHEMA);
    runMigrations(target);

    const since = opts.sinceIso ?? new Date(Date.now() - DEFAULT_SINCE_MS).toISOString();
    target.prepare('ATTACH DATABASE ? AS src').run(sourcePath);
    const copied: Record<string, number> = {};
    try {
      const tx = target.transaction(() => {
        for (const { table, identity } of COPIED_TABLES) {
          try {
            copied[table] = copyTable(target as Database.Database, table, identity, since);
          } catch (err) {
            // One unexpected table shape must not abandon the rest of the copy.
            console.error(`[web-publish] copy of "${table}" failed:`, err);
            copied[table] = 0;
          }
        }
      });
      tx();
    } finally {
      try {
        target.exec('DETACH DATABASE src');
      } catch {
        /* already detached */
      }
    }
    // Collapse the WAL into the .db file — git only ever sees the main file, so
    // an uncheckpointed write would be committed as a no-op.
    target.pragma('wal_checkpoint(TRUNCATE)');
    target.close();
    target = null;

    const signalsCopied = copied.signals ?? 0;
    if (opts.push === false) {
      return { ok: true, copied, pushed: false, skipped: 'push disabled — repo DB updated locally' };
    }

    const DB_PATHSPEC = 'data/insider-tracker.db';
    try {
      execFileSync('git', ['diff', '--quiet', 'HEAD', '--', DB_PATHSPEC], {
        cwd: repo,
        timeout: GIT_TIMEOUT_MS,
      });
      return { ok: true, copied, pushed: false, skipped: 'repo DB unchanged — nothing to push' };
    } catch {
      /* the DB differs from HEAD → commit + push below */
    }
    git(repo, ['add', '-f', DB_PATHSPEC]);
    // Pathspec-limited commit. This runs unattended after every scrape, so it
    // must capture ONLY the database — committing whatever else happened to be
    // staged would sweep unrelated work-in-progress into an automated push.
    git(repo, [
      'commit',
      '-m',
      `chore(data): desktop publish (${signalsCopied} signal(s)) ${DESKTOP_PUBLISH_MARKER}`,
      '--',
      DB_PATHSPEC,
    ]);
    git(repo, ['push', 'origin', 'HEAD:main']);
    console.log(`[web-publish] pushed ${signalsCopied} signal(s) — the site will redeploy.`);
    return { ok: true, copied, pushed: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('[web-publish] failed:', error);
    return { ok: false, error };
  } finally {
    if (target) {
      try {
        target.close();
      } catch {
        /* best-effort */
      }
    }
    if (tmpDir) {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* the OS temp dir gets cleaned eventually */
      }
    }
    publishInFlight = false;
  }
}
