import type { MouseEvent } from 'react';
import { type Signal, daysBetween, classifyTransaction } from '@/types';
import { GlassCard } from '@/components/UI/GlassCard';
import { ScoreGauge } from '@/components/UI/ScoreGauge';
import { ConvictionBadge } from '@/components/UI/ConvictionBadge';
import { FreshnessBadge } from '@/components/UI/FreshnessBadge';
import { EarningsChip } from '@/components/UI/EarningsChip';
import { ComboBadge } from '@/components/UI/ComboBadge';
import { PoliticianComboBadge, MegaSignalBanner, PoliticianCountBadge } from '@/components/UI/PoliticianBadges';
import { StarIcon, UsersIcon, ActivityIcon } from '@/components/UI/icons';
import { useStore } from '@/store/useStore';
import { useWatchlist } from '@/hooks/useWatchlist';
import { formatUSD, formatPrice, formatCompact, confidenceColor } from '@/lib/format';

/** Single-trade ceiling — keep in sync with electron/scraper/util MAX_SANE_TRADE_VALUE. */
const MAX_SANE_TRADE_VALUE = 5_000_000_000;
const MAX_SANE_SHARE_PRICE = 1_000_000;

function DetailRow({ label, value, isMono = false }: { label: string; value: string; isMono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs leading-none h-4 min-w-0">
      <span className="text-secondary shrink-0">{label}</span>
      <span className={`truncate font-semibold text-right flex-1 min-w-0 ${isMono ? 'font-mono-terminal' : ''}`} title={value}>
        {value}
      </span>
    </div>
  );
}

/** Small pill used for the context row (net flow, short interest, drawdown, etc.). */
function Pill({ text, color, title }: { text: string; color: string; title?: string }) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[10px] font-bold"
      style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
      title={title ?? text}
    >
      {text}
    </span>
  );
}

export function SignalCard({ signal }: { signal: Signal }) {
  const openSignal = useStore((s) => s.openSignal);
  const { isWatched, toggleWatch } = useWatchlist();
  const watched = isWatched(signal.ticker);

  // Insider display fields — derive from raw trades so empty topInsiderRole /
  // missing price on the aggregate still show when trade rows exist.
  const buyTrades = (signal.rawTrades ?? []).filter((t) => {
    if (classifyTransaction(t.transactionType).modifier <= 0) return false;
    const v = t.value ?? 0;
    const p = t.price ?? 0;
    if (v > MAX_SANE_TRADE_VALUE) return false;
    if (p > MAX_SANE_SHARE_PRICE) return false;
    return (p > 0 && t.shares > 0) || (v > 0 && t.shares > 0) || v > 0;
  });
  let pricedWeight = 0;
  let pricedSum = 0;
  let volumeSum = 0;
  for (const t of buyTrades) {
    const v = t.value > 0 && t.value <= MAX_SANE_TRADE_VALUE ? t.value : 0;
    const p =
      t.price != null && t.price > 0 && t.price <= MAX_SANE_SHARE_PRICE
        ? t.price
        : t.shares > 0 && v > 0
          ? v / t.shares
          : undefined;
    if (p != null && p > 0 && p <= MAX_SANE_SHARE_PRICE && t.shares > 0) {
      pricedSum += p * t.shares;
      pricedWeight += t.shares;
    }
    if (v > 0) volumeSum += v;
  }
  const avgPrice = pricedWeight > 0 ? pricedSum / pricedWeight : undefined;
  const displayVolume =
    volumeSum > 0
      ? volumeSum
      : signal.totalDollarVolume > 0 && signal.totalDollarVolume <= MAX_SANE_TRADE_VALUE * 50
        ? signal.totalDollarVolume
        : 0;
  const displayRole =
    (signal.topInsiderRole && signal.topInsiderRole.trim()) ||
    [...buyTrades]
      .sort((a, b) => (b.value || 0) - (a.value || 0))
      .map((t) => (t.role ?? '').trim())
      .find(Boolean) ||
    '—';

  const topOption = signal.optionsActivity?.[0];
  const ageDays = daysBetween(signal.tradeDate) ?? signal.breakdown.signalAgeDays;
  const confidence = signal.breakdown?.confidence;

  // ── Context pills (only render when the backend actually has the data) ──
  const flow = signal.insiderFlow;
  const stats = signal.stats;
  const netFlow = flow ? flow.buys - flow.sells : undefined;
  const netFlowColor =
    netFlow == null ? 'var(--text-secondary)' : netFlow > 0 ? 'var(--accent-green)' : netFlow < 0 ? 'var(--accent-red)' : 'var(--text-secondary)';
  const dd = stats?.pctFrom52wHigh;
  const shortPct = stats?.shortPctFloat;
  const adv = stats?.avgDollarVolume;

  // ── Congressional signal (additive — absent unless the backend has data) ──
  const politicianTrades = signal.politicianTrades ?? [];
  const politicianCount = new Set(politicianTrades.map((t) => t.politician.toLowerCase())).size;
  const hasPolitician = (signal.politicianScore ?? 0) > 0 && politicianCount > 0;
  const tier = signal.breakdown?.politicianComboTier ?? null;
  const isMega = tier === 'MEGA_SIGNAL';

  const onStar = (e: MouseEvent) => {
    e.stopPropagation();
    void toggleWatch(signal.ticker);
  };

  const cardBorderStyle = isMega
    ? { border: '1px solid color-mix(in srgb, var(--accent-red) 60%, transparent)', boxShadow: '0 0 16px rgba(255, 59, 48, 0.18)' }
    : tier === 'POLITICIAN_INSIDER'
      ? { border: '1px solid color-mix(in srgb, var(--accent-purple) 55%, transparent)' }
      : tier === 'POLITICIAN_OPTIONS'
        ? { border: '1px solid color-mix(in srgb, var(--accent-blue) 55%, transparent)' }
        : signal.comboSignal
          ? { border: '1px solid color-mix(in srgb, var(--accent-blue) 50%, transparent)' }
          : signal.bigPlayer
            ? { border: '1px solid #ffcc00', boxShadow: '0 0 16px rgba(255, 204, 0, 0.15)' }
            : undefined;

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      {/* MEGA_SIGNAL — full-width pulsing banner above the card, unmissable. */}
      {isMega && <MegaSignalBanner />}

      <GlassCard
        hover
        onClick={() => openSignal(signal.ticker)}
        className="relative flex w-full min-w-0 flex-col gap-4 p-5"
        style={cardBorderStyle}
      >
        {/* Combo badge — a politician tier REPLACES the orange COMBO badge. */}
        {tier ? (
          <PoliticianComboBadge tier={tier} className="absolute -right-2 -top-2 shadow-lg" />
        ) : signal.comboSignal ? (
          <ComboBadge className="absolute -right-2 -top-2 shadow-lg" />
        ) : null}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xl font-extrabold leading-tight font-mono-terminal">{signal.ticker}</div>
            {signal.bigPlayer && (
              <span
                className="inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-extrabold uppercase rounded select-none shadow-[0_0_12px_rgba(255,179,0,0.45)]"
                style={{
                  background: 'linear-gradient(135deg, #FFE082 0%, #FFB300 50%, #FFA000 100%)',
                  color: '#000000',
                  border: '1px solid #FFC107',
                  fontWeight: 900,
                  letterSpacing: '0.02em',
                }}
              >
                ★ Big Player
              </span>
            )}
          </div>
          <div className="truncate text-xs text-secondary" title={signal.companyName ?? ''}>
            {signal.companyName || '—'}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {confidence != null && (
            <span
              className="hidden select-none rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums sm:inline-flex"
              style={{ color: confidenceColor(confidence), background: `color-mix(in srgb, ${confidenceColor(confidence)} 12%, transparent)` }}
              title={`Data confidence ${Math.round(confidence)}%: field completeness + cross-source corroboration + authoritative sourcing. Not a judgment of the signal itself.`}
            >
              {Math.round(confidence)}%
            </span>
          )}
          <button
            className="icon-btn h-8 w-8"
            onClick={onStar}
            title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
            style={watched ? { color: 'var(--accent-yellow)' } : undefined}
          >
            <StarIcon size={16} filled={watched} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <ScoreGauge score={signal.score} size={88} stroke={8} />
        <div className="flex h-[88px] min-w-0 flex-1 flex-col justify-between">
          <div className="flex shrink-0 flex-row flex-wrap items-center gap-1">
            <ConvictionBadge level={signal.convictionLevel} className="px-1.5 py-0.5 text-[9px] shrink-0" />
            <FreshnessBadge ageDays={ageDays} className="px-1.5 py-0.5 text-[9px] shrink-0" />
            <EarningsChip days={signal.daysToEarnings} timing={signal.earningsTiming} className="px-1.5 py-0.5 text-[9px] shrink-0" />
            {hasPolitician && <PoliticianCountBadge count={politicianCount} className="shrink-0" />}
          </div>
          <DetailRow label="Role" value={displayRole} />
          <DetailRow label="Price" value={avgPrice ? formatPrice(avgPrice) : '—'} isMono />
          <DetailRow label="Volume" value={displayVolume > 0 ? formatUSD(displayVolume) : '—'} isMono />
        </div>
      </div>

      {/* Context pills — net flow, drawdown, short interest, liquidity. Each only
          renders when the backend has the datum; the row hides entirely if none. */}
      {(netFlow != null || dd != null || (shortPct != null && shortPct >= 20) || (adv != null && adv < 500_000)) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {netFlow != null && (
            <Pill
              color={netFlowColor}
              text={`NET ${netFlow >= 0 ? '+' : '−'}${formatUSD(Math.abs(netFlow))}`}
              title={`Trailing 90d insider flow — buys ${formatUSD(flow!.buys)} / sells ${formatUSD(flow!.sells)}${flow!.form144 > 0 ? ` · ${flow!.form144} Form 144 notice(s)` : ''}`}
            />
          )}
          {dd != null && (
            <Pill
              color={dd <= -40 ? 'var(--accent-green)' : 'var(--text-secondary)'}
              text={`${Math.round(dd)}% from 52w high`}
              title={dd <= -40 ? 'Deep value territory — insider buying well below the 52-week high' : 'Distance from the 52-week high'}
            />
          )}
          {shortPct != null && shortPct >= 20 && (
            <Pill color="#ff9f0a" text={`⚡ SI ${shortPct.toFixed(0)}%`} title={`Short interest ${shortPct.toFixed(1)}% of float — short-squeeze potential`} />
          )}
          {adv != null && adv < 500_000 && (
            <Pill color="var(--accent-red)" text="⚠ Low liquidity" title={`Average daily dollar volume ≈ ${formatUSD(adv)} — hard to trade`} />
          )}
        </div>
      )}

      <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: 'var(--border-glass)' }}>
        <span className="inline-flex items-center gap-1.5 text-sm text-secondary">
          <UsersIcon size={15} />
          {signal.insiderCount} insider{signal.insiderCount === 1 ? '' : 's'}
        </span>
        {topOption ? (
          <span
            className="inline-flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold font-mono-terminal"
            style={{ color: topOption.sentiment === 'bullish' ? 'var(--accent-green)' : 'var(--accent-red)' }}
          >
            <ActivityIcon size={15} className="shrink-0" />
            {formatUSD(topOption.notional)} {topOption.type}s
          </span>
        ) : (
          <span className="text-sm text-secondary">No options flow</span>
        )}
      </div>
      </GlassCard>
    </div>
  );
}
