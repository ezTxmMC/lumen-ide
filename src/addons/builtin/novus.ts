import type { Addon, LanguageSpec } from '@/core/types'
import { novusKind, novusTemplate } from '../lib/lang-projects'

/**
 * Novus (`.nv`) — ezTxmMC's self-hosting language, which compiles to portable
 * C.  https://github.com/ezTxmMC/novus
 *
 * The word lists and regexes follow the compiler:
 *   compiler/lexer/chars.nv      keywords, one- and two-character operators
 *   compiler/parser/*.nv         context-dependent words (define, class, based …)
 *   compiler/codegen/builtins.nv the free builtins
 *   README.md                    the standard modules and the type methods
 */
export const novusSpec: LanguageSpec = {
  id: 'novus',
  name: 'Novus',
  extensions: ['.nv'],
  icon: 'Nv',
  color: '#7c5cff',
  capitalizedAsType: true,
  comments: { line: '//', block: ['/*', '*/'] },

  // Annotations: @Deprecated, @Interface, @Abstract …
  meta: /^@[A-Za-z_][A-Za-z0-9_]*/,

  controls: [
    'if', 'else', 'while', 'for', 'in', 'return', 'break', 'continue',
    'await', 'sync',
  ],

  keywords: [
    // The lexer's keywords
    'package', 'import', 'method', 'var', 'private', 'final',
    // Declarations (the parser)
    'define', 'class', 'interface', 'enum', 'abstract', 'annotation',
    'based', 'construct', 'native', 'variadic', 'get', 'set', 'this',
    // Concurrency
    'async', 'thread', 'virtual',
  ],

  types: [
    'int', 'integer', 'float', 'doub', 'double', 'str', 'string',
    'bool', 'boolean', 'void', 'array', 'map', 'object',
  ],

  constants: ['true', 'false'],

  builtins: [
    // Output statements
    'println', 'print', 'eprintln',
    // The free builtins (without an import)
    'readFile', 'writeFile', 'fileExists', 'removeFile', 'readLine', 'args',
    'parseInt', 'parseFloat', 'chr', 'ord', 'typeOf', 'exec', 'env', 'exit',
    'platform',
    // The standard modules
    'os', 'path', 'json', 'http', 'strings', 'arrays', 'maps', 'math',
    'time', 'random', 'fmt', 'log', 'cli', 'base64', 'hash', 'csv', 'io',
  ],

  // Double quotes only; `${…}` interpolation and \n \t \r \0.
  strings: [{ start: '"', multiline: true, escapes: true, interpolate: '${' }],

  // Whole numbers, hexadecimal and floating point — without an exponent and without separators.
  numbers: /^(?:0[xX][0-9a-fA-F]+|\d+\.\d+|\d+)/,
  identifier: /^[A-Za-z_][A-Za-z0-9_]*/,

  // The two-character operators from isTwoCharOp, then the single characters.
  operators: /^(?:==|!=|<=|>=|&&|\|\||=>|=<|<<|>>|[+\-*/%=<>!&|^:])/,

  completions: [
    // The type methods (String, Array, Map)
    'length', 'charAt', 'substring', 'indexOf', 'contains', 'startsWith',
    'endsWith', 'split', 'replace', 'trim', 'toUpper', 'toLower',
    'append', 'pop', 'insert', 'remove', 'join', 'clear',
    'has', 'keys', 'values', 'get',
    // The thread module
    'mutex', 'channel', 'send', 'recv', 'received', 'close', 'joinAll',
    'sleep', 'cpus',
  ],

  snippets: [
    {
      label: 'main',
      detail: 'Einstiegspunkt',
      body: 'package main\n\nmethod main {\n    println "$0"\n}',
    },
    {
      label: 'mainargs',
      detail: 'main mit Argumenten',
      body: 'method main(array<string> args) {\n    $0\n}',
    },
    {
      label: 'method',
      detail: 'Methode',
      body: 'method ${name}(${integer n}): ${integer} {\n    $0\n}',
    },
    {
      label: 'class',
      detail: 'Klasse mit Konstruktor',
      body:
        'define class ${Name} {\n' +
        '    private final ${string} ${feld}: get, set\n\n' +
        '    construct(${string} ${feld}) {\n' +
        '        this.${feld} = ${feld}\n    }$0\n}',
    },
    {
      label: 'interface',
      detail: 'Interface',
      body: 'define interface ${IName} {\n    ${methode}()$0\n}',
    },
    {
      label: 'enum',
      detail: 'Enum mit Konstruktor',
      body:
        'define enum ${Name} {\n    ${EINS}("${text}"),\n    ${ZWEI}("${text}");\n\n' +
        '    private final str text: get\n\n' +
        '    private construct(str text) {\n        this.text = text;\n    }$0\n}',
    },
    {
      label: 'abstract',
      detail: 'Abstrakte Klasse',
      body: 'define abstract ${Name} {\n    abstract method ${buy}(): ${bool}$0\n}',
    },
    { label: 'for', detail: 'for..in', body: 'for (${element} in ${liste}) {\n    $0\n}' },
    { label: 'while', detail: 'while', body: 'while (${bedingung}) {\n    $0\n}' },
    {
      label: 'async',
      detail: 'async-Methode',
      body: 'async method ${name}(${string arg}): ${string} {\n    return $0\n}',
    },
    { label: 'sync', detail: 'sync-Block', body: 'sync {\n    $0\n}' },
  ],

  indentUnit: 4,

  /**
   * The Novus repository brings no language server along (as things stand).
   * The entries stand here all the same: Lumen checks before starting whether
   * the program lies in the PATH — as long as it is missing, the built-in
   * completion is what is used, with no error message. As soon as there is a
   * server, nothing further is to be done here.
   */
  lsp: [
    {
      label: 'novus-lsp',
      command: 'novus-lsp',
      args: ['--stdio'],
      languageId: 'novus',
      rootMarkers: ['project.nv', '.git'],
      install: 'Noch kein Language-Server im Novus-Repo — Wortlisten greifen weiterhin.',
    },
  ],
  run: [
    { label: 'novusc run', command: 'novusc', args: ['run', '${file}'] },
    { label: 'novusc run (Projekt)', command: 'novusc', args: ['run'] },
    {
      label: 'novusc build',
      command: 'novusc',
      args: ['build', '${file}', '-o', '${fileStem}'],
      then: { command: './${fileStem}', args: [] },
    },
    { label: 'novusc check', command: 'novusc', args: ['check', '${file}'] },
    { label: 'novusc emit (C)', command: 'novusc', args: ['emit', '${file}'] },
  ],
}

export const novusAddon: Addon = {
  id: 'lang.novus',
  name: 'Novus',
  version: '1.0.0',
  description:
    'Novus (.nv): Klassen, Interfaces, Enums, Annotationen, Nebenläufigkeit ' +
    'und String-Interpolation — mit novusc-Runner für run/build/check/emit.',
  icon: 'Nv',
  builtin: true,
  category: 'language',
  languages: [novusSpec],
  projectKinds: [novusKind],
  projectTemplates: [novusTemplate],
}
