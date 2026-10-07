/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/* ------------------------------------------------------------------ *
 * Effects
 * ------------------------------------------------------------------ */

export interface Effects {
  /** Transitions and fades, globally on or off. */
  animations: boolean;
  /** 0.4 = quick, 2 = sluggish. */
  animationSpeed: number;
  /** `reduced`: fades only · `normal` · `rich`: staggered lists, hover lift, springs on top. */
  animationLevel: 'reduced' | 'normal' | 'rich';
  /** Frosted-glass blur behind panels and overlays. */
  glass: boolean;
  /** A soft accent glow on active elements. */
  glow: boolean;
  shadows: boolean;
  /** Corner radius in px. */
  radius: number;
  /** Compact or airy spacing. */
  density: 'compact' | 'comfortable';
  /** Background transparency of the panels (0 = opaque). */
  transparency: number;

  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  ligatures: boolean;
  smoothCaret: boolean;
  cursorBlink: boolean;
  /** Text cursor: a line between characters, a block over the character, or an underline. */
  cursorStyle: 'line' | 'block' | 'underline';
  /** Thickness of the line in px (1–4). */
  cursorWidth: number;
  /** Language servers, globally on or off. */
  lsp: boolean;
  /** Inlay hints (parameter names, types) from the language server. */
  inlayHints: boolean;
  /** Signature help while typing `(` and `,`. */
  signatureHelp: boolean;
  /** Semantic colours from the language server, laid over the tokenizer's. */
  semanticTokens: boolean;
  /** Highlight occurrences of the symbol under the cursor. */
  documentHighlight: boolean;
  /** Format through the language server on save. */
  formatOnSave: boolean;
  /** Organise imports on save (source.organizeImports). */
  organizeImportsOnSave: boolean;
  /** Remember open files per project and restore them. */
  restoreOpenFiles: boolean;
  /** On start, open the last project instead of showing the project screen. */
  reopenLastProject: boolean;
  /** Where a project chosen from the switcher opens: ask each time, this window, or a new one. */
  openProjectsIn: 'ask' | 'this' | 'new';
  /** Start the project's language servers as soon as it opens, before any file is. */
  lspAutoStart: boolean;
  /** Fetch every Gradle task (`gradle tasks --all`) in the background when a project has none cached. */
  gradleTasksOnOpen: boolean;
  /** Look through a project's manifests, scripts and hooks for malware and dangerous commands when it opens. */
  securityScan: boolean;
  /**
   * Let jdtls check Java with javac (its javac backend) instead of the Eclipse
   * compiler, where it can — the same verdicts as the build. The backend's
   * class-cache bug is repaired by `electron/features/jdtls-agent.ts`.
   */
  javacBackend: boolean;
  /** Shell for new terminals (a path, or an id such as `fish`); empty = the default shell. */
  terminalShell: string;
  terminalFontSize: number;
  terminalCursor: 'block' | 'bar' | 'underline';
  /** Copy a terminal selection to the clipboard straight away. */
  terminalCopyOnSelect: boolean;
  /** Preferred external terminal program (its id); empty = the first one found. */
  externalTerminal: string;
  showLineNumbers: boolean;
  showIndentGuides: boolean;
  highlightActiveLine: boolean;
  wordWrap: boolean;
  /** Close brackets and quotes as they are typed. */
  autoCloseBrackets: boolean;
  /** Add the closing tag when an HTML/JSX tag is opened. */
  autoCloseTags: boolean;
  /** Minimap along the right edge of the editor. */
  minimap: boolean;
  /** Minimap: characters as blocks rather than as type. */
  minimapRenderCharacters: boolean;
  /** Minimap: width in px. */
  minimapWidth: number;
  /** Show fold markers only while hovering the gutter. */
  foldingOnHover: boolean;
  /** Collapse packages in the explorer into one row (`com.example.project`). */
  compactPackages: boolean;
  /** List build output folders (build, dist, out, target, bin, obj) in the explorer. */
  showBuildFolders: boolean;
  /** Window system on Linux: `auto` uses Wayland where available. Takes effect after a restart. */
  windowSystem: 'auto' | 'wayland' | 'x11';
  /** Look for updates in the background, download them and apply them on exit. */
  autoUpdate: boolean;

  /** Custom CSS, inserted last, overriding everything. */
  customCss: string;
}

export const DEFAULT_EFFECTS: Effects = {
  animations: true,
  animationSpeed: 1,
  animationLevel: 'normal',
  glass: true,
  glow: true,
  shadows: true,
  radius: 10,
  density: 'comfortable',
  transparency: 0,
  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace",
  fontSize: 13,
  lineHeight: 1.6,
  ligatures: true,
  smoothCaret: true,
  cursorBlink: true,
  cursorStyle: 'line',
  cursorWidth: 2,
  lsp: true,
  inlayHints: true,
  signatureHelp: true,
  documentHighlight: true,
  semanticTokens: true,
  formatOnSave: false,
  organizeImportsOnSave: false,
  restoreOpenFiles: true,
  reopenLastProject: false,
  openProjectsIn: 'ask',
  lspAutoStart: true,
  gradleTasksOnOpen: true,
  securityScan: true,
  javacBackend: true,
  terminalShell: '',
  terminalFontSize: 13,
  terminalCursor: 'bar',
  terminalCopyOnSelect: false,
  externalTerminal: '',
  showLineNumbers: true,
  showIndentGuides: true,
  highlightActiveLine: true,
  wordWrap: false,
  autoCloseBrackets: true,
  autoCloseTags: true,
  minimap: true,
  minimapRenderCharacters: false,
  minimapWidth: 96,
  foldingOnHover: false,
  compactPackages: true,
  showBuildFolders: true,
  windowSystem: 'auto',
  autoUpdate: true,
  customCss: '',
};
