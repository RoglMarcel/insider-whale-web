import { useEffect, useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { GlassCard } from '@/components/UI/GlassCard';
import type { PerformanceReport } from '@/types';
import { api } from '@/lib/ipc';
import { formatDate, formatDateTime } from '@/lib/format';

/**
 * Signal calibration dashboard — realized 10/20-day alpha vs SPY of stored
 * signals, by conviction tier and score bucket (F31-deduplicated, adjusted
 * closes only). Makes the conviction score auditable from inside the app.
 */
const pct = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
const alphaColor = (v: number): string => (v >= 0 ? 'var(--accent-green)' : 'var(--accent-red)');

export function PerformancePanel() {
  const { t, language } = useI18n();
  const [report, setReport] = useState<PerformanceReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.performance
      .getLatest()
      .then((r) => active && setReport(r))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const recompute = async () => {
    setRunning(true);
    setError(null);
    try {
      setReport(await api.performance.recompute());
    } catch (e) {
      setError(e instanceof Error ? e.message : t('perf.recomputeFailed'));
    } finally {
      setRunning(false);
    }
  };

  const maxAbsAlpha = Math.max(1, ...(report?.buckets.map((b) => Math.abs(b.avgAlpha10)) ?? []));

  return (
    <GlassCard className="p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-secondary">{t('perf.title')}</h3>
        <button className="btn" onClick={() => void recompute()} disabled={running}>
          {running ? t('perf.computing') : report ? t('perf.recompute') : t('perf.compute')}
        </button>
      </div>

      {error && <div className="py-2 text-sm" style={{ color: 'var(--accent-red)' }}>{error}</div>}

      {!report ? (
        <div className="py-4 text-sm text-secondary">
          No calibration run yet — press Compute to replay stored signals against realized returns. Signals need
          ~4 weeks to ripen before they count.
        </div>
      ) : (
        <>
          <div className="mb-3 text-xs text-secondary">
            {report.nObservations} deduplicated observations
            {report.fromDate ? ` · ${formatDate(report.fromDate, language)} → ${formatDate(report.toDate, language)}` : ''} · computed{' '}
            {formatDateTime(report.ranAt, language)}
            {report.ic10 != null && (
              <>
                {' '}
                · IC (score ↔ 10d alpha):{' '}
                <span className="font-semibold" style={{ colo…24963 tokens truncated…
  "pf.rules.fixedSizing": "Each new position targets {weight}% of equity at entry; weights can drift afterwards. No automatic rebalancing or additional buys.",
  "pf.assume.cashIdle": "Unused capital stays in cash with zero assumed interest. Returns include the effect of idle cash.",
  "pf.rules.sizingValue": "{base}% of equity at score {entry}, rising to {max}% (floor {min}%) — the higher the score, the larger the position",
  "bd.dormant": "Inactive (input missing, not a verdict):",
  "pf.rules.exits": "Exits (first barrier wins)",
  "pf.rules.exitTakeProfit": "Take profit +{tp}%",
  "pf.rules.exitNoTakeProfit": "No take profit — the upside is never capped",
  "pf.rules.exitStopLoss": "Stop loss −{sl}%",
  "pf.rules.exitNoStopLoss": "No stop loss",
  "pf.rules.exitTrailing": "Trailing {trailDist}% below the highest close once +{trailArm}%",
  "pf.rules.exitTime": "Time stop {hold} calendar days",
  "pf.rules.priority": "Priority when several break on the same day: stop loss → trailing → take profit → time. A disabled barrier is simply skipped.",
  "pf.rules.limits": "Limits",
  "pf.rules.limitsValue": "Max {max} open positions · one position per ticker · {cooldown} days locked out after a sale · minimum ticket ${ticket}",
  "pf.rules.cash": "Uninvested capital",
  "pf.rules.cashSpy": "Held in the S&P 500 (SPY)",
  "pf.rules.cashIdle": "Left as cash at 0% interest",
  "pf.rules.costs": "Costs",
  "pf.rules.costsValue": "$0 commission · {slip}% slippage per side, on every fill including the SPY cash leg",
  "pf.rules.capital": "Starting capital",
  "pf.rules.benchmark": "Benchmark",
  "pf.rules.benchmarkValue": "SPY buy & hold, same start day, same ${capital}, same entry slippage",
  "pf.assume.title": "Assumptions and limits",
  "pf.assume.cash": "Uninvested capital is held in the S&P 500. The portfolio is therefore “index plus signal overlay”, and the gap to the benchmark is the contribution of the signals and nothing else.",
  "pf.assume.prices": "Adjusted daily closing prices only (splits and dividends included). No intraday prices, no highs or lows — a stop filled at a low you could never have traded would be fiction.",
  "pf.assume.fractional": "Fractional shares are allowed, so a $1,500 share price cannot distort the weighting.",
  "pf.assume.tax": "No taxes and no withholding tax. Adjusted prices contain gross dividends.",
  "pf.assume.lookahead": "A position is opened at the earliest close that was still ahead of the moment the signal became visible in the terminal — never at the insider’s trade date.",
  "pf.assume.backfill": "Signals reconstructed from the labeled outcome history carry only a date, not a time. They are entered one session later, which can only ever cost return, never add it.",
  "pf.assume.sample": "The stored signal history is short. Every figure on this page rests on a handful of trades and is a direction, not a result.",
  "pf.quality.title": "Data quality",
  "pf.quality.skipped": "{n} signal(s) skipped (no cash)",
  "pf.quality.capped": "{n} skipped (position limit)",
  "pf.quality.missing": "{n} ticker(s) without price data",
  "pf.quality.suspect": "{n} suspect price(s) ignored",
  "pf.quality.restated": "{n} stored day(s) drifted after a price restatement",
  "pf.quality.untradable": "Not tradable: {tickers}",
  "pf.quality.clean": "No signals skipped, no prices missing.",
  "pf.meta.backfill": "Backfill from stored signal history since {from} · live since {live}",
  "pf.meta.backfillOnly": "Backfill from stored signal history since {from}",
  "pf.meta.liveOnly": "Live since {from} · no backfill — every trade was decided on a signal that had just arrived, not replayed over history the rules were chosen on",
  "pf.meta.lastRun": "Last run {when}",
  "pf.meta.readOnly": "Computed by the scheduled run — the hosted build reads the published result.",
  "pf.cfg.edit": "Edit rules",
  "pf.cfg.apply": "Apply & rebuild",
  "pf.cfg.applying": "Rebuilding…",
  "pf.cfg.cancel": "Cancel",
  "pf.cfg.reset": "Restore defaults",
  "pf.cfg.rebuildWarning": "Applying recomputes the whole curve from scratch — a chart drawn with one rule set must never be labelled with another. Prices, signals and labeled outcomes are not touched.",
  "pf.cfg.invalidWeights": "The base weight has to sit between the minimum and the maximum.",
  "pf.cfg.entryScore": "Entry score",
  "pf.cfg.scoreSpan": "Score span",
  "pf.cfg.baseWeight": "Base weight",
  "pf.cfg.minWeight": "Min weight",
  "pf.cfg.maxWeight": "Max weight",
  "pf.cfg.maxPositions": "Max positions",
  "pf.cfg.minTicket": "Min ticket ($)",
  "pf.cfg.cooldown": "Cooldown (days)",
  "pf.cfg.takeProfit": "Take profit",
  "pf.cfg.barrierOn": "on",
  "pf.cfg.barrierOff": "off — barrier disabled",
  "pf.cfg.stopLoss": "Stop loss",
  "pf.cfg.maxHoldDays": "Time stop (days)",
  "pf.cfg.trailArm": "Trailing arms at",
  "pf.cfg.trailDistance": "Trailing distance",
  "pf.cfg.slippage": "Slippage / side",
  "pf.cfg.cashSpy": "S&P 500",
  "pf.cfg.cashIdle": "Cash, 0%",
} as const;

export type TKey = keyof typeof en;

const de: Record<TKey, string> = {
  'opt.bullish': 'Positiv',
  'opt.bearish': 'Negativ',
  'opt.neutral': 'Neutral',
  'table.sourceTitle': 'Quelle ansehen: {source}',

  'card.calls': 'Call-Optionen',
  'card.puts': 'Put-Optionen',
  'bd.floatPercent': '{n}% des Streubesitzes',
  'bd.valuationFactor': 'Bewertung',
  'bd.vixFactor': 'Volatilitätsumfeld',
  'bd.comboFactor': 'Kombiniertes Signal',
  'bd.noFairValue': 'Keine Fair-Value-Eingabe in diesem gespeicherten Score',
  'bd.noVix': 'Kein Volatilitätswert für diesen gespeicherten Score',
  'bd.gateMissing': 'Basisscore unter der Aktivierungsschwelle',

  "ui.noPortfolioHint": "Noch keine Depot-Ergebnisse verfügbar.",
  "common.yes": "Ja",
  "common.no": "Nein",
  "ui.sourcesTitle": "Quellen der vorhandenen Alerts",
  "ui.sourcesHint": "Aus der Quellenzuordnung der verfügbaren Alerts. Die Liste zeigt keine technische Live-Verfügbarkeit.",
  "ui.noSources": "Noch keine zugeordneten Alert-Quellen verfügbar.",
  "ui.insiderSource": "Insider-Transaktionen",
  "ui.optionsSource": "Optionsaktivität",
  "ui.sourceCount": "{n} Alerts",
  "ui.congressSource": "Auch veröffentlichte Kongressgeschäfte sind enthalten. Ihr einzelner Anbieter ist in den verfügbaren Alerts nicht hinterlegt.",
  "ui.historyTitle": "Alert-Verlauf",
  "ui.historyHint": "Erfasste Ergebnisse nach Datum. Öffne einen Eintrag für die Anzahl je Quelle.",
  "ui.historyEmpty": "Noch kein Verlauf vorhanden.",
  "ui.historySources": "{n} Quellen einbezogen",
  "ui.alerts": "Alerts",
  "ui.available": "Verfügbar",
  "ui.partial": "Teilweise verfügbar",
  "ui.unavailable": "Nicht verfügbar",
  "ui.countUnavailable": "Keine Einzelzahlen verfügbar.",
  "ui.loadError": "Diese Informationen konnten nicht geladen werden. Bitte versuche es später erneut.",
  "ui.noAlertsHint": "Derzeit sind keine Alerts verfügbar. Schau später wieder vorbei.",

  'pf.compare.title': 'Drei Portfolios · gleiches Startkapital',
  'pf.compare.market': '1 · S&P 500',
  'pf.compare.overlay': '2 · Kleine Positionen + S&P 500',
  'pf.compare.insider': '3 · Nur Insider-Signale',
  'pf.compare.history': 'Experiment seit {date}. Frühere Ergebnisse sind rückblickende Simulationen, keine live erzielte Rendite.',
  'pf.compare.pending': 'Der Vergleich erscheint, sobald alle Portfolios dieselben Daten und dasselbe Startkapital haben.',
  'pf.compare.exposure': 'Kapital in Insider-Positionen',
  'pf.compare.drawdown': 'Maximaler Rückgang',
  'pf.compare.sameStart': 'Gleicher Zeitraum und gleiches Startkapital; simulierte Käufe enthalten Slippage.',
  'pf.compare.details': 'Portfoliodetails',
  'pf.compare.rules': 'Nur Insider-Signale: 10.000 $ Startkapital, gleiche Kaufziele von 20 %, maximal 5 Aktien. Ungenutztes Kapital bleibt bar. Keine automatische Umschichtung oder Nachkäufe; Gewichte können nach Einstieg abweichen. Gleiche Einstiegsschwelle und Ausstiegsregeln wie Portfolio 2.',

  'updates.affected': 'Betroffene Ticker: {n}',
  'updates.priceAsOf': 'Depotkurse bis',
  'updates.quarantined': 'Ungültige Symbole ausgeschlossen; Historie erhalten',
  'updates.title': 'Aktualisierungsstatus',
  'updates.partial': 'Teilweise aktualisiert — einige Daten konnten nicht aktualisiert werden.',
  'updates.unknown': 'Aktualisierungsstatus nicht verfügbar',
  'updates.signals': 'Signale',
  'updates.portfolio': 'Portfolio',
  'updates.outcomes': 'Ergebnisbewertung',
  'updates.success': 'Abgeschlossen',
  'updates.failed': 'Fehlgeschlagen',
  'updates.skipped': 'In diesem Durchlauf nicht nötig',
  'updates.partialStatus': 'Unvollständig',
  'updates.updated': 'Aktualisiert',
  'updates.lastSuccess': 'Letzte vollständige Aktualisierung',
  'updates.checked': 'Geprüft',
  'updates.details': 'Details',
  'updates.prices_unavailable': 'Einige Kurse sind nicht verfügbar.',
  'updates.work_remaining': 'Weitere historische Daten folgen in späteren Durchläufen.',
  'updates.source_errors': 'Einige Quellen konnten nicht aktualisiert werden.',
  'updates.update_failed': 'Aktualisierung fehlgeschlagen; angezeigte Daten können älter sein.',
  'updates.no_work': 'Noch keine neuen Ergebnisse fällig.',
  'updates.desktop_publish': 'Bei Desktop-Veröffentlichung nicht ausgeführt.',
  'updates.not_ready': 'Das Portfolio ist noch nicht startbereit.',
  'updates.unavailable': 'Portfoliodaten sind nicht verfügbar.',

  // ── Navigation / chrome ──
  'nav.alerts': 'Alerts',
  'nav.news': 'Live-News',
  'nav.watchlist': 'Merkliste',
  'nav.watchlistShort': 'Merken',
  'nav.history': 'Verlauf',
  'nav.settings': 'Einstellungen',
  'nav.newsShort': 'News',
  'nav.settingsShort': 'Setup',
  'nav.openMenu': 'Menü öffnen',
  'nav.closeMenu': 'Menü schließen',
  'nav.main': 'Hauptnavigation',
  'nav.autoRefreshOn': 'Auto-Scrape an',
  'nav.autoRefreshOff': 'Auto-Scrape aus',

  // ── View titles / subtitles ──
  'view.dashboard.title': 'Alerts',
  'view.dashboard.subtitle': 'Insider- und Großinvestoren-Signale nach Überzeugungsgrad',
  'view.news.title': 'Live-News',
  'view.news.subtitle': 'Aktuelle Meldungen und Analysen von @WhaleInsider',
  'view.watchlist.title': 'Merkliste',
  'view.watchlist.subtitle': 'Deine gemerkten Ticker mit aktuellen Scores',
  'view.history.title': 'Verlauf',
  'view.history.subtitle': 'Vergangene Alerts und ihre Quellen',
  'view.settings.title': 'Einstellungen',
  'view.settings.subtitle': 'Darstellung und Alert-Quellen',

  // ── Header ──
  'header.lastScrape': 'Letzter Scrape',
  'header.notifications': 'Benachrichtigungen',
  'header.highConviction': 'Hohe Überzeugung',
  'header.noHighConviction': 'Keine Signale mit hoher Überzeugung',
  'header.highSignalsTitle': '{count} Signale mit hoher Conviction',
  'header.refresh': 'Aktualisieren',
  'header.scraping': 'Scrape läuft…',
  'header.language': 'Sprache',
  'header.switchLanguage': 'Sprache wechseln',

  // ── App shell ──
  'app.previewMode':
    'Vorschaumodus — läuft außerhalb von Electron, Scraping und lokale Datenbank sind deaktiviert.',

  // ── Dashboard ──
  "dash.searchPlaceholder": "Ticker, Unternehmen, Insider suchen…",
  "dash.openFilters": "Filter öffnen",
  "dash.filter": "Filter",
  "dash.exportTitle": "Aktuelle Signale als CSV-Datei exportieren",
  "dash.exporting": 'Wird exportiert…',
  "dash.exportCsv": "CSV exportieren",
  "stats.totalSignals": "Signale gesamt",
  "stats.insiderBuys": "{amount} Insider-Käufe",
  "stats.highConviction": 'Hohe Überzeugung',
  "stats.onWatch": "{count} auf Beobachtung",
  "stats.unusualOptions": "Auffällige Optionen",
  "stats.tickersWithFlow": "Ticker mit Flow",
  "stats.comboSignals": "Combo-Signale",
  "stats.insiderPlusOptions": "Insider + Optionen",
  "grid.noSignalsYet": "Noch keine Signale",
  "grid.noSearchMatch": 'Keine Signale passen zu deiner Suche',
  "grid.noFilterMatch": 'Keine Signale passen zu diesem Filter',
  "grid.noSignalsYetHint": 'Starte einen Scrape, um aktuelle Insider-Käufe und auffälligen Options-Flow zu holen, zu bewerten und nach Conviction zu ranken.',
  "grid.noSearchMatchHint": "Versuche einen anderen Ticker, ein anderes Unternehmen oder einen anderen Insider-Namen.",
  "grid.noFilterMatchHint": 'Wähle einen anderen Conviction-Filter, um mehr Ergebnisse zu sehen.',
  "grid.runFirstScrape": "Ersten Scrape starten",

  // ── Filters ──
  "filter.today": "Heute",
  "filter.48h": "48 Std.",
  "filter.thisWeek": "Diese Woche",
  "filter.all": "Alle",
  "filter.openMarket": "Offener Markt",
  "filter.options": "Optionen",
  "filter.combo": "Combo",
  "filter.high": 'Hoch',
  "filter.watch": 'Beobachten',
  "filter.score": "Score",
  "filter.confidence": "Konfidenz",
  "filter.timeRange": "Zeitraum",
  "filter.type": "Typ",
  "filter.conviction": 'Überzeugung',
  "filter.sort": "Sortierung",
  "filter.sortBy": "Sortieren nach",
  "filter.bigPlayersOnly": "Nur Großinvestoren",
  "filter.bigPlayersChip": "Big Player",
  "filter.removeFilter": "Filter {label} entfernen",
  "filter.highlight": "Hervorhebung",
  "filter.on": "An",
  "filter.off": "Aus",
  "filter.showResults": "Ergebnisse anzeigen",

  // ── Time / freshness ──
  "time.never": "nie",
  "time.justNow": "gerade eben",
  "time.minutesAgo": "vor {n} Min.",
  "time.hoursAgo": "vor {n} Std.",
  "time.daysAgoShort": "vor {n} T.",
  "fresh.fresh": "Frisch",
  "fresh.recent": 'Kürzlich',
  "fresh.aging": "Älter",
  "fresh.stale": "Veraltet",
  "fresh.unknownAge": "Alter unbekannt",
  "fresh.under24h": "vor < 24 Std.",
  "fresh.dayAgo": "vor {n} Tag",
  "fresh.daysAgo": "vor {n} Tagen",

  // ── Badges ──
  "badge.combo": "COMBO",
  "badge.comboTitle": "Combo-Signal — Insider-Käufe und auffälliger Options-Flow beim selben Ticker",
  "badge.earningsIn": "Zahlen in {days} T.",
  "badge.earningsAmc": "Zahlen nach Börsenschluss",
  "badge.earningsBmo": "Zahlen vor Börsenöffnung",
  "badge.earningsUpcoming": "Anstehende Zahlen",
  "badge.vixTitle": "CBOE-Volatilitätsindex — ein hoher VIX macht Insider-Käufe aussagekräftiger. Scores werden bei VIX > 25 angehoben.",
  "badge.polInsider": "Politiker + Insider",
  "badge.polInsiderTitle": "Politiker- und Insider-Käufe beim selben Ticker",
  "badge.polOptions": "Politiker + Optionen",
  "badge.polOptionsTitle": "Politiker-Käufe und auffällig bullischer Options-Flow",
  "badge.mega": "MEGA",
  "badge.megaTitle": "MEGA-SIGNAL — Politiker, Insider und Optionen zeigen in dieselbe Richtung",
  "badge.megaBanner": "MEGA-SIGNAL — Politiker + Insider + Optionen bestätigt",
  "badge.megaBannerTitle": "MEGA-SIGNAL — Politiker, Insider und Optionen bestätigt",
  "badge.politicianOne": "{count} Politiker",
  "badge.politicianMany": "{count} Politiker",
  "badge.politicianCountTitleOne": "{count} Kongressmitglied hat diesen Ticker gehandelt",
  "badge.politicianCountTitle": "{count} Kongressmitglieder haben diesen Ticker gehandelt",

  // ── Signal card ──
  "card.bigPlayer": "Großinvestor",
  "card.confidenceTitle": "Datenkonfidenz {pct} %: Vollständigkeit der Felder + Bestätigung durch mehrere Quellen + belastbare Herkunft. Kein Urteil über das Signal selbst.",
  "card.removeFromWatchlist": "Von der Merkliste entfernen",
  "card.addToWatchlist": "Zur Merkliste hinzufügen",
  "card.role": "Rolle",
  "card.price": "Kurs",
  "card.volume": "Volumen",
  "card.netFlowTitle": 'Beobachteter 90-Tage-Flow — datierte Käufe {buys} / gemeldete Verkäufe {sells}; Abdeckung ggf. unvollständig',
  "card.form144": "{n} Form-144-Meldung(en)",
  "card.from52wHigh": "{pct} % vom 52-Wochen-Hoch",
  "card.from52wHighTitle": "Abstand zum 52-Wochen-Hoch",
  "card.deepValueTitle": "Deutlich unterbewertet — Insider kaufen weit unter dem 52-Wochen-Hoch",
  "card.shortInterestTitle": "Short-Quote {pct} % des Streubesitzes — Short-Squeeze-Potenzial",
  "card.lowLiquidity": "Geringe Liquidität",
  "card.lowLiquidityTitle": "Durchschnittliches Tagesvolumen ≈ {amount} — schwer handelbar",
  "card.insiderOne": "{count} Insider",
  "card.insiderMany": "{count} Insider",
  "card.noOptionsFlow": "Kein Options-Flow",

  // ── Score breakdown ──
  "common.buy": "Kauf",
  "common.sell": "Verkauf",
  "bd.title": "Score-Aufschlüsselung",
  "bd.insiderRank": "Insider-Rang",
  "bd.dollarVolume": "Dollar-Volumen",
  "bd.transactionQuality": "Transaktionsqualität",
  "bd.clusterBonus": "Cluster-Bonus",
  "bd.earningsTiming": "Zahlen-Timing",
  "bd.optionsFlow": "Options-Flow",
  "bd.signalAge": "Signalalter",
  "bd.trackRecord": 'Track Record',
  "bd.vixBoost": 'VIX-Angstaufschlag',
  "bd.comboBonus": "Combo-Bonus",
  "bd.noInsiderLeg": 'Kein bewertbarer Insider-Trade für dieses Signal — die Insider-Faktoren sind nicht gemessen, nicht mit null bewertet.',
  "bd.optionsTiming": 'Options-Timing',
  "bd.saturation": 'Sättigung ×100/(Rohwert+{k})',
  "bd.saturationTitle": 'Der Score ist 100 × Rohwert / (Rohwert + {k}) — eine Sättigungskurve, kein Anteil an einem Maximum.',
  "bd.gated": 'gesperrt, Basis muss ≥ {gate} sein',
  "bd.raw": 'Rohwert',
  "bd.final": 'Endwert',
  "bd.confidence": "Konfidenz",
  "bd.confidenceTitle": "Datenkonfidenz — Vollständigkeit der Anreicherung + Bestätigung durch mehrere Quellen + belastbare Herkunft. Kein Urteil über das Signal selbst.",
  "bd.netFlow90d": 'Netto-Insider-Flow · 90 T.',
  "bd.grossBuys": 'Bruttokäufe',
  "bd.grossSells": 'Bruttoverkäufe',
  "bd.netFlow": 'Netto-Flow',
  "bd.form144Notices": "Form-144-Meldungen",
  "bd.equityStats": "Aktienkennzahlen",
  "bd.shortInterest": "Short-Quote",
  "bd.float": "Streubesitz",
  "bd.floatShares": "{n} Stk.",
  "bd.avgDailyVol": "Ø Tagesvolumen",
  "bd.from52wHigh": 'Abstand zum 52-W-Hoch',
  "bd.politicianActivity": "Politiker-Aktivität",
  "bd.contraSignal": "Gegensignal — ein Kongressmitglied verkauft diesen Wert",
  "bd.politicianContribution": 'Score-Beitrag der Politiker',
  "bd.comboTier": "Combo-Stufe",
  "bd.bonus": "Bonus",
  "bd.disclosedAfter": "Offengelegt {n} Tag(e) nach dem Trade",
  "bd.disclosedLate": "verspätet offengelegt ({n} T.)",
  "bd.disclosedIn": "offengelegt in {n} T.",

  // ── Detail panels ──
  "common.loading": "Lädt…",
  "tbl.historicalTrades": "Historische Transaktionen",
  "tbl.tradesTitle": "Insider-Transaktionen ({n})",
  "tbl.viewFiling": "Meldung ansehen",
  "tbl.trackRecordTitle": "Bei {hit} von {total} Käufen den S&P 500 über etwa 3 Monate geschlagen. Verlauf öffnen.",
  "modal.loadingSignal": "Signal wird geladen…",
  "modal.polInsiderBanner": "POLITIKER + INSIDER — Kongress-Käufe zusammen mit Insider-Käufen",
  "modal.polOptionsBanner": "POLITIKER + OPTIONEN — Kongress-Käufe zusammen mit auffällig positivem Optionsfluss",
  "acc.noHistory": "Kein Insider-Verlauf für dieses Signal vorhanden.",
  "acc.routineBuyer": "regelmäßiger Käufer",
  "acc.firstBuy": "erster Kauf",
  "watch.scoreTrend": "Score-Verlauf",
  "tbl.closeTrackRecord": 'Track Record schließen',
  "tbl.date": "Datum",
  "tbl.ticker": "Ticker",
  "tbl.amount": "Betrag",
  "tbl.buyPrice": "Kaufkurs",
  "tbl.3mVsSp": "3M vs. S&P",
  "tbl.6mVsSp": "6M vs. S&P",
  "tbl.3mVsSpTitle": "3-Monats-Rendite über dem S&P 500 (split- und dividendenbereinigt)",
  "tbl.6mVsSpTitle": "Hat der Kauf den S&P 500 über ~6 Monate geschlagen?",
  "tbl.price": "Kurs",
  "tbl.shares": "Stück",
  "tbl.value": "Wert",
  "tbl.insider": "Insider",
  "tbl.type": "Typ",
  "tbl.trackRecord": 'Track Record',
  "tbl.reducedWeight": "Vorgeplanter Trade / reduzierte Gewichtung",
  "opt.title": "Auffälliger Options-Flow ({n})",
  "opt.vol": "Vol.",
  "opt.oi": "OI",
  "opt.strike": "Strike {v} $",
  "opt.otm": "Aus dem Geld",
  "opt.itm": "Im Geld",
  "opt.volOiTitle": "Volumen ÷ Open Interest — hohe Werte bedeuten frische Positionierung",
  "acc.title": 'Insider-Track-Record',
  "acc.calendarClustered": "Kalendergebundener Käufer — Käufe im selben Monat über Jahre hinweg sind geplant bzw. gewohnheitsmäßig und historisch wenig aussagekräftig.",
  "acc.firstEver": 'Erster dokumentierter Kauf am offenen Markt — Käufe, die mit dem bisherigen Muster brechen, liefern historisch das Alpha.',
  "acc.unavailable": 'Keine Track-Record-Daten verfügbar',
  "acc.bestInsider": "Bester Insider bei diesem Signal:",

  // ── Signal modal ──
  "common.close": "Schließen",
  "modal.chartFor": "TradingView-Chart für {symbol}",
  "modal.assetChart": "{ticker} Kursverlauf",
  "modal.bought": "{amount} gekauft",
  "modal.topInsider": "Bester Insider: schlug den S&P bei {pct} % von {n} Käufen (3 Mon.)",
  "modal.watching": 'Gemerkt',
  "modal.comboDetected": "COMBO-SIGNAL ERKANNT — Insider-Käufe und auffälliger Options-Flow beim selben Ticker",
  "modal.netBearish": 'NETTO-BÄRISCHER OPTIONS-FLOW — die Put-Dominanz belastet dieses Signal',
  "modal.tradeDate": "Handelsdatum",
  "modal.filingDate": "Meldedatum",
  "modal.earnings": "Zahlen",
  "modal.lateFiling": "Ungewöhnlich spät nach dem Trade gemeldet — potenziell auffällig",
  "modal.sinceSignal": "Seit Signal ({date}):",
  "modal.recentMentions": "Aktuelle Erwähnungen",

  // ── Settings ──
  "set.clearConfirm": "Gesamten Signalverlauf und alle Scrape-Protokolle löschen? Merkliste und Einstellungen bleiben erhalten.",
  "set.webNote": 'Live-Webansicht — die Zeitplan-, Quellen- und Filterschalter unten steuern den Cloud-Scraper nicht (der läuft nach festem GitHub-Actions-Zeitplan). Sie sind nur vorhanden, damit die Oberfläche zur Desktop-App passt; Änderungen gelten nur in diesem Browser.',
  "set.cloudSchedule": "Cloud-Scrape-Zeitplan",
  "set.cloudScheduleNote": "Läuft automatisch über GitHub Actions ca. 3× pro Werktag (um US-Börsenöffnung, mittags und nach Handelsschluss, UTC-Cron) sowie bei jedem Code-Push. Von hier aus nicht änderbar.",
  "set.autoRefresh": 'Zeitplan für automatische Scrapes',
  "set.enableSchedule": "Geplante Scrapes aktivieren",
  "set.enableScheduleHint": "Läuft werktags automatisch (US-Ostküstenzeit)",
  "set.marketOpen": 'Börsenöffnung — 9:30 Uhr ET',
  "set.midday": "Mittags — 12:00 Uhr ET",
  "set.marketClose": "Börsenschluss — 16:00 Uhr ET",
  "set.notifications": "Benachrichtigungen",
  "set.threshold": 'Schwelle für hohe Conviction',
  "set.thresholdHint": "Benachrichtigen, wenn ein neues Signal ≥ {n} erreicht",
  "set.filters": "Filter",
  "set.minVolume": "Mindest-Dollar-Volumen",
  "set.minVolumeHint": "Ticker unter {amount} an Insider-Käufen ignorieren",
  "set.rolesToInclude": "Zu berücksichtigende Insider-Rollen",
  "set.dataSources": "Datenquellen",
  "set.srcOptions": "Options-Flow",
  "set.srcInsider": "Insider-Trades",
  "set.srcMayNeedLogin": "benötigt ggf. Login",
  "set.srcLoginRequired": "Login erforderlich",
  "set.webPublish": "Web-Veröffentlichung",
  "set.webPublishToggle": "Scrapes ins Web-Terminal veröffentlichen",
  "set.webPublishHint": "Nach jedem Scrape die Signale dieses Laufs ins Repo der Website pushen und die CI neu deployen lassen",
  "set.repoPath": "Repo-Pfad",
  "set.repoPathHint": "Absoluter Pfad zu deinem Checkout des Website-Repos (der Ordner mit data/insider-tracker.db). Für die installierte App nötig, da sie aus Program Files läuft und das Repo nicht selbst findet.",
  "set.data": "Daten",
  "set.headless": "Headless-Browser",
  "set.headlessHint": "Browserfenster beim Scrapen ausblenden (empfohlen)",
  "set.clearHistory": "Signalverlauf löschen",
  "set.clearHistoryHint": "Löscht alle Signale und Scrape-Protokolle. Die Merkliste bleibt erhalten.",
  "set.clear": "Löschen",

  // ── Settings sub-panels ──
  "alert.title": 'Eigene Alerts',
  "alert.intro": "Regeln werden nach jedem Scrape geprüft und lösen einmalig aus, sobald ihre Bedingung erfüllt ist.",
  "alert.scopeTicker": "Ein Ticker",
  "alert.scopeWatchlist": "Merkliste",
  "alert.scopeGlobal": "Alle Signale",
  "alert.condScore": "Score überschreitet Schwelle",
  "alert.condNewBuy": "Beliebiger neuer Insider-Kauf",
  "alert.condNewCombo": "Neues Combo-Signal",
  "alert.condCluster": "Insider-Cluster erreicht N",
  "alert.tickerPlaceholder": "TICKER",
  "alert.addRule": "Regel hinzufügen",
  "alert.none": 'Noch keine eigenen Alert-Regeln.',
  "alert.deleteRule": "Regel löschen",
  "login.cannotOpen": "Das Login-Fenster konnte nicht geöffnet werden.",
  "login.cannotSave": "Die Sitzung konnte nicht gespeichert werden.",
  "login.sessionActive": "Sitzung aktiv (CI)",
  "login.desktopOnly": "Nur Desktop / CI",
  "login.opening": "Wird geöffnet…",
  "login.logIn": "Anmelden",
  "shadow.invalidJson": "Ungültiges JSON.",
  "shadow.active": "Schatten-Konfiguration aktiv — künftige Scrapes speichern zusätzlich shadow_score.",
  "shadow.disabled": "Schatten-Scoring deaktiviert.",

  // ── Login categories ──
  "login.catOptions": "Options-Flow",
  "login.catInsider": "Insider-Trades",

  // ── Login category news ──
  "login.catNews": "News",

  // ── History / watchlist / updates ──
  "hist.sessions": "Scrape-Läufe",
  "hist.noSessions": "Noch keine Scrape-Läufe aufgezeichnet.",
  "perf.title": "Signal-Performance (vs. SPY)",
  "perf.recomputeFailed": "Neuberechnung fehlgeschlagen",
  "perf.computing": 'Wird berechnet…',
  "perf.recompute": "Neu berechnen",
  "perf.compute": "Berechnen",
  "perf.tier": "Stufe",
  "perf.winRate10d": "Trefferquote 10 T.",
  "watch.empty": "Deine Merkliste ist leer",
  "watch.emptyHint": 'Markiere ein Signal im Dashboard mit dem Stern, um es hier mit laufendem Conviction-Score zu verfolgen.',
  "watch.added": "Hinzugefügt {when}",
  "watch.noSignal": "Kein Signal im letzten Scrape",
  "watch.notEnoughHistory": "Noch zu wenig Historie für {ticker} — mehr Scrapes für einen Trend nötig.",
  "watch.addToTrack": "Füge Aktien zur Merkliste hinzu, um ihren Score-Verlauf zu verfolgen.",
  "upd.ready": "Update bereit",
  "upd.downloading": "Update wird geladen",
  "upd.readyBody": "Version v{version} wurde erfolgreich geladen und kann installiert werden.",
  "upd.downloadingBody": "Version v{version} wird gerade im Hintergrund geladen.",
  "upd.later": "Später",
  "upd.restart": "Neu starten & aktualisieren",

  // ── Conviction / source health / news ──
  "conviction.high": 'Hohe Überzeugung',
  "conviction.watch": 'Beobachten',
  "conviction.low": "Schwaches Signal",
  "srcH.title": "Quellen-Status",
  "srcH.legend": "letzte · Median · unbrauchbar · Status",
  "srcH.noQuality": "Für diesen Lauf liegen noch keine Datenqualitäts-Zähler vor.",
  "srcH.brokenOne": "{n} Scraper-Quelle könnte defekt sein:",
  "srcH.brokenMany": "{n} Scraper-Quellen könnten defekt sein:",
  "srcH.zeroRows": '{names}: null Zeilen bei mehreren Läufen in Folge.',
  "srcH.viewSources": "Quellen ansehen",
  "srcH.dismiss": "Ausblenden",
  "srcH.dismissTitle": "Für diese Sitzung ausblenden",
  "news.connectionRequired": "Twitter/X-Verbindung erforderlich",
  "news.connectionHint": "X verlangt eine Anmeldung, um Profile anzuzeigen. Melde dich in den Einstellungen mit deinem X-Konto an, um diesen Feed und Echtzeit-Meldungen freizuschalten.",
  "news.goToSettings": "Zu den Einstellungen",
  "news.fetching": "Lade Live-News-Timeline…",
  "news.empty": "Noch keine News erfasst. Nutze „News aktualisieren“, um die neuesten Beiträge zu laden.",

  // ── Welcome modal ──
  "welcome.releaseNotes": "Versionshinweise",
  "welcome.skip": "Überspringen",
  "welcome.back": "Zurück",
  "welcome.next": "Weiter",
  "welcome.getStarted": "Los geht’s",

  // ── Platform logins ──
  "login.title": "Plattform-Logins",
  "login.requiredToScrape": "Login zum Scrapen erforderlich",
  "login.webNote": "Dies ist die gehostete Webansicht — sie zeigt nur Daten an und scrapt nie; ein Login hier hätte kein Ziel für die Cookies. Login-pflichtige Quellen (Options-Flow, Finviz Elite, X …) werden auf zwei Wegen gescrapt: in der Desktop-App, die ihre Ergebnisse hierher veröffentlicht, oder vom Cloud-Scraper, wenn du exportierte Session-Cookies als GitHub-Secret SCRAPE_SESSIONS hinterlegst.",
  "login.desktopNote": "Melde dich an, um Gratis-Limits und kontogebundene Daten zu umgehen. Es öffnet sich ein Browserfenster für den Login (E-Mail, Google, was auch immer) — gespeichert werden nur die resultierenden Session-Cookies, verschlüsselt auf diesem Gerät. Passwörter werden nicht gespeichert.",
  "plat.hintOptionsAccount": "Options-Flow erfordert ein Konto.",
  "plat.hintBarchart": "Gratis-Zugang reicht; Login hebt Limits auf.",
  "plat.hintFinviz": "Elite entfernt die Verzögerungen.",
  "plat.hintTwitter": "Nötig, um den WhaleInsider-News-Feed zu scrapen.",

  // ── Accuracy panel ──
  "acc.beatSp": "Schlug den S&P bei {hit} von {total} ({pct} %)",
  "acc.avgAlpha": "{v} Ø 3-M-α (vs. S&P)",
  "acc.marketBeatRate": "{pct} % Trefferquote gegen den Markt",
  "acc.avgAlphaLong": ", {v} Ø 3-Monats-Alpha",
  "acc.disclaimer": "Die Ergebnisse sind split- und dividendenbereinigt und werden über ~3 Monate gegen den S&P 500 gemessen. Käufe in später delisteten Titeln haben keine Kursdaten und fallen heraus — die Trefferquoten sind dadurch tendenziell zu optimistisch.",

  // ── Testing portfolio (v1.4.0) ──
  "nav.portfolio": "Depot",
  "nav.portfolioShort": "Depot",
  "view.portfolio.title": "Testing-Portfolio",
  "view.portfolio.subtitle": "Simuliertes 10.000-$-Depot aus den stärksten Signalen, gegen den S&P 500",
  "pf.headline.value": "Depotwert",
  "pf.headline.benchmark": "S&P 500 (SPY)",
  "pf.headline.edge": "Vorsprung",
  "pf.headline.sinceStart": "seit {date}",
  "pf.headline.asOf": "Kurse bis {date}",
  "pf.headline.noData": "Noch keine Kurve",
  "pf.headline.noDataHint": "Das Depot wird aus der gespeicherten Signalhistorie berechnet. Starte einen Lauf, um es zu erzeugen.",
  "pf.headline.opensOn": "Das Depot startet am {date}. Es handelt nur Signale ab diesem Tag — vor der ersten abgeschlossenen Sitzung gibt es nichts zu zeichnen.",
  "pf.action.sync": "Aktualisieren",
  "pf.action.syncing": "Läuft…",
  "pf.action.rebuild": "Neu aufbauen",
  "pf.action.rebuilding": "Baue neu…",
  "pf.action.rebuildConfirm": "Der Neuaufbau löscht die gespeicherte Kurve, alle simulierten Trades und das Ereignisprotokoll und rechnet alles von vorn. Kurshistorie, Signale und gelabelte Outcomes werden NICHT angefasst. Fortfahren?",
  "pf.action.failed": "Der Lauf ist fehlgeschlagen: {error}",
  "pf.chart.portfolio": "Insider-Portfolio",
  "pf.chart.benchmark": "S&P 500 (SPY)",
  "pf.chart.idle": "Portfolio (Cash ungenutzt)",
  "pf.chart.scaleLinear": "Linear",
  "pf.chart.scaleLog": "Log",
  "pf.chart.unitDollar": "$",
  "pf.chart.unitPercent": "%",
  "pf.chart.showTrades": "Trade-Marker",
  "pf.chart.showIdle": "Cash-Drag-Linie",
  "pf.chart.liveFrom": "Live ab {date}",
  "pf.chart.hint": "Beide Linien starten am selben Tag beim selben Betrag auf einer gemeinsamen Achse — gleicher vertikaler Abstand heißt gleiche Rendite. Die getönte Fläche ist der Abstand zwischen ihnen: grün, wo das Portfolio vor dem S&P 500 liegt, rot, wo es dahinter liegt. Dreiecke markieren Sitzungen mit Trades; für die Ticker darüberfahren.",
  "pf.chart.difference": "Differenz",
  "pf.chart.buy": "Kauf",
  "pf.chart.sell": "Verkauf",
  "pf.chart.moreTrades": "+{n} weitere",
  "pf.range.7d": "7T",
  "pf.range.30d": "30T",
  "pf.range.90d": "90T",
  "pf.range.6m": "6M",
  "pf.range.1y": "1J",
  "pf.range.max": "Max",
  "pf.range.tooShort": "Noch zu wenig Historie — noch {days} Tag(e)",
  "pf.stats.title": "Wertentwicklung",
  "pf.stats.metric": "Kennzahl",
  "pf.stats.portfolio": "Portfolio",
  "pf.stats.benchmark": "S&P 500",
  "pf.stats.diff": "Differenz",
  "pf.stats.7d": "7 Tage",
  "pf.stats.30d": "30 Tage",
  "pf.stats.6m": "6 Monate",
  "pf.stats.1y": "1 Jahr",
  "pf.stats.max": "Max (seit Start)",
  "pf.stats.cagr": "Annualisiert (CAGR)",
  "pf.stats.maxDrawdown": "Max. Drawdown",
  "pf.stats.volatility": "Volatilität (annualisiert)",
  "pf.stats.sharpe": "Sharpe (rf = 0)",
  "pf.stats.pending": "n/a · noch {days} T",
  "pf.stats.smallSample": "kleine Stichprobe (n={n})",
  "pf.trades.title": "Trade-Bilanz",
  "pf.trades.count": "Trades",
  "pf.trades.winRate": "Trefferquote",
  "pf.trades.avgHold": "Ø Haltedauer",
  "pf.trades.avgWinLoss": "Ø Gewinn / Ø Verlust",
  "pf.trades.bestWorst": "Bester / schlechtester Trade",
  "pf.trades.avgAlpha": "Ø Trade-Alpha vs. SPY",
  "pf.trades.avgAlphaHint": "Jeder Trade gegen den SPY über exakt seine eigene Haltedauer. Immun gegen Cash-Drag und Timing-Zufall — die aussagekräftigste Zahl auf dieser Seite.",
  "pf.trades.invested": "Aktuell investiert",
  "pf.trades.closedOpen": "{closed} geschlossen · {open} offen",
  "pf.trades.days": "{n} T",
  "pf.open.title": "Offene Positionen",
  "pf.open.none": "Keine offenen Positionen — das Depot liegt vollständig in seiner Cash-Politik.",
  "pf.closed.title": "Geschlossene Trades",
  "pf.closed.none": "Noch keine geschlossenen Trades.",
  "pf.col.ticker": "Ticker",
  "pf.col.entryDate": "Einstieg",
  "pf.col.exitDate": "Ausstieg",
  "pf.col.score": "Score",
  "pf.col.weight": "Gewicht",
  "pf.col.entryPrice": "Einstiegskurs",
  "pf.price.stale": "Veraltet · {date}",
  "pf.price.unavailable": "Kurs nicht verfügbar",
  "pf.col.price": "Kurs",
  "pf.col.exitPrice": "Ausstiegskurs",
  "pf.col.unrealized": "Buchgewinn",
  "pf.col.realized": "G/V",
  "pf.col.return": "Rendite",
  "pf.col.hold": "Haltedauer",
  "pf.col.barrier": "Nächste Barriere",
  "pf.col.alpha": "α vs. SPY",
  "pf.col.reason": "Grund",
  "pf.exit.take_profit": "Take-Profit",
  "pf.exit.stop_loss": "Stop-Loss",
  "pf.exit.trailing": "Trailing-Stop",
  "pf.exit.time": "Zeit-Stop",
  "pf.exit.data_missing": "Keine Kursdaten",
  "pf.showMore": "Alle {n} anzeigen",
  "pf.showLess": "Weniger anzeigen",
  "pf.rules.title": "Regelwerk & Annahmen",
  "pf.rules.show": "Anzeigen",
  "pf.rules.hide": "Ausblenden",
  "pf.rules.entry": "Einstieg",
  "pf.rules.entryValue": "Score ≥ {score} beim ersten Sichten, zum Schlusskurs dieser Sitzung",
  "pf.rules.sizing": "Positionsgröße",
  "pf.rules.fixedSizing": "Jede neue Position erhält beim Einstieg {weight}% des Depotwerts; danach können Gewichte abweichen. Keine automatische Neugewichtung oder Nachkäufe.",
  "pf.assume.cashIdle": "Nicht investiertes Kapital bleibt unverzinst als Cash. Die Rendite enthält den Effekt dieses Cash-Anteils.",
  "pf.rules.sizingValue": "{base} % des Depotwerts bei Score {entry}, steigend bis {max} % (Untergrenze {min} %) — je höher der Score, desto größer die Position",
  "bd.dormant": "Inaktiv (Eingabe fehlt, kein Urteil):",
  "pf.rules.exits": "Ausstiege (die erste Barriere gewinnt)",
  "pf.rules.exitTakeProfit": "Take-Profit +{tp} %",
  "pf.rules.exitNoTakeProfit": "Kein Take-Profit — die Oberseite wird nie gedeckelt",
  "pf.rules.exitStopLoss": "Stop-Loss −{sl} %",
  "pf.rules.exitNoStopLoss": "Kein Stop-Loss",
  "pf.rules.exitTrailing": "Trailing {trailDist} % unter dem höchsten Schlusskurs ab +{trailArm} %",
  "pf.rules.exitTime": "Zeit-Stop {hold} Kalendertage",
  "pf.rules.priority": "Reißen mehrere am selben Tag: Stop-Loss → Trailing → Take-Profit → Zeit. Eine abgeschaltete Barriere wird einfach übersprungen.",
  "pf.rules.limits": "Grenzen",
  "pf.rules.limitsValue": "Max. {max} offene Positionen · ein Ticker nur einmal · {cooldown} Tage Sperre nach dem Verkauf · Mindestticket {ticket} $",
  "pf.rules.cash": "Nicht investiertes Kapital",
  "pf.rules.cashSpy": "Liegt im S&P 500 (SPY)",
  "pf.rules.cashIdle": "Bleibt Cash, 0 % Verzinsung",
  "pf.rules.costs": "Kosten",
  "pf.rules.costsValue": "0 $ Kommission · {slip} % Slippage pro Seite, auf jede Ausführung inklusive der SPY-Cash-Seite",
  "pf.rules.capital": "Startkapital",
  "pf.rules.benchmark": "Benchmark",
  "pf.rules.benchmarkValue": "SPY Buy & Hold, gleicher Starttag, gleiche {capital} $, gleiche Einstiegs-Slippage",
  "pf.assume.title": "Annahmen und Grenzen",
  "pf.assume.cash": "Nicht investiertes Kapital liegt im S&P 500. Das Depot ist damit „Index plus Signal-Overlay“, und die Differenz zur Benchmark ist der Beitrag der Signale und nichts anderes.",
  "pf.assume.prices": "Ausschließlich bereinigte Tagesschlusskurse (Splits und Dividenden enthalten). Keine Intraday-Kurse, keine Hochs oder Tiefs — ein Stop auf einem Tages-Tief, das nie handelbar war, wäre Fiktion.",
  "pf.assume.fractional": "Fraktionale Anteile sind erlaubt, damit ein 1.500-$-Kurs die Gewichtung nicht verzerrt.",
  "pf.assume.tax": "Keine Steuern, keine Quellensteuer. Bereinigte Kurse enthalten Bruttodividenden.",
  "pf.assume.lookahead": "Eine Position wird frühestens zu dem Schlusskurs eröffnet, der nach dem Sichtbarwerden des Signals im Terminal noch bevorstand — nie zum Handelstag des Insiders.",
  "pf.assume.backfill": "Aus der gelabelten Outcome-Historie rekonstruierte Signale tragen nur ein Datum, keine Uhrzeit. Sie steigen eine Sitzung später ein, was Rendite nur kosten, nie hinzufügen kann.",
  "pf.assume.sample": "Die gespeicherte Signalhistorie ist kurz. Jede Zahl auf dieser Seite beruht auf einer Handvoll Trades und ist eine Richtung, kein Ergebnis.",
  "pf.quality.title": "Datenqualität",
  "pf.quality.skipped": "{n} Signal(e) übersprungen (kein Cash)",
  "pf.quality.capped": "{n} übersprungen (Positionslimit)",
  "pf.quality.missing": "{n} Ticker ohne Kursdaten",
  "pf.quality.suspect": "{n} verdächtige Kurse ignoriert",
  "pf.quality.restated": "{n} gespeicherte Tag(e) weichen nach einer Kursrestatement ab",
  "pf.quality.untradable": "Nicht handelbar: {tickers}",
  "pf.quality.clean": "Keine Signale übersprungen, keine Kurse fehlend.",
  "pf.meta.backfill": "Backfill aus gespeicherter Signalhistorie ab {from} · live ab {live}",
  "pf.meta.backfillOnly": "Backfill aus gespeicherter Signalhistorie ab {from}",
  "pf.meta.liveOnly": "Live seit {from} · kein Backfill — jeder Trade beruht auf einem gerade eingetroffenen Signal, nicht auf einer Historie, an der die Regeln gewählt wurden",
  "pf.meta.lastRun": "Letzter Lauf {when}",
  "pf.meta.readOnly": "Von der geplanten Ausführung berechnet — die Web-Version liest das veröffentlichte Ergebnis.",
  "pf.cfg.edit": "Regeln ändern",
  "pf.cfg.apply": "Übernehmen & neu aufbauen",
  "pf.cfg.applying": "Baue neu…",
  "pf.cfg.cancel": "Abbrechen",
  "pf.cfg.reset": "Standard wiederherstellen",
  "pf.cfg.rebuildWarning": "Beim Übernehmen wird die gesamte Kurve neu berechnet — ein Chart, der mit einem Regelsatz gezeichnet wurde, darf nie mit einem anderen beschriftet sein. Kurse, Signale und gelabelte Outcomes bleiben unberührt.",
  "pf.cfg.invalidWeights": "Das Basisgewicht muss zwischen Minimum und Maximum liegen.",
  "pf.cfg.entryScore": "Einstiegs-Score",
  "pf.cfg.scoreSpan": "Score-Spanne",
  "pf.cfg.baseWeight": "Basisgewicht",
  "pf.cfg.minWeight": "Min. Gewicht",
  "pf.cfg.maxWeight": "Max. Gewicht",
  "pf.cfg.maxPositions": "Max. Positionen",
  "pf.cfg.minTicket": "Mindestticket ($)",
  "pf.cfg.cooldown": "Sperre (Tage)",
  "pf.cfg.takeProfit": "Take-Profit",
  "pf.cfg.barrierOn": "an",
  "pf.cfg.barrierOff": "aus — Barriere abgeschaltet",
  "pf.cfg.stopLoss": "Stop-Loss",
  "pf.cfg.maxHoldDays": "Zeit-Stop (Tage)",
  "pf.cfg.trailArm": "Trailing ab",
  "pf.cfg.trailDistance": "Trailing-Abstand",
  "pf.cfg.slippage": "Slippage / Seite",
  "pf.cfg.cashSpy": "S&P 500",
  "pf.cfg.cashIdle": "Cash, 0 %",
};

const DICTS: Record<Lang, Record<TKey, string>> = { en, de };

/** `{name}` placeholders are replaced from `vars`; unknown ones are left as-is. */
export function translate(
  lang: Lang,
  key: TKey,
  vars?: Record<string, string | number>,
): string {
  const raw = DICTS[lang]?.[key] ?? en[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

const STORAGE_KEY = 'language';

/** Persisted choice, else the browser's preference, else English. */
export function initialLanguage(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'de' || saved === 'en') return saved;
  } catch {
    /* private mode / no storage */
  }
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('de')) {
    return 'de';
  }
  return 'en';
}

export function persistLanguage(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
  if (typeof document !== 'undefined') {
    // Keeps the document language honest for screen readers and hyphenation.
    document.documentElement.setAttribute('lang', lang);
  }
}
