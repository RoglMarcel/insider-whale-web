import { useStore } from '@/store/useStore';

/** Feature 8 — VIX pill with a fear-coded dot, shown in the header. */
export function VixIndicator() {
  const vix = useStore((s) => s.vix);
  if (!vix) return null;

  const color =
    vix.level === 'low' ? 'var(--accent-green)' : vix.level === 'normal' ? 'var(--accent-yellow)' : 'var(--accent-red)';

  return (
    <div
      className="hidden items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold md:inline-flex"
      style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)' }}
      title="CBOE Volatility Index — High VIX means insider buying carries stronger conviction. Scores boosted when VIX > 25."
    >
      <span
        className={`h-2.5 w-2.5 rounded-full ${vix.level === 'high' ? 'vix-pulse' : ''}`}
        style={{ background: color }}
      />
      <span className="text-secondary">VIX</span>
      <span className="tabular-nums font-mono-terminal">{vix.value.toFixed(1)}</span>
    </div>
  );
}
