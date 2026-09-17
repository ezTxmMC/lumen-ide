# Go

Go-Unterstützung für Lumen: Syntax, Snippets, `gopls`, Delve, Projekterkennung
für Go-Module und eine Projektvorlage.

## Inhalt

- **Sprache** `.go` — Backtick-Strings, Kanal-Operatoren (`<-`, `:=`, `&^`),
  Großschreibung als Typ, 13 Snippets von `iferr` bis zum tabellengetriebenen Test
- **Language-Server** `gopls` mit `staticcheck`, `gofumpt` und Vorschlägen aus
  nicht importierten Paketen
- **Debugger** Delve
- **Projektart** Go-Modul (`go.mod`, `go.work`) mit Build-, Test- und
  Tidy-Aufgaben; `go get` fügt Abhängigkeiten hinzu
- **Vorlage** Modul als Programm (`cmd/`) oder als Bibliothek

## Werkzeuge

```sh
go install golang.org/x/tools/gopls@latest
go install github.com/go-delve/delve/cmd/dlv@latest
```

Fehlt `gopls`, bietet Lumen die Installation beim Öffnen einer `.go`-Datei an.
