import { StringStream } from '@codemirror/language'
import { buildStreamParser } from '@/core/tokenizer'
import { matchLanguage } from '@/core/language'
import { ALL_ADDONS } from '@/addons'
import { markdownToText } from '@/lib/markdown'
import { extensionAddons, extensionsBuilt } from './lib/extension-addons'
import type { LanguageSpec } from '@/core/types'

if (!extensionsBuilt()) {
  console.log('extensions/dist is missing — run `npm run build:ext` first.')
  process.exit(1)
}

// Built in and from an extension alike: for the tokenizer and for matching a
// file name it makes no difference where a language came from.
const specs: LanguageSpec[] = [...ALL_ADDONS, ...extensionAddons()].flatMap((a) => a.languages ?? [])

const SAMPLES: Record<string, string> = {
  // Excerpts from test/syntax.nv of the Novus repository.
  novus:
    'package main\n\n' +
    'import json\n\n' +
    'private final NAME = "Syntaxprogramm"\n\n' +
    'method main(array<str> args) {\n' +
    '    println "Starting ${NAME} with ${args.length()} args"\n' +
    '    var tom = Person{name="Tom H.", age=0x12, friends=[]}\n' +
    '    tom.friends().append(fabi)\n' +
    '}\n\n' +
    'async method load(string name): string {\n' +
    '    return "contents of ${name}"  // Kommentar\n' +
    '}\n\n' +
    'define class Person based IPerson {\n' +
    '    private final string name: get\n' +
    '    private final integer age: get, set\n\n' +
    '    construct(string name, integer age) {\n' +
    '        this.name = name\n' +
    '    }\n\n' +
    '    @Interface\n' +
    '    sendPacket() {\n    }\n' +
    '}\n\n' +
    'define enum Gender {\n    MALE("männlich");\n}\n',
  java: 'public class A {\n  // Kommentar\n  @Override\n  public static void main(String[] args) {\n    System.out.println("hi");\n  }\n}',
  html: '<!doctype html>\n<div class="a" id=\'b\'>Text &amp; mehr</div>\n<style>.x { color: #fff; }</style>\n<script>const n = 1; // c\n</script>',
  css: '/* c */\n.foo > .bar:hover {\n  color: var(--x);\n  margin: 0 auto;\n}\n@media (min-width: 40rem) { a { b: c } }',
  javascript: 'const x = `tpl ${y}`;\nexport default function f(a) { return a?.b ?? 1 /* c */ }',
  typescript: 'interface A<T> { x: string }\nconst f = <T,>(v: T): Promise<T> => Promise.resolve(v)',
  cpp: '#include <iostream>\nint main() { std::cout << "x" << std::endl; return 0; }',
  c: '#include <stdio.h>\nint main(void) { printf("%d\\n", 42); return 0; }',
  csharp: 'namespace N;\npublic record R(int X)\n{\n    public string S => $"v={X}";\n}',
  kotlin: 'data class P(val n: String)\nfun main() { println("""raw""") }',
  rust: '#[derive(Debug)]\nstruct S { v: Vec<u8> }\nfn main() { println!("{:?}", S { v: vec![1] }); }',
  go: 'package main\nimport "fmt"\nfunc main() { ch := make(chan int); fmt.Println(`raw`, <-ch) }',
  python: 'import os\n\n\nclass A:\n    """doc"""\n    def f(self, x: int = 1) -> str:\n        return f"{x}"  # c',
  php: '<?php\nnamespace App;\n#[Route("/")]\nclass C { public function f(): string { return "x"; } }',
  crystal: 'require "json"\n\nstruct P\n  getter n : String\n  def initialize(@n : String)\n  end\nend\nputs P.new("x").n',
  tailwind: '@import "tailwindcss";\n@theme { --color-brand: #7c8cff; }\n.btn { @apply flex items-center; }',
  json: '{ "a": [1, 2.5, true, null], "b": "s" }',
  yaml: 'key: value\nlist:\n  - a: 1\n  - b: true  # c',
  markdown: '# Titel\n\n- Punkt **fett** `code`\n\n```js\nx\n```',
  shell: '#!/bin/bash\nfor f in *.txt; do\n  echo "$f" | grep -q x && printf "%s\\n" "$f"\ndone',
  sql: 'SELECT a.id, COUNT(*) FROM t a JOIN u b ON a.id = b.id WHERE a.x > 1 GROUP BY a.id;',
  toml: '[package]\nname = "x"\nversion = "1.0"\n',
  cmake: 'cmake_minimum_required(VERSION 3.20)\nproject(demo VERSION 0.1.0 LANGUAGES CXX)\n# Kommentar\nset(CMAKE_CXX_STANDARD 20)\nif(BUILD_TESTING)\n  add_test(NAME t COMMAND "${PROJECT_NAME}")\nendif()',
  makefile: 'CC ?= cc\nSRC := $(wildcard src/*.c)\n\nall: $(SRC) # c\n\t$(CC) -o app $^\n\n.PHONY: all clean',
  xml: '<?xml version="1.0"?>\n<!-- c -->\n<project xmlns="http://maven.apache.org/POM/4.0.0">\n  <artifactId>x</artifactId>\n</project>',
  groovy: "plugins {\n    id 'java' // c\n}\ndependencies {\n    implementation \"org.x:y:${version}\"\n}\ndef n = 42",
  properties: '# Kommentar\n[section]\norg.gradle.parallel=true\nname = Wert',
  dockerfile: 'FROM node:22-alpine\n# c\nWORKDIR /app\nRUN npm ci && echo "ok"\nCMD ["node", "src/index.js"]',
  'react-tsx':
    "import { useState } from 'react'\n\n" +
    'export function Zähler({ start }: { start: number }) {\n' +
    '  const [n, setN] = useState(start)\n' +
    '  return (\n' +
    '    <div className="box">\n' +
    '      <Button onClick={() => setN(n + 1)}>{n}</Button>\n' +
    '    </div>\n  )\n}',
  'react-jsx': 'export const A = () => <p style={{ color: "red" }}>hi {x}</p>',
  vue:
    '<script setup lang="ts">\n' +
    "import { ref } from 'vue'\nconst n = ref(0)\n</script>\n\n" +
    '<template>\n  <button class="b" @click="n++" :disabled="n > 3">{{ n }}</button>\n</template>\n\n' +
    '<style scoped>\n.b { color: #7c8cff; }\n</style>',
  'angular-html':
    '<!-- Vorlage -->\n@if (user(); as u) {\n  <p [class.aktiv]="u.ok">{{ u.name | uppercase }}</p>\n}\n' +
    '@for (x of liste(); track x.id) {\n  <li (click)="wähle(x)">{{ x.titel }}</li>\n}',
  'angular-ts':
    "import { Component, signal } from '@angular/core'\n\n" +
    "@Component({ selector: 'app-a', standalone: true, template: '<p></p>' })\n" +
    "export class AComponent {\n  readonly titel = signal('Hallo')\n}",
  astro:
    '---\n' +
    "import Layout from '../layouts/Layout.astro'\nconst titel = 'Seite'\n" +
    '---\n\n' +
    '<Layout title={titel}>\n  <h1 class="t">{titel}</h1>\n' +
    '  {liste.map((e) => <li>{e.name}</li>)}\n</Layout>\n\n' +
    '<style>\n  h1 { color: red; }\n</style>',
  mdx:
    '---\ntitle: Doku\n---\n\n' +
    "import { Hinweis } from './Hinweis'\n\n" +
    '# Überschrift\n\n' +
    'Text mit **fett**, *kursiv*, `code` und [Link](https://x.de).\n\n' +
    '<Hinweis typ="info">\n  Inhalt {wert}\n</Hinweis>\n\n' +
    '- Punkt eins\n- Punkt zwei\n\n```ts\nconst a = 1\n```',
}

let failures = 0
let checked = 0

for (const spec of specs) {
  const sample = SAMPLES[spec.id]
  if (!sample) { console.log(`  ?  ${spec.id}: no sample`); continue }

  const parser = buildStreamParser(spec)
  let state = parser.startState!(2)
  const kinds = new Set<string>()

  try {
    for (const line of sample.split('\n')) {
      const stream = new StringStream(line, 4, 2)
      if (line === '') { parser.blankLine?.(state, 2); continue }
      let guard = 0
      while (!stream.eol()) {
        stream.start = stream.pos
        const token = parser.token(stream, state)
        if (stream.pos === stream.start) {
          throw new Error(`The tokenizer does not move at "${line.slice(stream.pos, stream.pos + 12)}"`)
        }
        if (token) kinds.add(token)
        if (++guard > 5000) throw new Error('Endless loop')
      }
      state = parser.copyState ? parser.copyState(state) : state
    }
  } catch (err) {
    failures++
    console.log(`  ✗  ${spec.id}: ${(err as Error).message}`)
    continue
  }

  checked++
  // The names must take the internal prefixed form, otherwise CodeMirror's
  // legacy table applies rather than the parser's tokenTable.
  for (const kind of kinds) {
    if (!kind.startsWith('lm_')) {
      failures++
      console.log(`  !  ${spec.id}: unprefixed token name "${kind}"`)
    }
  }

  const expected = spec.id === 'json' || spec.id === 'toml' ? 2 : 3
  const ok = kinds.size >= expected
  if (!ok) failures++
  console.log(`  ${ok ? '✓' : '✗'}  ${spec.id.padEnd(12)} ${[...kinds].sort().join(' ')}`)
}

// Assigning files
const MAPPING: [string, string][] = [
  ['a.nv', 'novus'], ['A.java', 'java'], ['i.html', 'html'], ['s.css', 'tailwind'],
  ['x.js', 'javascript'], ['x.ts', 'typescript'], ['x.d.ts', 'typescript'],
  ['m.cpp', 'cpp'], ['m.c', 'c'], ['P.cs', 'csharp'], ['a.kt', 'kotlin'],
  ['l.rs', 'rust'], ['m.go', 'go'], ['s.py', 'python'], ['i.php', 'php'],
  ['a.cr', 'crystal'], ['Cargo.toml', 'toml'], ['README.md', 'markdown'],
  ['run.sh', 'shell'], ['q.sql', 'sql'], ['pkg.json', 'json'], ['x.unknown', ''],
  ['App.tsx', 'react-tsx'], ['App.jsx', 'react-jsx'], ['App.vue', 'vue'],
  ['app.component.html', 'angular-html'], ['app.component.ts', 'angular-ts'],
  ['x.service.ts', 'angular-ts'], ['index.astro', 'astro'], ['doku.mdx', 'mdx'],
  ['normal.ts', 'typescript'], ['seite.html', 'html'], ['stil.css', 'tailwind'],
  ['CMakeLists.txt', 'cmake'], ['Makefile', 'makefile'], ['pom.xml', 'xml'],
  ['build.gradle', 'groovy'], ['build.gradle.kts', 'kotlin'], ['gradle.properties', 'properties'],
  ['Dockerfile', 'dockerfile'], ['.env', 'properties'], ['icon.svg', 'xml'],
]
console.log('\nAssigning files:')
for (const [name, want] of MAPPING) {
  const got = matchLanguage(name, specs)?.id ?? ''
  const ok = got === want
  if (!ok) failures++
  console.log(`  ${ok ? '✓' : '✗'}  ${name.padEnd(14)} → ${got || '—'}${ok ? '' : `  (expected ${want || '—'})`}`)
}

/* -------------------------------------------------------------- *
 * Preparing the hover texts
 * -------------------------------------------------------------- */
const HOVER_CASES: [string, string][] = [
  ['```go\nfunc Sprintf(f string) string\n```', 'func Sprintf(f string) string'],
  ['---', '─────'],
  ['[`fmt.Sprintf` on pkg.go.dev](https://pkg.go.dev/fmt)', 'fmt.Sprintf on pkg.go.dev'],
  ['Ein **wichtiger** Hinweis', 'Ein wichtiger Hinweis'],
  ['Nutze `map[string]int` dafür', 'Nutze map[string]int dafür'],
]
console.log('\nPreparing hovers:')
for (const [input, want] of HOVER_CASES) {
  const got = markdownToText(input)
  const ok = got === want
  if (!ok) failures++
  console.log(`  ${ok ? '✓' : '✗'}  ${JSON.stringify(input).slice(0, 46).padEnd(48)} → ${JSON.stringify(got)}`)
}

console.log(`\n${checked} languages tokenised, ${failures} error(s)`)
process.exit(failures ? 1 : 0)
