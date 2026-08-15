/** Feature 4 — pulsing combo badge (insider buying + unusual options flow). */
export function ComboBadge({ className = '', pulse = true }: { className?: string; pulse?: boolean }) {
  return (
    <span
      className={`badge ${pulse ? 'combo-pulse' : ''} ${className}`}
      style={{ color: '#fff', background: 'var(--accent-blue)', border: 'none' }}
      title="Combo signal — insider buying and unusual options flow on the same ticker"
    >
      ⚡ COMBO
    </span>
  );
}
