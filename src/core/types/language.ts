/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { StringStream } from '@codemirror/language';
import type { LanguageFormat } from '../format-settings';
import type { DebugAdapterConfig } from './debug';
import type { ToolSpec } from './tools';

/* ------------------------------------------------------------------ *
 * Tokens
 * ------------------------------------------------------------------ */

/** Every token kind a theme can colour. */
export const TOKEN_KINDS = [
  'keyword',     // let, class, import …
  'control',     // if, for, return … (own colour for control flow)
  'type',        // int, String, benutzerdefinierte Typen
  'builtin',     // eingebaute Funktionen/Objekte
  'constant',    // true, false, null, PI
  'string',
  'escape',      // \n innerhalb von Strings
  'number',
  'comment',
  'function',    // Aufruf-/Definitionsname
  'variable',
  'property',    // obj.prop, CSS-Eigenschaften
  'operator',
  'punctuation',
  'tag',         // <div>
  'attribute',   // class="…"
  'meta',        // #include, @media, preprocessor
  'regexp',
  'invalid',
] as const;

export type TokenKind = (typeof TOKEN_KINDS)[number];

/* ------------------------------------------------------------------ *
 * Languages
 * ------------------------------------------------------------------ */

export interface StringRule {
  /** Character that opens the string, and closes it too when `end` is absent. */
  start: string;
  end?: string;
  /** May the string span several lines? */
  multiline?: boolean;
  /** Honour backslash escapes? Defaults to true. */
  escapes?: boolean;
  /** What one escape looks like, anchored with `^`; defaults to a backslash and one character. */
  escapePattern?: RegExp;
  /** Colour as `meta` rather than `string` — template literals, say. */
  kind?: TokenKind;
  /**
   * Start of an interpolation, such as `'${'` (Novus, JavaScript) or `'#{'`
   * (Crystal). The start and the matching closing brace are `meta`; what lies
   * between is code, tokenized like any other code of the language.
   */
  interpolate?: string;
}

export interface RunConfig {
  /** Label in the run menu. */
  label: string;
  /** Executable to launch, such as `python3`. */
  command: string;
  /**
   * Arguments. Placeholders:
   *  `${file}` `${fileDir}` `${fileName}` `${fileStem}` `${workspace}`
   */
  args: string[];
  /** Optional second stage (compile, then run). */
  then?: { command: string; args: string[]; };
  /**
   * Run in the nearest folder above the file that holds one of these files
   * (`project.nv` for a Novus program in a sub-project, whose code may read
   * paths relative to its own project) — up to the workspace root; without
   * a match, or without this field, the workspace root is the working folder.
   */
  cwdMarkers?: string[];
}

/**
 * A language server for this language.
 *
 * Lumen never installs anything by itself: if `command` is not on the PATH
 * the server stays off and the status bar shows how to install it. Several
 * entries are tried in order — the first one found wins.
 */
/**
 * How Lumen installs a server into its closed environment under
 * `~/.lumen/lsp` — with its own Node.js, uv/Python and Go, never touching a
 * global npm, pip or the system. The program ends up as a launcher in
 * `~/.lumen/lsp/bin`, which is checked before the PATH.
 *
 *   npm      packages from the npm registry (`["typescript", "typescript-language-server"]`)
 *   pypi     a Python tool through uv, with its own Python (`python: "3.13"`)
 *            and pinned extras (`with: ["pygls<2"]`)
 *   go       `go install module@version`
 *   dotnet   a .NET tool — needs the .NET SDK, which is not downloaded
 *   github   a release asset per `<platform>-<arch>` (a regular expression
 *            on the asset name); `bin` may be a path inside the archive
 *   archive  a download address, per platform or for all
 *
 * `bin` defaults to `command`. `runtime` starts the program through Lumen's
 * Node.js or Python — for scripts such as jdtls' launcher.
 */
export type LspPackage =
  | { type: 'npm'; packages: string[]; bin?: string; }
  | { type: 'pypi'; package: string; python?: string; with?: string[]; bin?: string; }
  | { type: 'go'; module: string; bin?: string; }
  | { type: 'dotnet'; package: string; bin?: string; }
  | { type: 'github'; repo: string; assets: Record<string, string>; bin?: string; version?: string; runtime?: 'python' | 'node'; }
  | { type: 'archive'; url: string | Record<string, string>; bin?: string; runtime?: 'python' | 'node'; executables?: string[]; };

/** System package managers Lumen can drive — the keys of `LspConfig.systemPackages`. */
export type SystemPackageManager =
  | 'pacman' | 'apt' | 'dnf' | 'zypper' | 'apk' | 'xbps' | 'emerge'
  | 'brew' | 'winget' | 'scoop' | 'choco';

/** Package names per system package manager; several packages separated by spaces. */
export type SystemPackages = Partial<Record<SystemPackageManager, string>>;

export interface LspConfig {
  /** Display name, for instance "typescript-language-server". */
  label: string;
  command: string;
  args?: string[];
  /**
   * Further places the server may live when `command` is not on the PATH.
   * Absolute paths, `~` and the placeholders `${root}` (project root),
   * `${home}` and `${dataDir}` are allowed. The first hit becomes the
   * program.
   */
  candidates?: string[];
  /** Extra environment variables for the server process. */
  env?: Record<string, string>;
  /** The LSP `languageId`, when it differs from `LanguageSpec.id`. */
  languageId?: string;
  /**
   * Files or folders that mark the project root (`package.json`, `go.mod`).
   * With no hit the opened folder is used.
   */
  rootMarkers?: string[];
  /**
   * `nearest` (the default) takes the first folder upwards holding a marker.
   * `outermost` takes the highest one within the workspace folder — for build
   * tools with modules (Maven, Gradle), whose server has to see the whole build
   * to resolve one module's classes in another. VCS markers such as `.git`
   * then only count when nothing else is found.
   */
  rootSearch?: 'nearest' | 'outermost';
  initializationOptions?: unknown;
  /** Sent through `workspace/didChangeConfiguration`. */
  settings?: unknown;
  /**
   * Settings derived from the user's editor formatting choices (tab width,
   * tabs or spaces) for servers that carry their own formatter. Merged into
   * `settings`; what `settings` sets itself wins.
   */
  formatSettings?: (format: LanguageFormat) => unknown;
  /** How to install the server, in prose. */
  install?: string;
  /**
   * Install commands per platform. Lumen only runs them when someone clicks
   * in the language-server panel or confirms the install prompt — never on
   * its own.
   */
  installCommands?: Partial<Record<'linux' | 'darwin' | 'win32', string>>;
  /** Installs the server into Lumen's own environment; preferred over `installCommands`. */
  package?: LspPackage;
  /**
   * The package that provides the server in the system's package manager, per
   * manager (`{ pacman: 'clang', apt: 'clangd', brew: 'llvm' }`). Lumen detects
   * the manager itself, builds the command and asks for the administrator
   * password where the manager needs root.
   */
  systemPackages?: SystemPackages;
  /** Link to the server's documentation. */
  docs?: string;
  /** `false`: leave the highlighting to the tokenizer even where the server offers semantic tokens. */
  semanticTokens?: boolean;
  /**
   * One process serving several languages (clangd for C and C++, tsserver
   * for JavaScript and TypeScript). Defaults to true: clients are shared by
   * program and project root.
   */
  shared?: boolean;
}

export interface Snippet {
  label: string;
  detail?: string;
  /** `$0` marks where the cursor lands after insertion. */
  body: string;
  /**
   * Only offered in these files, matched against the file name: an exact name
   * (`project.nv`) or `*.ext`. An entry with a leading `!` excludes instead
   * (`!project.nv`). Without it the snippet is offered in every file of the language.
   */
  files?: string[];
  /**
   * Only offered in these syntax contexts, as the language's `syntaxContext`
   * reports them (Novus: `toplevel`, `class`, `statement`, `expression`; nvh:
   * `nvh_block`, `nvh_template`, `nvh_tag`, `nvh_expr`). Without it the snippet
   * is offered everywhere — also in languages that detect no context.
   */
  scope?: string[];
}

/** Where the cursor sits in the syntax: the innermost context, and whether that is code. */
export interface SyntaxContext {
  /** Name of the innermost context, such as `class` or `nvh_tag`. */
  scope: string;
  /** Novus-like code rather than text or markup — `codeWordPattern` applies there. */
  code: boolean;
}

/** Finds the context at the end of `before`, the document text up to the cursor. Pure. */
export type ContextDetector = (before: string) => SyntaxContext;

/**
 * Text that completes itself while typing: once the cursor sits behind `open`,
 * `before` and `after` are inserted around it. `<?nv` with `before: ' '` and
 * `after: ' ?>'` yields `<?nv  ?>` with the cursor between the spaces.
 */
export interface AutoCloseRule {
  open: string;
  before?: string;
  after: string;
}

/** A snippet an add-on contributes to some other language. */
export interface AddonSnippet extends Snippet {
  languageId: string;
}

/** A tokenizer of your own — only needed for markup and the like. */
export interface CustomTokenizer<S = unknown> {
  startState(): S;
  copyState?(state: S): S;
  token(stream: StringStream, state: S): TokenKind | null;
}

export interface LanguageSpec {
  id: string;
  name: string;
  /** Lower case, with the dot: `['.ts', '.mts']` */
  extensions: string[];
  /** Exact file names without an extension, e.g. `['Makefile', 'Dockerfile']` */
  filenames?: string[];
  /** One or two characters for the file icon. */
  icon?: string;
  /** Accent colour of the language (file icon, status bar). */
  color?: string;

  comments?: {
    line?: string;
    block?: [string, string];
    /**
     * Enter inside `/** … *\/` closes the comment and continues it with ` * `.
     * On by default for languages whose block comment is `/* … *\/`.
     */
    docBlock?: boolean;
  };
  /** Rules that insert a closing text while typing, such as `<?nv` → `<?nv  ?>`. */
  autoClose?: AutoCloseRule[];
  /** Brackets and quotes that close themselves; defaults to `( [ { ' " \``. */
  closeBrackets?: string[];
  /**
   * What a word is — one whole word must match (`/^(?:…)$/`). Drives the word
   * at the cursor, the range completion replaces, double-click selection and
   * Ctrl+arrows. Defaults to letters, digits, `_` and `$`.
   */
  wordPattern?: RegExp;
  /**
   * The word inside code of a mixed language (`<?nv ?>` and `{expr}` of nvh),
   * where `wordPattern` is too wide — it allows `-` for attribute names.
   * Needs `syntaxContext`; otherwise `wordPattern` applies everywhere.
   */
  codeWordPattern?: RegExp;
  /** Tells the syntax context at the cursor — scoped snippets and `codeWordPattern` use it. */
  syntaxContext?: ContextDetector;
  keywords?: string[];
  controls?: string[];
  types?: string[];
  builtins?: string[];
  constants?: string[];

  /** Defaults to `"` and `'`, single-line, with escapes. */
  strings?: StringRule[];
  numbers?: RegExp;
  identifier?: RegExp;
  operators?: RegExp;
  /** Preprocessor directives at the start of a line, `/^#\w+/` for C. */
  meta?: RegExp;
  caseInsensitive?: boolean;
  /** Colour capitalised identifiers as types (Java, Rust, Go …). */
  capitalizedAsType?: boolean;

  /** Characters that indent and outdent. Defaults to `{[(` / `}])` */
  indentOpen?: RegExp;
  indentClose?: RegExp;
  indentUnit?: number;

  /** Extra words for completion. */
  completions?: string[];
  snippets?: Snippet[];
  run?: RunConfig[];
  /** Language servers, most preferred first. */
  lsp?: LspConfig[];
  /** Programs the language needs besides its server — missing ones are offered for install. */
  tools?: ToolSpec[];
  /** Debug adapters, most preferred first. */
  debug?: DebugAdapterConfig[];

  /** Replaces the generic tokenizer outright. */
  tokenizer?: CustomTokenizer<never>;

  /**
   * The language's own formatting conventions — tab width, tabs or spaces —
   * which the editor's indentation follows until the user chooses otherwise.
   */
  format?: Partial<Pick<LanguageFormat, 'tabWidth' | 'useTabs'>>;

  /**
   * Higher wins when several languages claim the same extension (Tailwind
   * ahead of CSS, for instance). Defaults to 0.
   */
  priority?: number;
}

