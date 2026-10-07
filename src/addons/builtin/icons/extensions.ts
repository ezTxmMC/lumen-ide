/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The icons by file extension. */

import type { IconDef } from '@/core/types';
import { same, P, B, TEST, SPEC, IMAGE, VECTOR, AUDIO, VIDEO, FONT, ARCHIVE, LOCK, SHEET, BINARY, CONFIG, KEY, ENV, CERT, DATA, LOG, TEXT, SHELL, DIFF, NOTEBOOK, DOCUMENT, SLIDES, MODEL3D, TEMPLATE } from './palette';

/* ------------------------------------------------------------------ *
 * Extensions (without a language add-on too)
 * ------------------------------------------------------------------ */

export const EXTENSIONS: Record<string, IconDef> = {
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
