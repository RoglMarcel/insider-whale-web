import type { PortfolioConfig, PortfolioExperiment } from '../types';
import type { PortfolioSimInput } from './portfolio-rules';
import { buildComparisonPortfolio, insiderOnlyConfig } from './insider-only';

export const ALERTS_ABOVE_80_ID = 'alerts-above-80-v1';
export const ALERTS_ABOVE_80_DEFINED_AT = '2026-11-01';

/** Match portfolio 3's allocation exactly; only qualification changes. */
export function alertsAbove80Config(base: PortfolioConfig): PortfolioConfig {
  return { ...insiderOnlyConfig(base), entryScore: 80, entryScoreStrict: true };
}

export function buildAlertsAbove80(input: PortfolioSimInput, builtAt: string): PortfolioExperiment {
  return { ...buildComparisonPortfolio(input, builtAt, alertsAbove80Config(input.config), ALERTS_ABOVE_80_ID, ALERTS_ABOVE_80_DEFINED_AT), name: 'alerts >80 only' };
}
