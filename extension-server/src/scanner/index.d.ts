/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type ScanTarget = 'command' | 'extension' | 'project';

export interface Finding {
  /** Stable rule id, e.g. `SEC-CMD-004`. */
  id: string;
  severity: Severity;
  /** `destructive` | `download-exec` | `reverse-shell` | `persistence` | `exfiltration` | `obfuscation` | `privilege` | `supply-chain` | `malware` | `cryptominer` | `ransomware` | `tamper` | `secret` | `custom`. */
  category: string;
  /** Short, English. */
  title: string;
  /** One sentence: why this is dangerous. */
  message: string;
  target: ScanTarget;
  /** File (or `code.main`, `code.renderer`, `page:<id>`, `addon.commands[3]` for extensions; `command` for commands). */
  file?: string;
  /** 1-based. */
  line?: number;
  column?: number;
  /** The offending text, trimmed to at most 160 characters. */
  excerpt?: string;
  /** Stable fingerprint (rule id + file + hash of the matched text) so a user can acknowledge a finding. */
  fingerprint: string;
}

export type Verdict = 'clean' | 'warn' | 'block';

export interface ScanReport {
  /** Sorted by severity, then file, then line; capped at 200. */
  findings: Finding[];
  verdict: Verdict;
  /** Lines, strings or files examined, depending on what was scanned. */
  scanned: number;
  /** Rules that applied to this scan. */
  rules: number;
  /** Input was cut (over 2 MB) or findings were capped. */
  truncated?: boolean;
}

export type FileKind = 'shell' | 'js' | 'json' | 'python' | 'powershell' | 'batch' | 'any';

export interface RuleContext {
  file?: string;
  /** The whole text being scanned (not only the line). */
  text?: string;
  kind?: string;
}

export interface Rule {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  message: string;
  targets: ScanTarget[];
  pattern: RegExp;
  /** Extra check on a match; return false to drop a false positive. */
  confirm?: (match: RegExpExecArray, line: string, context: RuleContext) => boolean;
  /** File kinds the rule applies to. Absent: every kind. Internal kinds exist for structured files. */
  languages?: string[];
  /** `line` (default), `text` (whole text at once) or `command` (normalised and unwrapped first). */
  scope?: 'line' | 'text' | 'command';
  /** Cheap regex source a text must contain for the rule to be run at all. */
  hint?: string;
  /** For `text` rules: report only when the pattern occurs at least this often. */
  minMatches?: number;
  /** Raised by the scanner itself; never matched against text. */
  synthetic?: boolean;
}

export interface ScanOptions {
  /** Extra rules, e.g. compiled with `toRule` from extensions. */
  extraRules?: Rule[];
}

/** Every built-in rule. */
export const RULES: readonly Rule[];

/** Bumped whenever the rules change in a way that should re-check what is already stored. */
export const SCANNER_VERSION: number;

export function scanCommand(input: string | { command: string; args?: string[] }, options?: ScanOptions): ScanReport;

export function scanText(
  text: string,
  options?: { file?: string; kind?: FileKind; target?: ScanTarget; extraRules?: Rule[] },
): ScanReport;

/** An extension manifest as published; the readme is never scanned. */
export function scanManifest(manifest: unknown, options?: ScanOptions): ScanReport;

export function scanProjectFiles(files: { path: string; text: string; size?: number }[], options?: ScanOptions): ScanReport;

/** Which files of a project folder are worth reading, and the limits to read them with. */
export const PROJECT_SCAN: {
  /** Relative paths at the project root, read by exact name. */
  names: string[];
  /** Matched against relative paths (`/` separators) for everything else. */
  globs: RegExp[];
  maxFileBytes: number;
  maxFiles: number;
  ignoredDirs: string[];
  /** Reported by name only; pass `text: ''` for these. */
  executableExtensions: string[];
};

/** Is this relative path one the project scan reads? */
export function isProjectFile(path: string): boolean;

/** `critical` → `block`; otherwise `high` or `medium` → `warn`; otherwise `clean`. */
export function verdictOf(findings: Finding[]): Verdict;

/**
 * Compile a rule an extension supplies as data. The id becomes `${owner}:${spec.id}`.
 * The pattern is compiled case-insensitively. Throws when the spec is malformed or the
 * pattern is unsafe (over 500 characters, nested quantifiers, too many unbounded repeats).
 */
export function toRule(
  spec: { id: string; title: string; severity: Severity; targets: ScanTarget[]; pattern: string; message?: string },
  owner: string,
): Rule;

export function summarize(report: ScanReport): { critical: number; high: number; medium: number; low: number; info: number };
