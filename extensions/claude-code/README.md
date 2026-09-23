# Claude Code

Claude Code als Chat-Agent in Lumen — mit derselben Engine wie der `claude`-Befehl:
deine Anmeldung, `CLAUDE.md`, Einstellungen und MCP-Server gelten.

## Chat

- **Live-Antworten**: Text und Gedankengang erscheinen, während Claude schreibt;
  Antworten als Markdown mit kopierbaren Code-Blöcken
- **Werkzeuge** mit Vorschau — Diffs bei Änderungen, der Befehl bei `Bash`, die
  Datei zum Öffnen; geänderte Dateien öffnen sich von selbst
- **Erlauben / Immer erlauben / Ablehnen** (auch mit Begründung) für jede Aktion
- **Plan**: die To-do-Liste von Claude als Karte mit Fortschritt
- **Kosten** je Antwort: Tokens, Cache, Schritte, Dauer und Preis
- **Mehrere Chats** nebeneinander, **frühere Sitzungen fortsetzen**
- **Modelle** kommen direkt aus der installierten Claude-Code-CLI — immer
  passend zu Version und Konto; ↻ neben der Auswahl lädt sie neu
- **Aufwand je Modell** im Chat wählen — nur die Stufen, die das Modell kann
  (Haiku z. B. hat keine); die Wahl merkt sich Lumen pro Modell
- **Modi** direkt im Chat umschalten: Nachfragen, Edits automatisch,
  Plan und — nur wenn freigeschaltet — Ohne Rückfrage
- **Eingabe**: `/` für Slash-Befehle, `@` für Dateien, ↑ für frühere Nachrichten,
  Bilder einfügen (Strg+V) oder anhängen, geöffnete Datei und Auswahl mitsenden

## Einstellungen

*Einstellungen → Erweiterungen → Claude Code*: Pfad zu `claude`, Standard- und
Ersatzmodell, weitere Modelle, Zwischenspeicher der Modellliste,
Standard-Aufwand, erweitertes Nachdenken (adaptiv, Budget, aus), Schnellmodus,
Ausgabestil, Sitzungen speichern, Live-Antworten, Höchstzahl an Schritten, Kostengrenze, zusätzliche Anweisungen,
erlaubte und gesperrte Werkzeuge, weitere Ordner, Einstellungsquellen,
zusätzliche MCP-Server (JSON) und Umgebungsvariablen.

## Vorlage

*Neues Projekt → Claude Code Projekt* legt `CLAUDE.md`, `.claude/settings.json`
und den Slash-Befehl `/review` an.

## Voraussetzung

Claude Code muss installiert und angemeldet sein:

```sh
npm install -g @anthropic-ai/claude-code
claude
```

Die Erweiterung bringt Programmcode mit, der beim Installieren bestätigt werden
muss. Er startet das installierte `claude`.
