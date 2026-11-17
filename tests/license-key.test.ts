import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatLicenseKey, forgetLicenseKey, normalizeLicenseKey, readLicenseKey, saveLicenseKey } from '../src/lib/licenseKey';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}
const g = globalThis as unknown as { localStorage?: Storage; sessionStorage?: Storage };

describe('license key kept on the device that entered it', () => {
  beforeEach(() => { g.localStorage = new MemoryStorage(); g.sessionStorage = new MemoryStorage(); });
  afterEach(() => { delete g.localStorage; delete g.sessionStorage; });

  it('normalizes the way the access service does and shows the issued format', () => {
    expect(normalizeLicenseKey(' iwt-abcdefgh-jkmnpqrs-tuvwxyz2-3456789a ')).toBe('IWTABCDEFGHJKMNPQRSTUVWXYZ23456789A');
    expect(formatLicenseKey('IWTABCDEFGHJKMNPQRSTUVWXYZ23456789A')).toBe('IWT-ABCDEFGH-JKMNPQRS-TUVWXYZ2-3456789A');
  });
  it('keeps the key as long as the sign-in: device for "keep me signed in", tab session otherwise', () => {
    saveLicenseKey('iwt abcdefgh jkmnpqrs tuvwxyz2 3456789a', true);
    expect(g.localStorage!.getItem('iwt_license_key')).toBe('IWTABCDEFGHJKMNPQRSTUVWXYZ23456789A');
    expect(readLicenseKey()).toBe('IWT-ABCDEFGH-JKMNPQRS-TUVWXYZ2-3456789A');
    saveLicenseKey('IWT-ABCDEFGH-JKMNPQRS-TUVWXYZ2-3456789A', false);
    expect(g.localStorage!.getItem('iwt_license_key')).toBeNull();
    expect(g.sessionStorage!.getItem('iwt_license_key')).toBe('IWTABCDEFGHJKMNPQRSTUVWXYZ23456789A');
  });
  it('is gone after lock or the end of access', () => {
    saveLicenseKey('IWT-ABCDEFGH-JKMNPQRS-TUVWXYZ2-3456789A', true);
    forgetLicenseKey();
    expect(readLicenseKey()).toBeNull();
  });
  it('has nothing to show where no storage exists', () => {
    delete g.localStorage; delete g.sessionStorage;
    saveLicenseKey('IWT-ABCDEFGH-JKMNPQRS-TUVWXYZ2-3456789A', true);
    expect(readLicenseKey()).toBeNull();
  });
});
