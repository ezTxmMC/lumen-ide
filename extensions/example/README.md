# Example

A complete extension as a template. It ships everything the manifest knows and
is deliberately small enough to read in one sitting.

## What is inside

- a **language** (`.lumenlog`) with keywords, strings and snippets
- three **settings** (text, toggle and choice) that appear in Lumen under
  *Settings → Extensions*
- two **pages**: one for the sidebar, one for the editor area

## Building it yourself

```sh
npm run build:ext -- example
npm run publish:ext -- --server http://localhost:8730 --token "$LUMEN_EXT_TOKEN"
```

## Folder layout

| File | Meaning |
| --- | --- |
| `extension.json` | Profile, settings |
| `addon.json` | Languages, templates, project kinds, commands |
| `README.md` | this page, on the server |
| `pages/*.md` | pages that Lumen displays itself |

> Extensions like this one ship no program code. Logic comes from node graphs,
> which the same interpreter runs as for custom add-ons.
