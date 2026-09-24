/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { Addon, LanguageSpec } from '@/core/types';
import { denoKind, jsBrowserTemplate, jsNodeTemplate, npmKind } from '../lib/node-project';
import { jsDebugNode } from '@/core/debug/adapters';
import { LSP_PACKAGES, SYSTEM_PACKAGES } from '../lib/lsp-packages';
import { localizeSnippets } from '../lib/localize';
import { t } from '@/i18n';

/** Inlay hints and suggestion settings, shared by the tsserver front ends. */
export const TS_INLAY_HINTS = {
  parameterNames: { enabled: 'all', suppressWhenArgumentMatchesName: true },
  parameterTypes: { enabled: true },
  variableTypes: { enabled: false },
  propertyDeclarationTypes: { enabled: true },
  functionLikeReturnTypes: { enabled: true },
  enumMemberValues: { enabled: true },
};

/** vtsls reads the defaults as VS Code does, from `typescript.preferences` / `typescript.suggest`. */
export const VTSLS_PREFERENCES = { includePackageJsonAutoImports: 'on' };
export const VTSLS_SUGGEST = { autoImports: true, includeCompletionsForImportStatements: true, completeFunctionCalls: true };

export const TS_PREFERENCES = {
  includeInlayParameterNameHints: 'all',
  includeInlayParameterNameHintsWhenArgumentMatchesName: false,
  includeInlayFunctionParameterTypeHints: true,
  includeInlayVariableTypeHints: false,
  includeInlayPropertyDeclarationTypeHints: true,
  includeInlayFunctionLikeReturnTypeHints: true,
  includeInlayEnumMemberValueHints: true,
  includeCompletionsForModuleExports: true,
  includeCompletionsForImportStatements: true,
  // Suggest the exports of every package in node_modules, not only those used directly in package.json.
  includePackageJsonAutoImports: 'on',
  includeCompletionsWithClassMemberSnippets: true,
  includeCompletionsWithObjectLiteralMethodSnippets: true,
  includeCompletionsWithInsertText: true,
  includeCompletionsWithSnippetText: true,
  includeAutomaticOptionalChainCompletions: true,
  importModuleSpecifierPreference: 'shortest',
  importModuleSpecifierEnding: 'auto',
  quotePreference: 'auto',
  providePrefixAndSuffixTextForRename: true,
  allowRenameOfImportPath: true,
  jsxAttributeCompletionStyle: 'auto',
};


export const javascriptSpec: LanguageSpec = {
  id: 'javascript',
  name: 'JavaScript',
  extensions: ['.js', '.mjs', '.cjs', '.jsx'],
  filenames: ['.eslintrc', '.babelrc'],
  icon: 'JS',
  color: '#f7df1e',
  comments: { line: '//', block: ['/*', '*/'] },
  controls: [
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break',
    'continue', 'return', 'throw', 'try', 'catch', 'finally', 'yield', 'await',
  ],
  keywords: [
    'var', 'let', 'const', 'function', 'class', 'extends', 'new', 'delete',
    'typeof', 'instanceof', 'in', 'of', 'this', 'super', 'import', 'export',
    'from', 'as', 'default', 'async', 'static', 'get', 'set', 'void', 'with',
  ],
  constants: ['true', 'false', 'null', 'undefined', 'NaN', 'Infinity', 'globalThis'],
  builtins: [
    'console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean',
    'Promise', 'Symbol', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Date', 'RegExp',
    'Error', 'TypeError', 'Proxy', 'Reflect', 'BigInt', 'fetch', 'structuredClone',
    'setTimeout', 'setInterval', 'queueMicrotask', 'document', 'window',
  ],
  strings: [
    { start: '"', escapes: true },
    { start: "'", escapes: true },
    { start: '`', multiline: true, escapes: true, interpolate: '${' },
  ],
  completions: [
    'addEventListener', 'removeEventListener', 'querySelector',
    'querySelectorAll', 'createElement', 'appendChild', 'classList',
    'dataset', 'textContent', 'innerHTML', 'localStorage', 'sessionStorage',
    'requestAnimationFrame', 'IntersectionObserver', 'AbortController',
    'URLSearchParams', 'FormData', 'Headers', 'Response', 'Request',
    'process', 'Buffer', '__dirname', 'module', 'exports', 'globalThis',
  ],
  snippets: localizeSnippets([
    { label: 'log', detail: 'console.log', body: 'console.log($0)' },
    { label: 'fn', detail: 'addons.snippets.javascript.fn', body: 'function ${name}(${args}) {\n  $0\n}' },
    { label: 'afn', detail: 'Arrow Function', body: 'const ${name} = (${args}) => {\n  $0\n}' },
    { label: 'asfn', detail: 'async Arrow Function', body: 'const ${name} = async (${args}) => {\n  $0\n}' },
    { label: 'try', detail: 'try/catch', body: 'try {\n  $0\n} catch (err) {\n  console.error(err)\n}' },
    { label: 'cls', detail: 'addons.snippets.javascript.cls', body: 'class ${Name} {\n  constructor(${args}) {\n    $0\n  }\n}' },
    { label: 'imp', detail: 'Import', body: "import { ${name} } from '${modul}'" },
    { label: 'impd', detail: 'addons.snippets.javascript.impd', body: "import ${Name} from '${modul}'" },
    { label: 'exp', detail: 'Export', body: 'export const ${name} = $0' },
    { label: 'forof', detail: 'for…of', body: 'for (const ${element} of ${liste}) {\n  $0\n}' },
    { label: 'fore', detail: 'forEach', body: '${liste}.forEach((${element}) => {\n  $0\n})' },
    { label: 'map', detail: 'map', body: '${liste}.map((${element}) => $0)' },
    { label: 'filter', detail: 'filter', body: '${liste}.filter((${element}) => $0)' },
    { label: 'reduce', detail: 'reduce', body: '${liste}.reduce((${acc}, ${element}) => $0, ${start})' },
    { label: 'fetch', detail: 'addons.snippets.javascript.fetch', body: "const res = await fetch('${url}')\nif (!res.ok) throw new Error(res.statusText)\nconst data = await res.json()$0" },
    { label: 'prom', detail: 'Promise', body: 'new Promise((resolve, reject) => {\n  $0\n})' },
    { label: 'timeout', detail: 'setTimeout', body: 'setTimeout(() => {\n  $0\n}, ${200})' },
    { label: 'switch', detail: 'switch', body: 'switch (${wert}) {\n  case ${1}:\n    $0\n    break\n  default:\n    break\n}' },
    { label: 'destr', detail: 'addons.snippets.javascript.destr', body: 'const { ${a}, ${b} } = ${objekt}$0' },
  ]),
  run: [
    { label: 'Node', command: 'node', args: ['${file}'] },
    { label: 'Bun', command: 'bun', args: ['run', '${file}'] },
  ],
  debug: [jsDebugNode],
  lsp: [
    {
      label: 'typescript-language-server',
      command: 'typescript-language-server',
      args: ['--stdio'],
      candidates: [
        '${root}/node_modules/.bin/typescript-language-server',
        '${workspace}/node_modules/.bin/typescript-language-server',
        '~/.local/share/nvim/mason/bin/typescript-language-server',
        '~/.bun/bin/typescript-language-server',
        '/opt/homebrew/bin/typescript-language-server',
      ],
      languageId: 'javascript',
      rootMarkers: ['tsconfig.json', 'jsconfig.json', 'package.json', '.git'],
      initializationOptions: {
        hostInfo: 'Lumen',
        preferences: TS_PREFERENCES,
        tsserver: { logVerbosity: 'off', useSyntaxServer: 'auto' },
        completions: { completeFunctionCalls: true },
        plugins: [],
      },
      settings: {
        typescript: { inlayHints: TS_INLAY_HINTS, suggest: { completeFunctionCalls: true } },
        javascript: { inlayHints: TS_INLAY_HINTS, suggest: { completeFunctionCalls: true } },
        completions: { completeFunctionCalls: true },
      },
      install: 'npm i -g typescript typescript-language-server',
      package: LSP_PACKAGES.typescriptLanguageServer,
      systemPackages: SYSTEM_PACKAGES.typescriptLanguageServer,
      docs: 'https://github.com/typescript-language-server/typescript-language-server',
    },
    {
      label: 'vtsls',
      command: 'vtsls',
      args: ['--stdio'],
      candidates: ['${root}/node_modules/.bin/vtsls', '~/.local/share/nvim/mason/bin/vtsls'],
      languageId: 'javascript',
      rootMarkers: ['tsconfig.json', 'jsconfig.json', 'package.json', '.git'],
      settings: {
        typescript: { inlayHints: TS_INLAY_HINTS, preferences: VTSLS_PREFERENCES, suggest: VTSLS_SUGGEST },
        javascript: { inlayHints: TS_INLAY_HINTS, preferences: VTSLS_PREFERENCES, suggest: VTSLS_SUGGEST },
        vtsls: { autoUseWorkspaceTsdk: true },
      },
      install: 'npm i -g @vtsls/language-server',
      package: LSP_PACKAGES.vtsls,
      docs: 'https://github.com/yioneko/vtsls',
    },
    {
      label: 'eslint',
      command: 'vscode-eslint-language-server',
      args: ['--stdio'],
      candidates: ['${root}/node_modules/.bin/vscode-eslint-language-server', '~/.local/share/nvim/mason/bin/vscode-eslint-language-server'],
      languageId: 'javascript',
      rootMarkers: ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts', '.eslintrc.json', '.eslintrc.js', 'package.json'],
      settings: { validate: 'on', run: 'onType', workingDirectory: { mode: 'auto' }, nodePath: null, codeAction: { disableRuleComment: { enable: true, location: 'separateLine' }, showDocumentation: { enable: true } } },
      install: 'npm i -g vscode-langservers-extracted',
      package: LSP_PACKAGES.eslint,
      docs: 'https://github.com/hrsh7th/vscode-langservers-extracted',
    },
    {
      label: 'biome',
      command: 'biome',
      args: ['lsp-proxy'],
      candidates: ['${root}/node_modules/.bin/biome', '~/.local/share/nvim/mason/bin/biome'],
      languageId: 'javascript',
      rootMarkers: ['biome.json', 'biome.jsonc'],
      install: 'npm i -g @biomejs/biome',
      package: LSP_PACKAGES.biome,
      docs: 'https://biomejs.dev/reference/language-server/',
    },
    {
      label: 'deno lsp',
      command: 'deno',
      args: ['lsp'],
      candidates: ['~/.deno/bin/deno'],
      languageId: 'javascript',
      rootMarkers: ['deno.json', 'deno.jsonc'],
      initializationOptions: { enable: true, lint: true, unstable: false, suggest: { imports: { hosts: { 'https://deno.land': true } } } },
      settings: { deno: { enable: true, lint: true } },
      install: 'curl -fsSL https://deno.land/install.sh | sh',
      package: LSP_PACKAGES.deno,
      systemPackages: SYSTEM_PACKAGES.deno,
      docs: 'https://docs.deno.com/runtime/reference/lsp_integration/',
    },
  ],
};

export const javascriptAddon: Addon = {
  id: 'lang.javascript',
  name: 'JavaScript',
  version: '1.0.0',
  get description() {
    return t('addons.javascriptDescription');
  },
  icon: 'JS',
  builtin: true,
  category: 'language',
  languages: [javascriptSpec],
  projectKinds: [npmKind, denoKind],
  projectTemplates: [jsNodeTemplate, jsBrowserTemplate],
};
