import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from '@/store/useStore';
import { GlassCard } from '@/components/UI/GlassCard';
import { TrashIcon, AlertIcon } from '@/components/UI/icons';
import { ROLE_CATEGORIES, SCRAPER_SOURCES, type AppSettings, isSourceUnlocked } from '@/types';
import { formatUSD } from '@/lib/format';
import { PlatformLogins } from './PlatformLogins';
import { AlertRules } from './AlertRules';
import { ShadowScoring } from './ShadowScoring';
import { api } from '@/lib/ipc';

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200"
      style={{
        background: checked ? 'var(--accent-green)' : 'var(--border-glass)',
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span
        className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200"
        style={{ left: checked ? '1.375rem' : '0.125rem' }}
      />
    </button>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-secondary">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <GlassCard className="p-6">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-secondary">{title}</h3>
      <div className="divide-y" style={{ borderColor: 'var(--border-glass)' }}>
        {children}
      </div>
    </GlassCard>
  );
}

export function SettingsPanel() {
  const settings = useStore((s) => s.settings);
  const saveSettings = useStore((s) => s.saveSettings);
  const clearDatabase = useStore((s) => s.clearDatabase);
  const authStatus = useStore((s) => s.authStatus);

  const save = (patch: Partial<AppSettings>) => void saveSettings(patch);

  const onClear = () => {
    if (window.confirm('Clear all signal history and scrape logs? Your watchlist and settings are kept.')) {
      void clearDatabase();
    }
  };

  return (
    <div className="animate-fade-in mx-auto flex max-w-3xl flex-col gap-5">
      {/* Schedule */}
      <SectionCard title="Auto-Refresh Schedule">
        <Row label="Enable scheduled scrapes" hint="Runs automatically on weekdays (US Eastern)">
          <Toggle checked={settings.scheduleEnabled} onChange={(v) => save({ scheduleEnabled: v })} />
        </Row>
        <Row label="Market Open — 9:30 AM ET">
          <Toggle
            checked={settings.scheduleTimes.marketOpen}
            disabled={!settings.scheduleEnabled}
            onChange={(v) => save({ scheduleTimes: { ...settings.scheduleTimes, marketOpen: v } })}
          />
        </Row>
        <Row label="Midday — 12:00 PM ET">
          <Toggle
            checked={settings.scheduleTimes.midday}
            disabled={!settings.scheduleEnabled}
            onChange={(v) => save({ scheduleTimes: { ...settings.scheduleTimes, midday: v } })}
          />
        </Row>
        <Row label="Market Close — 4:00 PM ET">
          <Toggle
            checked={settings.scheduleTimes.close}
            disabled={!settings.scheduleEnabled}
            onChange={(v) => save({ scheduleTimes: { ...settings.scheduleTimes, close: v } })}
          />
        </Row>
      </SectionCard>

      {/* Notifications */}
      <SectionCard title="Notifications">
        <Row label="High-conviction threshold" hint={`Notify when a new signal scores ≥ ${settings.notificationThreshold}`}>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              value={settings.notificationThreshold}
              onChange={(e) => save({ notificationThreshold: Number(e.target.value) })}
              style={{ accentColor: 'var(--accent-blue)' }}
            />
            <span className="w-8 text-right font-bold tabular-nums">{settings.notificationThreshold}</span>
          </div>
        </Row>
      </SectionCard>

      {/* Filters */}
      <SectionCard title="Filters">
        <Row label="Minimum dollar volume" hint={`Ignore tickers below ${formatUSD(settings.minDollarVolume)} in insider buys`}>
          <input
            type="number"
            className="input w-36"
            min={0}
            step={10000}
            value={settings.minDollarVolume}
            onChange={(e) => save({ minDollarVolume: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Row>
        <div className="py-3">
          <div className="mb-2 text-sm font-medium">Insider roles to include</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ROLE_CATEGORIES.map((role) => {
              const checked = settings.roleFilters[role.key] ?? true;
              return (
                <label key={role.key} className="flex cursor-pointer items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => save({ roleFilters: { ...settings.roleFilters, [role.key]: e.target.checked } })}
                    style={{ accentColor: 'var(--accent-blue)', width: 16, height: 16 }}
                  />
                  <span>{role.label}</span>
                  <span className="ml-auto text-xs text-secondary">w{role.weight}</span>
                </label>
              );
            })}
          </div>
        </div>
      </SectionCard>

      {/* Sources */}
      <SectionCard title="Data Sources">
        {SCRAPER_SOURCES.map((src) => {
          const unlocked = isSourceUnlocked(src.key, authStatus);
          return (
            <Row
              key={src.key}
              label={src.label}
              hint={`${src.kind === 'options' ? 'Options flow' : 'Insider trades'}${src.authOptional ? ' · may need login' : ''}${!unlocked ? ' · Login required' : ''}`}
            >
              <Toggle
                checked={settings.sources[src.key] && unlocked}
                disabled={!unlocked}
                onChange={(v) => save({ sources: { ...settings.sources, [src.key]: v } })}
              />
            </Row>
          );
        })}
      </SectionCard>

      {/* Platform Logins */}
      <PlatformLogins />

      <AlertRules />

      <ShadowScoring />

      {/* Danger zone */}
      <SectionCard title="Data">
        <Row label="Headless browser" hint="Hide the scraping browser window (recommended)">
          <Toggle checked={settings.headless} onChange={(v) => save({ headless: v })} />
        </Row>
        <Row label="Clear signal history" hint="Deletes all signals & scrape logs. Watchlist is kept.">
          <button
            className="btn"
            onClick={onClear}
            style={{ color: 'var(--accent-red)', borderColor: 'color-mix(in srgb, var(--accent-red) 30%, transparent)' }}
          >
            <TrashIcon size={16} />
            Clear
          </button>
        </Row>
      </SectionCard>
    </div>
  );
}
