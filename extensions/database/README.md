# Datenbanken

Datenbanken direkt in Lumen durchsuchen und bearbeiten — Dateien und Server:

| | |
| --- | --- |
| **SQLite** | `.db`, `.sqlite`, `.sqlite3`, `.db3` — direkt auf der Datei, ohne Kopie |
| **H2** | `.mv.db` — braucht Java 11+; der H2-Treiber wird beim ersten Öffnen von Maven Central geladen |
| **MariaDB / MySQL** | alle Datenbanken des Servers als Schemas |
| **PostgreSQL** | Schemas, Tabellen, Views |
| **SQL Server** | auch mit ADO.NET-Verbindungszeichenfolge |
| **Redis** | Schlüssel suchen, Werte je Typ bearbeiten (String, Hash, List, Set, Sorted Set, Stream), TTL |
| **MongoDB** | Datenbanken, Collections, Dokumente als Extended JSON mit Filter und Sortierung |

## So arbeitest du damit

- Links die Ansicht **Datenbanken**: Verbindungen hinzufügen (`+`), eine Datei öffnen, verbinden.
  Eine Datenbankdatei im Explorer lässt sich auch direkt öffnen — Lumen fragt, ob sie in die
  Datenbank-Ansicht soll.
- Ein Klick auf eine Tabelle öffnet ihre Daten als **Tab im Editorbereich**: seitenweise,
  sortierbar per Klick auf die Spaltenköpfe, filterbar mit einer SQL-Bedingung.
- **Bearbeiten**: Doppelklick auf eine Zelle, neue Zeilen, Zeilen löschen — alles bleibt als
  ausstehende Änderung markiert, bis du **Übernehmen** klickst. Dann läuft alles in einer
  Transaktion; schlägt eine Anweisung fehl, wird nichts geschrieben. *SQL anzeigen* zeigt die
  Anweisungen vorher.
- **SQL-Konsole**: Strg+Enter führt das Skript aus (oder nur die Markierung), Anweisung für
  Anweisung; die Ergebnisse erscheinen darunter.
- **Export** der Tabelle oder eines Ergebnisses als CSV oder JSON.

Passwörter liegen verschlüsselt im Schlüsselbund des Systems, nie in den Einstellungen. Wer sein
Passwort nicht speichern möchte, wird beim Verbinden gefragt.

## Einstellungen

Zeilen pro Seite, Nachfrage vor dem Übernehmen, CSV-Trennzeichen, höchstens gezeigte Zeilen einer
Abfrage, Zeitlimit für Abfragen, Schlüssel je Redis-Suche, Pfad zu Java und die H2-Version.

## Hinweise

- Tabellen ohne Primärschlüssel sind nur lesbar — außer bei SQLite (`rowid`) und PostgreSQL
  (`ctid`), die jede Zeile auch so adressieren können.
- SQLite läuft in einem kleinen Hilfsprozess: eine lange Abfrage blockiert Lumen nicht und lässt
  sich über das Zeitlimit abbrechen.
- H2 sperrt die Datei, solange die Verbindung offen ist; *Trennen* gibt sie frei.

Diese Erweiterung bringt Programmcode mit (die Treiber sind darin gebündelt) und wird vor der
Installation zur Freigabe angezeigt.
