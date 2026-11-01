/** Position annotations without changing the underlying plotted coordinates. */
export function spreadChartLabels<T extends { y: number }>(
  items: readonly T[], top: number, bottom: number, minimumGap = 28,
): (T & { labelY: number })[] {
  if (bottom < top) return [];
  const labels = items.filter(item => Number.isFinite(item.y))
    .map(item => ({ ...item, labelY: Math.min(bottom, Math.max(top, item.y)) }))
    .sort((a, b) => a.y - b.y);
  const gap = labels.length > 1 ? Math.min(minimumGap, (bottom - top) / (labels.length - 1)) : 0;
  for (let i = 1; i < labels.length; i++) labels[i].labelY = Math.max(labels[i].labelY, labels[i - 1].labelY + gap);
  if (labels.length) labels[labels.length - 1].labelY = Math.min(bottom, labels[labels.length - 1].labelY);
  for (let i = labels.length - 2; i >= 0; i--) labels[i].labelY = Math.min(labels[i].labelY, labels[i + 1].labelY - gap);
  return labels;
}
