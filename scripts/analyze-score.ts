/**
 * Score calibration report (v1.1.13) — "does a high score mean anything?"
 *
 * Reads the labeled `signal_outcomes` table (built by `npm run label:outcomes`)
 * and measures the ONLY thing that matters for the product: does a higher score
 * actually precede higher SPY-relative alpha?
 *
 *   npm run analyze:score
 *
 * Reports, per horizon:
 *  - Spearman IC of score vs realized alpha, with SE ≈ 1/√n and a t-stat, so a
 *    number is never presented as meaningful when it is inside the noise band.
 *  - Mean alpha + hit rate per score bucket — this exposes NON-MONOTONICITY that
 *    a single IC hides (a U-shaped curve can produce a negative IC even while the
 *    top bucket works).
 * Buckets with n < MIN_BUCKET_N are printed but explicitly marked as too small.
 */
import path from 'node:path';
import fs from 'node:fs';
import { initDatabase, closeDatabase, getScoreOutcomeRows } from '../electron/database';

const HORIZONS = [5, 10, 20];
const BUCKETS: [number, number][] = [
  [0, 20],
  [20, 40],
  [40, 60],
  [60, 80],
  [80, 101],
];
/** Below this a bucket mean is anecdote, not evidence. */
const MIN_BUCKET_N = 30;

function spearmanIC(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 10) return null;
  const rank = (a: number[]): number[] => {
    const idx = a.map((v, i) => [v, i] as [number, number]).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(a.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1; // average rank for ties
      for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const mx = rx.reduce((a, b) => a + b, 0) / n;
  const my = ry.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i] - mx;
    const b = ry[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : null;
}

function main(): void {
  const dbPath = process.env.DB_PATH ?? path.resolve(process.cwd(), 'data', 'insider-tracker.db');
  if (!fs.existsSync(dbPath)) {
    console.log(`No DB at ${dbPath}.`);
    return;
  }
  initDatabase(dbPath);

  console.log('Score-Kalibrierung — realisiertes SPY-relatives Alpha je Score.\n');
  let any = false;
  for (const h of HORIZONS) {
    const rows = getScoreOutcomeRows(h);
    if (rows.length < 10) continue;
    any = true;
    const ic = spearmanIC(rows.map((r) => r.score), rows.map((r) => r.alpha));
    const se = 1 / Math.sqrt(rows.length);
    const t = ic == null ? 0 : ic / se;
    const verdict = Math.abs(t) >= 2 ? (ic! > 0 ? 'signifikant POSITIV' : 'signifikant NEGATIV') : 'im Rauschen';
    console.log(`=== ${h} Tage · n=${rows.length} ===`);
    console.log(`  IC(Score → Alpha) = ${ic?.toFixed(3) ?? '—'}   SE≈${se.toFixed(3)}  t≈${t.toFixed(2)}   → ${verdict}`);
    const span = rows.reduce(
      (acc, r) => ({ min: r.entryDate < acc.min ? r.entryDate : acc.min, max: r.entryDate > acc.max ? r.entryDate : acc.max }),
      { min: '9999', max: '0000' },
    );
    console.log(`  Eintritts-Zeitraum: ${span.min} → ${span.max}`);
    for (const [lo, hi] of BUCKETS) {
      const b = rows.filter((r) => r.score >= lo && r.score < hi);
      if (!b.length) continue;
      const mean = (b.reduce((s, r) => s + r.alpha, 0) / b.length) * 100;
      const win = (b.filter((r) => r.alpha > 0).length / b.length) * 100;
      const flag = b.length < MIN_BUCKET_N ? '  ⚠ zu kleine Stichprobe' : '';
      console.log(
        `    Score ${String(lo).padStart(2)}–${String(hi - 1).padEnd(3)} n=${String(b.length).padStart(4)}` +
          `  Ø alpha=${mean.toFixed(2).padStart(6)}%  Trefferquote=${win.toFixed(0).padStart(3)}%${flag}`,
      );
    }
    console.log('');
  }
  if (!any) console.log('Noch keine gelabelten Outcomes — zuerst `npm run label:outcomes` laufen lassen.');
  closeDatabase();
}

main();
