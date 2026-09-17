import type { Addon, LanguageSpec } from '@/core/types'
import { denoKind, denoTemplate, npmKind, tsLibraryTemplate, tsNodeTemplate, tsViteTemplate } from '../lib/node-project'
import { javascriptSpec, TS_INLAY_HINTS, TS_PREFERENCES, VTSLS_PREFERENCES, VTSLS_SUGGEST } from './javascript'
import { jsDebugTypeScript } from '@/core/debug/adapters'

export const typescriptSpec: LanguageSpec = {
  ...javascriptSpec,
  id: 'typescript',
  name: 'TypeScript',
  extensions: ['.ts', '.tsx', '.mts', '.cts', '.d.ts'],
  filenames: [],
  icon: 'TS',
  color: '#3178c6',
  capitalizedAsType: true,
  keywords: [
    ...(javascriptSpec.keywords ?? []),
    'interface', 'type', 'enum', 'namespace', 'declare', 'abstract', 'implements',
    'public', 'private', 'protected', 'readonly', 'override', 'satisfies',
    'keyof', 'infer', 'asserts', 'is', 'module', 'accessor', 'using',
  ],
  types: [
    'string', 'number', 'boolean', 'object', 'symbol', 'bigint', 'any', 'unknown',
    'never', 'void', 'null', 'undefined', 'Array', 'Readonly', 'Partial',
    'Required', 'Pick', 'Omit', 'Record', 'Exclude', 'Extract', 'ReturnType',
    'Parameters', 'Awaited', 'NonNullable', 'Promise', 'Map', 'Set',
  ],
  snippets: [
    ...(javascriptSpec.snippets ?? []),
    { label: 'iface', detail: 'Interface', body: 'interface ${Name} {\n  $0\n}' },
    { label: 'tp', detail: 'Type-Alias', body: 'type ${Name} = $0' },
    { label: 'enum', detail: 'Enum', body: "enum ${Name} {\n  ${A} = '${a}',\n  $0\n}" },
    { label: 'genfn', detail: 'Generische Funktion', body: 'function ${name}<${T}>(${arg}: ${T}): ${T} {\n  $0\n}' },
    { label: 'guard', detail: 'Type Guard', body: 'function is${Name}(value: unknown): value is ${Name} {\n  return $0\n}' },
    { label: 'asconst', detail: 'as const', body: 'const ${NAME} = [$0] as const' },
    { label: 'record', detail: 'Record-Typ', body: 'type ${Name} = Record<${string}, ${unknown}>' },
    { label: 'partial', detail: 'Optionaler Parameter', body: '${name}?: ${string}' },
    { label: 'generic', detail: 'Generisches Interface', body: 'interface ${Name}<${T}> {\n  ${wert}: ${T}\n}' },
  ],
  run: [
    { label: 'tsx', command: 'npx', args: ['tsx', '${file}'] },
    { label: 'Bun', command: 'bun', args: ['run', '${file}'] },
    { label: 'Deno', command: 'deno', args: ['run', '-A', '${file}'] },
    { label: 'tsc --noEmit', command: 'npx', args: ['tsc', '--noEmit'] },
  ],
  debug: [jsDebugTypeScript],
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
      languageId: 'typescript',
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
      installCommands: {
        linux: 'npm i -g typescript typescript-language-server',
        darwin: 'npm i -g typescript typescript-language-server',
        win32: 'npm i -g typescript typescript-language-server',
      },
      docs: 'https://github.com/typescript-language-server/typescript-language-server',
    },
    {
      label: 'vtsls',
      command: 'vtsls',
      args: ['--stdio'],
      candidates: ['${root}/node_modules/.bin/vtsls', '~/.local/share/nvim/mason/bin/vtsls'],
      languageId: 'typescript',
      rootMarkers: ['tsconfig.json', 'jsconfig.json', 'package.json', '.git'],
      settings: {
        typescript: { inlayHints: TS_INLAY_HINTS, preferences: VTSLS_PREFERENCES, suggest: VTSLS_SUGGEST },
        javascript: { inlayHints: TS_INLAY_HINTS, preferences: VTSLS_PREFERENCES, suggest: VTSLS_SUGGEST },
        vtsls: { autoUseWorkspaceTsdk: true },
      },
      install: 'npm i -g @vtsls/language-server',
      installCommands: {
        linux: 'npm i -g @vtsls/language-server',
        darwin: 'npm i -g @vtsls/language-server',
        win32: 'npm i -g @vtsls/language-server',
      },
      docs: 'https://github.com/yioneko/vtsls',
    },
    {
      label: 'deno lsp',
      command: 'deno',
      args: ['lsp'],
      candidates: ['~/.deno/bin/deno'],
      languageId: 'typescript',
      rootMarkers: ['deno.json', 'deno.jsonc'],
      initializationOptions: { enable: true, lint: true, unstable: false, suggest: { imports: { hosts: { 'https://deno.land': true } } } },
      settings: { deno: { enable: true, lint: true } },
      install: 'curl -fsSL https://deno.land/install.sh | sh',
      installCommands: { linux: 'sh -c "curl -fsSL https://deno.land/install.sh | sh"', darwin: 'brew install deno' },
      docs: 'https://docs.deno.com/runtime/reference/lsp_integration/',
    },
  ],
}

export const typescriptAddon: Addon = {
  id: 'lang.typescript',
  name: 'TypeScript',
  version: '1.0.0',
  description:
    'TypeScript und TSX inklusive Utility-Typen und tsx/Bun/Deno-Runner. Projekte ' +
    'mit npm/pnpm/yarn/bun oder Deno, Vorlagen für Node und Vite, tsserver-LSP.',
  icon: 'TS',
  builtin: true,
  category: 'language',
  languages: [typescriptSpec],
  projectKinds: [npmKind, denoKind],
  projectTemplates: [tsNodeTemplate, tsLibraryTemplate, tsViteTemplate, denoTemplate],
}
