/**
 * Variante B — "desktop-as-publisher" (v1.1.6).
 *
 * Runs the FULL scrape with your real, logged-in sessions (options flow,
 * GuruFocus, X, valuation …) on your own machine, writes the shared history DB +
 * static JSON, and (optionally) commits + pushes so GitHub Actions redeploys the
 * site. The login-gated OPTIONS flow then rides the next ~72h of cloud 🟢 runs via
 * the orchestrator's existing 72h options merge — lighting up COMBO/HIGH tiles.
 *
 * MUST run under Electron (real `safeStorage` to decrypt your saved sessions, and
 * an Electron-ABI better-sqlite3):  `npm run publish:web`   (see package.json).
 *
 * Sessions live in the DESKTOP APP's userData. If none are found, point this at
 * the right folder:  USERDATA_DIR="C:\\Users\\you\\AppData\\Roaming\\<app>" npm run publish:web
 * (find it from the desktop app; the README "userData path" gotcha applies).
 *
 * Safe by default: it does NOT push unless you pass `--push` (or set PUBLISH_PUSH=1).
 * Without it, it just writes locally and prints the git commands.
 */
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { app, safeStorage } from 'electron';
import { runScrape } from '../electron/scraper';
import { initDatabase, closeDatabase, getMostRecentSessionSignals } from '../electron/database';
import { fetchVix } from '../electron/vix';
import { authStatus, sourceUnlocked } from '../electron/auth';
import { DEFAULT_SETTINGS, SCRAPER_SOURCES, LOGIN_PLATFORMS, type AppSettings, type ScraperSource } from '../src/types';

const DO_PUSH = process.argv.includes('--push') || process.env.PUBLISH_PUSH === '1';

/**
 * MUST run before app.whenReady(): on Windows `safeStorage` decrypts with an AES
 * key stored in `<userData>/Local State`, so pointing userData at the wrong folder
 * (or setting it after ready) makes every saved session fail to decrypt — which
 * silently reads as "logged out" and skips all login-gated sources.
 * Default = the desktop app's folder (Roaming/insider-whale-terminal).
 */
const USER_DATA_DIR =
  process.env.USERDATA_DIR ||
  path.join(app.getPath('appData'), process.env.APP_NAME || 'insider-whale-terminal');
app.setPath('userData', USER_DATA_DIR);

function git(args: string[]): void {
  execFileSync('git', args, { cwd: process.cwd(), stdio: 'inherit' });
}

async function main(): Promise<void> {
  await app.whenReady();

  const sessionsDir = path.join(app.getPath('userData'), 'sessions');
  const sessionCount = fs.existsSync(sessionsDir)
    ? fs.readdirSync(sessionsDir).filter((f) => f.endsWith('.session')).length
    : 0;
  console.log(`[publish-web] userData: ${app.getPath('userData')}`);
  console.log(`[publish-web] safeStorage available: ${safeStorage.isEncryptionAvailable()}`);
  console.log(`[publish-web] session files on disk: ${sessionCount}`);

  // Pre-flight: a file that exists but does NOT decrypt reads as "logged out" and
  // the source is skipped without any error — so report what actually unlocked.
  const status = authStatus();
  const decrypted = Object.entries(status).filter(([, v]) => v.loggedIn).map(([k]) => k);
  const gatedKeys = SCRAPER_SOURCES.filter((s) => LOGIN_PLATFORMS.some((p) => p.sourceKey === s.key));
  const unlocked = gatedKeys.filter((s) => sourceUnlocked(s.key)).map((s) => s.key);
  console.log(`[publish-web] sessions that decrypt: ${decrypted.length}/${sessionCount}` +
    (decrypted.length ? ` (${decrypted.join(', ')})` : ''));
  console.log(`[publish-web] login-gated sources unlocked: ${unlocked.join(', ') || 'NONE'}`);
  if (sessionCount > 0 && decrypted.length === 0) {
    console.warn(
      '[publish-web] ⚠ Session files exist but none decrypt — this is almost always the WRONG userData folder.\n' +
      '    safeStorage keys off <userData>/Local State. Point at the desktop app\'s folder, e.g.:\n' +
      `    set USERDATA_DIR=${path.join(app.getPath('appData'), 'insider-whale-terminal')} && npm run publish:web`,
    );
  }

  const dbDir = path.resolve(process.cwd(), 'data');
  const outDir = path.resolve(process.cwd(), 'public', 'data');
  fs.mkdirSync(dbDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });

  // Start from the latest remote history so we append, not fork (best-effort).
  if (DO_PUSH) {
    try {
      git(['fetch', 'origin', '--quiet']);
      git(['pull', '--ff-only', 'origin', 'main']);
    } catch {
      console.warn('[publish-web] git pull --ff-only failed (local commits?) — continuing; push may need a manual rebase.');
    }
  }

  const dbPath = path.join(dbDir, 'insider-tracker.db');
  console.log(`[publish-web] init DB at ${dbPath} (${fs.existsSync(dbPath) ? 'existing' : 'fresh'})`);
  initDatabase(dbPath);

  const prevTickers = new Set(getMostRecentSessionSignals().map((s) => s.ticker));

  // Enable EVERY source; sourceUnlocked() gates the login-gated ones by your
  // real saved sessions, so only the ones you're actually logged into run.
  const sources = Object.fromEntries(SCRAPER_SOURCES.map((s) => [s.key, true])) as Record<ScraperSource, boolean>;
  const settings: AppSettings = { ...DEFAULT_SETTINGS, sources, headless: true, scheduleEnabled: false };

  const vix = await fetchVix().catch(() => null);
  console.log('[publish-web] scraping WITH logins…');
  const started = Date.now();
  const result = await runScrape({ settings, vix: vix?.value });
  const secs = Math.round((Date.now() - started) / 1000);

  const NOTABLE_MIN_SCORE = 65;
  const newNotable = result.signals
    .filter((s) => s.score >= NOTABLE_MIN_SCORE && !prevTickers.has(s.ticker))
    .map((s) => s.ticker);

  const meta = {
    generatedAt: new Date().toISOString(),
    version: readVersion(),
    durationSec: secs,
    status: result.status,
    signalsFound: result.signalsFound,
    vix: vix ?? null,
    sourceHealth: result.sourceHealth ?? [],
    newHighConviction: result.newHighConviction,
    newCombos: result.newCombos,
    newNotable,
    scoreSurges: result.scoreSurges ?? [],
    source: 'desktop-publish',
    errors: result.errors.map((e) => `${e.source}: ${e.message}`),
  };
  fs.writeFileSync(path.join(outDir, 'signals.json'), JSON.stringify(result.signals));
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));
  closeDatabase();

  const optionsTickers = new Set(result.signals.filter((s) => (s.optionsActivity?.length ?? 0) > 0).map((s) => s.ticker));
  console.log(
    `[publish-web] done in ${secs}s · ${result.signals.length} signals · ` +
    `${optionsTickers.size} with options · ${result.newCombos.length} new combo(s) · status=${result.status}`,
  );

  if (!DO_PUSH) {
    console.log('\n[publish-web] --push not set → wrote locally only. To publish:');
    console.log('    git add data/insider-tracker.db && git commit -m "chore(data): desktop publish" && git push');
    app.exit(0);
    return;
  }

  try {
    git(['add', 'data/insider-tracker.db']);
    // Only commit if the DB actually changed.
    try {
      execFileSync('git', ['diff', '--staged', '--quiet'], { cwd: process.cwd() });
      console.log('[publish-web] DB unchanged — nothing to push.');
    } catch {
      git(['commit', '-m', 'chore(data): desktop publish (login sources)']);
      git(['push', 'origin', 'main']);
      console.log('[publish-web] pushed — GitHub Actions will redeploy the site.');
    }
  } catch (err) {
    console.error('[publish-web] git push failed:', err instanceof Error ? err.message : err);
    console.error('    Fix: git pull --rebase origin main   then   git push   (or re-run publish:web).');
    app.exit(1);
    return;
  }
  app.exit(0);
}

function readVersion(): string {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')).version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

main().catch((err) => {
  console.error('[publish-web] THREW:', err);
  app.exit(1);
});
