/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/**
 * The bundled icon packs.
 *
 * “Lumen” (the default): every language, format and tool gets a shape or a
 * short mark in a coherent palette — brand colours where a tool is known by
 * its colour, the palette below for everything that has a role rather than a
 * brand. Folders with a role (sources, tests, docs, assets, config …) carry an
 * emblem inside the folder outline.
 * “Lumen Monochrome”: the same coverage and the same shapes, drawn in one
 * neutral tone that follows the theme.
 * “Lumen Classic”: the abbreviations and colours of the language add-ons alone,
 * folders as tinted arrows.
 */

import type { Addon, IconDef, IconPack } from '@/core/types';
import { t } from '@/i18n';

/** Several keys sharing one icon. */
function same(keys: string[], def: IconDef): Record<string, IconDef> {
  return Object.fromEntries(keys.map((key) => [key, def]));
}

/** `name.config.js`, `name.config.ts` … — every script flavour of a config file. */
function configFiles(base: string, def: IconDef, extensions = ['js', 'mjs', 'cjs', 'ts', 'mts', 'cts', 'json']): Record<string, IconDef> {
  return same(extensions.map((ext) => `${base}.${ext}`), def);
}

const MUTED = 'var(--c-text-muted)';
const SUBTLE = 'var(--c-text-subtle)';

/**
 * The palette for roles — tuned to read on dark and light backgrounds alike,
 * with similar lightness so no role shouts over another.
 */
const P = {
  red: '#ef6b73',
  orange: '#f59a5c',
  amber: '#f2b544',
  yellow: '#e3c94c',
  lime: '#a3cf5f',
  green: '#4fc98a',
  teal: '#33bfae',
  cyan: '#45c1de',
  sky: '#5aaaf0',
  blue: '#5b8def',
  indigo: '#7c8cff',
  violet: '#a48bf5',
  purple: '#c67ae0',
  pink: '#ef7fbd',
  rose: '#f2708f',
  brown: '#c69568',
  gray: '#9aa3b0',
  slate: '#7f8a99',
} as const;

/** Brand colours, for tools recognised by them. */
const B = {
  java: '#e76f00',
  kotlin: '#a97bff',
  typescript: '#3178c6',
  javascript: '#f0db4f',
  python: '#4b8bbe',
  rust: '#dea584',
  go: '#00add8',
  npm: '#cb3837',
  pnpm: '#f69220',
  yarn: '#2c8ebb',
  bun: '#e8c8a0',
  deno: '#70ffaf',
  gradle: '#4fb4c8',
  maven: '#c71a36',
  docker: '#2496ed',
  git: '#f05032',
  react: '#61dafb',
  vue: '#42b883',
  angular: '#dd0031',
  svelte: '#ff3e00',
  astro: '#ff5d01',
  tailwind: '#38bdf8',
  vite: '#bd34fe',
  node: '#5fa04e',
  dotnet: '#8c6cf0',
  csharp: '#9b4f96',
  php: '#8892bf',
  ruby: '#cc342d',
  cmake: '#3e8ed0',
  html: '#e34c26',
  css: '#3d8fe6',
  sass: '#cd6799',
  markdown: '#519aba',
  github: MUTED,
  gitlab: '#fc6d26',
} as const;

/* ------------------------------------------------------------------ *
 * Shared icons
 * ------------------------------------------------------------------ */

const TEST: IconDef = { shape: 'flask', color: P.green };
const SPEC: IconDef = { shape: 'test-tube', color: P.teal };
const IMAGE: IconDef = { shape: 'file-image', color: P.violet };
const VECTOR: IconDef = { shape: 'pen-tool', color: P.amber };
const AUDIO: IconDef = { shape: 'file-audio', color: P.pink };
const VIDEO: IconDef = { shape: 'file-video', color: P.rose };
const FONT: IconDef = { shape: 'type', color: P.red };
const ARCHIVE: IconDef = { shape: 'file-archive', color: P.brown };
const LOCK: IconDef = { shape: 'lock', color: P.gray };
const SHEET: IconDef = { shape: 'file-spreadsheet', color: P.green };
const BINARY: IconDef = { shape: 'binary', color: P.slate };
const CONFIG: IconDef = { shape: 'settings', color: P.gray };
const KEY: IconDef = { shape: 'key-round', color: P.amber };
const ENV: IconDef = { shape: 'file-key', color: P.yellow };
const CERT: IconDef = { shape: 'certificate', color: P.amber };
const DATA: IconDef = { shape: 'database', color: P.amber };
const LOG: IconDef = { shape: 'scroll', color: P.slate };
const TEXT: IconDef = { shape: 'file-text', color: MUTED };
const SHELL: IconDef = { shape: 'shell', color: P.lime };
const DIFF: IconDef = { shape: 'file-diff', color: P.orange };
const NOTEBOOK: IconDef = { shape: 'notebook-pen', color: '#f37726' };
const DOCUMENT: IconDef = { shape: 'file-text', color: P.blue };
const SLIDES: IconDef = { shape: 'presentation', color: P.orange };
const MODEL3D: IconDef = { shape: 'box', color: P.teal };
const TEMPLATE: IconDef = { shape: 'layout-template', color: P.teal };
const LINT: IconDef = { shape: 'shield-check', color: P.violet };
const FORMAT: IconDef = { shape: 'sparkles', color: P.amber };
const CI: IconDef = { shape: 'workflow', color: P.orange };
const DEPLOY: IconDef = { shape: 'rocket', color: P.sky };

/* ------------------------------------------------------------------ *
 * Languages — the fallback when neither the name nor the extension match
 * ------------------------------------------------------------------ */

const LANGUAGES: Record<string, IconDef> = {
  java: { shape: 'coffee', color: B.java },
  kotlin: { shape: 'kotlin', color: B.kotlin },
  groovy: { glyph: 'Gy', color: '#4298b8' },
  python: { shape: 'python', color: B.python },
  javascript: { glyph: 'JS', color: B.javascript },
  typescript: { glyph: 'TS', color: B.typescript },
  'react-tsx': { shape: 'atom', color: B.react },
  'react-jsx': { shape: 'atom', color: '#a3e3f5' },
  vue: { shape: 'vue', color: B.vue },
  astro: { shape: 'rocket', color: B.astro },
  'angular-html': { shape: 'angular', color: B.angular },
  'angular-ts': { shape: 'angular', color: B.angular },
  html: { shape: 'code-xml', color: B.html },
  css: { shape: 'hash', color: B.css },
  tailwind: { shape: 'tailwind', color: B.tailwind },
  c: { glyph: 'C', color: '#6a7bd1' },
  cpp: { glyph: 'C++', color: '#4f8fd1' },
  csharp: { glyph: 'C#', color: B.csharp },
  go: { glyph: 'Go', color: B.go },
  rust: { shape: 'rust', color: B.rust },
  php: { glyph: 'php', color: B.php },
  crystal: { shape: 'gem', color: '#c8c8c8' },
  novus: { shape: 'lumen', color: '#7c5cff' },
  shell: SHELL,
  sql: DATA,
  json: { shape: 'braces', color: P.yellow },
  yaml: { shape: 'yaml', color: P.rose },
  toml: { shape: 'toml', color: P.brown },
  xml: { shape: 'code-xml', color: P.orange },
  markdown: { shape: 'markdown', color: B.markdown },
  mdx: { shape: 'markdown', color: P.amber },
  properties: CONFIG,
  dockerfile: { shape: 'docker', color: B.docker },
  cmake: { shape: 'cmake', color: B.cmake },
  makefile: { shape: 'hammer', color: P.orange },
  lumenlog: LOG,
};

/* ------------------------------------------------------------------ *
 * Extensions (without a language add-on too)
 * ------------------------------------------------------------------ */

const EXTENSIONS: Record<string, IconDef> = {
  // JavaScript and TypeScript flavours
  ...same(['ts', 'mts', 'cts'], { glyph: 'TS', color: B.typescript }),
  ...same(['js', 'mjs', 'cjs'], { glyph: 'JS', color: B.javascript }),
  ...same(['d.ts', 'd.mts', 'd.cts'], { glyph: 'TS', color: '#7aa7e0' }),
  ...same(['tsx'], { shape: 'atom', color: B.react }),
  ...same(['jsx'], { shape: 'atom', color: '#a3e3f5' }),
  ...same(['test.ts', 'test.tsx', 'test.js', 'test.jsx', 'test.mjs', 'test.cjs', 'test.mts'], TEST),
  ...same(['spec.ts', 'spec.tsx', 'spec.js', 'spec.jsx', 'spec.mjs', 'spec.cjs', 'spec.mts'], SPEC),
  ...same(['e2e.ts', 'e2e.js', 'cy.ts', 'cy.js'], { shape: 'test-tubes', color: P.teal }),
  ...same(['stories.tsx', 'stories.ts', 'stories.jsx', 'stories.js', 'stories.mdx', 'story.tsx'], { shape: 'book-open', color: '#ff4785' }),
  ...same(['bench.ts', 'bench.js'], { shape: 'gauge', color: P.orange }),
  ...same(['min.js', 'min.mjs'], { glyph: 'JS', color: '#b0a33a' }),
  'min.css': { shape: 'hash', color: '#5b7fd1' },
  ...same(['map', 'js.map', 'css.map'], { shape: 'map', color: P.slate }),
  svelte: { shape: 'svelte', color: B.svelte },
  ...same(['component.ts', 'component.html'], { shape: 'angular', color: B.angular }),
  ...same(['service.ts'], { shape: 'angular', color: P.amber }),
  ...same(['module.ts'], { shape: 'angular', color: P.violet }),
  ...same(['routes.ts', 'routing.ts'], { shape: 'route', color: P.orange }),
  ...same(['module.css', 'module.scss'], { shape: 'hash', color: P.cyan }),

  // Styles
  ...same(['scss', 'sass'], { glyph: 'S', color: B.sass }),
  less: { glyph: 'L', color: '#3d6ba8' },
  styl: { glyph: 'St', color: P.lime },
  pcss: { shape: 'hash', color: P.red },

  // Markup, data and configuration
  ...same(['html', 'htm', 'xhtml'], { shape: 'code-xml', color: B.html }),
  ...same(['xml', 'xsd', 'xsl', 'xslt', 'plist', 'resx'], { shape: 'code-xml', color: P.orange }),
  ...same(['json', 'jsonc', 'json5'], { shape: 'braces', color: P.yellow }),
  ...same(['jsonl', 'ndjson'], { shape: 'list', color: P.yellow }),
  ...same(['yml', 'yaml'], { shape: 'yaml', color: P.rose }),
  toml: { shape: 'toml', color: P.brown },
  ...same(['ini', 'cfg', 'conf', 'config', 'properties', 'prefs'], CONFIG),
  ...same(['env'], ENV),
  ...same(['md', 'markdown'], { shape: 'markdown', color: B.markdown }),
  mdx: { shape: 'markdown', color: P.amber },
  ...same(['rst', 'adoc', 'asciidoc', 'org', 'tex', 'latex'], { shape: 'book-text', color: P.sky }),
  bib: { shape: 'library', color: P.sky },
  txt: TEXT,
  ...same(['csv', 'tsv', 'xlsx', 'xls', 'ods', 'numbers'], SHEET),
  ...same(['doc', 'docx', 'odt', 'rtf', 'pages'], DOCUMENT),
  ...same(['ppt', 'pptx', 'odp', 'key'], SLIDES),
  pdf: { shape: 'file-text', color: P.red },
  ...same(['ipynb'], NOTEBOOK),
  ...same(['http', 'rest'], { shape: 'send', color: P.teal }),
  ...same(['graphql', 'gql', 'graphqls'], { shape: 'graphql', color: '#e535ab' }),
  ...same(['proto', 'avsc', 'thrift'], { shape: 'network', color: '#4285f4' }),
  prisma: { shape: 'prisma', color: P.teal },
  ...same(['sql', 'psql', 'pgsql', 'mysql', 'plsql', 'ddl', 'dml'], DATA),
  ...same(['db', 'sqlite', 'sqlite3', 'db3', 'mdb', 'accdb'], { shape: 'cylinder', color: P.amber }),
  ...same(['parquet', 'avro', 'arrow', 'feather', 'h5', 'hdf5'], { shape: 'table', color: P.teal }),
  ...same(['lock', 'lockb'], LOCK),
  ...same(['log', 'out'], LOG),
  ...same(['diff', 'patch', 'rej', 'orig'], DIFF),
  ...same(['todo'], { shape: 'list-todo', color: P.amber }),
  ...same(['tmpl', 'tpl', 'hbs', 'handlebars', 'mustache', 'ejs', 'pug', 'jade', 'njk', 'liquid', 'j2', 'jinja', 'jinja2', 'twig', 'erb', 'razor', 'cshtml', 'blade.php'], TEMPLATE),

  // Media
  ...same(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'tif', 'tiff', 'heic', 'heif', 'psd', 'xcf', 'kra', 'raw'], IMAGE),
  ...same(['ico', 'icns', 'cur'], { shape: 'file-image', color: P.cyan }),
  ...same(['svg', 'eps', 'ai', 'sketch', 'fig', 'xd'], VECTOR),
  ...same(['mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'aac', 'opus', 'mid', 'midi', 'aiff'], AUDIO),
  ...same(['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'wmv', 'flv', 'ogv'], VIDEO),
  ...same(['ttf', 'otf', 'woff', 'woff2', 'eot', 'fnt'], FONT),
  ...same(['obj', 'fbx', 'gltf', 'glb', 'stl', 'blend', 'dae', '3ds', 'usd', 'usdz'], MODEL3D),
  ...same(['glsl', 'vert', 'frag', 'geom', 'comp', 'wgsl', 'hlsl', 'shader', 'metal', 'spv'], { shape: 'triangle', color: '#5586a4' }),

  // Archives, binaries and packages
  ...same(['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'txz', '7z', 'rar', 'zst', 'lz', 'lzma', 'cab', 'iso', 'dmg'], ARCHIVE),
  ...same(['jar', 'war', 'ear', 'aar'], { shape: 'package', color: B.java }),
  ...same(['deb', 'rpm', 'apk', 'appimage', 'flatpak', 'snap', 'msi', 'msix', 'pkg', 'nupkg', 'whl', 'gem', 'crate', 'vsix'], { shape: 'package', color: P.brown }),
  ...same(['exe', 'dll', 'so', 'dylib', 'o', 'a', 'lib', 'obj.o', 'class', 'pyc', 'pyo', 'pdb', 'ilk', 'exp', 'bin', 'elf', 'hex'], BINARY),
  wasm: { shape: 'binary', color: '#654ff0' },
  wat: { glyph: 'wat', color: '#654ff0' },

  // Security
  ...same(['pem', 'crt', 'cer', 'der', 'p12', 'pfx', 'p7b', 'csr', 'jks', 'keystore'], CERT),
  ...same(['key', 'pub', 'gpg', 'asc', 'sig', 'ppk'], KEY),
  ...same(['kdbx', 'secret', 'secrets', 'age'], { shape: 'lock-keyhole', color: P.red }),

  // Shells and scripts
  ...same(['sh', 'bash', 'zsh', 'fish', 'ksh', 'csh', 'tcsh', 'command'], SHELL),
  ...same(['ps1', 'psm1', 'psd1'], { shape: 'shell', color: '#5391fe' }),
  ...same(['bat', 'cmd'], { shape: 'shell', color: '#c1f12e' }),
  ...same(['awk', 'sed'], { shape: 'regex', color: P.lime }),
  nu: { shape: 'shell', color: '#3aa675' },

  // The JVM
  ...same(['kt', 'kts'], { shape: 'kotlin', color: B.kotlin }),
  ...same(['gradle', 'gradle.kts'], { shape: 'hammer', color: B.gradle }),
  ...same(['scala', 'sc', 'sbt'], { glyph: 'Sc', color: '#dc322f' }),
  ...same(['groovy', 'gvy', 'gy', 'gsh'], { glyph: 'Gy', color: '#4298b8' }),
  ...same(['clj', 'cljs', 'cljc', 'edn'], { glyph: 'λ', color: '#63b132' }),

  // Native
  ...same(['c', 'i'], { glyph: 'C', color: '#6a7bd1' }),
  ...same(['h'], { glyph: 'H', color: '#9aa5e0' }),
  ...same(['cpp', 'cc', 'cxx', 'c++', 'cppm', 'ixx', 'ipp', 'tcc', 'inl'], { glyph: 'C++', color: '#4f8fd1' }),
  ...same(['hpp', 'hh', 'hxx', 'h++'], { glyph: 'H++', color: '#8fb4e0' }),
  ...same(['m', 'mm'], { glyph: 'M', color: '#438eff' }),
  ...same(['rs'], { shape: 'rust', color: B.rust }),
  go: { glyph: 'Go', color: B.go },
  zig: { glyph: 'Zg', color: '#f7a41d' },
  ...same(['nim', 'nims', 'nimble'], { shape: 'crown', color: '#ffe953' }),
  ...same(['d', 'di'], { glyph: 'D', color: '#b03931' }),
  ...same(['v', 'sv', 'svh', 'vhd', 'vhdl'], { shape: 'microchip', color: P.teal }),
  ...same(['asm', 's', 'nasm'], { shape: 'cpu', color: P.slate }),
  ...same(['ld', 'lds'], { shape: 'cpu', color: P.gray }),
  ...same(['cu', 'cuh'], { glyph: 'CU', color: '#76b900' }),
  ...same(['f', 'f90', 'f95', 'f03', 'for'], { glyph: 'F', color: '#734f96' }),
  ...same(['ada', 'adb', 'ads'], { glyph: 'Ad', color: '#02f88c' }),
  cr: { shape: 'gem', color: '#c8c8c8' },
  nv: { shape: 'lumen', color: '#7c5cff' },

  // .NET
  ...same(['cs', 'csx'], { glyph: 'C#', color: B.csharp }),
  ...same(['fs', 'fsi', 'fsx'], { glyph: 'F#', color: '#378bba' }),
  ...same(['vb'], { glyph: 'VB', color: '#945db7' }),
  ...same(['csproj', 'fsproj', 'vbproj', 'vcxproj', 'sln', 'slnx', 'proj'], { shape: 'package', color: B.dotnet }),
  ...same(['props', 'targets', 'ruleset', 'runsettings'], { shape: 'settings', color: B.dotnet }),
  ...same(['xaml', 'axaml'], { shape: 'app-window', color: B.dotnet }),

  // Scripting and functional languages
  ...same(['py', 'pyi', 'pyw', 'pyx', 'pxd'], { shape: 'python', color: B.python }),
  ...same(['rb', 'rake', 'gemspec', 'ru'], { shape: 'ruby', color: B.ruby }),
  php: { glyph: 'php', color: B.php },
  ...same(['lua', 'luau'], { shape: 'moon', color: '#51a0cf' }),
  ...same(['pl', 'pm', 'pod', 't'], { glyph: 'Pl', color: '#39457e' }),
  ...same(['r', 'rmd', 'rdata', 'rds'], { glyph: 'R', color: '#276dc3' }),
  jl: { glyph: 'jl', color: '#9558b2' },
  swift: { shape: 'bird', color: '#f05138' },
  dart: { shape: 'target', color: '#0175c2' },
  ...same(['ex', 'exs', 'heex', 'eex', 'leex'], { shape: 'droplet', color: '#a97bd6' }),
  ...same(['erl', 'hrl'], { glyph: 'Er', color: '#b83998' }),
  ...same(['gleam'], { shape: 'sparkle', color: '#ffaff3' }),
  ...same(['hs', 'lhs', 'cabal'], { glyph: 'λ', color: '#8f4e8b' }),
  ...same(['ml', 'mli'], { glyph: 'ML', color: '#ec6813' }),
  ...same(['elm'], { shape: 'tree-pine', color: '#60b5cc' }),
  ...same(['purs'], { glyph: '=>', color: '#a0a0a0' }),
  ...same(['lisp', 'lsp', 'cl', 'el', 'scm', 'ss', 'rkt'], { glyph: '()', color: '#b3a2f5' }),
  ...same(['vim', 'vimrc'], { glyph: 'V', color: '#019733' }),
  ...same(['ps', 'coffee'], { shape: 'coffee', color: P.brown }),
  ...same(['sol'], { shape: 'diamond', color: '#6c7a9c' }),
  ...same(['move', 'cairo'], { shape: 'hexagon', color: P.orange }),
  ...same(['nix'], { shape: 'snowflake', color: '#7ebae4' }),
  ...same(['tf', 'tfvars', 'tfstate', 'hcl'], { glyph: 'TF', color: '#7b42bc' }),
  ...same(['bicep'], { shape: 'cloud-cog', color: '#0078d4' }),
  ...same(['pkl', 'cue', 'dhall', 'jsonnet', 'libsonnet'], { shape: 'braces', color: P.teal }),
  ...same(['rego'], { shape: 'shield', color: P.slate }),

  // Minecraft
  mcfunction: { shape: 'pickaxe', color: '#8bc34a' },
  mcmeta: { shape: 'pickaxe', color: '#8bc34a' },
  nbt: { shape: 'pickaxe', color: '#a1887f' },
};

/* ------------------------------------------------------------------ *
 * File names: the basic files and the build tools
 * ------------------------------------------------------------------ */

const FILE_NAMES: Record<string, IconDef> = {
  // JavaScript and TypeScript: package managers
  'package.json': { shape: 'npm', color: B.npm },
  'package-lock.json': { shape: 'lock', color: B.npm },
  ...same(['.npmrc', '.npmignore'], { shape: 'npm', color: P.slate }),
  ...same(['.nvmrc', '.node-version'], { shape: 'hexagon', color: B.node }),
  'pnpm-lock.yaml': { shape: 'lock', color: B.pnpm },
  ...same(['pnpm-workspace.yaml', '.pnpmfile.cjs'], { shape: 'boxes', color: B.pnpm }),
  'yarn.lock': { shape: 'lock', color: B.yarn },
  ...same(['.yarnrc', '.yarnrc.yml'], { shape: 'settings', color: B.yarn }),
  ...same(['bun.lock', 'bun.lockb'], { shape: 'lock', color: B.bun }),
  'bunfig.toml': { shape: 'bun', color: B.bun },
  ...same(['deno.json', 'deno.jsonc'], { shape: 'package', color: B.deno }),
  'deno.lock': { shape: 'lock', color: B.deno },
  ...same(['lerna.json', 'nx.json', 'turbo.json', 'rush.json'], { shape: 'boxes', color: P.indigo }),
  ...same(['.browserslistrc', 'browserslist'], { shape: 'globe', color: P.amber }),

  // JavaScript and TypeScript: compilers, bundlers, frameworks
  ...same(['tsconfig.json', 'tsconfig.base.json', 'tsconfig.app.json', 'tsconfig.node.json', 'tsconfig.build.json', 'tsconfig.spec.json', 'tsconfig.lib.json'], { shape: 'settings', color: B.typescript }),
  'jsconfig.json': { shape: 'settings', color: B.javascript },
  ...configFiles('vite.config', { shape: 'zap', color: B.vite }),
  ...configFiles('vitest.config', { shape: 'flask', color: '#729b1b' }),
  ...configFiles('vitest.workspace', { shape: 'flask', color: '#729b1b' }),
  ...configFiles('webpack.config', { shape: 'boxes', color: '#8dd6f9' }),
  ...configFiles('rollup.config', { shape: 'layers', color: '#ef3335' }),
  ...configFiles('rolldown.config', { shape: 'layers', color: P.orange }),
  ...configFiles('esbuild.config', { shape: 'zap', color: '#ffcf00' }),
  ...configFiles('tsup.config', { shape: 'package', color: P.amber }),
  ...configFiles('electron-builder', { shape: 'atom', color: '#9feaf9' }, ['json', 'yml', 'yaml', 'js', 'ts']),
  ...configFiles('next.config', { shape: 'triangle', color: MUTED }),
  ...configFiles('nuxt.config', { shape: 'mountain', color: '#00dc82' }),
  ...configFiles('astro.config', { shape: 'rocket', color: B.astro }),
  ...configFiles('svelte.config', { shape: 'svelte', color: B.svelte }),
  ...configFiles('remix.config', { shape: 'route', color: P.sky }),
  ...configFiles('gatsby-config', { shape: 'rocket', color: '#663399' }),
  ...configFiles('quasar.config', { shape: 'vue', color: '#1976d2' }),
  ...configFiles('angular', { shape: 'angular', color: B.angular }, ['json']),
  ...configFiles('tailwind.config', { shape: 'tailwind', color: B.tailwind }),
  ...configFiles('postcss.config', { shape: 'hash', color: '#dd3a0a' }),
  ...same(['.postcssrc', '.postcssrc.json'], { shape: 'hash', color: '#dd3a0a' }),
  ...configFiles('babel.config', { shape: 'settings', color: '#f9dc3e' }),
  ...same(['.babelrc', '.babelrc.json', '.swcrc'], { shape: 'settings', color: '#f9dc3e' }),
  ...configFiles('capacitor.config', { shape: 'smartphone', color: '#119eff' }),
  'app.json': { shape: 'smartphone', color: P.indigo },
  'manifest.json': { shape: 'app-window', color: P.sky },
  ...same(['.env.d.ts', 'vite-env.d.ts', 'env.d.ts', 'global.d.ts', 'globals.d.ts'], { glyph: 'TS', color: '#7aa7e0' }),

  // JavaScript and TypeScript: quality
  ...configFiles('eslint.config', LINT),
  ...same(['.eslintrc', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.yml', '.eslintrc.yaml', '.eslintignore'], LINT),
  ...configFiles('prettier.config', FORMAT),
  ...same(['.prettierrc', '.prettierrc.json', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.yaml', '.prettierrc.yml', '.prettierrc.toml', '.prettierignore'], FORMAT),
  ...same(['biome.json', 'biome.jsonc'], { shape: 'shield-check', color: '#60a5fa' }),
  ...same(['oxlintrc.json', '.oxlintrc.json'], { shape: 'shield-check', color: P.cyan }),
  ...configFiles('stylelint.config', { shape: 'shield-check', color: P.pink }),
  ...same(['.stylelintrc', '.stylelintrc.json'], { shape: 'shield-check', color: P.pink }),
  ...configFiles('commitlint.config', { shape: 'git-commit', color: P.green }),
  ...same(['.commitlintrc', '.commitlintrc.json', '.czrc'], { shape: 'git-commit', color: P.green }),
  ...same(['.lintstagedrc', '.lintstagedrc.json', 'lint-staged.config.js', 'lint-staged.config.mjs'], { shape: 'list-checks', color: P.lime }),
  ...same(['.huskyrc', '.huskyrc.json'], { shape: 'dog', color: P.brown }),
  ...same(['.editorconfig'], { shape: 'settings', color: MUTED }),

  // JavaScript and TypeScript: testing
  ...configFiles('jest.config', { shape: 'test-tube', color: '#c21325' }),
  ...configFiles('playwright.config', { shape: 'drama', color: '#2ead33' }),
  ...configFiles('cypress.config', { shape: 'test-tubes', color: P.teal }),
  ...configFiles('karma.conf', { shape: 'test-tube', color: '#56c5a8' }),
  ...same(['.mocharc', '.mocharc.json', '.mocharc.yml', '.mocharc.js', '.nycrc', '.nycrc.json', '.c8rc', '.c8rc.json'], { shape: 'test-tube', color: '#a0725a' }),
  ...configFiles('storybook.config', { shape: 'book-open', color: '#ff4785' }),

  // The JVM: Maven, Gradle, Ant, sbt
  'pom.xml': { shape: 'feather', color: B.maven },
  ...same(['mvnw', 'mvnw.cmd'], { shape: 'shell', color: B.maven }),
  ...same(['maven-wrapper.properties', 'settings.xml', 'extensions.xml', 'maven.config', 'jvm.config'], { shape: 'settings', color: B.maven }),
  ...same(['build.gradle', 'build.gradle.kts'], { shape: 'hammer', color: B.gradle }),
  ...same(['settings.gradle', 'settings.gradle.kts'], { shape: 'list-tree', color: B.gradle }),
  ...same(['gradle.properties', 'gradle-wrapper.properties', 'init.gradle', 'init.gradle.kts'], { shape: 'settings', color: B.gradle }),
  ...same(['gradlew', 'gradlew.bat'], { shape: 'shell', color: B.gradle }),
  'gradle-wrapper.jar': { shape: 'package', color: B.gradle },
  'libs.versions.toml': { shape: 'tags', color: B.gradle },
  ...same(['build.xml', 'ivy.xml'], { shape: 'hammer', color: B.java }),
  ...same(['build.sbt'], { shape: 'hammer', color: '#dc322f' }),
  ...same(['lombok.config'], { shape: 'settings', color: '#bc2b2b' }),
  ...same(['application.properties', 'application.yml', 'application.yaml', 'bootstrap.yml', 'bootstrap.properties'], { shape: 'leaf', color: '#6db33f' }),
  ...same(['log4j2.xml', 'log4j.properties', 'logback.xml', 'logback-spring.xml'], { shape: 'scroll', color: P.orange }),
  ...same(['module-info.java'], { shape: 'package', color: B.java }),
  ...same(['package-info.java'], { shape: 'file-text', color: B.java }),

  // C and C++
  'cmakelists.txt': { shape: 'cmake', color: B.cmake },
  ...same(['cmakepresets.json', 'cmakeuserpresets.json', 'cmakecache.txt'], { shape: 'settings', color: B.cmake }),
  ...same(['makefile', 'gnumakefile', 'makefile.am', 'makefile.in', 'bsdmakefile'], { shape: 'hammer', color: P.orange }),
  ...same(['configure', 'configure.ac', 'configure.in', 'autogen.sh'], { shape: 'shell', color: P.orange }),
  'meson.build': { shape: 'hammer', color: '#6ea1d8' },
  ...same(['meson_options.txt', 'meson.options'], { shape: 'settings', color: '#6ea1d8' }),
  'xmake.lua': { shape: 'hammer', color: '#22a079' },
  'premake5.lua': { shape: 'hammer', color: '#8be9fd' },
  ...same(['sconstruct', 'sconscript'], { shape: 'hammer', color: '#c0322b' }),
  ...same(['conanfile.txt', 'conanfile.py'], { shape: 'package', color: '#6699cb' }),
  'conan.lock': { shape: 'lock', color: '#6699cb' },
  'vcpkg.json': { shape: 'package', color: '#7c5cff' },
  'vcpkg-configuration.json': { shape: 'settings', color: '#7c5cff' },
  'build.ninja': { shape: 'zap', color: P.gray },
  'compile_commands.json': { shape: 'list-tree', color: '#6a7bd1' },
  'compile_flags.txt': { shape: 'settings', color: '#6a7bd1' },
  ...same(['.clangd', '.clang-tidy'], { shape: 'shield-check', color: '#6a7bd1' }),
  '.clang-format': { shape: 'sparkles', color: '#6a7bd1' },
  ...same(['.ccls', '.ycm_extra_conf.py'], { shape: 'settings', color: '#6a7bd1' }),
  ...same(['module.bazel', 'module.bazel.lock', 'build.bazel', 'build', 'workspace', 'workspace.bazel', '.bazelrc', '.bazelversion', '.bazelignore'], { shape: 'hexagon', color: '#43a047' }),
  ...same(['doxyfile'], { shape: 'book-text', color: '#2c4aa8' }),

  // Rust, Go, Zig
  'cargo.toml': { shape: 'package', color: B.rust },
  'cargo.lock': { shape: 'lock', color: B.rust },
  ...same(['rust-toolchain', 'rust-toolchain.toml', 'rustfmt.toml', '.rustfmt.toml', 'clippy.toml', '.clippy.toml', 'deny.toml'], { shape: 'settings', color: B.rust }),
  'build.rs': { shape: 'hammer', color: B.rust },
  ...same(['go.mod', 'go.work'], { shape: 'package', color: B.go }),
  ...same(['go.sum', 'go.work.sum'], { shape: 'lock', color: B.go }),
  ...same(['.golangci.yml', '.golangci.yaml', '.goreleaser.yml', '.goreleaser.yaml'], { shape: 'shield-check', color: B.go }),
  ...same(['build.zig', 'build.zig.zon'], { shape: 'hammer', color: '#f7a41d' }),

  // Python
  'pyproject.toml': { shape: 'python', color: B.python },
  ...same(['requirements.txt', 'requirements-dev.txt', 'requirements-test.txt', 'dev-requirements.txt', 'constraints.txt', 'requirements.in'], { shape: 'list', color: B.python }),
  ...same(['setup.py', 'manage.py', 'noxfile.py', 'fabfile.py', 'tasks.py', 'dodo.py'], { shape: 'hammer', color: B.python }),
  ...same(['setup.cfg', 'tox.ini', '.python-version', 'ruff.toml', '.ruff.toml', '.flake8', 'mypy.ini', '.mypy.ini', 'pytest.ini', '.pylintrc', 'pylintrc', '.coveragerc', '.isort.cfg', 'pyrightconfig.json'], { shape: 'settings', color: B.python }),
  ...same(['pipfile'], { shape: 'package', color: B.python }),
  ...same(['pipfile.lock', 'poetry.lock', 'pdm.lock', 'pylock.toml'], { shape: 'lock', color: B.python }),
  'uv.lock': { shape: 'lock', color: '#de5fe9' },
  ...same(['environment.yml', 'environment.yaml', 'conda.yml', 'conda.yaml', 'meta.yaml'], { shape: 'package', color: '#44a833' }),
  '__init__.py': { shape: 'python', color: P.slate },
  ...same(['conftest.py'], TEST),
  '__main__.py': { shape: 'python', color: P.amber },

  // PHP, Ruby, .NET, Crystal, Elixir, Dart, Haskell
  'composer.json': { shape: 'package', color: '#c68e5a' },
  'composer.lock': { shape: 'lock', color: '#c68e5a' },
  ...same(['phpunit.xml', 'phpunit.xml.dist', 'phpstan.neon', 'phpstan.neon.dist', 'psalm.xml', '.php-cs-fixer.php', '.php-cs-fixer.dist.php'], { shape: 'shield-check', color: B.php }),
  'artisan': { shape: 'shell', color: '#ff2d20' },
  ...same(['gemfile', 'gems.rb'], { shape: 'ruby', color: B.ruby }),
  ...same(['gemfile.lock', 'gems.locked'], { shape: 'lock', color: B.ruby }),
  ...same(['rakefile', 'guardfile', 'capfile', 'podfile', 'fastfile', 'appfile', 'brewfile'], { shape: 'hammer', color: B.ruby }),
  ...same(['.rubocop.yml', '.rspec', '.ruby-version'], { shape: 'settings', color: B.ruby }),
  ...same(['global.json', 'nuget.config', 'directory.build.props', 'directory.build.targets', 'directory.packages.props', 'dotnet-tools.json', 'launchsettings.json', 'appsettings.json', 'appsettings.development.json'], { shape: 'settings', color: B.dotnet }),
  'packages.lock.json': { shape: 'lock', color: B.dotnet },
  'shard.yml': { shape: 'package', color: '#c8c8c8' },
  'shard.lock': { shape: 'lock', color: '#c8c8c8' },
  'mix.exs': { shape: 'droplet', color: '#a97bd6' },
  'mix.lock': { shape: 'lock', color: '#a97bd6' },
  ...same(['pubspec.yaml', 'pubspec.yml'], { shape: 'package', color: '#0175c2' }),
  'pubspec.lock': { shape: 'lock', color: '#0175c2' },
  ...same(['stack.yaml', 'cabal.project'], { shape: 'package', color: '#8f4e8b' }),
  'project.nv': { shape: 'lumen', color: '#7c5cff' },
  ...same(['package.swift'], { shape: 'package', color: '#f05138' }),
  ...same(['description', 'namespace', '.rprofile'], { shape: 'settings', color: '#276dc3' }),

  // Containers, infrastructure and deployment
  ...same(['dockerfile', 'containerfile'], { shape: 'docker', color: B.docker }),
  ...same(['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml', 'docker-compose.override.yml', 'compose.override.yml'], { shape: 'ship', color: B.docker }),
  ...same(['.dockerignore', '.containerignore'], { shape: 'docker', color: P.slate }),
  ...same(['devcontainer.json', '.devcontainer.json'], { shape: 'container', color: B.docker }),
  ...same(['chart.yaml', 'values.yaml', 'helmfile.yaml', 'kustomization.yaml', 'skaffold.yaml', 'tiltfile'], { shape: 'ship-wheel', color: '#326ce5' }),
  ...same(['vagrantfile'], { shape: 'box', color: '#1868f2' }),
  ...same(['ansible.cfg', 'playbook.yml', 'site.yml'], { shape: 'settings', color: '#ee0000' }),
  ...same(['.terraform.lock.hcl'], { shape: 'lock', color: '#7b42bc' }),
  ...same(['vercel.json', '.vercelignore'], { shape: 'triangle', color: MUTED }),
  ...same(['netlify.toml', '_redirects', '_headers'], { shape: 'cloud', color: '#32e6e2' }),
  ...same(['fly.toml', 'render.yaml', 'railway.json', 'railway.toml', 'app.yaml', 'serverless.yml', 'serverless.yaml', 'sst.config.ts', 'amplify.yml'], DEPLOY),
  ...same(['wrangler.toml', 'wrangler.json', 'wrangler.jsonc'], { shape: 'cloud', color: '#f38020' }),
  ...same(['firebase.json', '.firebaserc', 'firestore.rules', 'storage.rules'], { shape: 'flame', color: '#ffca28' }),
  ...same(['supabase.toml'], { shape: 'zap', color: '#3ecf8e' }),
  ...same(['nginx.conf', '.htaccess', 'httpd.conf', 'caddyfile', 'apache2.conf'], { shape: 'server', color: '#009639' }),
  ...same(['procfile', 'procfile.dev'], { shape: 'server', color: P.violet }),
  ...same(['nixpacks.toml', 'flake.nix', 'flake.lock', 'default.nix', 'shell.nix'], { shape: 'snowflake', color: '#7ebae4' }),
  ...same(['justfile', '.justfile', 'taskfile.yml', 'taskfile.yaml', 'magefile.go'], { shape: 'list-checks', color: P.amber }),
  ...same(['.tool-versions', '.mise.toml', 'mise.toml', '.sdkmanrc', '.envrc'], { shape: 'sliders', color: P.teal }),

  // Git
  ...same(['.gitignore', '.gitattributes', '.gitkeep', '.keep', '.git-blame-ignore-revs', '.mailmap'], { shape: 'git', color: B.git }),
  ...same(['.gitmodules'], { shape: 'git-merge', color: B.git }),
  ...same(['.gitconfig', '.gitmessage'], { shape: 'settings', color: B.git }),
  ...same(['.pre-commit-config.yaml', '.pre-commit-hooks.yaml', 'lefthook.yml', 'lefthook.yaml'], { shape: 'git-commit', color: P.amber }),

  // CI, bots, hosting
  '.gitlab-ci.yml': { shape: 'gitlab', color: B.gitlab },
  ...same(['jenkinsfile'], { shape: 'workflow', color: '#d33833' }),
  ...same(['azure-pipelines.yml', 'azure-pipelines.yaml'], { shape: 'workflow', color: '#0078d4' }),
  ...same(['.travis.yml'], { shape: 'workflow', color: '#cd4a4e' }),
  ...same(['bitbucket-pipelines.yml'], { shape: 'workflow', color: '#2684ff' }),
  ...same(['.drone.yml', 'appveyor.yml', '.appveyor.yml', 'buildkite.yml', 'codemagic.yaml', 'cloudbuild.yaml', 'cloudbuild.yml'], CI),
  ...same(['codeowners', 'funding.yml', 'pull_request_template.md', 'issue_template.md'], { shape: 'github', color: B.github }),
  ...same(['dependabot.yml', 'renovate.json', 'renovate.json5', '.renovaterc', '.renovaterc.json'], { shape: 'bot', color: P.sky }),
  ...same(['.codecov.yml', 'codecov.yml', 'sonar-project.properties', '.snyk'], { shape: 'gauge', color: P.rose }),

  // The environment
  ...same(['.env', '.env.local', '.env.development', '.env.development.local', '.env.production', '.env.production.local', '.env.test', '.env.test.local', '.env.staging', '.env.example', '.env.sample', '.env.template', '.env.defaults', '.env.vault'], ENV),
  ...same(['.flaskenv'], ENV),

  // Editors and tools
  ...same(['.vscodeignore', 'settings.json', 'launch.json', 'tasks.json', 'extensions.json', 'keybindings.json'], { shape: 'settings', color: '#23a9f2' }),
  ...same(['.lumen-workspace.json'], { shape: 'lumen', color: P.indigo }),
  ...same(['.ignore', '.rgignore', '.fdignore', '.gcloudignore', '.slugignore'], { shape: 'eye', color: P.slate }),
  ...same(['.htpasswd', 'known_hosts', 'authorized_keys', 'id_rsa', 'id_ed25519', 'id_ecdsa'], KEY),
  ...same(['id_rsa.pub', 'id_ed25519.pub', 'id_ecdsa.pub'], KEY),
  ...same(['.bashrc', '.bash_profile', '.bash_logout', '.zshrc', '.zprofile', '.zshenv', '.profile', '.inputrc', 'config.fish'], SHELL),
  ...same(['.tmux.conf', '.wezterm.lua', 'kitty.conf', 'alacritty.toml', 'alacritty.yml'], { shape: 'square-terminal', color: P.lime }),
  ...same(['.vimrc', '.gvimrc', 'init.vim', 'init.lua'], { glyph: 'V', color: '#019733' }),

  // Documentation, law and community
  ...same(['readme', 'readme.md', 'readme.txt', 'readme.rst', 'readme.adoc', 'readme.org'], { shape: 'book-open', color: B.markdown }),
  ...same(['changelog', 'changelog.md', 'changelog.txt', 'changes', 'changes.md', 'history.md', 'news.md', 'releases.md', 'release-notes.md'], { shape: 'history', color: P.green }),
  ...same(['license', 'license.md', 'license.txt', 'licence', 'licence.md', 'licence.txt', 'copying', 'copying.lesser', 'unlicense', 'notice', 'notice.md', 'third-party-notices.md'], { shape: 'scale', color: P.yellow }),
  ...same(['contributing.md', 'contributing', 'code_of_conduct.md', 'governance.md', 'support.md', 'maintainers.md'], { shape: 'users', color: P.sky }),
  ...same(['authors', 'authors.md', 'contributors', 'contributors.md', 'credits.md', 'acknowledgements.md'], { shape: 'users', color: P.violet }),
  ...same(['security.md', 'security.txt'], { shape: 'shield-check', color: P.red }),
  ...same(['todo', 'todo.md', 'todo.txt', 'roadmap.md'], { shape: 'list-todo', color: P.amber }),
  ...same(['claude.md', 'agents.md', 'gemini.md', '.cursorrules', '.windsurfrules', 'copilot-instructions.md', 'llms.txt'], { shape: 'bot', color: '#d97757' }),
  'robots.txt': { shape: 'bot', color: P.gray },
  ...same(['sitemap.xml', 'humans.txt'], { shape: 'globe', color: P.gray }),
  ...same(['favicon.ico', 'favicon.svg', 'apple-touch-icon.png'], { shape: 'star', color: P.amber }),
  ...same(['mkdocs.yml', 'mkdocs.yaml', 'docusaurus.config.js', 'docusaurus.config.ts', '_config.yml', 'book.toml', 'conf.py', '.readthedocs.yml', '.readthedocs.yaml'], { shape: 'book-text', color: P.sky }),
  ...same(['citation.cff'], { shape: 'quote', color: P.sky }),

  // Minecraft
  ...same(['fabric.mod.json', 'mods.toml', 'neoforge.mods.toml', 'quilt.mod.json', 'pack.mcmeta', 'architectury.common.json'], { shape: 'pickaxe', color: '#dbd0b4' }),
  ...same(['plugin.yml', 'paper-plugin.yml', 'bungee.yml', 'velocity-plugin.json', 'config.yml'], { shape: 'puzzle', color: '#f0b429' }),
  ...same(['server.properties', 'eula.txt', 'ops.json', 'whitelist.json', 'bukkit.yml', 'spigot.yml', 'paper.yml'], { shape: 'server', color: '#8bc34a' }),

  // Lumen itself
  'lumen-extension.json': { shape: 'lumen', color: P.indigo },
};

/* ------------------------------------------------------------------ *
 * Folders
 * ------------------------------------------------------------------ */

const FOLDER_NAMES: Record<string, IconDef> = {
  // Sources
  ...same(['src', 'source', 'sources', 'app', 'main', 'code', 'pkg', 'internal', 'cmd'], { shape: 'folder-src', color: P.indigo }),
  ...same(['lib', 'libs', 'library', 'libraries', 'shared', 'common', 'core'], { shape: 'folder-library', color: P.teal }),
  ...same(['include', 'includes', 'inc', 'headers'], { shape: 'folder-types', color: '#8fb4e0' }),
  ...same(['java'], { shape: 'folder-java', color: B.java }),
  ...same(['kotlin'], { shape: 'folder-src', color: B.kotlin }),
  ...same(['python', 'py'], { shape: 'folder-src', color: B.python }),
  ...same(['typescript', 'ts'], { shape: 'folder-src', color: B.typescript }),
  ...same(['javascript', 'js'], { shape: 'folder-src', color: B.javascript }),

  // Tests
  ...same(['test', 'tests', 'testing', '__tests__', 'unit', 'integration', 'it'], { shape: 'folder-test', color: P.green }),
  ...same(['spec', 'specs', 'e2e', 'cypress', 'playwright'], { shape: 'folder-test', color: P.teal }),
  ...same(['__mocks__', 'mocks', 'mock', '__fixtures__', 'fixtures', 'fixture', 'stubs', 'testdata', 'test-data', '__snapshots__', 'snapshots'], { shape: 'folder-mock', color: P.rose }),
  ...same(['bench', 'benches', 'benchmark', 'benchmarks', 'perf'], { shape: 'folder-temp', color: P.orange }),
  ...same(['coverage', '.nyc_output', 'htmlcov'], { shape: 'folder-check', color: P.rose }),

  // Documentation and examples
  ...same(['docs', 'doc', 'documentation', 'manual', 'guide', 'guides', 'wiki', 'site'], { shape: 'folder-docs', color: P.sky }),
  ...same(['examples', 'example', 'samples', 'sample', 'demo', 'demos', 'playground', 'sandbox', 'showcase'], { shape: 'folder-examples', color: P.amber }),
  ...same(['content', 'posts', 'blog', 'articles', 'pages'], { shape: 'folder-content', color: P.sky }),
  ...same(['.storybook', 'stories', 'storybook'], { shape: 'folder-docs', color: '#ff4785' }),

  // Assets
  ...same(['assets', 'asset', 'resources', 'res', 'static', 'data', 'raw'], { shape: 'folder-image', color: P.amber }),
  ...same(['images', 'image', 'img', 'imgs', 'pictures', 'photos', 'screenshots', 'icons', 'icon', 'sprites', 'textures', 'drawable', 'mipmap'], { shape: 'folder-image', color: P.violet }),
  ...same(['public', 'www', 'wwwroot', 'webroot', 'htdocs', 'html'], { shape: 'folder-public', color: P.teal }),
  ...same(['fonts', 'font', 'typefaces'], { shape: 'folder-font', color: P.red }),
  ...same(['media', 'audio', 'sounds', 'sound', 'music', 'video', 'videos', 'movies'], { shape: 'folder-media', color: P.pink }),
  ...same(['models3d', 'meshes', 'mesh'], { shape: 'folder-package', color: P.teal }),

  // Web application structure
  ...same(['components', 'component', 'widgets', 'widget', 'ui', 'elements', 'atoms', 'molecules', 'organisms'], { shape: 'folder-component', color: B.react }),
  ...same(['hooks', 'hook', 'composables', 'directives'], { shape: 'folder-plugin', color: P.pink }),
  ...same(['utils', 'util', 'utilities', 'helpers', 'helper', 'tools', 'toolkit'], { shape: 'folder-util', color: P.teal }),
  ...same(['api', 'apis', 'endpoints', 'rest', 'graphql', 'rpc', 'controllers', 'controller', 'handlers', 'resolvers'], { shape: 'folder-api', color: P.violet }),
  ...same(['routes', 'route', 'router', 'routing', 'navigation'], { shape: 'folder-route', color: P.orange }),
  ...same(['views', 'view', 'screens', 'screen', 'layouts', 'layout', 'templates', 'template', 'partials'], { shape: 'folder-view', color: P.indigo }),
  ...same(['styles', 'style', 'css', 'scss', 'sass', 'less', 'stylesheets', 'themes', 'theme'], { shape: 'folder-style', color: B.css }),
  ...same(['models', 'model', 'entities', 'entity', 'schemas', 'schema', 'domain', 'dto', 'dtos'], { shape: 'folder-model', color: P.purple }),
  ...same(['services', 'service', 'providers', 'provider', 'repositories', 'repository', 'repos', 'usecases'], { shape: 'folder-service', color: P.yellow }),
  ...same(['store', 'stores', 'state', 'redux', 'reducers', 'slices', 'atoms-state'], { shape: 'folder-model', color: P.violet }),
  ...same(['types', 'typings', '@types', 'interfaces', 'contracts'], { shape: 'folder-types', color: B.typescript }),
  ...same(['middleware', 'middlewares', 'interceptors', 'guards', 'pipes', 'filters'], { shape: 'folder-plugin', color: P.slate }),
  ...same(['plugins', 'plugin', 'addons', 'addon', 'extensions', 'extension', 'modules', 'mods'], { shape: 'folder-plugin', color: '#f0b429' }),
  ...same(['features', 'feature', 'packages-src'], { shape: 'folder-src', color: P.cyan }),
  ...same(['events', 'event', 'listeners', 'jobs', 'queues', 'workers', 'tasks', 'cron'], { shape: 'folder-temp', color: P.lime }),
  ...same(['mail', 'mails', 'emails', 'email', 'notifications'], { shape: 'folder-content', color: P.rose }),
  ...same(['auth', 'security', 'secure', 'secrets', 'certs', 'certificates', 'keys', 'ssl', '.ssh', '.gnupg', 'credentials'], { shape: 'folder-secure', color: P.red }),

  // Languages and data
  ...same(['i18n', 'l10n', 'locales', 'locale', 'lang', 'langs', 'languages', 'translations', 'messages', 'intl'], { shape: 'folder-i18n', color: P.cyan }),
  ...same(['db', 'database', 'databases', 'sql', 'data-access', 'dao', 'seeds', 'seeders', 'prisma', 'drizzle'], { shape: 'folder-database', color: P.amber }),
  ...same(['migrations', 'migration', 'migrate'], { shape: 'folder-database', color: P.orange }),
  ...same(['server', 'backend', 'back-end', 'functions', 'lambda', 'lambdas', 'edge'], { shape: 'folder-api', color: P.violet }),
  ...same(['client', 'frontend', 'front-end', 'web', 'webapp'], { shape: 'folder-public', color: P.sky }),

  // Configuration and scripts
  ...same(['config', 'configs', 'configuration', 'conf', '.config', 'settings', 'env', 'environments', 'environment'], { shape: 'folder-cog', color: P.pink }),
  ...same(['scripts', 'script', 'bin', 'sbin', 'tasks-sh', 'shell', 'hack'], { shape: 'folder-script', color: P.lime }),
  ...same(['.husky', 'githooks', '.githooks'], { shape: 'folder-script', color: P.brown }),
  ...same(['.vscode', '.vscode-test'], { shape: 'folder-editor', color: '#23a9f2' }),
  ...same(['.idea', '.fleet', '.zed', '.helix', '.nvim', '.vim', '.emacs.d'], { shape: 'folder-editor', color: P.violet }),
  '.lumen': { shape: 'folder-cog', color: P.indigo },
  ...same(['.claude', '.cursor', '.codex', '.gemini', '.windsurf', '.continue', '.aider'], { shape: 'folder-cog', color: '#d97757' }),
  ...same(['.devcontainer'], { shape: 'folder-docker', color: B.docker }),

  // Build output and caches
  ...same(['build', 'builds', 'dist', 'out', 'output', 'target', 'release', 'releases', 'artifacts', 'publish', 'bundle', '.output', 'lib-dist', 'esm', 'cjs', 'umd'], { shape: 'folder-dist', color: P.gray }),
  ...same(['obj', 'debug', 'x64', 'x86', 'arm64', 'cmake-build-debug', 'cmake-build-release', 'builddir'], { shape: 'folder-dist', color: P.slate }),
  ...same(['.next', '.nuxt', '.svelte-kit', '.astro', '.angular', '.vercel', '.netlify', '.turbo', '.parcel-cache', '.expo', '.docusaurus'], { shape: 'folder-dist', color: P.slate }),
  ...same(['tmp', 'temp', '.tmp', '.temp', 'cache', '.cache', '.pytest_cache', '.mypy_cache', '.ruff_cache', '__pycache__', '.sass-cache', '.eslintcache'], { shape: 'folder-temp', color: P.slate }),
  ...same(['logs', 'log'], { shape: 'folder-clock', color: P.slate }),
  ...same(['backup', 'backups', 'archive', 'archives', 'old', 'legacy', 'deprecated'], { shape: 'folder-archive', color: P.brown }),

  // Dependencies
  'node_modules': { shape: 'folder-package', color: '#8b5a5a' },
  ...same(['vendor', 'third_party', 'third-party', 'thirdparty', 'external', 'externals', 'deps', 'dependencies', 'packages', 'bower_components', 'jspm_packages', 'subprojects', 'vcpkg_installed', '.pnpm-store', '.yarn'], { shape: 'folder-package', color: P.brown }),
  ...same(['.venv', 'venv', '.env-py', 'virtualenv', '.virtualenv', 'site-packages', '.tox', '.nox'], { shape: 'folder-package', color: B.python }),
  ...same(['gradle', '.gradle', 'buildsrc', 'build-logic'], { shape: 'folder-cog', color: B.gradle }),
  ...same(['.mvn', 'maven'], { shape: 'folder-cog', color: B.maven }),
  ...same(['.cargo'], { shape: 'folder-cog', color: B.rust }),
  ...same(['.dart_tool', '.pub-cache'], { shape: 'folder-package', color: '#0175c2' }),

  // Version control and CI
  '.git': { shape: 'folder-git', color: B.git },
  ...same(['.github'], { shape: 'folder-github', color: MUTED }),
  ...same(['workflows', '.circleci', '.buildkite', '.azure-pipelines', 'ci', '.ci', 'pipelines'], { shape: 'folder-ci', color: P.orange }),
  ...same(['.gitlab'], { shape: 'folder-ci', color: B.gitlab }),
  ...same(['.changeset', '.changesets'], { shape: 'folder-docs', color: P.green }),

  // Infrastructure and platforms
  ...same(['.docker', 'docker', 'containers', 'container'], { shape: 'folder-docker', color: B.docker }),
  ...same(['k8s', 'kubernetes', 'helm', 'charts', 'manifests', 'deploy', 'deployment', 'deployments', 'infra', 'infrastructure', 'terraform', 'ansible', '.terraform', 'cloud', 'aws', 'azure', 'gcp'], { shape: 'folder-cloud', color: '#326ce5' }),
  ...same(['android', 'app-android'], { shape: 'folder-android', color: '#3ddc84' }),
  ...same(['ios', 'macos', 'osx', 'darwin', 'app-ios'], { shape: 'folder-apple', color: P.gray }),
  ...same(['mobile', 'native', 'expo', 'flutter'], { shape: 'folder-mobile', color: P.sky }),
  ...same(['desktop', 'electron', 'tauri', 'src-tauri', 'windows', 'linux'], { shape: 'folder-view', color: P.cyan }),
  ...same(['game', 'games', 'levels', 'scenes', 'prefabs'], { shape: 'folder-game', color: P.purple }),

  // Minecraft
  ...same(['mixin', 'mixins'], { shape: 'folder-plugin', color: '#dbd0b4' }),
  ...same(['datagen', 'generated'], { shape: 'folder-dist', color: '#8bc34a' }),
};

/* ------------------------------------------------------------------ *
 * The packs
 * ------------------------------------------------------------------ */

export const lumenIconPack: IconPack = {
  id: 'lumen-icons',
  name: 'Lumen',
  author: 'Lumen',
  description: 'iconPacks.packs.lumen',
  languages: LANGUAGES,
  extensions: EXTENSIONS,
  fileNames: FILE_NAMES,
  folderNames: FOLDER_NAMES,
  file: { shape: 'file', color: SUBTLE },
  folder: { shape: 'folder', color: MUTED },
};

/** Every colour of a map replaced by one tone. */
function tone(map: Record<string, IconDef>, color: string): Record<string, IconDef> {
  return Object.fromEntries(Object.entries(map).map(([key, def]) => [key, { ...def, color }]));
}

/**
 * The Lumen pack in one colour. Files take the muted text tone, folders the
 * subtler one, so the tree still reads as files within folders.
 */
export const monoIconPack: IconPack = {
  id: 'lumen-mono',
  name: 'Lumen Monochrome',
  author: 'Lumen',
  description: 'iconPacks.packs.mono',
  languages: tone(LANGUAGES, MUTED),
  extensions: tone(EXTENSIONS, MUTED),
  fileNames: tone(FILE_NAMES, MUTED),
  folderNames: tone(FOLDER_NAMES, SUBTLE),
  file: { shape: 'file', color: SUBTLE },
  folder: { shape: 'folder', color: SUBTLE },
};

export const classicIconPack: IconPack = {
  id: 'lumen-classic',
  name: 'Lumen Classic',
  author: 'Lumen',
  description: 'iconPacks.packs.classic',
  folderNames: {
    ...same(['src', 'lib', 'app'], { color: '#7c8cff' }),
    ...same(['test', 'tests', 'spec'], { color: '#4ade80' }),
    ...same(['docs', 'doc'], { color: '#38bdf8' }),
    ...same(['assets', 'public', 'static', 'images'], { color: '#fbbf24' }),
    ...same(['config', 'scripts'], { color: '#f472b6' }),
  },
};

export const DEFAULT_ICON_PACK_ID = lumenIconPack.id;

export const iconsAddon: Addon = {
  id: 'icons.lumen',
  name: 'Lumen Icons',
  version: '2.0.0',
  get description() {
    return t('addons.icons');
  },
  icon: '◈',
  builtin: true,
  category: 'theme',
  iconPacks: [lumenIconPack, monoIconPack, classicIconPack],
};
