import { useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useStore } from '@/store/useStore';
import { SCRAPER_SOURCES, SIDE_PIPELINE_SOURCES, sourceLabel } from '@/types';
import { GlassCard } from '@/components/UI/GlassCard';
import { CheckIcon, AlertIcon } from '@/components/UI/icons';
import { formatDateTime, formatDate } from '@/lib/format';
import { PerformancePanel } from './PerformancePanel';
import { SourceHealthPanel } from '@/components/UI/SourceHealth';
import { isWeb } from '@/lib/ipc';

function statusColor(status: string): string {
  if (status === 'success') return 'var(--accent-green)';
  if (status === 'partial') return 'var(--accent-yellow)';
  return 'var(--accent-red)';
}

export function HistoryView() {
  const { t } = useI18n();
  const scrapeLogs = useStore((s) => s.scrapeLogs);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);

  return (
    <div className="animate-fade-in flex flex-col gap-6">

      {/* Signal calibration dashboard. Desktop only: the calibration replays the
          local SQLite history and its "Compute" action has no counterpart on the
          hosted build, where it would return a "desktop app only" note. */}
      {!isWeb && <PerformancePanel />}

      {/* Per-source scrape health */}
      <SourceHealthPanel />

      {/* Scrape session timeline */}
      <GlassCard className="p-6">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-secondary">{t('hist.sessions')}</h3>
        {scrapeLogs.length === 0 ? (
          <div className="py-10 text-center text-sm text-secondary">{t('hist.noSessions')}</div>
        ) : (
          <div className="flex flex-col">
            {scrapeLogs.map((log) => {
              const isExpanded = expandedLogId === log.id;
              return (
                <div
                  key={log.id}
                  className="flex flex-col py-3 transition-colors duration-150 hover:bg-white/5 cursor-pointer rounded-lg px-2 -mx-2"
                  style={{ borderTop: '1px solid var(--border-glass)' }}
                  onClick={() => setExpandedLogId(isExpanded ? null : (log.id ?? null))}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{
                        color: statusColor(log.status),
                        background: `color-mix(in srgb, ${statusColor(log.status)} 14%, transparent)`,
                      }}
                    >
                      {log.status === 'failed' ? <AlertIcon size={16} /> : <CheckIcon size={16} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">
                        {formatDateTime(log.startedAt)}
                        <span className="ml-2 text-xs font-normal uppercase tracking-wide text-secondary">
                          {log.status}
                        </span>
                      </div>
                      <div className="truncate text-xs text-secondary">
                        {log.sourcesScraped.length} sources · {formatDate(log.startedAt)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-extrabold tabular-nums font-mono-terminal">{log.signalsFound}</div>
                      <div className="text-xs text-secondary">signals</div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 pl-13 pr-4 py-2.5 rounded-xl bg-black/20 text-xs flex flex-col gap-2 border border-white/5 animate-fade-in">
                      <div className="font-bold text-secondary uppercase tracking-wide text-[10px]">Scrape Results Breakdown</div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {log.sourcesScraped.map((srcKey) => {
                          const meta = SCRAPER_SOURCES.find(
                            (s) => s.key.toLowerCase() === srcKey.toLowerCase() || s.label.toLowerCase() === srcKey.toLowerCase()
                          );
                          const side = SIDE_PIPELINE_SOURCES.find(
                            (s) => s.key.toLowerCase() === srcKey.toLowerCase(),
                          );
                          const normalizedKey = meta?.key || side?.key || srcKey.toLowerCase();
                          const count = log.sourceBreakdown?.[normalizedKey] ?? log.sourceBreakdown?.[srcKey] ?? 0;
                          const label = meta?.label || side?.label || sourceLabel(srcKey);
                          const failed = count < 0;
                          return (
                            <div key={srcKey} className="flex justify-between items-center py-1 border-b border-white/5 pr-2">
                              <span className="text-secondary font-medium">{label}</span>
                              <span
                                className="font-extrabold tabular-nums"
                                style={{
                                  color: failed
                                    ? 'var(--accent-red)'
                                    : count > 0
                                      ? 'var(--accent-blue)'
                                      : 'var(--text-secondary)',
                                }}
                              >
                                {failed ? 'failed' : `${count} ${count === 1 ? 'alert' : 'alerts'}`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      {(!log.sourceBreakdown || Object.keys(log.sourceBreakdown).length === 0) && (
                        <div className="text-xs text-secondary italic py-1">
                          No source-specific signal counts available for this session.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
