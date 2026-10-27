import { usSessionCloseUtc } from './marketSession';

const DAY = 86400000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
function observed(year: number, month: number, day: number): string {
  const ms = Date.UTC(year, month, day);
  const weekday = new Date(ms).getUTCDay();
  return ymd(ms + (weekday === 6 ? -DAY : weekday === 0 ? DAY : 0));
}
function nth(year: number, month: number, weekday: number, n: number): string {
  const first = Date.UTC(year, month, 1);
  return ymd(first + ((weekday - new Date(first).getUTCDay() + 7) % 7 + (n - 1) * 7) * DAY);
}
function isSession(date: string): boolean {
  const ms = Date.parse(`${date}T00:00:00Z`);
  const weekday = new Date(ms).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  const year = Number(date.slice(0, 4));
  // Gregorian Easter, used to exclude Good Friday.
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = (h + l - 7 * m + 114) % 31 + 1;
  const memorial = Date.UTC(year, 5, 0);
  const holidays = [
    // NYSE does not observe a Saturday New Year's Day on the preceding Friday.
    new Date(Date.UTC(year, 0, 1)).getUTCDay() === 6 ? `${year}-01-01` : observed(year, 0, 1),
    nth(year, 0, 1, 3), nth(year, 1, 1, 3),
    ymd(Date.UTC(year, month - 1, day) - 2 * DAY),
    ymd(memorial - (new Date(memorial).getUTCDay() + 6) % 7 * DAY),
    ...(year >= 2022 ? [observed(year, 5, 19)] : []),
    observed(year, 6, 4), nth(year, 8, 1, 1), nth(year, 10, 4, 4), observed(year, 11, 25),
  ];
  return !holidays.includes(date);
}

/** Latest regular US equity close, allowing 30 minutes for provider publication.
 * Actual provider sessions remain authoritative for building the curve. */
export function expectedPriceSession(now: Date): string {
  let ms = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  while (!isSession(ymd(ms)) || usSessionCloseUtc(ymd(ms)) + 30 * 60000 > now.getTime()) ms -= DAY;
  return ymd(ms);
}

export function shouldRefreshPrices(
  coverage: { last: string; fetchedAt: string | null } | undefined,
  now: Date,
  benchmark: boolean,
  benchmarkLast: string,
): boolean {
  if (!coverage) return true;
  if (!benchmark && benchmarkLast && coverage.last < benchmarkLast) return true;
  const fetched = Date.parse(coverage.fetchedAt ?? '');
  return !Number.isFinite(fetched) || fetched > now.getTime() || now.getTime() - fetched >= 30 * 60000;
}
