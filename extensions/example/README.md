# Beispiel

Eine vollständige Erweiterung als Vorlage. Sie bringt alles mit, was das
Manifest kennt, und ist bewusst klein genug, um sie am Stück zu lesen.

## Was darin steckt

- eine **Sprache** (`.lumenlog`) mit Schlüsselwörtern, Zeichenketten und Snippets
- drei **Einstellungen** — Text, Schalter und Auswahl —, die in Lumen unter
  *Einstellungen → Erweiterungen* erscheinen
- zwei **Seiten**: eine für die Seitenleiste, eine für den Editorbereich

## Selbst bauen

```sh
npm run build:ext -- example
npm run publish:ext -- --server http://localhost:8730 --token "$LUMEN_EXT_TOKEN"
```

## Aufbau des Ordners

| Datei | Bedeutung |
| --- | --- |
| `extension.json` | Steckbrief, Einstellungen |
| `addon.json` | Sprachen, Vorlagen, Projektarten, Befehle |
| `README.md` | diese Seite, auf dem Server |
| `pages/*.md` | Seiten, die Lumen selbst anzeigt |

> Erweiterungen bringen keinen Programmcode mit. Logik entsteht über
> Knotengraphen, die derselbe Interpreter ausführt wie bei eigenen Add-ons.
