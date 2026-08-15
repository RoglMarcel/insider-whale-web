# Prompt: Machbarkeits- und Architekturanalyse "Insider & Whale Terminal auf Android"

> **Anleitung für mich selbst:** Diesen kompletten Text als Prompt an das KI-Modell geben, das
> Zugriff auf den Ordner `C:\Users\8marc\Desktop\Insider` hat. Alles ab der Linie unten ist der Prompt.

---

## Rolle

Du bist ein erfahrener Mobile-System-Architekt mit Schwerpunkt Android, Offline-First-Apps,
Web-Scraping unter feindlichen Bedingungen (Bot-Schutz, Login-Walls, JS-Rendering) und
Cross-Platform-Codesharing zwischen Electron und Mobile. Du hast schon mehrfach
Desktop-Anwendungen mit Node-Backend auf reine On-Device-Mobile-Architekturen portiert und
weißt aus Erfahrung, wo solche Portierungen scheitern.

Du bewertest nüchtern und ergebnisoffen. Du bist ausdrücklich **nicht** dazu da, mir zu
bestätigen, dass mein Vorhaben funktioniert. Wenn Teile davon technisch nicht oder nur
schlecht funktionieren, ist genau das das wertvollste Ergebnis dieser Analyse.

## Aufgabe

Erstelle eine tiefgehende technische **Konzept- und Machbarkeitsanalyse** dazu, wie meine
bestehende Desktop-Anwendung (Electron) als **Android-App** laufen kann.

**Wichtig: Es geht in diesem Schritt ausdrücklich NICHT um die Umsetzung.** Schreibe keinen
Produktionscode, lege keine Dateien im Projekt an, ändere nichts am bestehenden Code. Ich will
verstehen, **ob**, **wie genau** und **zu welchem Preis** das funktionieren würde, bevor
irgendeine Zeile geschrieben wird. Kleine Code-Skizzen (5–20 Zeilen) sind erlaubt, aber
ausschließlich um ein Architekturkonzept zu illustrieren — nicht als Implementierung.

## Vorarbeit (verbindlich, vor jeder Aussage)

Analysiere zuerst den tatsächlichen Ist-Zustand im Ordner `C:\Users\8marc\Desktop\Insider`.
Rate nichts, was du nachlesen kannst. Sieh dir mindestens an:

- `README.md`, `PROJECT_ANALYSIS.md`, `CODEBASE_AUDIT.md`, `FEATURE_ROADMAP.md`
- `package.json`, `vite.config.ts`, `electron-builder.json`
- `electron/main.ts`, `electron/preload.ts`, `electron/ipc-channels.ts`
- `electron/database.ts`, `electron/scoring.ts`, `electron/scheduler.ts`,
  `electron/notifications.ts`, `electron/auth.ts`, `electron/vix.ts`, `electron/performance.ts`
- den kompletten Ordner `electron/scraper/` (insbesondere `index.ts`, `browser.ts`, `util.ts`
  und jede einzelne Quelle)
- `src/types/index.ts`, `src/store/useStore.ts`, `src/lib/ipc.ts` und die Komponenten unter
  `src/components/`

Zähle dabei konkret aus, statt zu schätzen: Wie viele Zeilen/KB entfallen auf reine Logik
(portierbar), auf Node-/Electron-gebundenen Code (nicht portierbar), auf UI (je nach Ansatz
wiederverwendbar)? Nenne bei jeder Aussage die Datei und, wo sinnvoll, die Funktion, auf die
du dich beziehst. Eine Behauptung ohne Bezug zum echten Code ist wertlos.

## Harte Rahmenbedingungen (nicht verhandelbar)

1. **Zielplattform: ausschließlich Android.** iOS ist explizit kein Thema. Nutze die dadurch
   gewonnene Freiheit (WorkManager, Foreground Services, Sideloading, exakte Alarme,
   WebView-Kontrolle) aktiv in der Analyse aus.
2. **Alles läuft auf dem Gerät selbst.** Es darf **kein eigener Server, kein VPS, keine Cloud-
   Datenbank, kein Backend-Worker und keine Verbindung zu meinem PC** notwendig sein. Die App
   muss autark auf dem Handy funktionieren: eigenes Scraping, eigene Datenbank, eigenes
   Scoring, eigene Zeitsteuerung, eigene Benachrichtigungen. Verbindungen nach außen sind nur
   zu den öffentlichen Datenquellen selbst erlaubt (die Seiten, die die App ohnehin scrapt).
3. **Nutzerkreis: ich plus eine Handvoll Leute** (Größenordnung 3–20), Verteilung als
   Beta/Testverteilung. Kein öffentliches Play-Store-Produkt, aber auch nicht nur mein eigenes
   Gerät — die App muss also auf fremder Hardware, mit fremden Accounts und ohne mich als
   Admin funktionieren.
4. Die Desktop-App bleibt bestehen. Die Analyse muss beantworten, ob Desktop und Mobile aus
   **einer** Codebasis gepflegt werden können oder ob zwangsläufig zwei Projekte entstehen.

## Der eigentliche Konflikt, den du auflösen musst

Die App ist heute so gebaut, dass der Electron-Main-Prozess mit **Playwright/Chromium** echte
Browser startet, teils mit gespeicherten Login-Sessions (`storageState`, verschlüsselt über
Electron `safeStorage`), dazu **better-sqlite3** als natives Modul, **node-cron** plus Windows
Task Scheduler für zeitgesteuerte Läufe und native Electron-Notifications.

Kein einziger dieser Bausteine existiert in dieser Form auf Android. Gleichzeitig verbietet
Rahmenbedingung 2, die Arbeit einfach auf einen Server zu verschieben. Die zentrale Frage
dieser Analyse lautet deshalb:

> **Lässt sich die Beschaffungs-, Speicher-, Scoring- und Zeitsteuerungsschicht dieser
> Anwendung vollständig auf ein Android-Gerät verlagern — und wenn ja, welche Fähigkeiten
> gehen dabei verloren, welche werden unzuverlässig, und was kostet das an Akku, Datenvolumen,
> Zeit und Wartungsaufwand?**

Beantworte diese Frage ehrlich, auch wenn die Antwort "für einen Teil der Datenquellen nein"
lautet. Wenn eine Rahmenbedingung die Sache unmöglich macht, sage das deutlich und zeige, was
die minimal notwendige Lockerung dieser Bedingung wäre (z. B. einmaliger Datei-Import statt
Dauerverbindung) — aber schlage sie nicht einfach als Hauptweg vor.

## Fragen, die die Analyse beantworten muss

### A. Architekturoptionen und Entscheidung

1. Vergleiche mindestens diese Ansätze systematisch:
   - **Capacitor** (bestehendes React/Vite/Tailwind-Frontend unverändert weiterverwenden,
     Native-Layer für HTTP, SQLite, Hintergrundläufe, Benachrichtigungen)
   - **React Native / Expo** (UI-Neubau, Logik-Wiederverwendung)
   - **Native Android (Kotlin)** (kompletter Neubau, maximale Kontrolle über Hintergrund und
     WebView)
   - **Trusted Web Activity / PWA** (und warum das an den Rahmenbedingungen vermutlich
     scheitert — begründe es, statt es nur zu behaupten)
   - jede weitere Option, die du für ernsthaft konkurrenzfähig hältst
2. Bewerte jede Option entlang: Wiederverwendungsgrad des vorhandenen Codes (konkret in
   Prozent, hergeleitet aus der Codeanalyse), Fähigkeit zum Scraping JS-lastiger und
   login-geschützter Seiten, Hintergrundausführung, Datenbankzugriff, Wartbarkeit über zwei
   Plattformen, Aufwand beim Erstbau, Aufwand pro Folgeänderung, Risiko.
3. Gib eine **klare, begründete Empfehlung** mit expliziter Nennung, was du dafür in Kauf
   nimmst. Kein "es kommt darauf an" ohne Auflösung.
4. Zeichne die Zielarchitektur als Textdiagramm — analog zum Architekturblock im bestehenden
   `README.md` —, inklusive der Frage, was aus der heutigen Trennung
   `Renderer → window.api → IPC → Main` wird. Prüfe explizit die These, dass die
   `preload.ts`/`ipc-channels.ts`-Schnittstelle bereits die natürliche Bruchkante ist, hinter
   der man zwei Implementierungen (Electron-IPC vs. On-Device-Service) austauschen könnte.

### B. Datenbeschaffung ohne Playwright — der kritischste Teil

5. Gehe **jede einzelne Quelle** aus `electron/scraper/` einzeln durch (OpenInsider, Finviz,
   SEC EDGAR/Form 4, SECForm4, Insider-Monitor, Quiver, MarketBeat, MarketBeat Options,
   Barchart, OptionStrat, InsiderFinance, GuruFocus, CapitolTrades, Senate Watcher, Activist,
   Sellside, Stockstats, Twitter, AlphaSpread, valueinvesting.io, Yahoo/CBOE VIX) und
   klassifiziere sie in einer Tabelle:
   - Was wird technisch tatsächlich gemacht (statisches HTML, JSON-API, JS-gerendertes DOM,
     Shadow DOM, Login nötig, Rate Limits, Bot-Schutz)?
   - Reicht auf Android ein reiner HTTP-Request plus HTML-Parser (kein Browser)?
   - Braucht es einen echten Renderer — und ist Android **WebView** mit injiziertem JavaScript
     dafür ein ausreichender Ersatz für Playwright? Wo genau nicht?
   - Wie hoch schätzt du das Risiko ein, dass die Quelle einen Mobile-Client/WebView erkennt
     und blockt (Cloudflare, TLS-Fingerprinting, User-Agent-Prüfung, Datacenter- vs.
     Residential-IP)?
   - Ampelbewertung: funktioniert on-device / funktioniert eingeschränkt / funktioniert nicht.
6. Bewerte den CORS-Aspekt sauber: Welche Ansätze umgehen ihn nativ (nativer HTTP-Stack) und
   welche laufen in eine Browser-Sandbox?
7. Wie können die heutigen **Platform Logins** on-device abgebildet werden? Prüfe das Konzept
   "Nutzer loggt sich in einer In-App-WebView ein, Cookies bleiben im nativen CookieManager
   und werden für spätere Scrapes wiederverwendet" gegen das heutige verschlüsselte
   `storageState`-Verfahren aus `electron/auth.ts`. Wo liegen Sicherheits-, Ablauf- und
   Zuverlässigkeitsprobleme, besonders wenn andere Leute die App mit ihren eigenen Accounts
   benutzen?
8. Welche Teile der Parsing-Logik sind reine Zeichenketten-/DOM-Arbeit und damit unabhängig
   von Playwright wiederverwendbar, wenn man sie hinter eine Abstraktion legt (z. B.
   "hol mir HTML" vs. "interpretiere HTML")? Wie tief steckt die Playwright-API heute in
   `scraper/util.ts` und den einzelnen Scrapern drin — schätze den Refactoring-Aufwand.

### C. Persistenz, Scoring, Verlauf

9. Welcher SQLite-Weg ist auf Android der richtige (nativ, über eine JS-Bindung, ORM-Schicht)?
   Was passiert mit WAL-Modus, den PRAGMA-basierten Migrationen aus `database.ts`, den
   Prepared-Statement-Optimierungen und den Backups vor Migrationen? Ist das bestehende
   Schema 1:1 übertragbar?
10. Wie viel Prozent von `electron/scoring.ts`, `electron/performance.ts` und
    `src/types/index.ts` sind reines TypeScript ohne Node-Abhängigkeit und laufen damit
    unverändert in einer JS-Laufzeit auf dem Gerät? Prüfe das am Code, nicht per Annahme —
    das ist ein Hauptargument für oder gegen eine JS-basierte Mobile-Lösung.
11. **Kaltstart-Problem:** Track Records, Backtests, Performance-Dashboard, Score-Trends und
    Source-Health leben von historischen Daten, die auf meinem PC über Monate gewachsen sind.
    Eine frische Installation auf einem fremden Handy hat eine leere Datenbank. Analysiere die
    Folgen für die Aussagekraft der Scores und diskutiere Lösungen (mitgelieferte Seed-
    Datenbank im App-Bundle, einmaliger Datei-Import/Export, schrittweiser Aufbau, oder
    Verzicht auf bestimmte Features in den ersten Wochen).
12. Speicher- und Wachstumsverhalten: Wie groß wird die Datenbank bei 365 Tagen Retention
    realistisch, und ist das auf einem Telefon vertretbar?

### D. Zeitsteuerung, Akku, Ressourcen

13. Wie ersetzt man `node-cron` plus Windows Task Scheduler auf Android? Vergleiche
    WorkManager (periodisch, Mindestintervall), exakte Alarme (`AlarmManager`, Berechtigung
    ab Android 12/13/14), Foreground Service für längere Läufe und die Frage, wie das
    bestehende Zeitraster (Market Open 9:30 ET, Midday, Close 16:00 ET) mit Zeitzonen und
    Sommerzeit korrekt getroffen wird.
14. Was machen **Doze Mode, App Standby Buckets, herstellerspezifische Akku-Killer**
    (Xiaomi, Samsung, Huawei, OnePlus) mit einer App, die dreimal täglich 15+ Quellen
    abklappert? Wie zuverlässig ist das realistisch, und welche Nutzeraktion (Akkuoptimierung
    deaktivieren) wird zwingend nötig?
15. Schätze die Kosten eines vollständigen Scrape-Laufs auf dem Handy quantitativ ab:
    übertragenes Datenvolumen, Laufzeit, CPU-/Speicherbedarf (besonders wenn WebViews mehrere
    schwere Seiten rendern), Akkuverbrauch pro Lauf und pro Tag. Nenne die Annahmen, aus denen
    du rechnest. Was bedeutet das auf Mobilfunk statt WLAN?
16. Wie muss der heutige Concurrency-3-Pool aus `scraper/index.ts` auf einem Telefon angepasst
    werden? Was passiert, wenn das Betriebssystem die App mitten im Lauf beendet — braucht es
    Wiederaufnahme/Teilfortschritt?

### E. Oberfläche und Bedienung

17. Was passiert mit der bestehenden UI (Dashboard/Alerts, Live News, Watchlist, History mit
    Recharts, Detail-Modal mit Score-Breakdown, Insider-Tabelle, TradingView-Widget,
    Settings)? Was ist am Handy schlicht zu dicht und muss konzeptionell neu gedacht werden?
18. Was passiert konkret mit Recharts, Tailwind, dem Glass-Design aus `styles/globals.css` und
    dem eingebetteten TradingView-Widget — je nach gewähltem Architekturansatz?
19. Welche Interaktionen (Hover-Tooltips, breite Tabellen, mehrspaltige Modals, Popover in der
    Insider-Tabelle) haben auf Touch kein Äquivalent und brauchen ein anderes Muster?
20. Skizziere eine sinnvolle mobile Informationsarchitektur — was ist die eine Sache, die man
    am Handy sehen will, und was gehört bewusst nur auf den Desktop?

### F. Verteilung, Betrieb, Recht

21. Wie kommt die App auf die Geräte der anderen Leute, ohne Play-Store-Listing? Vergleiche
    direkte APK-Verteilung, Play Console Internal Testing/Internal App Sharing, F-Droid-artige
    Wege — inklusive Signatur, Update-Mechanismus (der heutige `electron-updater` fällt weg)
    und der Frage, wie ein Datenbank-Migrationsschritt bei einem Update auf fremden Geräten
    sicher durchläuft.
22. Was ändert sich rechtlich/ToS-seitig dadurch, dass fremde Personen mit ihren eigenen
    Accounts und IPs scrapen, statt dass ich es lokal für mich tue? Gehe auf Nutzungsbedingungen
    der Quellen, Login-Weitergabe, Haftung und die nötigen Disclaimer ein (die App gibt keine
    Anlageberatung). Du bist kein Anwalt — kennzeichne das, aber benenne die Risiken trotzdem
    konkret.
23. Wartungsrealität: Scraper brechen ständig (das zeigt die Versionshistorie im `README.md`
    sehr deutlich). Wenn die Scraping-Logik jetzt in einer verteilten App auf fremden Geräten
    steckt statt zentral, wie schnell kann ich einen kaputten Parser überhaupt noch fixen?
    Diskutiere Konzepte wie versionierte, zur Laufzeit nachladbare Parser-Regeln, ohne dabei
    Rahmenbedingung 2 zu verletzen — und sage klar, wenn das nicht geht.

### G. Gesamtbewertung

24. Eine Tabelle **Feature für Feature**: bleibt vollständig erhalten / eingeschränkt /
    entfällt on-device — inklusive Begründung. Nutze dafür die Feature-Liste aus dem `README.md`.
25. Realistische **Aufwandsschätzung** in Personentagen, je Architekturoption, aufgeteilt nach
    Gewerken (Datenschicht, Scraping, Hintergrund, UI, Verteilung, Stabilisierung).
26. **Risikoregister**: die 8–12 größten Risiken, jeweils mit Eintrittswahrscheinlichkeit,
    Auswirkung, Frühwarnsignal und Gegenmaßnahme. Das größte Risiko gehört an Position 1.
27. **Killer-Kriterien**: Welche Erkenntnis würde das Vorhaben in dieser Form beenden? Formuliere
    für die 3–5 wichtigsten Unbekannten je ein konkretes, billiges Vorab-Experiment (max. ein
    halber Tag Aufwand), mit dem man sie **vor** dem Projektstart beantworten kann — inklusive
    dem, was genau man messen würde und welches Ergebnis "Abbruch" bedeutet.
28. Eine **Phasen-/Etappenskizze**: Welcher kleinste sinnvolle erste Schritt liefert schon
    echten Nutzen am Handy, und in welcher Reihenfolge kommt der Rest dazu? Kein Wasserfall
    über sechs Monate.

## Qualitätsanforderungen

- **Technisch präzise statt allgemein.** Nenne konkrete APIs, Bibliotheken, Android-Versionen
  und Berechtigungen beim Namen. "Man könnte Hintergrundjobs nutzen" ist keine Aussage;
  "WorkManager mit `PeriodicWorkRequest`, Mindestintervall 15 Minuten, unter Doze auf das
  Maintenance-Window verschoben, deshalb für einen exakten Lauf um 15:30 Uhr MEZ ungeeignet —
  Alternative X" ist eine.
- **Alles belegen oder als Annahme kennzeichnen.** Wo du dich auf meinen Code beziehst, nenne
  Datei und Stelle. Wo du dich auf Plattformverhalten beziehst, das sich geändert haben kann,
  kennzeichne es als prüfbedürftig und sage, wie man es prüft. Wo du schätzt, nenne die
  Rechengrundlage. Erfinde keine Zahlen, Bibliotheksnamen oder API-Verhalten.
- **Trade-offs offenlegen.** Jede Empfehlung nennt, was sie kostet, nicht nur, was sie bringt.
- **Widerspruch ist erwünscht.** Wenn meine Rahmenbedingungen (besonders "alles on-device")
  aus deiner Sicht die schlechtere Lösung erzwingen, sage es klar, quantifiziere den
  Unterschied und beschreibe kurz die Alternative — bevor du dann trotzdem den bestmöglichen
  Weg innerhalb meiner Bedingungen ausarbeitest.
- **Keine Marketing-Sprache, keine Füllsätze, keine Wiederholungen.** Länge ergibt sich aus
  Inhalt, nicht aus Ausschmückung. Tabellen und Listen dort, wo sie schneller lesbar sind als
  Prosa; Fließtext dort, wo eine Begründung Zusammenhang braucht.
- Sprache: **Deutsch**, Fachbegriffe auf Englisch belassen, wo eingedeutscht unüblich wäre.

## Ergebnisformat

Eine einzelne Markdown-Datei mit dieser Gliederung:

1. **Executive Summary** — max. eine Seite: geht es, wie, was kostet es, was geht verloren,
   klare Empfehlung, klare Killer-Risiken. Diese Seite muss für sich allein verständlich sein.
2. **Ist-Analyse der bestehenden Codebasis** (mit ausgezählten Zahlen)
3. **Portierungsmatrix Baustein für Baustein** (Playwright, SQLite, Cron, Notifications,
   Auth/Sessions, Updater, IPC, UI)
4. **Architekturoptionen im Vergleich + Empfehlung**
5. **Zielarchitektur** (Textdiagramm + Erläuterung der Schichten)
6. **Datenquellen-Matrix** (Quelle für Quelle, mit Ampelbewertung)
7. **Hintergrundausführung, Akku und Ressourcen**
8. **Daten, Historie und Kaltstart**
9. **UI/UX-Konzept fürs Handy**
10. **Verteilung, Updates, Wartung, Recht**
11. **Feature-Erhalt-Tabelle**
12. **Aufwand, Phasen, Risikoregister**
13. **Offene Fragen und Vorab-Experimente** (das, was ich als Nächstes tun sollte)

Am Ende: eine kurze, ehrliche Einschätzung in drei Sätzen — würdest du dieses Projekt unter
diesen Rahmenbedingungen selbst angehen, und warum (nicht)?

Wenn dir für eine belastbare Aussage entscheidende Informationen fehlen, stelle mir **vor**
Beginn der Analyse gebündelt die Fragen, die den größten Unterschied machen — maximal fünf.
