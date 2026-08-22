# Audit-Dokumente (2026-08-22)

Vollständiges Audit des Scoring-Modells und der Pipeline. Die Arbeitskopie liegt
unter `tmp/audit/` (gitignored); **dies hier ist die versionierte Fassung**, damit
die Befunde nicht mit dem Scratch-Verzeichnis verschwinden.

| Datei | Inhalt |
|---|---|
| [REPORT.md](REPORT.md) | **Hier anfangen.** Executive Summary: gefunden / behoben / offen / riskant, mit Verifikationsausgaben |
| [MATH.md](MATH.md) | Formel für Formel: 61 Prüfungen mit ausgeschriebener Rechnung oder Gegenbeispiel |
| [MONOTONICITY.md](MONOTONICITY.md) | Warum der Score „invertiert" aussah — 8 Hypothesen, geprüft und teils verworfen |
| [FACTORS.md](FACTORS.md) | Faktor für Faktor: misst er, was er behauptet? Varianzanteile, Korrelationen, Urteil |
| [ENGINEERING.md](ENGINEERING.md) | Befunde außerhalb der Mathematik, nach Schweregrad (S1–S3) |
| [DATAFLOW.md](DATAFLOW.md) | Pipeline und jede Stelle, an der ein Wert transformiert, gerundet, geklemmt oder defaultet wird |
| [INVENTORY.md](INVENTORY.md) | Alle Dateien mit Zweck und Risikoklasse |
| [COVERAGE.md](COVERAGE.md) | Ledger: was gelesen wurde, was bewusst übersprungen und warum |
| `verify/` | Rohausgaben der Verifikationsläufe |
