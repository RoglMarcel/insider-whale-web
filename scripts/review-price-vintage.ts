/** Explicit operator tool. Never invoked automatically by a scrape/sync.
 * Bundle with esbuild, then pass DB_PATH VINTAGE_ID REVIEWER EVIDENCE_URL_OR_TEXT.
 * Use a backup; changes the active cache, not archived simulation evidence.
 */
import Database from 'better-sqlite3';
import { makePriceVintage, storePriceVintage, type PriceVintage } from '../electron/priceCache';
const [file, id, reviewer, evidence] = process.argv.slice(2);
if (!file || !/^[a-f0-9]{64}$/.test(id ?? '') || !reviewer?.trim() || !evidence?.trim()) throw new Error('Required: explicit DB path, vintage ID, reviewer, independent evidence');
const db = new Database(file, { fileMustExist: true });
try {
  const row = db.prepare('SELECT payload FROM price_vintages WHERE id=?').get(id) as { payload:string } | undefined;
  if (!row) throw new Error('Unknown vintage');
  const prior = JSON.parse(row.payload) as PriceVintage;
  const latest = db.prepare('SELECT id FROM price_vintages WHERE ticker=? ORDER BY julianday(recorded_at) DESC,id DESC LIMIT 1').pluck().get(prior.ticker);
  if (latest !== id) throw new Error('Review the latest response; the supplied vintage is stale');
  // Generated integrity issues are recomputed from the raw snapshot. Preserve
  // provider identity errors; only magnitude review can be released here.
  const issues = prior.issues.filter(s=>!s.startsWith('unexplained_discontinuity'));
  const reviewed = makePriceVintage({ ...prior, issues }, { reviewer,evidence,sourceVintageId:id,reviewedAt:new Date().toISOString() });
  if (reviewed.issues.length) throw new Error(`Correct source data first: ${reviewed.issues.join('; ')}`);
  console.log(storePriceVintage(db, reviewed));
} finally { db.close(); }
