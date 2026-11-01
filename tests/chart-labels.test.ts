import { describe, expect, it } from 'vitest';
import { spreadChartLabels } from '../src/lib/chart-labels';

describe('chart endpoint annotation layout', () => {
  it('separates nearby final labels while retaining the exact source coordinates', () => {
    const points = [{ key: 'blue', y: 180 }, { key: 'mint', y: 188 }, { key: 'gold', y: 70 }];
    const before = structuredClone(points);
    const labels = spreadChartLabels(points, 10, 220);
    expect(labels.map(p => p.key)).toEqual(['gold', 'blue', 'mint']);
    expect(labels[2].labelY - labels[1].labelY).toBeGreaterThanOrEqual(28);
    expect(labels.find(p => p.key === 'mint')!.y).toBe(188);
    expect(points).toEqual(before);
  });
  it('keeps clustered annotations within the plot even at the lower edge', () => {
    const labels = spreadChartLabels([{ y: 196 }, { y: 198 }, { y: 200 }], 14, 200);
    expect(labels.map(p => p.labelY)).toEqual([144, 172, 200]);
  });
  it('fits a very small plot and ignores invalid projected coordinates', () => {
    const labels = spreadChartLabels([{ y: 3 }, { y: 4 }, { y: 5 }, { y: NaN }], 0, 10);
    expect(labels.map(p => p.labelY)).toEqual([0, 5, 10]);
    expect(spreadChartLabels([], 0, 10)).toEqual([]);
  });
});
