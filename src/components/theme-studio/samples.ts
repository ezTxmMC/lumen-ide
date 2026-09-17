/** Sample code for the Theme Studio's editor preview, one file per language. */

import type { Ranges } from './CodeView'

export interface CodeSample {
  /** Id of the language in the registry. */
  languageId: string
  label: string
  file: string
  code: string
  /** Word whose first occurrence is selected and whose others get extra cursors. */
  select: string
}

export const SAMPLES: CodeSample[] = [
  {
    languageId: 'typescript',
    label: 'TypeScript',
    file: 'session.ts',
    select: 'user',
    code: `// Sitzungen verwalten — Vorschau für Lumen
import { createHash } from 'node:crypto'

type Role = 'admin' | 'member'

export interface Session {
  readonly id: string
  user: string
  role: Role
  expires: Date
}

const TTL_MS = 30 * 60 * 1000
const TOKEN = /^[a-f0-9]{64}$/i

@Injectable()
export class SessionStore {
  private sessions = new Map<string, Session>()

  async open(user: string, role: Role = 'member'): Promise<Session> {
    const id = createHash('sha256').update(\`\${user}:\${Date.now()}\\n\`).digest('hex')
    if (!TOKEN.test(id)) throw new Error("invalid token")
    const session = { id, user, role, expires: new Date(Date.now() + TTL_MS) }
    this.sessions.set(id, session)
    return session
  }

  get size(): number {
    return this.sessions.size
  }
}
`,
  },
  {
    languageId: 'javascript',
    label: 'JavaScript',
    file: 'debounce.js',
    select: 'timer',
    code: `/** Ruft fn erst nach einer Pause von wait Millisekunden auf. */
export function debounce(fn, wait = 200) {
  let timer = null
  return function (...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), wait)
  }
}

const onResize = debounce(() => {
  console.log(\`Fenster: \${window.innerWidth}×\${window.innerHeight}\`)
}, 150)

window.addEventListener('resize', onResize, { passive: true })
`,
  },
  {
    languageId: 'java',
    label: 'Java',
    file: 'Inventory.java',
    select: 'stock',
    code: `package de.lumen.demo;

import java.util.HashMap;
import java.util.Map;

/**
 * A minimal inventory.
 */
public final class Inventory {
    private static final int LIMIT = 1_000;
    private final Map<String, Integer> stock = new HashMap<>();

    @Override
    public String toString() {
        return "Inventory{" + stock.size() + " items}\\n";
    }

    public boolean add(String sku, int amount) {
        if (amount <= 0 || amount > LIMIT) {
            return false;
        }
        stock.merge(sku, amount, Integer::sum);
        return true;
    }
}
`,
  },
  {
    languageId: 'python',
    label: 'Python',
    file: 'stats.py',
    select: 'values',
    code: `"""Kleine Statistik-Helfer."""
from dataclasses import dataclass
import re

NUMBER = re.compile(r"-?\\d+(?:\\.\\d+)?")


@dataclass(frozen=True)
class Summary:
    count: int
    mean: float


def summarize(text: str) -> Summary | None:
    values = [float(m) for m in NUMBER.findall(text)]
    if not values:
        return None  # nichts gefunden
    return Summary(len(values), sum(values) / len(values))


print(f"Ergebnis: {summarize('3, 4.5 und 10')!r}\\n")
`,
  },
  {
    languageId: 'rust',
    label: 'Rust',
    file: 'queue.rs',
    select: 'items',
    code: `use std::collections::VecDeque;

/// A queue with a fixed capacity.
#[derive(Debug, Default)]
pub struct Bounded<T> {
    items: VecDeque<T>,
    capacity: usize,
}

impl<T: Clone> Bounded<T> {
    pub const MAX: usize = 4_096;

    pub fn push(&mut self, value: T) -> Option<T> {
        let full = self.items.len() == self.capacity;
        let dropped = full.then(|| self.items.pop_front()).flatten();
        self.items.push_back(value);
        dropped
    }
}

fn main() {
    let mut q: Bounded<&str> = Bounded { items: VecDeque::new(), capacity: 2 };
    println!("{:?}\\n", q.push("a"));
}
`,
  },
  {
    languageId: 'cpp',
    label: 'C++',
    file: 'matrix.cpp',
    select: 'data',
    code: `#include <array>
#include <iostream>

// A 2×2 matrix with constant multiplication
template <typename T>
struct Matrix2 {
    std::array<T, 4> data{};

    constexpr Matrix2 operator*(const Matrix2& o) const noexcept {
        return {{data[0] * o.data[0] + data[1] * o.data[2],
                 data[0] * o.data[1] + data[1] * o.data[3],
                 data[2] * o.data[0] + data[3] * o.data[2],
                 data[2] * o.data[1] + data[3] * o.data[3]}};
    }
};

int main() {
    constexpr Matrix2<int> fib{{1, 1, 1, 0}};
    auto result = fib * fib;
    std::cout << "F(3) = " << result.data[0] << '\\n';
    return 0;
}
`,
  },
  {
    languageId: 'go',
    label: 'Go',
    file: 'server.go',
    select: 'mux',
    code: `package main

import (
	"fmt"
	"net/http"
	"time"
)

// Health reports that the service is running.
func Health(w http.ResponseWriter, _ *http.Request) {
	fmt.Fprintf(w, "ok %s\\n", time.Now().Format(time.RFC3339))
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", Health)
	srv := &http.Server{Addr: ":8080", Handler: mux, ReadTimeout: 5 * time.Second}
	if err := srv.ListenAndServe(); err != nil {
		panic(err)
	}
}
`,
  },
  {
    languageId: 'kotlin',
    label: 'Kotlin',
    file: 'Greeter.kt',
    select: 'name',
    code: `package de.lumen.demo

// Greets warmly, more than once if asked
data class Greeter(val name: String, val times: Int = 1) {
    fun greet(): String = buildString {
        repeat(times) { append("Hallo, \${name}!\\n") }
    }
}

fun main() {
    val greeter = Greeter(name = "Lumen", times = 2)
    println(greeter.greet())
}
`,
  },
  {
    languageId: 'csharp',
    label: 'C#',
    file: 'Order.cs',
    select: "Total",
    code: `using System;
using System.Linq;

namespace Lumen.Demo;

// An order with its line items
public record Line(string Sku, int Quantity, decimal Price);

public sealed class Order
{
    public required Line[] Lines { get; init; }

    public decimal Total => Lines.Sum(l => l.Quantity * l.Price);

    public override string ToString() => $"Order: {Total:C}\\n";
}
`,
  },
  {
    languageId: 'php',
    label: 'PHP',
    file: 'Router.php',
    select: 'routes',
    code: `<?php
declare(strict_types=1);

namespace App;

/** A minimal router */
final class Router
{
    private array $routes = [];

    public function get(string $path, callable $handler): self
    {
        $this->routes['GET'][$path] = $handler;
        return $this;
    }

    public function dispatch(string $method, string $uri): string
    {
        $handler = $this->routes[$method][$uri] ?? null;
        return $handler ? $handler() : "404 Not Found\\n";
    }
}
`,
  },
  {
    languageId: 'html',
    label: 'HTML',
    file: 'index.html',
    select: 'card',
    code: `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <title>Lumen &amp; Themes</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <!-- Karte mit Überschrift -->
    <article class="card" data-id="42">
      <h1 class="card-title">Hallo Welt</h1>
      <p>Ein <strong>kurzer</strong> Absatz.</p>
      <button type="button" disabled>Senden</button>
    </article>
    <script type="module">
      document.querySelector('.card').dataset.ready = 'true'
    </script>
  </body>
</html>
`,
  },
  {
    languageId: 'css',
    label: 'CSS',
    file: 'style.css',
    select: 'card',
    code: `/* Karten-Layout */
@import url("fonts.css");

:root {
  --accent: #7c8cff;
  --radius: 10px;
}

.card:hover > .card-title,
.card[data-ready="true"] {
  color: var(--accent);
  margin: 0 auto 1.5rem;
  transition: transform 0.2s ease-in-out !important;
}

@media (prefers-color-scheme: light) {
  .card { background: rgb(255 255 255 / 80%); }
}
`,
  },
  {
    languageId: 'json',
    label: 'JSON',
    file: 'package.json',
    select: 'lumen',
    code: `{
  "name": "lumen-demo",
  "version": "1.2.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build"
  },
  "keywords": ["lumen", "theme", "editor"],
  "workspaces": null,
  "engines": { "node": ">=20" },
  "lumen": { "theme": "lumen-dark", "fontSize": 13.5 }
}
`,
  },
  {
    languageId: 'markdown',
    label: 'Markdown',
    file: 'README.md',
    select: 'Theme',
    code: `# Lumen Theme

Ein **flaches** Theme mit _ruhigen_ Farben und \`CodeMirror\`-Unterstützung.

## Installation

1. Theme-Studio öffnen
2. JSON importieren
3. [Dokumentation](https://example.com/themes) lesen

> Tipp: Mit Strg+Enter wird das Theme gespeichert.

\`\`\`ts
const theme = registry.themes()[0]
\`\`\`

- [x] Dunkel
- [ ] Hell
`,
  },
  {
    languageId: 'shell',
    label: 'Shell',
    file: 'deploy.sh',
    select: 'TARGET',
    code: `#!/usr/bin/env bash
set -euo pipefail

# Baut und verteilt die Anwendung
TARGET="\${1:-staging}"
VERSION=$(git describe --tags --always)

if [[ "$TARGET" == "production" ]]; then
  echo "Deploy $VERSION nach $TARGET" >&2
  npm run build && rsync -az dist/ "deploy@$TARGET:/srv/app"
fi

exit 0
`,
  },
]

/** Selection plus extra cursors from a sample's `select` word. */
export function sampleSelection(sample: CodeSample): Ranges {
  const ranges: Ranges = []
  let from = sample.code.indexOf(sample.select)
  while (from >= 0 && ranges.length < 4) {
    const to = from + sample.select.length
    // First occurrence selected, the rest only as cursors at the end of the word.
    ranges.push(ranges.length === 0 ? [from, to] : [to, to])
    from = sample.code.indexOf(sample.select, to)
  }
  return ranges
}
