/**
 * The member's own license key, kept on the device where it was entered.
 *
 * The access service stores only a SHA-256 hash of every key, so the server can
 * never show a key again. The browser that typed it is the only place a copy can
 * exist. It lives exactly as long as the sign-in it came with: localStorage for
 * "Keep me signed in", sessionStorage otherwise, and it is removed when the
 * terminal is locked or the access ends.
 */
const STORAGE_KEY = 'iwt_license_key';
/** Same shape the access service accepts (IWT + 32 characters, no I/O/0/1). */
const CANONICAL = /^IWT[A-HJ-NP-Z2-9]{32}$/;

export const normalizeLicenseKey = (value: string): string => value.toUpperCase().replace(/[\s-]/g, '');

/** IWT-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX, the form keys are issued in. */
export function formatLicenseKey(normalized: string): string {
  return CANONICAL.test(normalized) ? `IWT-${normalized.slice(3).match(/.{8}/g)!.join('-')}` : normalized;
}

const stores = (): Storage[] => {
  try { return [localStorage, sessionStorage]; } catch { return []; }
};

export function saveLicenseKey(key: string, rememberDevice: boolean): void {
  const value = normalizeLicenseKey(key);
  for (const store of stores()) {
    try {
      if (store === (rememberDevice ? localStorage : sessionStorage)) store.setItem(STORAGE_KEY, value);
      else store.removeItem(STORAGE_KEY);
    } catch { /* storage unavailable (private mode): nothing is kept on this device */ }
  }
}

export function readLicenseKey(): string | null {
  for (const store of stores()) {
    try {
      const value = store.getItem(STORAGE_KEY);
      if (value) return formatLicenseKey(value);
    } catch { /* storage unavailable */ }
  }
  return null;
}

export function forgetLicenseKey(): void {
  for (const store of stores()) {
    try { store.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
  }
}
