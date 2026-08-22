import { useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { computeSourceHealth, SCRAPER_SOURCES, SIDE_PIPELINE_SOURCES, type SourceHealthIssue } from '@/types';

export interface SourceHealthEntry {
  key: string;
  label: string;
  /** Rows returned in the most recent run that included this source. */
  lastRows: number | null;
  /** Rolling median rows across recent runs. */
  median: number;
  /** Consecutive most-recent zero-row runs. */
  consecutiveZeroRuns: number;
  /** Zero-row runs anywhere in the window, and how many runs that window holds. */
  zeroRunsInWindow: number;
  runsInWindow: number;
  /** `flapping` = intermittently returns zero rows but recovers; not dead, still lossy. */
  status: 'healthy' | 'degraded' | 'dead' | 'flapping' | 'unknown';
}

/**
 * Source-health view derived entirely from the persisted scrape logs
 * (`sourceBreakdown` per run) using the same pure `computeSourceHealth` the
 * main process uses for its notifications — no extra IPC round-trip.
 */
export function useSourceHealth(): {
  entries: SourceHealthEntry[];
  dead: SourceHealthEntry[];
  flapping: SourceHealthEntry[];
  issues: SourceHealthIssue[];
} {
  const scrapeLogs = useStore((s) => s.scrapeLogs);

  return useMemo(() => {
    // Newest first; each run's per-source counts.
    const runsNewestFirst = scrapeLogs
      .filter((l) => l.sourceBreakdown && Object.keys(l.sourceBreakdown).length > 0)
      .map((l) => l.sourceBreakdown as Record<string, number>);

    const allSources = [
      ...SCRAPER_SOURCES.map((s) => ({ key: s.key, label: s.label })),
      ...SIDE_PIPELINE_SOURCES.map((s) => ({ key: s.key, label: s.label })),
    ];
    const enabledKeys = allSources.map((s) => s.key);
    const issues = computeSourceHealth(enabledKeys, runsNewestFirst);
    const issueBySource = new Map(issues.map((i) => [i.source, i]));

    const entries: SourceHealthEntry[] = allSources.map((src) => {
      const counts = runsNewestFirst
        .map((run) => run[src.key])
        .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      const label = src.label;
      if (counts.length === 0) {
        return {
          key: src.key,
          label,
          lastRows: null,
          median: 0,
          consecutiveZeroRuns: 0,
          zeroRunsInWindow: 0,
          runsInWindow: 0,
          status: 'unknown',
        };
      }
      // Normalize hard-fail sentinel (-1) to 0 for display/median.
      const norm = counts.map((c) => (c < 0 ? 0 : c));
      const sorted = [...norm].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const lastRows = counts[0] < 0 ? null : counts[0];
      const issue = issueBySource.get(src.key);
      let status: SourceHealthEntry['status'];
      // Flapping is checked first: an intermittently-failing source has an issue
      // but is NOT dead, and reporting it as dead would fire the red "broken"
      // banner on a source that is still producing rows most runs.
      if (issue?.kind === 'flapping' && counts[0] >= 0) status = 'flapping';
      else if (issue || counts[0] < 0) status = 'dead';
      else if (median > 0 && norm[0] === 0) status = 'degraded';
      else status = 'healthy';
      return {
        key: src.key,
        label,
        lastRows,
        median,
        consecutiveZeroRuns: issue?.consecutiveZeroRuns ?? 0,
        zeroRunsInWindow: issue?.zeroRunsInWindow ?? norm.filter((c) => c === 0).length,
        runsInWindow: issue?.runsInWindow ?? counts.length,
        status,
      };
    });

    const dead = entries.filter((e) => e.status === 'dead');
    const flapping = entries.filter((e) => e.status === 'flapping');
    return { entries, dead, flapping, issues };
  }, [scrapeLogs]);
}
