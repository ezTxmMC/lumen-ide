# GitHub

GitHub direkt in Lumen — für das Repository im geöffneten Ordner.

## Inhalt

- **Pull Requests** (rechte Seitenleiste): offene Pull Requests, gefiltert nach
  allen, eigenen oder denen mit angefragtem Review; Status der Checks, Labels
  und Entwürfe. Details mit Beschreibung, Reviews und geänderten Dateien,
  lokal auschecken, genehmigen, Änderungen anfordern, kommentieren, mergen
  (Merge, Squash, Rebase) und neue Pull Requests aus dem aktuellen Branch
  erstellen — auf Wunsch wird der Branch vorher gepusht.
- **Issues** (rechte Seitenleiste): offene Issues (alle, mir zugewiesen, von
  mir erstellt), Details mit Kommentaren, kommentieren, schließen, neue Issues
  mit Labels.
- **GitHub Actions** (unteres Panel): die letzten Workflow-Läufe des aktuellen
  Branches oder aller Branches — erneut ausführen (auch nur fehlgeschlagene
  Jobs), abbrechen, im Browser öffnen.
- **Statusleiste**: CI-Status des letzten Laufs auf dem aktuellen Branch.
- **Befehle**: Repository oder aktive Datei im Browser öffnen, Pull Request
  bzw. Issue erstellen, an- und abmelden.

## Anmeldung

Entweder ein Personal Access Token (*GitHub: Anmelden…* oder *Einstellungen →
Erweiterungen → GitHub*) — er wird verschlüsselt im Schlüsselbund des Systems
gespeichert — oder die Anmeldung der [GitHub CLI](https://cli.github.com)
(`gh auth login`). GitHub Enterprise funktioniert mit eingetragener API-Adresse.

Die Erweiterung bringt Programmcode mit, der beim Installieren bestätigt werden
muss. Sie spricht direkt mit der GitHub-API und ruft `git` bzw. `gh` nur für
das Auschecken und Pushen auf.
