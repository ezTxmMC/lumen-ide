# Live Server

Serves the project folder over HTTP (HTML, PHP and static files) and reloads
the page in the browser when a file changes.

- **Go Live** in the status bar (or the command *Live Server: Start / Stop*) starts the server and opens the active file in the browser.
- **HTML** gets a small script injected; changes to **CSS** only swap the styles, everything else reloads.
- **PHP** runs through `php -S` (PHP must be installed); the output is routed through the live server so PHP pages reload too.
- Folders without `index.html` show a file list. The port, the address, a subfolder (`dist`, `public`), the watched file types, ignored folders and the path to `php` are in the settings.

## Commands

| Command | What it does |
|---|---|
| Live Server: Start / Stop | toggles the server |
| Live Server: Open active file in browser | opens the file at the server address |
| Live Server: Open the site in the browser | opens the root of the server |
