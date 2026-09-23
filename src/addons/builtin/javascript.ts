import type { Addon, LanguageSpec } from '@/core/types'
import { denoKind, jsBrowserTemplate, jsNodeTemplate, npmKind } from '../lib/node-project'
import { jsDebugNode } from '@/core/debug/adapters'
import { LSP_PACKAGES, SYSTEM_PACKAGES } from '../lib/lsp-packages'

/** Inlay hints and suggestion settings, shared by the tsserver front ends. */
export const TS_INLAY_HINTS = {
  parameterNames: { enabled: 'all', suppressWhenArgumentMatchesName: true },
  parameterTypes: { enabled: true },
  variableTypes: { enabled: false },
  propertyDeclarationTypes: { enabled: true },
  functionLikeReturnTypes: { enabled: true },
  enumMemberValues: { enabled: true },
}

/** vtsls reads the defaults as VS Code does, from `typescript.preferences` / `typescript.suggest`. */
export const VTSLS_PREFERENCES = { includePackageJsonAutoImports: 'on' }
export const VTSLS_SUGGEST = { autoImports: true, includeCompletionsForImportStatements: true, completeFunctionCalls: true }

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
}


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
  snippets: [
    { label: 'log', detail: 'console.log', body: 'console.log($0)' },
    { label: 'fn', detail: 'Funktion', body: 'function ${name}(${args}) {\n  $0\n}' },
    { label: 'afn', detail: 'Arrow Function', body: 'const ${name} = (${args}) => {\n  $0\n}' },
    { label: 'asfn', detail: 'async Arrow Function', body: 'const ${name} = async (${args}) => {\n  $0\n}' },
    { label: 'try', detail: 'try/catch', body: 'try {\n  $0\n} catch (err) {\n  console.error(err)\n}' },
    { label: 'cls', detail: 'Klasse', body: 'class ${Name} {\n  constructor(${args}) {\n    $0\n  }\n}' },
    { label: 'imp', detail: 'Import', body: "import { ${name} } from '${modul}'" },
    { label: 'impd', detail: 'Default-Import', body: "import ${Name} from '${modul}'" },
    { label: 'exp', detail: 'Export', body: 'export const ${name} = $0' },
    { label: 'forof', detail: 'for…of', body: 'for (const ${element} of ${liste}) {\n  $0\n}' },
    { label: 'fore', detail: 'forEach', body: '${liste}.forEach((${element}) => {\n  $0\n})' },
    { label: 'map', detail: 'map', body: '${liste}.map((${element}) => $0)' },
    { label: 'filter', detail: 'filter', body: '${liste}.filter((${element}) => $0)' },
    { label: 'reduce', detail: 'reduce', body: '${liste}.reduce((${acc}, ${element}) => $0, ${start})' },
    { label: 'fetch', detail: 'fetch mit await', body: "const res = await fetch('${url}')\nif (!res.ok) throw new Error(res.statusText)\nconst data = await res.json()$0" },
    { label: 'prom', detail: 'Promise', body: 'new Promise((resolve, reject) => {\n  $0\n})' },
    { label: 'timeout', detail: 'setTimeout', body: 'setTimeout(() => {\n  $0\n}, ${200})' },
    { label: 'switch', detail: 'switch', body: 'switch (${wert}) {\n  case ${1}:\n    $0\n    break\n  default:\n    break\n}' },
    { label: 'destr', detail: 'Destrukturierung', body: 'const { ${a}, ${b} } = ${objekt}$0' },
  ],
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
}

export const javascriptAddon: Addon = {
  id: 'lang.javascript',
  name: 'JavaScript',
  version: '1.0.0',
  description:
    'Syntax, Snippets und Node-/Bun-Ausführung für JavaScript und JSX. npm-, pnpm-, ' +
    'yarn-, bun- und Deno-Projekte mit Skripten als Aufgaben, Vorlagen, tsserver-LSP.',
  icon: 'JS',
  builtin: true,
  category: 'language',
  languages: [javascriptSpec],
  projectKinds: [npmKind, denoKind],
  projectTemplates: [jsNodeTemplate, jsBrowserTemplate],
}
