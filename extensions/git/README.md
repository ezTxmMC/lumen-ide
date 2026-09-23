# Git

Quellcodeverwaltung mit Git direkt in Lumen.

## Inhalt

- **Quellcodeverwaltung** (Seitenleiste): Commit-Nachricht mit *Commit*,
  *Commit & Push* und *Amend*; Merge-Konflikte, vorgemerkte, geänderte und nicht
  verfolgte Dateien mit Diff, Vormerken, Zurücknehmen und Verwerfen — einzeln
  oder für die ganze Gruppe. Laufende Merges, Rebases und Cherry-Picks lassen
  sich fortsetzen oder abbrechen.
- **Branches**: lokale und Remote-Branches mit Upstream und ↑/↓, Tags, Stashes
  und Remotes — auschecken, mergen, rebasen, umbenennen, löschen, anwenden.
- **Git-Verlauf** (unteres Panel): die letzten Commits mit Branches und Tags;
  ein Klick zeigt den Diff, das Kontextmenü bietet Branch/Tag anlegen,
  Checkout, Cherry-Pick, Revert und Reset.
- **Statusleiste**: aktueller Branch (mit `*` bei Änderungen) und ↓/↑ zum
  Synchronisieren.
- **Befehle** in der Befehlspalette (`Git: …`), u. a. Verlauf und Blame der
  aktiven Datei, Klonen und Repository anlegen.

Die Ansicht aktualisiert sich beim Speichern, beim Fokussieren des Fensters und
alle paar Sekunden, solange du mit ihr arbeitest. Optional ruft sie in einem
Intervall automatisch ab (*Einstellungen → Erweiterungen → Git*).

## Voraussetzung

Git muss installiert sein. Die Erweiterung bringt Programmcode mit, der beim
Installieren bestätigt werden muss; er ruft ausschließlich das installierte
`git` auf — ohne Shell und ohne interaktive Rückfragen.
