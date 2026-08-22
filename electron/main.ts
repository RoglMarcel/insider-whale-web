import { app, BrowserWindow, ipcMain, shell, Menu, Notification, dialog, globalShortcut } from 'electron';
import type { Browser } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { autoUpdater } from 'electron-updater';
import type {
  AppSettings,
  ScrapeResult,
  SignalFilter,
  InsiderTrackRecord,
  SignalPerformance,
  AlertRule,
  ScoringConfig,
} from '../src/types';
import { CONVICTION_THRESHOLDS } from '../src/types';
import { IPC } from './ipc-channels';
import {
  initDatabase,
  closeDatabase,
  getLatestSignals,
  getSignalByTicker,
  getSignalHistory,
  getFilteredSignals,
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  getSettings,
  setSettings,
  getScrapeLogs,
  getLastScrapeTime,
  getMostRecentSessionSignals,
  getTrackRecord,
  upsertTrackRecord,
  clearDatabase,
  updateEarnings,
  getNewsItems,
  getNewsForTicker,
  getAlertRules,
  addAlertRule,
  deleteAlertRule,
  setAlertRuleEnabled,
  insertBacktestRun,
  getLatestBacktestRun,
  getShadowScoringConfig,
  setShadowScoringConfig,
} from './database';
import { computePerformanceReport } from './performance';
import { runScrape, getScrapeStatus, fetchStockAnalysisEarnings } from './scraper';
import { publishToWeb } from './webPublish';
import { launchBrowser, createContext } from './scraper/browser';
import { scrapeFinvizEarnings } from './scraper/finviz';
import { fetchInsiderTrackRecord } from './scraper/insiderHistory';
import { configureScheduler, stopScheduler, syncTaskScheduler } from './scheduler';
import {
  notifyForSignals,
  notifyCombos,
  notifyScoreSurges,
  notifySourceHealth,
  notifyAlertHits,
  notifyFilingEvents,
  seedNotified,
} from './notifications';
import { startVixPolling, stopVixPolling, getCachedVix, fetchVix } from './vix';
import {
  authStatus,
  startLogin,
  saveLogin,
  cancelLogin,
  logout,
  closeAllLogins,
  loadMergedStorageState,
} from './auth';

const TRACK_RECORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let mainWindow: BrowserWindow | null = null;

// ──────────────────────────────────────────────────────────────────────────
// Window
// ──────────────────────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#050507',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.removeMenu();
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Open external links in the user's browser, never in-app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// On-demand Chromium pool — bounds how many headless browsers run at once for
// modal-triggered fetches (track records, earnings fallback). Opening
// a multi-insider modal previously launched one Chromium PER insider in parallel.
// ──────────────────────────────────────────────────────────────────────────

const MAX_CONCURRENT_BROWSERS = 2;
let activeBrowserOps = 0;
const browserWaiters: Array<() => void> = [];

async function acquireBrowserSlot(): Promise<void> {
  if (activeBrowserOps < MAX_CONCURRENT_BROWSERS) {
    activeBrowserOps++;
    return;
  }
  // Wait for a freed slot; the releaser hands it over without changing the count.
  await new Promise<void>((resolve) => browserWaiters.push(resolve));
}

function releaseBrowserSlot(): void {
  const next = browserWaiters.shift();
  if (next) next();
  else activeBrowserOps--;
}

/** Run a task with a pooled Chromium instance, capping total concurrency. */
async function withPooledBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
  await acquireBrowserSlot();
  let browser: Browser | null = null;
  try {
    browser = await launchBrowser(getSettings().headless);
    return await fn(browser);
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    releaseBrowserSlot();
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Scrape pipeline (shared by manual trigger + scheduler)
// ──────────────────────────────────────────────────────────────────────────

async function triggerScrape(): Promise<ScrapeResult> {
  const settings = getSettings();
  const result = await runScrape({
    settings,
    vix: getCachedVix()?.value,
    onStatus: (status) => broadcast(IPC.scraperStatusUpdate, status),
  });

  // Combo signals always notify; other high-conviction signals respect the threshold.
  notifyCombos(result.newCombos, result.signals, mainWindow);
  notifyScoreSurges(result.scoreSurges, mainWindow);
  // When threshold is at/above HIGH, prefer the precomputed new-HIGH list so the
  // orchestrator's newHighConviction path is actually used (not dead).
  if (settings.notificationThreshold >= CONVICTION_THRESHOLDS.high && result.newHighConviction.length) {
    const highSet = new Set(result.newHighConviction);
    notifyForSignals(
      result.signals.filter((s) => highSet.has(s.ticker)),
      settings.notificationThreshold,
      mainWindow,
    );
  } else {
    notifyForSignals(result.signals, settings.notificationThreshold, mainWindow);
  }
  notifySourceHealth(result.sourceHealth);
  notifyAlertHits(result.alertHits, mainWindow);
  notifyFilingEvents(result.filingEvents, mainWindow);
  broadcast(IPC.appSignalsUpdated, getLatestSignals());

  // Push the run to the web terminal. Deliberately NOT awaited into the scrape's
  // own result: publishing talks to git and the network, and a scrape that
  // already succeeded locally must not be reported as failed because a push did
  // not land. Errors are surfaced to the UI instead.
  if (settings.webPublishEnabled) {
    void publishToWeb({ repoPath: settings.webPublishRepoPath || undefined })
      .then((res) => {
        if (res.pushed) {
          console.log('[main] web publish: pushed', res.copied);
        } else if (res.skipped) {
          console.log(`[main] web publish skipped: ${res.skipped}`);
        } else if (res.error) {
          console.error(`[main] web publish failed: ${res.error}`);
        }
        broadcast(IPC.webPublishStatus, res);
      })
      .catch((err) => {
        console.error('[main] web publish threw:', err);
        broadcast(IPC.webPublishStatus, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  }
  return result;
}

async function fetchTrackRecord(
  name: string,
  role?: string,
  url?: string,
): Promise<InsiderTrackRecord | null> {
  const cached = getTrackRecord(name);
  const fresh = cached && (Date.now() - Date.parse(cached.lastUpdated) < TRACK_RECORD_TTL_MS) && (cached.totalTrades > 0 || !!cached.error);
  if (cached && fresh) return cached;
  if (!url) {
    return cached ?? {
      insiderName: name,
      insiderRole: role || null,
      totalTrades: 0,
      profitable3m: 0,
      profitable6m: 0,
      accuracy3m: 0,
      accuracy6m: 0,
      avgReturn3m: 0,
      lastUpdated: new Date().toISOString(),
      recentTrades: [],
      error: 'No history page available for this insider.',
    };
  }

  try {
    return await withPooledBrowser(async (browser) => {
      const context = await createContext(browser, loadMergedStorageState());
      const record = await fetchInsiderTrackRecord(context, name, url, role);
      await context.close().catch(() => undefined);
      if (record.totalTrades > 0 || record.error === 'No post-trade performance data yet.' || record.error === 'No history page available for this insider.') {
        upsertTrackRecord(record); // cache clean scrapes to avoid repeating slow launches
      }
      return record;
    });
  } catch {
    return cached ?? null;
  }
}


async function fetchEarningsForTicker(ticker: string): Promise<{ earningsDate?: string; daysToEarnings?: number; earningsTiming?: string }> {
  // Try Stock Analysis first (fast GET — reuses the orchestrator's fetch+parse).
  try {
    const parsed = await fetchStockAnalysisEarnings(ticker);
    if (parsed?.earningsDate) {
      updateEarnings(ticker, parsed.earningsDate, parsed.earningsTiming ?? null, parsed.daysToEarnings ?? null);
      return { earningsDate: parsed.earningsDate, daysToEarnings: parsed.daysToEarnings, earningsTiming: parsed.earningsTiming };
    }
  } catch (err) {
    console.error(`Dynamic earnings fetch from Stock Analysis failed for ${ticker}:`, err);
  }

  // Fallback to the Finviz Playwright quote page scraper (pooled browser).
  try {
    return await withPooledBrowser(async (browser) => {
      const context = await createContext(browser, loadMergedStorageState());
      const earningsMap = await scrapeFinvizEarnings(context, [ticker], 1);
      await context.close().catch(() => undefined);
      const e = earningsMap.get(ticker);
      if (e && e.earningsDate) {
        updateEarnings(ticker, e.earningsDate, e.earningsTiming ?? null, e.daysToEarnings ?? null);
        return { earningsDate: e.earningsDate, daysToEarnings: e.daysToEarnings, earningsTiming: e.earningsTiming };
      }
      return {};
    });
  } catch (err) {
    console.error(`Dynamic earnings fetch fallback failed for ${ticker}:`, err);
    return {};
  }
}

// ──────────────────────────────────────────────────────────────────────────
// "Follow this signal" P&L + CSV export (Feature 2 / 8)
// ──────────────────────────────────────────────────────────────────────────

const YF_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function yahooAdjMap(symbol: string): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2y`,
      { headers: { 'User-Agent': YF_UA }, signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) return map;
    const r = (await res.json() as any)?.chart?.result?.[0];
    const ts: number[] = r?.timestamp || [];
    const adj: number[] = r?.indicators?.adjclose?.[0]?.adjclose || r?.indicators?.quote?.[0]?.close || [];
    ts.forEach((t, i) => {
      const v = adj[i];
      if (v != null && Number.isFinite(v)) map[new Date(t * 1000).toISOString().slice(0, 10)] = v;
    });
  } catch {
    /* leave empty */
  }
  return map;
}

/** Walk calendar days in pure UTC so US timezones don't shift YYYY-MM-DD keys. */
function priceOnOrAfter(map: Record<string, number>, dateStr: string): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  if (!m) return undefined;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return undefined;
  for (let i = 0; i < 6; i++) {
    const s = d.toISOString().slice(0, 10);
    if (map[s] != null) return map[s];
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return undefined;
}

function latestPrice(map: Record<string, number>): number | undefined {
  const keys = Object.keys(map).sort();
  return keys.length ? map[keys[keys.length - 1]] : undefined;
}

async function getSignalPerformance(ticker: string): Promise<SignalPerformance | null> {
  const sym = ticker.trim().toUpperCase();
  const history = getSignalHistory(sym);
  const first = history[0];
  const sinceDate =
    first?.tradeDate && /^\d{4}-\d{2}-\d{2}$/.test(first.tradeDate)
      ? first.tradeDate
      : first?.scrapedAt
        ? first.scrapedAt.slice(0, 10)
        : null;
  if (!sinceDate) return null;

  const [stockMap, spyMap] = await Promise.all([yahooAdjMap(sym), yahooAdjMap('SPY')]);
  const entryPrice = priceOnOrAfter(stockMap, sinceDate);
  const currentPrice = latestPrice(stockMap);
  if (entryPrice == null || currentPrice == null) return { ticker: sym, sinceDate };

  const returnPct = ((currentPrice - entryPrice) / entryPrice) * 100;
  const spyEntry = priceOnOrAfter(spyMap, sinceDate);
  const spyNow = latestPrice(spyMap);
  const alphaPct = spyEntry && spyNow ? returnPct - ((spyNow - spyEntry) / spyEntry) * 100 : undefined;

  return {
    ticker: sym,
    sinceDate,
    entryPrice: Math.round(entryPrice * 100) / 100,
    currentPrice: Math.round(currentPrice * 100) / 100,
    returnPct: Math.round(returnPct * 10) / 10,
    alphaPct: alphaPct != null ? Math.round(alphaPct * 10) / 10 : undefined,
  };
}

async function exportSignalsCsv(): Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }> {
  try {
    const signals = getLatestSignals();
    const headers = [
      'Ticker', 'Company', 'Sector', 'Score', 'Conviction', 'InsiderCount', 'DollarVolume', 'TopInsider', 'TopRole',
      'TradeDate', 'FilingDate', 'Combo', 'BigPlayer', 'EarningsDate', 'DaysToEarnings', 'ScrapedAt',
    ];
    const esc = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(',')];
    for (const s of signals) {
      lines.push(
        [
          s.ticker, s.companyName ?? '', s.sector ?? '', s.score, s.convictionLevel, s.insiderCount, Math.round(s.totalDollarVolume),
          s.topInsiderName ?? '', s.topInsiderRole ?? '', s.tradeDate ?? '', s.filingDate ?? '',
          s.comboSignal ? 'yes' : '', s.bigPlayer ? 'yes' : '', s.earningsDate ?? '', s.daysToEarnings ?? '', s.scrapedAt,
        ].map(esc).join(','),
      );
    }
    const csv = lines.join('\n');
    const opts = {
      title: 'Export signals to CSV',
      defaultPath: `insider-signals-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    };
    const res = mainWindow ? await dialog.showSaveDialog(mainWindow, opts) : await dialog.showSaveDialog(opts);
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(res.filePath, csv, 'utf8');
    return { ok: true, path: res.filePath };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

let updateStatus: 'idle' | 'available' | 'downloaded' = 'idle';
let updateVersion = '';

function initAutoUpdater(): void {
  if (!app.isPackaged) return;

  // Custom log file to debug auto-updater issues in production
  const logFilePath = path.join(app.getPath('userData'), 'updater.log');
  const customLogger = {
    info(msg: any) {
      try { fs.appendFileSync(logFilePath, `[INFO] ${new Date().toISOString()} - ${msg}\n`); } catch {}
    },
    warn(msg: any) {
      try { fs.appendFileSync(logFilePath, `[WARN] ${new Date().toISOString()} - ${msg}\n`); } catch {}
    },
    error(msg: any) {
      try { fs.appendFileSync(logFilePath, `[ERROR] ${new Date().toISOString()} - ${msg}\n`); } catch {}
    }
  };
  autoUpdater.logger = customLogger;

  // Code-signature verification is intentionally left ENABLED (electron-updater's
  // default). A previous build overrode `verifyUpdateCodeSignature` to always pass,
  // which meant any tampered installer served to the updater would be installed and
  // run as a silent auto-update — a remote-code-execution vector.
  // NOTE: release builds must therefore be code-signed (electron-builder
  // `win.signtoolOptions` / certificate config). Until they are, Windows signature
  // verification will correctly REJECT the update instead of installing unverified
  // code — which is the safe failure mode.

  autoUpdater.on('checking-for-update', () => {
    customLogger.info('Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    customLogger.info(`Update available: ${info.version}`);
    updateStatus = 'available';
    updateVersion = info.version;
    broadcast(IPC.updateAvailable, info.version);
  });

  autoUpdater.on('update-not-available', () => {
    customLogger.info('Update not available.');
  });

  autoUpdater.on('error', (err) => {
    customLogger.error(`Error checking for update: ${err.message || String(err)}`);
    broadcast(IPC.updateError, err.message || String(err));
  });

  autoUpdater.on('update-downloaded', (info) => {
    customLogger.info(`Update downloaded: ${info.version}`);
    updateStatus = 'downloaded';
    updateVersion = info.version;
    broadcast(IPC.updateDownloaded, info.version);

    // Native OS Notification
    try {
      const notification = new Notification({
        title: 'Software Update Ready',
        body: `Version v${info.version} has been successfully downloaded. Click to restart and update.`,
      });
      notification.on('click', () => {
        if (mainWindow) {
          if (!mainWindow.isVisible()) mainWindow.show();
          mainWindow.restore();
          mainWindow.focus();
        }
        autoUpdater.quitAndInstall();
      });
      notification.show();
    } catch (err) {
      customLogger.error(`Failed to show native notification: ${err}`);
    }
  });

  autoUpdater.checkForUpdatesAndNotify();
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 4 * 60 * 60 * 1000);
}

import { runTwitterScrape } from './scraper/twitter';



function setAutoStart(enabled: boolean): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: app.getPath('exe'),
    args: ['--hidden'],
  });
}

function getAutoStart(): boolean {
  const settings = app.getLoginItemSettings({
    path: app.getPath('exe'),
    args: ['--hidden'],
  });
  return settings.openAtLogin;
}

async function triggerNewsScrape(): Promise<void> {
  const settings = getSettings();
  await runTwitterScrape({ headless: settings.headless });
}

function cleanupTestTask(): void {
  const taskName = 'InsiderWhaleTerminal_Test';
  execFile('schtasks', ['/delete', '/tn', taskName, '/f'], (err, stdout, stderr) => {
    if (err) {
      // Ignore errors if the task does not exist
      return;
    }
    console.log(`[cleanup-test-task] Successfully deleted scheduled test task: ${stdout}`);
  });
}

// ──────────────────────────────────────────────────────────────────────────
// IPC handlers
// ──────────────────────────────────────────────────────────────────────────

function registerIpc(): void {
  ipcMain.handle(IPC.scraperStart, () => triggerScrape());
  ipcMain.handle(IPC.scraperStatus, () => getScrapeStatus());

  ipcMain.handle(IPC.signalsGetAll, () => getLatestSignals());
  ipcMain.handle(IPC.signalsGetByTicker, (_e, ticker: string) => getSignalByTicker(ticker));
  ipcMain.handle(IPC.signalsGetHistory, (_e, ticker: string) => getSignalHistory(ticker));
  ipcMain.handle(IPC.signalsGetFiltered, (_e, filter: SignalFilter) => getFilteredSignals(filter));
  ipcMain.handle(IPC.signalsGetPerformance, (_e, ticker: string) => getSignalPerformance(ticker));
  ipcMain.handle(IPC.signalsExportCsv, () => exportSignalsCsv());

  ipcMain.handle(IPC.vixGetCurrent, () => getCachedVix());
  ipcMain.handle(IPC.insiderGetTrackRecord, (_e, name: string, role?: string, url?: string) =>
    fetchTrackRecord(name, role, url),
  );

  ipcMain.handle(IPC.watchlistGetAll, () => getWatchlist());
  ipcMain.handle(IPC.watchlistAdd, (_e, ticker: string, notes?: string) => addToWatchlist(ticker, notes));
  ipcMain.handle(IPC.watchlistRemove, (_e, ticker: string) => removeFromWatchlist(ticker));

  ipcMain.handle(IPC.settingsGet, () => getSettings());
  ipcMain.handle(IPC.settingsSet, (_e, partial: Partial<AppSettings>) => {
    const merged = setSettings(partial);
    // Re-arm the scheduler whenever schedule-related settings change.
    configureScheduler(
      merged,
      () => { void triggerScrape(); },
      () => { void triggerNewsScrape(); }
    );
    return merged;
  });

  ipcMain.handle(IPC.earningsFetch, (_e, ticker: string) => fetchEarningsForTicker(ticker));

  // Platform logins (authenticated scraping)
  ipcMain.handle(IPC.authStatus, () => authStatus());
  ipcMain.handle(IPC.authStartLogin, (_e, platform: string) => startLogin(platform));
  ipcMain.handle(IPC.authSaveLogin, (_e, platform: string) => saveLogin(platform));
  ipcMain.handle(IPC.authCancelLogin, (_e, platform: string) => cancelLogin(platform));
  ipcMain.handle(IPC.authLogout, (_e, platform: string) => logout(platform));

  ipcMain.handle(IPC.historyGetScrapeLogs, () => getScrapeLogs());
  ipcMain.handle(IPC.performanceGetLatest, () => getLatestBacktestRun());
  ipcMain.handle(IPC.shadowGetConfig, () => getShadowScoringConfig());
  ipcMain.handle(IPC.shadowSetConfig, (_e, config: Partial<ScoringConfig> | null) =>
    setShadowScoringConfig(config),
  );
  ipcMain.handle(IPC.performanceRecompute, async () => {
    const report = await computePerformanceReport();
    insertBacktestRun(report);
    return report;
  });
  ipcMain.handle(IPC.alertsGetRules, () => getAlertRules());
  ipcMain.handle(IPC.alertsAddRule, (_e, rule: AlertRule) => {
    addAlertRule(rule);
    return getAlertRules();
  });
  ipcMain.handle(IPC.alertsRemoveRule, (_e, id: number) => {
    deleteAlertRule(id);
    return getAlertRules();
  });
  ipcMain.handle(IPC.alertsToggleRule, (_e, id: number, enabled: boolean) => {
    setAlertRuleEnabled(id, enabled);
    return getAlertRules();
  });
  ipcMain.handle(IPC.appGetLastScrape, () => getLastScrapeTime());
  ipcMain.handle(IPC.appGetVersion, () => app.getVersion());
  ipcMain.handle(IPC.newsGetAll, () => getNewsItems());
  ipcMain.handle(IPC.newsGetForTicker, (_e, ticker: string) => getNewsForTicker(ticker));
  ipcMain.handle(IPC.newsScrapeNow, () => triggerNewsScrape());
  ipcMain.handle(IPC.appSetAutoStart, (_e, enabled: boolean) => setAutoStart(enabled));
  ipcMain.handle(IPC.appGetAutoStart, () => getAutoStart());
  ipcMain.handle(IPC.updateQuitAndInstall, () => {
    console.log('[updater] Quitting and installing update...');
    autoUpdater.quitAndInstall();
  });
  ipcMain.handle(IPC.updateGetStatus, () => ({ status: updateStatus, version: updateVersion }));

  ipcMain.handle(IPC.dbClear, () => {
    clearDatabase();
    broadcast(IPC.appSignalsUpdated, getLatestSignals());
  });

  ipcMain.handle(IPC.appTestSchedule, async () => {
    const appPath = app.getPath('exe');
    const now = new Date();
    // Add 1 minute, or if seconds >= 45, add 2 minutes to be safe.
    const target = new Date(now.getTime() + (now.getSeconds() >= 45 ? 120 : 60) * 1000);
    const hours = String(target.getHours()).padStart(2, '0');
    const minutes = String(target.getMinutes()).padStart(2, '0');
    const hhmm = `${hours}:${minutes}`;

    const taskName = 'InsiderWhaleTerminal_Test';
    const args = [
      '/create',
      '/tn',
      taskName,
      '/tr',
      `"${appPath}" --scheduled-scrape`,
      '/sc',
      'once',
      '/st',
      hhmm,
      '/f'
    ];

    console.log(`[test-schedule] Scheduling task with execFile: schtasks ${args.join(' ')}`);

    return new Promise<void>((resolve, reject) => {
      execFile('schtasks', args, (error, stdout, stderr) => {
        if (error) {
          console.error(`[test-schedule] Failed to create scheduled task: ${error.message || stderr}`);
          reject(error);
          return;
        }
        console.log(`[test-schedule] Task scheduled successfully for ${hhmm}: ${stdout}`);

        // Terminate the app after 1 second so that Task Scheduler can run it
        setTimeout(() => {
          console.log('[test-schedule] Quitting app for scheduled test task...');
          app.quit();
        }, 1000);

        resolve();
      });
    });
  });

  ipcMain.handle(IPC.appSetTheme, (_e, theme: string) => {
    if (mainWindow) {
      const color = theme === 'dark' ? '#050507' : '#f5f5f7';
      mainWindow.setBackgroundColor(color);
    }
  });
}

// ──────────────────────────────────────────────────────────────────────────
// App lifecycle
// ──────────────────────────────────────────────────────────────────────────

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine) => {
    if (commandLine.includes('--scheduled-scrape')) {
      console.log('[scheduler] Received scheduled background scrape request from second instance.');
      void triggerScrape();
      return;
    }

    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    if (app.isPackaged) {
      autoUpdater.checkForUpdatesAndNotify().catch(() => undefined);
    }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    const dbPath = path.join(app.getPath('userData'), 'insider-tracker.db');
    initDatabase(dbPath);

    // Seed de-dupe from all active (dashboard) highs so a restart doesn't re-toast.
    const settings = getSettings();
    seedNotified(
      getLatestSignals()
        .filter((s) => s.score >= settings.notificationThreshold)
        .map((s) => s.ticker),
    );

    // Ensure registry/startup entry from previous versions is cleanly removed
    try {
      app.setLoginItemSettings({
        openAtLogin: false,
        path: app.getPath('exe'),
        args: ['--hidden'],
      });
    } catch {}

    registerIpc();

    const isScheduledScrape = process.argv.includes('--scheduled-scrape');

    if (isScheduledScrape) {
      console.log('[scheduler] Starting scheduled background scrape...');
      cleanupTestTask();
      // Warm VIX (await the value) before scoring so background scrapes match
      // interactive ones — getCachedVix() is otherwise still null at scrape time.
      fetchVix()
        .catch(() => undefined)
        .then(() => triggerScrape())
        // Re-register the schtasks triggers: they store LOCAL times computed at
        // registration, so a DST flip misaligns them until re-synced — doing it
        // on every scheduled run self-heals within a day without the app opening.
        .then(() => syncTaskScheduler(getSettings()).catch(() => undefined))
        .then(() => {
          console.log('[scheduler] Scheduled background scrape completed.');
          stopScheduler();
          stopVixPolling();
          closeDatabase();
          app.exit(0);
        })
        .catch((err) => {
          console.error('[scheduler] Scheduled background scrape failed:', err);
          stopScheduler();
          stopVixPolling();
          closeDatabase();
          app.exit(1);
        });
    } else {
      cleanupTestTask();
      createWindow();
      initAutoUpdater();

      // Global shortcut to toggle DevTools at any time (windowed mode only).
      globalShortcut.register('F12', () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) win.webContents.toggleDevTools();
      });

      // Feature 8 — keep VIX warm (fetch now + every 15 min).
      startVixPolling();

      configureScheduler(
        settings,
        () => { void triggerScrape(); },
        () => { void triggerNewsScrape(); }
      );
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && !isScheduledScrape) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      stopScheduler();
      stopVixPolling();
      closeDatabase();
      app.quit();
    }
  });

  app.on('before-quit', () => {
    (app as any).isQuitting = true;
    globalShortcut.unregisterAll();
    stopScheduler();
    stopVixPolling();
    void closeAllLogins();
    closeDatabase();
  });
}
