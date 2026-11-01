import type { PortfolioConfig } from '../types';

/** Locked research alternatives, not estimates of optimal production rules. */
export const EXIT_POLICIES: { id: string; patch: Partial<PortfolioConfig> }[] = [
  { id: 'legacy-25-20-v1', patch: { trailArm: .25, trailDistance: .20, profitFloor: null, takeProfit: null } },
  { id: 'trail-25-10-v1', patch: { trailArm: .25, trailDistance: .10, profitFloor: null, takeProfit: null } },
  { id: 'trail-15-10-v1', patch: { trailArm: .15, trailDistance: .10, profitFloor: null, takeProfit: null } },
  { id: 'target-25-v1', patch: { trailArm: .25, trailDistance: .20, profitFloor: null, takeProfit: .25 } },
  { id: 'floor-10-after-25-v1', patch: { trailArm: .25, trailDistance: .20, profitFloor: .10, takeProfit: null } },
  { id: 'trail-30-15-v1', patch: { trailArm: .30, trailDistance: .15, profitFloor: null, takeProfit: null } },
];
