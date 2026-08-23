import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * Portfolio vs S&P 500 — split out so Recharts (~100 kB) is fetched lazily by
 * the one view that draws it, exactly like ScoreTrendChart.
 *
 * The one thing that makes this comparison fair is that both series sit on ONE
 * shared Y axis and start on the same day at the same amount. Two axes would
 * let any pair of curves be drawn as "beating" the other, which is the single
 * most common way a chart like this lies.
 */

const BLUE = 'var(--accent-blue)';
const GREY = 'var(--text-secondary)';
const GRID = 'rgba(128,128,128,0.18)';

/**
 * Round a domain outward to a 1/2/5×10^n step.
 *
 * Padding the raw min/max produces arbitrary bounds like −4.03% … +5.17%, and
 * Recharts then labels exactly those, so the axis reads with unevenly spaced,
 * meaningless ticks. Snapping to a round step is what makes the vertical
 * distance between the two lines legible at a glance, which is the entire job
 * of the shared axis.
 */
function niceDomain(lo: number, hi: number, targetTicks = 5): [number, number] {
  const span = hi - lo || Math.max(Math.abs(hi), 1) * 0.02;
  const rough = span / targetTicks;
  const mag = 10 ** Math.floor(Math.log10(Math.abs(rough) || 1));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return [Math.floor(lo / step) * step, Math.ceil(hi / step) * step];
}

export interface EquityChartPoint {
  date: string;
  portfolio: number;
  benchmark: number;
  idle: number;
}

export interface TradeMarker {
  date: string;
  value: number;
  kind: 'buy' | 'sell';
}

export interface EquityChartProps {
  data: EquityChartPoint[];
  /** '$' plots the NAV, '%' re-bases both series to 0 at the window start. */
  unit: '$' | '%';
  logScale: boolean;
  showIdle: boolean;
  markers: TradeMarker[];
  /** Backfill → live boundary, drawn as a vertical rule. */
  liveFrom: string | null;
  /** Axis ticks get their own formatter — a phone has no room for "$10,239.91". */
  formatTick?: (v: number) => string;
  compact: boolean;
  labels: { portfolio: string; benchmark: string; idle: string; difference: string; liveFrom: string };
  formatValue: (v: number) => string;
  formatDate: (d: string) => string;
}

function Row({ color, name, value, faded }: { color: string; name: string; value: string; faded?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4" style={{ opacity: faded ? 0.6 : 1 }}>
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: color }} />
        {name}
      </span>
      <span className="tabular-nums font-semibold">{value}</span>
    </div>
  );
}

export function EquityChart({
  data,
  unit,
  logScale,
  showIdle,
  markers,
  liveFrom,
  compact,
  labels,
  formatValue,
  formatTick,
  formatDate,
}: EquityChartProps) {
  const values = data.flatMap((d) => [d.portfolio, d.benchmark, ...(showIdle ? [d.idle] : [])]);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.06, Math.abs(hi) * 0.004) || 1;
  // Deliberately NOT anchored at zero: over weeks of single-digit moves a
  // zero-based axis squashes a 20% difference into two touching lines.
  // Log needs a strictly positive domain, which the % view (which crosses 0)
  // cannot give — the caller only offers Log in the $ view.
  const domain: [number, number] = logScale
    ? [Math.max(lo * 0.98, 1e-6), hi * 1.02]
    : niceDomain(lo - pad, hi + pad);

  return (
    <ResponsiveContainer>
      <LineChart data={data} // The right gutter has to clear HALF the last X label, or 'Aug 21, 2026'
        // is sliced off at the plot edge.
        margin={compact ? { top: 8, right: 22, left: -2, bottom: 0 } : { top: 12, right: 44, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: compact ? 10 : 11 }}
          stroke={GRID}
          interval="preserveStartEnd"
          minTickGap={compact ? 48 : 24}
          tickFormatter={formatDate}
        />
        <YAxis
          domain={domain}
          scale={logScale ? 'log' : 'auto'}
          allowDataOverflow
          tick={{ fontSize: compact ? 10 : 11 }}
          stroke={GRID}
          width={compact ? 44 : 68}
          tickFormatter={formatTick ?? formatValue}
        />
        {/* One tooltip for BOTH series AND their gap. The gap is the entire
            question this page asks, so making the reader subtract two numbers
            themselves would hide the answer in plain sight. */}
        <Tooltip
          cursor={{ stroke: GRID }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const point = payload[0].payload as EquityChartPoint;
            const diff = point.portfolio - point.benchmark;
            return (
              <div
                className="rounded-xl px-3 py-2 text-xs"
                style={{
                  background: 'var(--bg-glass)',
                  border: '1px solid var(--border-glass)',
                  boxShadow: 'var(--shadow-glass)',
                  backdropFilter: 'blur(20px)',
                }}
              >
                <div className="mb-1 font-semibold">{formatDate(String(label))}</div>
                <Row color={BLUE} name={labels.portfolio} value={formatValue(point.portfolio)} />
                <Row color={GREY} name={labels.benchmark} value={formatValue(point.benchmark)} />
                {showIdle && <Row color={BLUE} name={labels.idle} value={formatValue(point.idle)} faded />}
                <div
                  className="mt-1 flex items-center justify-between gap-4 pt-1 font-semibold tabular-nums"
                  style={{
                    borderTop: '1px solid var(--border-glass)',
                    color: diff >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                  }}
                >
                  <span>{labels.difference}</span>
                  <span>
                    {diff >= 0 ? '+' : '−'}
                    {formatValue(Math.abs(diff)).replace(/^[+−-]/, '')}
                  </span>
                </div>
              </div>
            );
          }}
        />
        <Legend
          verticalAlign="top"
          height={compact ? 24 : 30}
          wrapperStyle={{ fontSize: compact ? 11 : 12, color: 'var(--text-secondary)' }}
          // Explicit payload so the PORTFOLIO reads first. The <Line> order is
          // fixed by paint order (benchmark underneath), and the legend would
          // otherwise inherit it and lead with the benchmark.
          payload={[
            { value: labels.portfolio, type: 'line', color: BLUE, id: 'portfolio' },
            { value: labels.benchmark, type: 'line', color: GREY, id: 'benchmark' },
            ...(showIdle ? [{ value: labels.idle, type: 'line' as const, color: BLUE, id: 'idle' }] : []),
          ]}
        />
        {liveFrom && (
          <ReferenceLine
            x={liveFrom}
            stroke={GREY}
            strokeDasharray="2 4"
            label={compact ? undefined : { value: labels.liveFrom, position: 'insideTopRight', fontSize: 10, fill: GREY }}
          />
        )}
        {unit === '%' && <ReferenceLine y={0} stroke={GRID} />}
        <Line
          type="monotone"
          dataKey="benchmark"
          name={labels.benchmark}
          stroke={GREY}
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
        {showIdle && (
          <Line
            type="monotone"
            dataKey="idle"
            name={labels.idle}
            stroke={BLUE}
            strokeOpacity={0.35}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        )}
        <Line
          type="monotone"
          dataKey="portfolio"
          name={labels.portfolio}
          stroke={BLUE}
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5 }}
          isAnimationActive={false}
        />
        {markers.map((m) => (
          <ReferenceDot
            key={`${m.kind}-${m.date}`}
            x={m.date}
            y={m.value}
            r={3.5}
            fill={m.kind === 'buy' ? 'var(--accent-green)' : 'var(--accent-red)'}
            stroke="none"
            isFront
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export default EquityChart;
