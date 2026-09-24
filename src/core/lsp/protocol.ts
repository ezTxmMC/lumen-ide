/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The subset of the Language Server Protocol that Lumen uses. */

import { t } from '@/i18n';

export interface Position { line: number; character: number; }
export interface Range { start: Position; end: Position; }
export interface Location { uri: string; range: Range; }
export interface LocationLink {
  originSelectionRange?: Range;
  targetUri: string;
  targetRange: Range;
  targetSelectionRange: Range;
}

export interface TextEdit { range: Range; newText: string; }

export interface DiagnosticRelated { location: Location; message: string; }

export interface Diagnostic {
  range: Range;
  /** 1 error · 2 warning · 3 information · 4 hint */
  severity?: 1 | 2 | 3 | 4;
  code?: string | number;
  source?: string;
  message: string;
  /** 1 Unnecessary · 2 Deprecated */
  tags?: (1 | 2)[];
  relatedInformation?: DiagnosticRelated[];
  data?: unknown;
}

export interface MarkupContent { kind: 'plaintext' | 'markdown'; value: string; }
export type MarkedString = string | { language: string; value: string; };

export interface Hover {
  contents: MarkupContent | MarkedString | MarkedString[];
  range?: Range;
}

export const COMPLETION_KIND = [
  '', 'Text', 'Methode', 'Funktion', 'Konstruktor', 'Feld', 'Variable',
  'Klasse', 'Interface', 'Modul', 'Eigenschaft', 'Einheit', 'Wert', 'Enum',
  'Schlüsselwort', 'Snippet', 'Farbe', 'Datei', 'Referenz', 'Ordner',
  'Enum-Wert', 'Konstante', 'Struct', 'Ereignis', 'Operator', 'Typparameter',
] as const;

/** LSP CompletionItemKind → CodeMirror symbol type. */
export const COMPLETION_ICON: Record<number, string> = {
  1: 'text', 2: 'method', 3: 'function', 4: 'function', 5: 'property',
  6: 'variable', 7: 'class', 8: 'interface', 9: 'namespace', 10: 'property',
  11: 'constant', 12: 'constant', 13: 'enum', 14: 'keyword', 15: 'snippet',
  16: 'constant', 17: 'text', 18: 'text', 19: 'text', 20: 'enum',
  21: 'constant', 22: 'class', 23: 'variable', 24: 'operator', 25: 'type',
};

export interface CompletionItem {
  label: string;
  labelDetails?: { detail?: string; description?: string; };
  kind?: number;
  detail?: string;
  documentation?: string | MarkupContent;
  sortText?: string;
  filterText?: string;
  insertText?: string;
  /** 1 = plain text, 2 = a snippet with `$1` placeholders */
  insertTextFormat?: 1 | 2;
  /** 1 = the editor adjusts the indentation of continuation lines, 2 = it keeps them as sent */
  insertTextMode?: 1 | 2;
  textEdit?: { range?: Range; insert?: Range; replace?: Range; newText: string; };
  /** With `itemDefaults.editRange`: the text of the edit — `LspClient` folds it into `textEdit`. */
  textEditText?: string;
  additionalTextEdits?: TextEdit[];
  commitCharacters?: string[];
  command?: LspCommand;
  preselect?: boolean;
  deprecated?: boolean;
  tags?: number[];
  data?: unknown;
}

/** What `completionList.itemDefaults` may carry — the fields the client declares. */
export interface CompletionItemDefaults {
  commitCharacters?: string[];
  editRange?: Range | { insert: Range; replace: Range; };
  insertTextFormat?: 1 | 2;
  insertTextMode?: 1 | 2;
  data?: unknown;
}

export interface CompletionList {
  isIncomplete: boolean;
  items: CompletionItem[];
  itemDefaults?: CompletionItemDefaults;
  /**
   * Set by `LspClient.completion` when the request failed: the empty list is
   * no answer — `isIncomplete` is true so nothing caches it as final.
   */
  failed?: boolean;
}

/**
 * The list with its `itemDefaults` written into every item, so consumers never
 * see an undefined default. jdtls relies on it: with `editRange` the items
 * carry no `textEdit` and the real text (`substring(${1:beginIndex})`) sits in
 * `textEditText`. A field the item has itself wins.
 */
export function applyItemDefaults(list: CompletionList): CompletionList {
  const defaults = list.itemDefaults;
  if (!defaults) {
    return list;
  }
  const range = defaults.editRange;
  const items = list.items.map((item) => {
    const out: CompletionItem = { ...item };
    out.commitCharacters ??= defaults.commitCharacters;
    out.insertTextFormat ??= defaults.insertTextFormat;
    out.insertTextMode ??= defaults.insertTextMode;
    out.data ??= defaults.data;
    if (out.textEdit || !range) {
      return out;
    }
    const newText = out.textEditText ?? out.insertText ?? out.label;
    out.textEdit = 'start' in range ? { range, newText } : { insert: range.insert, replace: range.replace, newText };
    delete out.textEditText;
    return out;
  });
  return { ...list, items, itemDefaults: undefined };
}

/** A JSON-RPC error answer — the `code` decides whether asking again makes sense. */
export class LspError extends Error {
  readonly code: number | undefined;

  constructor(message: string, code?: number) {
    super(message);
    this.name = 'LspError';
    this.code = code;
  }
}

/**
 * -32800 RequestCancelled, -32801 ContentModified (the document moved on while
 * the server worked), -32802 ServerCancelled: the server did not fail, the
 * answer was overtaken — the same request usually succeeds a moment later.
 */
export const RETRYABLE_CODES: ReadonlySet<number> = new Set([-32800, -32801, -32802]);

export function isRetryable(error: unknown): boolean {
  return error instanceof LspError && error.code !== undefined && RETRYABLE_CODES.has(error.code);
}

/**
 * The candidate `organizeImports` takes for an ambiguous simple name (jdtls
 * `java.action.organizeImports.chooseImports`): java.util first (List, Date,
 * Map), then the rest of java/javax, then library types, JDK internals last;
 * ties keep the server's order, so the choice is deterministic.
 */
export function pickImportCandidate<T extends { fullyQualifiedName: string; }>(candidates: T[]): T | null {
  const rank = (name: string): number => {
    if (/^java\.util\.[A-Z]/.test(name)) {
      return 0;
    }
    if (/^javax?\./.test(name)) {
      return 1;
    }
    if (/^(sun|com\.sun|jdk|org\.w3c|org\.xml)\./.test(name)) {
      return 3;
    }
    return 2;
  };
  let best: T | null = null;
  for (const candidate of candidates) {
    if (!best || rank(candidate.fullyQualifiedName) < rank(best.fullyQualifiedName)) {
      best = candidate;
    }
  }
  return best;
}

export interface ParameterInformation {
  label: string | [number, number];
  documentation?: string | MarkupContent;
}

export interface SignatureInformation {
  label: string;
  documentation?: string | MarkupContent;
  parameters?: ParameterInformation[];
  activeParameter?: number;
}

export interface SignatureHelp {
  signatures: SignatureInformation[];
  activeSignature?: number;
  activeParameter?: number;
}

/* ------------------------------------------------------------------ *
 * Symbols
 * ------------------------------------------------------------------ */

const SYMBOL_KIND_KEYS = [
  '', 'file', 'module', 'namespace', 'package', 'class', 'method', 'property',
  'field', 'constructor', 'enum', 'interface', 'function', 'variable',
  'constant', 'string', 'number', 'boolean', 'array', 'object', 'key',
  'null', 'enumMember', 'struct', 'event', 'operator', 'typeParameter',
] as const;

/** Readable name of an LSP symbol kind, in the interface language. */
export function symbolKindLabel(kind: number): string {
  const key = SYMBOL_KIND_KEYS[kind];
  return key ? t(`symbols.${key}`) : '';
}

/** A short glyph per SymbolKind, for the outline and the palettes. */
export const SYMBOL_GLYPH: Record<number, string> = {
  1: 'F', 2: 'M', 3: 'N', 4: 'P', 5: 'C', 6: 'm', 7: 'p', 8: 'f', 9: 'c',
  10: 'E', 11: 'I', 12: 'ƒ', 13: 'v', 14: 'K', 15: 's', 16: '#', 17: 'b',
  18: '[]', 19: '{}', 20: 'k', 21: '∅', 22: 'e', 23: 'S', 24: 'ev', 25: 'op',
  26: 'T',
};

export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: number;
  deprecated?: boolean;
  tags?: number[];
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

export interface SymbolInformation {
  name: string;
  kind: number;
  deprecated?: boolean;
  location: Location;
  containerName?: string;
}

export interface WorkspaceSymbol {
  name: string;
  kind: number;
  containerName?: string;
  location: Location | { uri: string; };
  data?: unknown;
}

/* ------------------------------------------------------------------ *
 * Edits and actions
 * ------------------------------------------------------------------ */

export interface OptionalVersionedTextDocumentIdentifier { uri: string; version?: number | null; }

export interface TextDocumentEdit {
  textDocument: OptionalVersionedTextDocumentIdentifier;
  edits: TextEdit[];
}

export interface CreateFile { kind: 'create'; uri: string; options?: { overwrite?: boolean; ignoreIfExists?: boolean; }; }
export interface RenameFile { kind: 'rename'; oldUri: string; newUri: string; options?: { overwrite?: boolean; ignoreIfExists?: boolean; }; }
export interface DeleteFile { kind: 'delete'; uri: string; options?: { recursive?: boolean; ignoreIfNotExists?: boolean; }; }

export interface WorkspaceEdit {
  changes?: Record<string, TextEdit[]>;
  documentChanges?: (TextDocumentEdit | CreateFile | RenameFile | DeleteFile)[];
}

export interface LspCommand {
  title: string;
  command: string;
  arguments?: unknown[];
}

export interface CodeAction {
  title: string;
  kind?: string;
  diagnostics?: Diagnostic[];
  isPreferred?: boolean;
  disabled?: { reason: string; };
  edit?: WorkspaceEdit;
  command?: LspCommand;
  data?: unknown;
}

export interface DocumentHighlight {
  range: Range;
  /** 1 text · 2 read · 3 write */
  kind?: 1 | 2 | 3;
}

export interface InlayHintLabelPart {
  value: string;
  tooltip?: string | MarkupContent;
  location?: Location;
}

export interface InlayHint {
  position: Position;
  label: string | InlayHintLabelPart[];
  /** 1 type · 2 parameter */
  kind?: 1 | 2;
  textEdits?: TextEdit[];
  tooltip?: string | MarkupContent;
  paddingLeft?: boolean;
  paddingRight?: boolean;
  data?: unknown;
}

export interface PrepareRenameResult {
  range: Range;
  placeholder?: string;
}

/* ------------------------------------------------------------------ *
 * Window and progress
 * ------------------------------------------------------------------ */

/** 1 error · 2 warning · 3 info · 4 log · 5 debug */
export type MessageType = 1 | 2 | 3 | 4 | 5;

export interface ShowMessageParams { type: MessageType; message: string; }
export interface ShowMessageRequestParams extends ShowMessageParams {
  actions?: { title: string; }[];
}

export interface ProgressParams {
  token: string | number;
  value: {
    kind: 'begin' | 'report' | 'end';
    title?: string;
    message?: string;
    percentage?: number;
    cancellable?: boolean;
  };
}

/** Sent by jdtls: startup phase, errors, readiness. */
export interface JavaStatus {
  type: 'Starting' | 'Started' | 'Error' | 'Message' | 'ServiceReady' | 'ProjectStatus' | string;
  message: string;
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** Pulls plain text out of the protocol's various markup shapes. */
export function plainText(
  value: string | MarkupContent | MarkedString | MarkedString[] | undefined,
): string {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(plainText).join('\n\n');
  }
  if ('kind' in value) {
    return value.value;
  }
  if ('value' in value) {
    return value.value;
  }
  return '';
}

/**
 * Like `plainText`, but code sections (a `MarkedString` with a language) keep
 * their Markdown fence so the renderer sets them as code.
 */
export function toMarkdown(
  value: string | MarkupContent | MarkedString | MarkedString[] | undefined,
): string {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(toMarkdown).join('\n\n');
  }
  if ('kind' in value) {
    return value.kind === 'plaintext' ? escapeMarkdown(value.value) : value.value;
  }
  if ('language' in value) {
    return `\`\`\`${value.language}\n${value.value}\n\`\`\``;
  }
  return '';
}

function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_{}[\]#])/g, '\\$1');
}

/** File path → a `file://` URI. */
export function pathToUri(filePath: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(filePath) && !filePath.startsWith('file://')) {
    return filePath;
  }
  const normalized = filePath.replace(/\\/g, '/');
  const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `file://${withSlash.split('/').map(encodeURIComponent).join('/').replace(/^%2F/, '/')}`;
}

/** A `file://` URI → file path. Other schemes (jdt://) are left alone. */
export function uriToPath(uri: string): string {
  if (!uri.startsWith('file://')) {
    return uri;
  }
  const withoutScheme = decodeURIComponent(uri.slice('file://'.length));
  // Windows: file:///C:/x → C:/x
  return /^\/[A-Za-z]:/.test(withoutScheme) ? withoutScheme.slice(1) : withoutScheme;
}

/** Is this a “real” file, or a virtual document (jdt://, deno:)? */
export function isVirtualUri(uri: string): boolean {
  // Windows drives (`C:\…`, `C:/…`) are file paths, not schemes.
  if (/^[a-z]:[\\/]/i.test(uri)) {
    return false;
  }
  return /^[a-z][a-z0-9+.-]*:/i.test(uri) && !uri.startsWith('file://');
}

/** Comparison for sorting by position. */
export function comparePosition(a: Position, b: Position): number {
  return a.line - b.line || a.character - b.character;
}

/** Does `range` contain the position? */
export function rangeContains(range: Range, pos: Position): boolean {
  return comparePosition(range.start, pos) <= 0 && comparePosition(pos, range.end) <= 0;
}

/** Normalises definition answers (Location, Location[], LocationLink[]). */
export function toLocations(
  result: Location | Location[] | LocationLink[] | null | undefined,
): Location[] {
  if (!result) {
    return [];
  }
  const list = Array.isArray(result) ? result : [result];
  return list.map((item) =>
    'targetUri' in item
      ? { uri: item.targetUri, range: item.targetSelectionRange ?? item.targetRange }
      : item,
  );
}
