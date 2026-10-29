export type KeyDuration = '4weeks' | '6months' | '1year' | 'lifetime';
export interface AccessSession { role: 'member' | 'admin'; expiresAt: number | null; sessionExpiresAt: number; duration: KeyDuration | null }
export interface AccessKey { id: string; hint: string; duration: KeyDuration; label: string; createdAt: number; activatedAt: number | null; expiresAt: number | null; revokedAt: number | null; status: 'unused' | 'active' | 'expired' | 'revoked' }
export interface PlanStats { duration: KeyDuration; generated: number; used: number; active: number; unused: number; expired: number; revoked: number }
export interface KeyOverview { keys: AccessKey[]; stats: PlanStats[]; total: number; page: number; pageSize: number }
export class AccessApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export const PLANS: { id: KeyDuration; title: string; term: string }[] = [
  { id: '4weeks', title: '4 weeks', term: '28 days of access' },
  { id: '6months', title: '6 months', term: '6 calendar months' },
  { id: '1year', title: '1 year', term: '12 calendar months' },
  { id: 'lifetime', title: 'Lifetime', term: 'No expiry date' },
];
export async function accessRequest<T>(path: string, data?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${import.meta.env.BASE_URL}api/${path}`, {
      method: data === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: data === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new AccessApiError('Unable to reach the access service. Please try again.', 503); }
  if (!(response.headers.get('content-type') || '').includes('application/json')) throw new AccessApiError('The access service is unavailable on this host.', 503);
  const result = await response.json();
  if (!response.ok) throw new AccessApiError(result.error || 'Please try again.', response.status);
  return result as T;
}
export const formatAccessDate = (value: number | null) => value === null ? '—' : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(value);
