# ChatGPT Codex

OpenAI Codex als Chat-Agent in Lumen. Jede Nachricht startet die installierte
Codex CLI (`codex exec`), deine Anmeldung, `AGENTS.md` und `~/.codex/config.toml`
gelten.

## Chat

- **Modi** sind Sandbox-Stufen: *Im Projekt* (Standard), *Nur lesen* und — nur
  wenn freigeschaltet — *Voller Zugriff*
- **Werkzeuge** mit Vorschau: Befehle mit ihrer Ausgabe, geänderte Dateien zum
  Öffnen, MCP-Aufrufe, Websuchen
- **Plan**: die To-do-Liste von Codex als Karte mit Fortschritt
- **Tokens und Dauer** je Antwort
- **Mehrere Chats**, **frühere Sitzungen fortsetzen** (aus `~/.codex/sessions`)
- **Modelle** aus `~/.codex/models_cache.json` oder von `codex app-server`
  (`model/list`) — ↻ neben der Auswahl fragt die CLI neu
- **Denkaufwand je Modell** im Chat wählen — nur die Stufen, die das Modell
  kann; die Wahl merkt sich Lumen pro Modell
- **Modelle** direkt im Chat umschalten, **Bilder** einfügen oder anhängen,
  `@` für Dateien, geöffnete Datei und Auswahl mitsenden

## Einstellungen

*Einstellungen → Erweiterungen → ChatGPT Codex*: Pfad zu `codex`, Profil,
Standardmodell, Quelle der Modellliste, weitere Modelle, Standard-Denkaufwand,
Zusammenfassung des Denkens, Ausführlichkeit, Gedankengang ausblenden, Websuche, Netzwerk in der Sandbox, Freigaberegel,
voller Zugriff, weitere beschreibbare Ordner, Git-Prüfung, weitere
Konfiguration (`-c key=value`) und Umgebungsvariablen.

## Projekt

- **Projektart** `ChatGPT Codex` — erkannt an `AGENTS.md` oder `.codex/`, mit den
  Aufgaben *Codex starten*, *Letzte Sitzung fortsetzen*, *Anmelden*,
  *MCP-Server anzeigen* und *Codex installieren*
- **Vorlage** `AGENTS.md` mit Befehlen und Konventionen

## Voraussetzung

```sh
npm install -g @openai/codex
codex login
```

Die Erweiterung bringt Programmcode mit, der beim Installieren bestätigt werden
muss. Er startet nur das Programm, das du installiert hast.
