/**
 * Testing-portfolio runner (v1.4.0).
 *
 *   npm run portfolio:sync            — incremental: new days only
 *   npm run portfolio:sync -- --rebuild
 *
 * Tops the adjusted-close cache up, replays the rules over every trading day
 * that is not yet in `portfolio_equity`, and publishes `public/data/portfolio.json`
 * so the hosted build has something to read. This is the same code path the
 * desktop app runs after a scrape — there is no separate "CI" simulation.
 *
 * Never blocks anything: the workflow calls it with `|| echo`, and a failure
 * here must not stop the site from deploying.
 */
import path from 'node:path';
import fs from 'node:fs';
import { initDatabase, closeDatabase } from '../electron/database';
import { getPortfolioState, rebuildPortfolio, syncPortfolio } from '../electron/portfolio';

const pct = (v: number | null | undefined): string =>
  v == null ? 'n/a' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;

export function writePortfolioJson(outDir: string): number {
  const state = getPortfolioState();
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'portfolio.json'),
    // `readOnly` tells the web UI to hide the Sync / Rebuild / Settings controls
    // rather than render buttons that cannot do anything in a browser.
    JSON.stringify({ ...state, meta: { ...state.meta, readOnly: true } }),
  );
  return state.equity.length;
}

async function main(): Promise<void> {
  const dbPath = (process.env.DB_PATH ?? path.resolve(process.cwd(), 'data', 'insider-tracker.db')).trim();
  if (!fs.existsSync(dbPath)) {
    console.log(`[portfolio] no DB at ${dbPath} — nothing to simulate.`);
    return;
  }
  const rebuild = process.argv.includes('--rebuild');
  initDatabase(dbPath);

  console.log(`[portfolio] ${rebuild ? 'REBUILD' : 'sync'} · ${dbPath}`);
  const report = rebuild ? await rebuildPortfolio() : await syncPortfolio();

  if (!report.ok) {
    console.log(`[portfolio] not run: ${report.reason}`);
    closeDatabase();
    return;
  }

  const state = getPortfolioState();
  const s = state.stats;
  const max = s.windows.find((w) => w.key === 'max');
  const last = state.equity[state.equity.length - 1];

  console.log(
    `[portfolio] ${report.pricesFetched} price series fetched · ` +
      `${report.daysWritten} new day(s) · ${report.suspectPoints} suspect point(s) ignored` +
      (report.restatedDays ? ` · ⚠ ${report.restatedDays} stored day(s) drifted after a price restatement` : ''),
  );

  if (last) {
    console.log(
      `[portfolio] ${state.meta.firstDate} → ${state.meta.lastDate} · ` +
        `equity $${last.equity.toFixed(2)} (${pct(max?.portfolio)}) vs SPY $${last.benchmark.toFixed(2)} (${pct(max?.benchmark)}) · ` +
        `edge ${pct(max?.diff)}`,
    );
    console.log(
      `[portfolio] trades ${s.trades.closed} closed / ${s.trades.open} open · ` +
        `hit rate ${s.trades.winRate == null ? 'n/a' : `${(s.trades.winRate * 100).toFixed(0)}%`} · ` +
        `avg trade alpha ${pct(s.trades.avgTradeAlpha)} (n=${s.trades.alphaN}) · ` +
        `max DD ${pct(s.maxDrawdown.portfolio)}`,
    );
    if (state.meta.untradableTickers.length) {
      console.log(`[portfolio] not tradable (no price series): ${state.meta.untradableTickers.join(', ')}`);
    }
  }

  const points = writePortfolioJson(path.resolve(process.cwd(), 'public', 'data'));
  console.log(`[portfolio] wrote public/data/portfolio.json (${points} point(s))`);

  closeDatabase();
}

main().catch((err) => {
  console.error('[portfolio] THREW:', err);
  process.exit(1);
});
