/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { Addon, LanguageSpec, LspConfig, ToolSpec } from '@/core/types';
import { novusKind, novusTemplate } from '../lib/project/lang-projects';
import { novusWebTemplate } from '../lib/project/novus-web';
import { localizeSnippets } from '../lib/localize';
import { detectNovus } from '../lib/contexts/novus-context';
import { detectNvh } from '../lib/contexts/nvh-context';
import { createNovusTokenizer, createNvhTokenizer } from '../lib/tokenizers/novus-tokenizer';
import { LSP_PACKAGES, NOVUS_VERSION } from '../lib/lsp-packages';
import { novusFormat } from '../lib/format-settings';
import { STD_FUNCTION_WORDS, STD_MODULES } from './novus-support/std-api';
import { novusSnippets } from './novus-support/snippets';
import { MANIFEST_SNIPPETS, NOVUS_SNIPPETS, NVH_PART_SNIPPETS, NVH_SNIPPETS } from './novus-support/own-snippets';
import { t } from '@/i18n';

/**
 * Novus (`.nv`, components `.nvh`) — ezTxmMC's self-hosting language, which
 * compiles to portable C.  https://github.com/ezTxmMC/novus
 *
 * The word lists and regexes follow the compiler:
 *   compiler/lexer/chars.nv      keywords, one- and two-character operators
 *   compiler/parser/*.nv         context-dependent words (define, class, based …)
 *   compiler/codegen/builtins.nv the free builtins
 *   README.md                    the standard modules and the type methods
 *   std/*.nv                     the functions of the modules (novus-support/std-api.ts)
 *   vscode-novus/snippets        the snippet catalogue (novus-support/snippet-rows.ts)
 *
 * All of it as of the release v0.1.0-pre.alpha.8 (`NOVUS_VERSION`).
 */
/** Builds the language server from the repository — needs git, make and a C compiler. */
const NOVUS_BUILD = `git clone --depth 1 --branch ${NOVUS_VERSION} https://github.com/ezTxmMC/novus ~/.lumen/novus && make -C ~/.lumen/novus lsp`;

/**
 * `novusc` — the compiler the run configurations call. Installed from the same
 * pinned release as `novus-lsp`, into Lumen's managed folder, which is on the
 * PATH of run tasks, terminals and debug launches.
 */
const novusc: ToolSpec = {
  id: 'novusc',
  label: 'novusc',
  command: 'novusc',
  // A build from source (`make`) is found without any PATH setup.
  candidates: ['~/.lumen/novus/build/novusc'],
  check: ['version'],
  package: LSP_PACKAGES.novusc,
  docs: 'https://github.com/ezTxmMC/novus#usage',
};

/** `novus-lsp` — written in Novus, LSP over stdio; one process serves `.nv` and `.nvh`. */
function novusLsp(languageId: string): LspConfig {
  return {
    label: 'novus-lsp',
    command: 'novus-lsp',
    args: ['--stdio'],
    languageId,
    rootMarkers: ['project.nv', '.git'],
    // A build from source (`make lsp`) is found without any PATH setup.
    candidates: ['~/.lumen/novus/build/novus-lsp', '${root}/build/novus-lsp'],
    installCommands: {
      linux: NOVUS_BUILD,
      darwin: NOVUS_BUILD,
    },
    docs: 'https://github.com/ezTxmMC/novus#editor-support',
    package: LSP_PACKAGES.novusLsp,
    // The server reads its settings under `novus.*` (website/content/projects/language-server.nvmd).
    formatSettings: novusFormat,
    get install() {
      return t('addons.novusInstall');
    },
  };
}

/** The identifiers of the lexer, plus the `$name` placeholders and `@Annotation`s (language-configuration.json). */
const NOVUS_WORD = /[$@]?[A-Za-z_][A-Za-z0-9_]*|\d+(?:\.\d+)?/;

const novusBase: LanguageSpec = {
  id: 'novus',
  name: 'Novus',
  extensions: ['.nv'],
  icon: 'Nv',
  color: '#7c5cff',
  capitalizedAsType: true,
  // `/**` + Enter closes a doc comment and continues it with ` * `.
  comments: { line: '//', block: ['/*', '*/'], docBlock: true },
  wordPattern: NOVUS_WORD,
  // Top level, class body, statement block, literal — scopes the snippets (`Snippet.scope`).
  syntaxContext: detectNovus,
  // Double quotes only — an apostrophe in a comment stays alone.
  closeBrackets: ['(', '[', '{', '"'],

  // Annotations: @Deprecated, @Interface, @Abstract …
  // `$name` / `$$` are the placeholders of a `c { }` block's C code.
  meta: /^(?:@[A-Za-z_][A-Za-z0-9_]*|\$\$|\$[A-Za-z_][A-Za-z0-9_]*)/,

  controls: [
    'if', 'else', 'while', 'for', 'in', 'return', 'break', 'continue',
    'await', 'sync',
  ],

  keywords: [
    // The lexer's keywords
    'package', 'import', 'method', 'var', 'private', 'final',
    // Declarations (the parser)
    'define', 'class', 'interface', 'enum', 'abstract', 'annotation',
    'based', 'construct', 'native', 'variadic', 'get', 'set', 'this', 'super',
    'public', 'protected', 'static',
    // Concurrency
    'async', 'thread', 'virtual',
  ],

  types: [
    'int', 'integer', 'float', 'doub', 'double', 'str', 'string',
    'bool', 'boolean', 'void', 'array', 'map', 'object', 'image',
  ],

  constants: ['true', 'false', 'null'],

  builtins: [
    // Output statements
    'println', 'print', 'eprintln',
    // The free builtins (without an import)
    'readFile', 'writeFile', 'fileExists', 'removeFile', 'readLine', 'args',
    'parseInt', 'parseFloat', 'chr', 'ord', 'typeOf', 'exec', 'env', 'exit',
    'platform',
    // The standard modules (std/*.nv) and `project`, which the compiler answers itself
    ...STD_MODULES,
  ],

  // Double quotes only; `${…}` interpolation and \n \t \r \0.
  strings: [{ start: '"', multiline: true, escapes: true, interpolate: '${' }],

  // Whole numbers, hexadecimal and floating point — without an exponent and without separators.
  numbers: /^(?:0[xX][0-9a-fA-F]+|\d+\.\d+|\d+)/,
  identifier: /^[A-Za-z_][A-Za-z0-9_]*/,

  // The two-character operators from isTwoCharOp, then the single characters.
  operators: /^(?:==|!=|<=|>=|&&|\|\||=>|=<|<<|>>|\.\.|[+\-*/%=<>!&|^:])/,

  completions: [
    // The type methods (String, Array, Map)
    'length', 'charAt', 'substring', 'indexOf', 'contains', 'startsWith',
    'endsWith', 'split', 'replace', 'trim', 'toUpper', 'toLower',
    'append', 'pop', 'insert', 'remove', 'join', 'clear',
    'has', 'keys', 'values', 'get', 'words', 'sort',
    // `project.nv`
    'require', 'replace',
    // The functions of the standard modules
    ...STD_FUNCTION_WORDS,
  ],

  snippets: localizeSnippets(novusSnippets(NOVUS_SNIPPETS, MANIFEST_SNIPPETS)),

  indentUnit: 4,

  lsp: [novusLsp('novus')],
  tools: [novusc],
  run: [
    { label: 'novusc run', command: 'novusc', args: ['run', '${file}'], cwdMarkers: ['project.nv'] },
    { get label() { return t('addons.novusRunProject'); }, command: 'novusc', args: ['run'] },
    {
      label: 'novusc build',
      command: 'novusc',
      args: ['build', '${file}', '-o', '${fileStem}'],
      then: { command: './${fileStem}', args: [] },
      cwdMarkers: ['project.nv'],
    },
    { label: 'novusc check', command: 'novusc', args: ['check', '${file}'] },
    { label: 'novusc check --offline', command: 'novusc', args: ['check', '${file}', '--offline'] },
    { label: 'novusc emit (C)', command: 'novusc', args: ['emit', '${file}'] },
  ],
};

export const novusSpec: LanguageSpec = {
  ...novusBase,
  tokenizer: createNovusTokenizer(novusBase) as never,
};

/**
 * `.nvh` — HTML with Novus in it, like a PHP page, and a component at the same
 * time. The Novus parts are coloured with the words of `.nv`.
 */
export const nvhSpec: LanguageSpec = {
  id: 'nvh',
  name: 'Novus HTML',
  extensions: ['.nvh'],
  icon: 'Nv',
  color: '#7c5cff',
  comments: { block: ['<!--', '-->'] },
  // `<?nv` and `<?=` close themselves (language-configuration-nvh.json).
  autoClose: [
    { open: '<?nv', before: ' ', after: ' ?>' },
    { open: '<?=', before: ' ', after: '?>' },
  ],
  closeBrackets: ['(', '[', '{', '"'],
  // Attribute names run over `-` and `:` (`aria-label`, `class:active`, `bind:value`), plus `@click` and `$value`.
  wordPattern: /[@$]?[A-Za-z_][A-Za-z0-9_]*(?:[-:][A-Za-z_][A-Za-z0-9_]*)*-?|\d+(?:\.\d+)?/,
  // Inside `<?nv ?>`, `<?= ?>` and `{expr}` the code's own words: `count-c` is `count` minus `c`.
  codeWordPattern: NOVUS_WORD,
  // Template text, tag, expression or block — scopes the snippets and picks the word pattern.
  syntaxContext: detectNvh,
  // The block of a header (`<?nv … ?>`) and the words that are only valid there.
  keywords: ['prop', 'ref'],
  completions: [
    // The header block and the component's methods (std/web.nv: NvhComponent)
    'prop', 'ref', 'mount', 'tick', 'emit', 'navigate', 'id',
    // Template blocks, directives and the parts of a page
    '@click', '@input', '@change', '@submit', '@keydown.enter.prevent', '$value',
    'bind', 'class:', 'key', 'slot',
    '{#if}', '{:else if}', '{:else}', '{/if}', '{#for}', '{/for}', '{@html }',
  ],
  snippets: localizeSnippets([...NVH_SNIPPETS, ...NVH_PART_SNIPPETS]),
  indentUnit: 4,
  tokenizer: createNvhTokenizer(novusBase) as never,
  lsp: [novusLsp('novus-html')],
  tools: [novusc],
  run: [
    { label: 'novusc run', command: 'novusc', args: ['run', '${file}'], cwdMarkers: ['project.nv'] },
    { label: 'novusc nvh', command: 'novusc', args: ['nvh', '${file}'] },
    { label: 'novusc check', command: 'novusc', args: ['check', '${file}'] },
    {
      label: 'novusc build',
      command: 'novusc',
      args: ['build', '${file}', '-o', '${fileStem}'],
      then: { command: './${fileStem}', args: [] },
      cwdMarkers: ['project.nv'],
    },
  ],
};

export const novusAddon: Addon = {
  id: 'lang.novus',
  name: 'Novus',
  version: '1.1.0',
  get description() {
    return t('addons.novusDescription');
  },
  icon: 'Nv',
  builtin: true,
  category: 'language',
  languages: [novusSpec, nvhSpec],
  projectKinds: [novusKind],
  projectTemplates: [novusTemplate, novusWebTemplate],
};
