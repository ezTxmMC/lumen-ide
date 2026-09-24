# Live Server

Ein lokaler Server für den Projektordner — HTML, PHP und alles Statische — der
die Seite im Browser neu lädt, sobald sich eine Datei ändert.

- **Go Live** in der Statusleiste (oder der Befehl *Live Server: Starten / Stoppen*) startet den Server und öffnet die aktive Datei im Browser.
- **HTML** bekommt ein kleines Skript eingefügt; Änderungen an **CSS** tauschen nur die Stile aus, alles andere lädt neu.
- **PHP** läuft über `php -S` (PHP muss installiert sein); die Ausgabe wird durch den Live-Server geleitet, sodass auch PHP-Seiten neu laden.
- Ordner ohne `index.html` zeigen eine Dateiliste. Der Port, die Adresse, ein Unterordner (`dist`, `public`), die beobachteten Dateitypen und ignorierte Ordner stehen in den Einstellungen.

## Befehle

| Befehl | Was er tut |
|---|---|
| Live Server: Starten / Stoppen | schaltet den Server um |
| Live Server: Aktive Datei im Browser öffnen | öffnet die Datei unter der Server-Adresse |
| Live Server: Startseite im Browser öffnen | öffnet die Wurzel des Servers |

---

Serves the project folder over HTTP — HTML, PHP and static files — and reloads
the page in the browser when a file changes. CSS changes are swapped in without
a reload. PHP runs through `php -S`. Settings: port, address, subfolder, the
file types that trigger a reload, ignored folders and the path to `php`.
