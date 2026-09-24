/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/**
 * Keyboard shortcuts: presets, custom bindings, and recognising key sequences.
 *
 * A binding is a string of one or two chords:
 *   `Ctrl+Shift+P`, `F12`, `Ctrl+K Ctrl+S`, `Shift Shift` (Shift pressed twice).
 * `Ctrl` means Command on macOS. Keys are named either as on a US keyboard
 * (`/`, `[`, `` ` ``) or by the character produced (`Ö`) — both are recognised,
 * so shortcuts work on German keyboards too.
 */

import { getLanguage } from '@/i18n';

export type PresetId = 'lumen' | 'jetbrains' | 'vscode' | 'visualstudio' | 'eclipse';

export const PRESETS: { id: PresetId; name: string; }[] = [
  { id: 'lumen', name: 'Lumen IDE' },
  { id: 'jetbrains', name: 'JetBrains (IntelliJ IDEA)' },
  { id: 'vscode', name: 'Visual Studio Code' },
  { id: 'visualstudio', name: 'Visual Studio' },
  { id: 'eclipse', name: 'Eclipse' },
];

/** Command id → bindings. */
export type BindingMap = Record<string, string[]>;

/** A modifier key struck twice (IntelliJ's “Search Everywhere”). */
export const DOUBLE_SHIFT = 'Shift Shift';

/* ------------------------------------------------------------------ *
 * Presets
 * ------------------------------------------------------------------ */

const LUMEN: BindingMap = {
  'search.everywhere': [DOUBLE_SHIFT],
  'search.files': ['Ctrl+Shift+N'],
  'search.actions': ['Ctrl+Shift+A'],
  'view.commandPalette': ['Ctrl+Shift+P', 'F1'],
  'file.quickOpen': ['Ctrl+P'],
  'editor.workspaceSymbols': ['Ctrl+T'],
  'editor.symbols': ['Ctrl+Shift+O'],
  'file.save': ['Ctrl+S'],
  'file.saveAll': ['Ctrl+Alt+S'],
  'file.open': ['Ctrl+O'],
  'file.new': ['Ctrl+N'],
  'file.closeTab': ['Ctrl+W'],
  'tabs.reopenClosed': ['Ctrl+Shift+T'],
  'tabs.next': ['Ctrl+Tab'],
  'tabs.previous': ['Ctrl+Shift+Tab'],
  'project.new': ['Ctrl+Alt+N'],
  'project.tasks': ['Ctrl+Alt+R'],
  'project.panel': ['Ctrl+Shift+J'],
  'project.build': ['Ctrl+Shift+B'],
  'project.run': ['F5'],
  'project.test': ['Ctrl+Shift+F5'],
  'run.file': ['Ctrl+F5'],
  'view.explorer': ['Ctrl+Shift+E'],
  'view.search': ['Ctrl+Shift+F'],
  'view.addons': ['Ctrl+Shift+X'],
  'view.problems': ['Ctrl+Shift+M'],
  'view.sidebar': ['Ctrl+B'],
  'view.panel': ['Ctrl+J'],
  'view.settings': ['Ctrl+,'],
  'view.keybindings': ['Ctrl+K Ctrl+S'],
  'view.themes': ['Ctrl+K Ctrl+T'],
  'view.splitRight': ['Ctrl+\\'],
  'view.splitDown': ['Ctrl+K Ctrl+\\'],
  'view.focusNextGroup': ['Ctrl+K Ctrl+Right'],
  'view.moveTabToOtherGroup': ['Ctrl+K Ctrl+M'],
  'editor.moveTabToNewWindow': ['Ctrl+K Ctrl+E'],
  'editor.dockWindowBack': ['Ctrl+K Ctrl+H'],
  'view.popOutView': ['Ctrl+K Ctrl+V'],
  'view.minimap': ['Ctrl+K Ctrl+N'],
  'terminal.toggle': ['Ctrl+`', 'Ctrl+Ö', 'Alt+F12'],
  'terminal.new': ['Ctrl+Shift+`'],
  'effects.zoomIn': ['Ctrl+=', 'Ctrl++'],
  'effects.zoomOut': ['Ctrl+-'],
  'effects.zoomReset': ['Ctrl+0'],
  'editor.definition': ['F12'],
  'editor.implementation': ['Ctrl+F12'],
  'editor.typeDefinition': ['Ctrl+Shift+F12'],
  'editor.declaration': ['Ctrl+Alt+F12'],
  'editor.references': ['Shift+F12'],
  'editor.rename': ['F2'],
  'editor.codeActions': ['Ctrl+.', 'Alt+Enter'],
  'editor.format': ['Ctrl+Alt+L'],
  'editor.organizeImports': ['Ctrl+Alt+O'],
  'editor.signature': ['Ctrl+Shift+Space'],
  'editor.triggerSuggest': ['Ctrl+Space'],
  'editor.undo': ['Ctrl+Z'],
  'editor.redo': ['Ctrl+Shift+Z', 'Ctrl+Y'],
  'editor.toggleComment': ['Ctrl+/'],
  'editor.toggleBlockComment': ['Ctrl+Shift+/', 'Shift+Alt+A'],
  'editor.copyLineDown': ['Shift+Alt+Down'],
  'editor.copyLineUp': ['Shift+Alt+Up'],
  'editor.deleteLine': ['Ctrl+Shift+K'],
  'editor.moveLineUp': ['Alt+Up'],
  'editor.moveLineDown': ['Alt+Down'],
  'editor.selectLine': ['Alt+L'],
  'editor.expandSelection': ['Ctrl+I', 'Shift+Alt+Right'],
  'editor.addCursorAbove': ['Ctrl+Alt+Up'],
  'editor.addCursorBelow': ['Ctrl+Alt+Down'],
  'editor.selectNextOccurrence': ['Ctrl+D'],
  'editor.selectAllOccurrences': ['Ctrl+Shift+L'],
  'editor.gotoLine': ['Ctrl+G'],
  'editor.fold': ['Ctrl+Shift+[', 'Ctrl+NumpadSubtract'],
  'editor.unfold': ['Ctrl+Shift+]', 'Ctrl+NumpadAdd'],
  'editor.foldAll': ['Ctrl+Alt+[', 'Ctrl+Shift+NumpadSubtract'],
  'editor.unfoldAll': ['Ctrl+Alt+]', 'Ctrl+Shift+NumpadAdd'],
  'editor.indent': ['Ctrl+]'],
  'editor.outdent': ['Ctrl+['],
  'editor.find': ['Ctrl+F'],
  'editor.replace': ['Ctrl+H', 'Ctrl+R'],
  'editor.findNext': ['F3'],
  'editor.findPrevious': ['Shift+F3'],
  'editor.jumpToBracket': ['Ctrl+Shift+\\'],
  'editor.insertLineBelow': ['Ctrl+Enter'],
  'editor.insertLineAbove': ['Ctrl+Shift+Enter'],
  'editor.upperCase': ['Ctrl+Shift+U'],
  'debug.toggleBreakpoint': ['F9'],
  'debug.start': ['Shift+F9'],
  'debug.continue': ['F5'],
  'debug.stepOver': ['F10', 'F8'],
  'debug.stepInto': ['F11', 'F7'],
  'debug.stepOut': ['Shift+F11', 'Shift+F8'],
  'debug.stop': ['Shift+F5', 'Ctrl+F2'],
  'debug.restart': ['Ctrl+Shift+F9'],
  'debug.runToCursor': ['Alt+F9'],
  'nav.back': ['Ctrl+Alt+-'],
  'nav.forward': ['Ctrl+Shift+-'],
  'editor.shrinkSelection': ['Shift+Alt+Left'],
};

const JETBRAINS: BindingMap = {
  'search.everywhere': [DOUBLE_SHIFT],
  'search.files': ['Ctrl+Shift+N'],
  'search.actions': ['Ctrl+Shift+A'],
  'file.quickOpen': ['Ctrl+E'],
  'editor.workspaceSymbols': ['Ctrl+Alt+Shift+N'],
  'editor.symbols': ['Ctrl+F12'],
  'file.save': ['Ctrl+S'],
  'file.closeTab': ['Ctrl+F4'],
  'tabs.reopenClosed': ['Ctrl+Shift+T'],
  'tabs.next': ['Alt+Right', 'Ctrl+Tab'],
  'tabs.previous': ['Alt+Left', 'Ctrl+Shift+Tab'],
  'project.build': ['Ctrl+F9'],
  'project.run': ['Shift+F10'],
  'run.file': ['Ctrl+Shift+F10'],
  'project.test': ['Alt+Shift+F10'],
  'project.panel': ['Alt+1'],
  'view.explorer': ['Alt+Shift+1'],
  'view.search': ['Ctrl+Shift+F'],
  'view.problems': ['Alt+6'],
  'view.sidebar': ['Ctrl+Shift+F12'],
  'view.settings': ['Ctrl+Alt+S'],
  'view.commandPalette': ['Ctrl+Shift+P'],
  'terminal.toggle': ['Alt+F12'],
  'editor.definition': ['Ctrl+B'],
  'editor.implementation': ['Ctrl+Alt+B'],
  'editor.typeDefinition': ['Ctrl+Shift+B'],
  'editor.references': ['Alt+F7'],
  'editor.rename': ['Shift+F6'],
  'editor.codeActions': ['Alt+Enter'],
  'editor.format': ['Ctrl+Alt+L'],
  'editor.organizeImports': ['Ctrl+Alt+O'],
  'editor.signature': ['Ctrl+P'],
  'editor.triggerSuggest': ['Ctrl+Space'],
  'editor.undo': ['Ctrl+Z'],
  'editor.redo': ['Ctrl+Shift+Z'],
  'editor.toggleComment': ['Ctrl+/'],
  'editor.toggleBlockComment': ['Ctrl+Shift+/'],
  'editor.copyLineDown': ['Ctrl+D'],
  'editor.deleteLine': ['Ctrl+Y'],
  'editor.moveLineUp': ['Alt+Shift+Up'],
  'editor.moveLineDown': ['Alt+Shift+Down'],
  'editor.expandSelection': ['Ctrl+W'],
  'editor.selectNextOccurrence': ['Alt+J'],
  'editor.selectAllOccurrences': ['Ctrl+Alt+Shift+J'],
  'editor.gotoLine': ['Ctrl+G'],
  'editor.fold': ['Ctrl+-'],
  'editor.unfold': ['Ctrl+='],
  'editor.foldAll': ['Ctrl+Shift+-'],
  'editor.unfoldAll': ['Ctrl+Shift+='],
  'editor.find': ['Ctrl+F'],
  'editor.replace': ['Ctrl+R'],
  'editor.findNext': ['F3'],
  'editor.findPrevious': ['Shift+F3'],
  'editor.jumpToBracket': ['Ctrl+Shift+M'],
  'editor.insertLineBelow': ['Shift+Enter'],
  'editor.insertLineAbove': ['Ctrl+Alt+Enter'],
  'editor.upperCase': ['Ctrl+Shift+U'],
  'editor.joinLines': ['Ctrl+Shift+J'],
  'debug.toggleBreakpoint': ['Ctrl+F8'],
  'debug.start': ['Shift+F9'],
  'debug.continue': ['F9'],
  'debug.stepOver': ['F8'],
  'debug.stepInto': ['F7'],
  'debug.stepOut': ['Shift+F8'],
  'debug.stop': ['Ctrl+F2'],
  'debug.restart': ['Ctrl+F5'],
  'debug.runToCursor': ['Alt+F9'],
  'nav.back': ['Ctrl+Alt+Left'],
  'nav.forward': ['Ctrl+Alt+Right'],
  'editor.shrinkSelection': ['Ctrl+Shift+W'],
};

const VSCODE: BindingMap = {
  'view.commandPalette': ['Ctrl+Shift+P', 'F1'],
  'file.quickOpen': ['Ctrl+P'],
  'editor.workspaceSymbols': ['Ctrl+T'],
  'editor.symbols': ['Ctrl+Shift+O'],
  'file.save': ['Ctrl+S'],
  'file.saveAll': ['Ctrl+K S'],
  'file.open': ['Ctrl+K Ctrl+O'],
  'file.new': ['Ctrl+N'],
  'file.closeTab': ['Ctrl+W', 'Ctrl+F4'],
  'file.closeAll': ['Ctrl+K Ctrl+W'],
  'tabs.reopenClosed': ['Ctrl+Shift+T'],
  'tabs.next': ['Ctrl+Tab', 'Ctrl+PageDown'],
  'tabs.previous': ['Ctrl+Shift+Tab', 'Ctrl+PageUp'],
  'project.build': ['Ctrl+Shift+B'],
  'project.run': ['Ctrl+F5'],
  'view.explorer': ['Ctrl+Shift+E'],
  'view.search': ['Ctrl+Shift+F'],
  'view.addons': ['Ctrl+Shift+X'],
  'view.problems': ['Ctrl+Shift+M'],
  'view.output': ['Ctrl+Shift+U'],
  'view.sidebar': ['Ctrl+B'],
  'view.panel': ['Ctrl+J'],
  'view.settings': ['Ctrl+,'],
  'view.keybindings': ['Ctrl+K Ctrl+S'],
  'view.themes': ['Ctrl+K Ctrl+T'],
  'view.splitRight': ['Ctrl+\\'],
  'view.focusGroup1': ['Ctrl+1'],
  'view.focusGroup2': ['Ctrl+2'],
  'terminal.toggle': ['Ctrl+`'],
  'terminal.new': ['Ctrl+Shift+`'],
  'effects.zoomIn': ['Ctrl+='],
  'effects.zoomOut': ['Ctrl+-'],
  'effects.zoomReset': ['Ctrl+NumpadNumber0'],
  'editor.definition': ['F12'],
  'editor.implementation': ['Ctrl+F12'],
  'editor.references': ['Shift+F12', 'Shift+Alt+F12'],
  'editor.rename': ['F2'],
  'editor.codeActions': ['Ctrl+.'],
  'editor.format': ['Ctrl+Shift+I'],
  'editor.organizeImports': ['Shift+Alt+O'],
  'editor.signature': ['Ctrl+Shift+Space'],
  'editor.triggerSuggest': ['Ctrl+Space'],
  'editor.undo': ['Ctrl+Z'],
  'editor.redo': ['Ctrl+Y', 'Ctrl+Shift+Z'],
  'editor.toggleComment': ['Ctrl+/'],
  'editor.toggleBlockComment': ['Ctrl+Shift+A'],
  'editor.copyLineDown': ['Shift+Alt+Down'],
  'editor.copyLineUp': ['Shift+Alt+Up'],
  'editor.deleteLine': ['Ctrl+Shift+K'],
  'editor.moveLineUp': ['Alt+Up'],
  'editor.moveLineDown': ['Alt+Down'],
  'editor.selectLine': ['Ctrl+L'],
  'editor.expandSelection': ['Shift+Alt+Right'],
  'editor.addCursorAbove': ['Ctrl+Shift+Up'],
  'editor.addCursorBelow': ['Ctrl+Shift+Down'],
  'editor.selectNextOccurrence': ['Ctrl+D'],
  'editor.selectAllOccurrences': ['Ctrl+Shift+L'],
  'editor.gotoLine': ['Ctrl+G'],
  'editor.fold': ['Ctrl+Shift+['],
  'editor.unfold': ['Ctrl+Shift+]'],
  'editor.foldAll': ['Ctrl+K Ctrl+0'],
  'editor.unfoldAll': ['Ctrl+K Ctrl+J'],
  'editor.indent': ['Ctrl+]'],
  'editor.outdent': ['Ctrl+['],
  'editor.find': ['Ctrl+F'],
  'editor.replace': ['Ctrl+H'],
  'editor.findNext': ['F3'],
  'editor.findPrevious': ['Shift+F3'],
  'editor.jumpToBracket': ['Ctrl+Shift+\\'],
  'editor.insertLineBelow': ['Ctrl+Enter'],
  'editor.insertLineAbove': ['Ctrl+Shift+Enter'],
  'editor.trimWhitespace': ['Ctrl+K Ctrl+X'],
  'debug.toggleBreakpoint': ['F9'],
  'debug.start': ['F5'],
  'debug.continue': ['F5'],
  'debug.stepOver': ['F10'],
  'debug.stepInto': ['F11'],
  'debug.stepOut': ['Shift+F11'],
  'debug.stop': ['Shift+F5'],
  'debug.restart': ['Ctrl+Shift+F5'],
  'nav.back': ['Ctrl+Alt+-'],
  'nav.forward': ['Ctrl+Shift+-'],
  'editor.shrinkSelection': ['Shift+Alt+Left'],
  'window.new': ['Ctrl+Shift+N'],
};

const VISUALSTUDIO: BindingMap = {
  'search.everywhere': ['Ctrl+T'],
  'search.files': ['Ctrl+Shift+T'],
  'search.actions': ['Ctrl+Q'],
  'editor.workspaceSymbols': ['Ctrl+,'],
  'editor.symbols': ['Alt+\\'],
  'file.save': ['Ctrl+S'],
  'file.saveAll': ['Ctrl+Shift+S'],
  'file.new': ['Ctrl+N'],
  'file.open': ['Ctrl+Shift+O'],
  'file.closeTab': ['Ctrl+F4'],
  'tabs.next': ['Ctrl+Alt+PageDown', 'Ctrl+Tab'],
  'tabs.previous': ['Ctrl+Alt+PageUp', 'Ctrl+Shift+Tab'],
  'project.build': ['Ctrl+Shift+B'],
  'project.run': ['Ctrl+F5'],
  'project.test': ['Ctrl+R Ctrl+A'],
  'view.explorer': ['Ctrl+Alt+L'],
  'view.search': ['Ctrl+Shift+F'],
  'view.problems': ['Ctrl+\\ Ctrl+E'],
  'view.output': ['Ctrl+Alt+O'],
  'view.commandPalette': ['Ctrl+Shift+P'],
  'terminal.toggle': ['Ctrl+`'],
  'editor.definition': ['F12'],
  'editor.implementation': ['Ctrl+F12'],
  'editor.references': ['Shift+F12'],
  'editor.rename': ['Ctrl+R Ctrl+R', 'F2'],
  'editor.codeActions': ['Ctrl+.', 'Alt+Enter'],
  'editor.format': ['Ctrl+K Ctrl+D'],
  'editor.organizeImports': ['Ctrl+R Ctrl+G'],
  'editor.signature': ['Ctrl+Shift+Space'],
  'editor.triggerSuggest': ['Ctrl+Space', 'Ctrl+J'],
  'editor.undo': ['Ctrl+Z'],
  'editor.redo': ['Ctrl+Y'],
  'editor.toggleComment': ['Ctrl+K Ctrl+/', 'Ctrl+K Ctrl+C'],
  'editor.toggleBlockComment': ['Ctrl+Shift+/'],
  'editor.copyLineDown': ['Ctrl+D'],
  'editor.deleteLine': ['Ctrl+Shift+L'],
  'editor.moveLineUp': ['Alt+Up'],
  'editor.moveLineDown': ['Alt+Down'],
  'editor.expandSelection': ['Shift+Alt+='],
  'editor.selectNextOccurrence': ['Shift+Alt+.'],
  'editor.selectAllOccurrences': ['Shift+Alt+;'],
  'editor.gotoLine': ['Ctrl+G'],
  'editor.toggleFold': ['Ctrl+M Ctrl+M'],
  'editor.foldAll': ['Ctrl+M Ctrl+O'],
  'editor.unfoldAll': ['Ctrl+M Ctrl+P', 'Ctrl+M Ctrl+L'],
  'editor.find': ['Ctrl+F'],
  'editor.replace': ['Ctrl+H'],
  'editor.findNext': ['F3'],
  'editor.findPrevious': ['Shift+F3'],
  'editor.jumpToBracket': ['Ctrl+]'],
  'editor.insertLineBelow': ['Ctrl+Shift+Enter'],
  'editor.insertLineAbove': ['Ctrl+Enter'],
  'editor.upperCase': ['Ctrl+Shift+U'],
  'editor.lowerCase': ['Ctrl+U'],
  'debug.toggleBreakpoint': ['F9'],
  'debug.start': ['F5'],
  'debug.continue': ['F5'],
  'debug.stepOver': ['F10'],
  'debug.stepInto': ['F11'],
  'debug.stepOut': ['Shift+F11'],
  'debug.stop': ['Shift+F5'],
  'debug.restart': ['Ctrl+Shift+F5'],
  'debug.runToCursor': ['Ctrl+F10'],
  'nav.back': ['Ctrl+Alt+-'],
  'nav.forward': ['Ctrl+Shift+-'],
};

const ECLIPSE: BindingMap = {
  'search.actions': ['Ctrl+3'],
  'file.quickOpen': ['Ctrl+Shift+R'],
  'editor.workspaceSymbols': ['Ctrl+Shift+T'],
  'editor.symbols': ['Ctrl+O'],
  'view.search': ['Ctrl+H'],
  'view.commandPalette': ['Ctrl+Shift+L'],
  'file.save': ['Ctrl+S'],
  'file.saveAll': ['Ctrl+Shift+S'],
  'file.new': ['Ctrl+N'],
  'file.closeTab': ['Ctrl+W', 'Ctrl+F4'],
  'file.closeAll': ['Ctrl+Shift+W'],
  'tabs.next': ['Ctrl+F6', 'Ctrl+PageDown'],
  'tabs.previous': ['Ctrl+Shift+F6', 'Ctrl+PageUp'],
  'project.build': ['Ctrl+B'],
  'project.run': ['Ctrl+F11'],
  'view.problems': ['Alt+Shift+Q X'],
  'terminal.toggle': ['Ctrl+Alt+T'],
  'effects.zoomIn': ['Ctrl+='],
  'effects.zoomOut': ['Ctrl+-'],
  'editor.definition': ['F3'],
  'editor.references': ['Ctrl+Shift+G'],
  'editor.rename': ['Alt+Shift+R'],
  'editor.codeActions': ['Ctrl+1'],
  'editor.format': ['Ctrl+Shift+F'],
  'editor.organizeImports': ['Ctrl+Shift+O'],
  'editor.triggerSuggest': ['Ctrl+Space'],
  'editor.undo': ['Ctrl+Z'],
  'editor.redo': ['Ctrl+Y'],
  'editor.toggleComment': ['Ctrl+/', 'Ctrl+7'],
  'editor.toggleBlockComment': ['Ctrl+Shift+/'],
  'editor.copyLineDown': ['Ctrl+Alt+Down'],
  'editor.copyLineUp': ['Ctrl+Alt+Up'],
  'editor.deleteLine': ['Ctrl+D'],
  'editor.moveLineUp': ['Alt+Up'],
  'editor.moveLineDown': ['Alt+Down'],
  'editor.expandSelection': ['Alt+Shift+Up'],
  'editor.gotoLine': ['Ctrl+L'],
  'editor.fold': ['Ctrl+NumpadSubtract'],
  'editor.unfold': ['Ctrl+NumpadAdd'],
  'editor.foldAll': ['Ctrl+Shift+NumpadDivide'],
  'editor.unfoldAll': ['Ctrl+NumpadMultiply'],
  'editor.find': ['Ctrl+F'],
  'editor.findNext': ['Ctrl+K'],
  'editor.findPrevious': ['Ctrl+Shift+K'],
  'editor.jumpToBracket': ['Ctrl+Shift+P'],
  'editor.insertLineBelow': ['Shift+Enter'],
  'editor.insertLineAbove': ['Ctrl+Shift+Enter'],
  'editor.upperCase': ['Ctrl+Shift+X'],
  'editor.lowerCase': ['Ctrl+Shift+Y'],
  'debug.toggleBreakpoint': ['Ctrl+Shift+B'],
  'debug.start': ['F11'],
  'debug.continue': ['F8'],
  'debug.stepOver': ['F6'],
  'debug.stepInto': ['F5'],
  'debug.stepOut': ['F7'],
  'debug.stop': ['Ctrl+F2'],
  'debug.runToCursor': ['Ctrl+R'],
  'nav.back': ['Alt+Left'],
  'nav.forward': ['Alt+Right'],
};

const PRESET_MAPS: Record<PresetId, BindingMap> = {
  lumen: LUMEN,
  jetbrains: JETBRAINS,
  vscode: VSCODE,
  visualstudio: VISUALSTUDIO,
  eclipse: ECLIPSE,
};

export function presetBindings(preset: PresetId): BindingMap {
  return PRESET_MAPS[preset] ?? LUMEN;
}

/* ------------------------------------------------------------------ *
 * Chords
 * ------------------------------------------------------------------ */

export interface Chord {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  /** Normalised key name (`A`, `F12`, `/`, `Up`, `NumpadAdd`). */
  key: string;
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'OS', 'CapsLock', 'Fn']);

const CODE_NAMES: Record<string, string> = {
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  IntlBackslash: '<', Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter', Escape: 'Escape',
  Tab: 'Tab', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End',
  PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left',
  ArrowRight: 'Right', NumpadAdd: 'NumpadAdd', NumpadSubtract: 'NumpadSubtract',
  NumpadMultiply: 'NumpadMultiply', NumpadDivide: 'NumpadDivide', NumpadDecimal: 'NumpadDecimal',
};

const KEY_NAMES: Record<string, string> = {
  ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Esc: 'Escape', Del: 'Delete',
};

const NAMED_KEYS = new Set([
  'Space', 'Enter', 'Escape', 'Tab', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp',
  'PageDown', 'Up', 'Down', 'Left', 'Right', 'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply',
  'NumpadDivide', 'NumpadDecimal',
]);

function nameFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }
  if (/^Digit\d$/.test(code)) {
    return code.slice(5);
  }
  if (/^Numpad\d$/.test(code)) {
    return `NumpadNumber${code.slice(6)}`;
  }
  if (/^F\d{1,2}$/.test(code)) {
    return code;
  }
  return CODE_NAMES[code] ?? null;
}

function nameFromKey(key: string): string | null {
  if (KEY_NAMES[key]) {
    return KEY_NAMES[key];
  }
  if (key.length === 1) {
    return key.toUpperCase();
  }
  if (/^F\d{1,2}$/.test(key)) {
    return key;
  }
  if (NAMED_KEYS.has(key)) {
    return key;
  }
  return null;
}

/** The key of an event — both readings, by position and by character. */
export function eventKeys(event: KeyboardEvent): { code: string | null; key: string | null; } {
  return { code: nameFromCode(event.code), key: nameFromKey(event.key) };
}

export function isModifierOnly(event: KeyboardEvent) {
  return MODIFIER_KEYS.has(event.key);
}

/** A chord from one keypress — for recording new bindings. */
export function chordFromEvent(event: KeyboardEvent): Chord | null {
  if (isModifierOnly(event)) {
    return null;
  }
  const { code, key } = eventKeys(event);
  // Letters and digits by position, punctuation by the character produced (Ö, ß, +).
  const byCode = code && (/^[A-Z0-9]$/.test(code) || code.startsWith('F') || NAMED_KEYS.has(code) || code.startsWith('Numpad'));
  const name = byCode ? code : (key ?? code);
  if (!name) {
    return null;
  }
  return { ctrl: event.ctrlKey || event.metaKey, alt: event.altKey, shift: event.shiftKey, key: name };
}

/** `Ctrl+Shift+p` → a chord. */
export function parseChord(text: string): Chord | null {
  const parts = text.split('+');
  // `Ctrl++` → the “+” key.
  const merged: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === '' && i === parts.length - 1 && merged.length) {
      merged.push('+');
      continue;
    }
    if (parts[i] === '') {
      continue;
    }
    merged.push(parts[i]);
  }
  const chord: Chord = { ctrl: false, alt: false, shift: false, key: '' };
  for (const raw of merged) {
    const part = raw.trim();
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'cmd' || lower === 'mod' || lower === 'meta') { chord.ctrl = true; continue; }
    if (lower === 'alt' || lower === 'option') { chord.alt = true; continue; }
    if (lower === 'shift') { chord.shift = true; continue; }
    chord.key = part.length === 1 ? part.toUpperCase() : part;
  }
  return chord.key ? chord : null;
}

export function chordToString(chord: Chord): string {
  return [chord.ctrl && 'Ctrl', chord.alt && 'Alt', chord.shift && 'Shift', chord.key].filter(Boolean).join('+');
}

/** Normalises a binding: modifier order and letter case. */
export function normalizeBinding(binding: string): string {
  if (binding.trim() === DOUBLE_SHIFT) {
    return DOUBLE_SHIFT;
  }
  return binding
    .trim()
    .split(/\s+/)
    .map((part) => parseChord(part))
    .filter((c): c is Chord => c !== null)
    .map(chordToString)
    .join(' ');
}

const isSymbol = (key: string) => key.length === 1 && !/[A-Z0-9]/.test(key);

/** Does a keypress fit a chord? */
export function eventMatches(event: KeyboardEvent, chord: Chord): boolean {
  const ctrl = event.ctrlKey || event.metaKey;
  if (ctrl !== chord.ctrl || event.altKey !== chord.alt) {
    return false;
  }
  const { code, key } = eventKeys(event);
  if (code === chord.key && event.shiftKey === chord.shift) {
    return true;
  }
  if (key !== chord.key) {
    return false;
  }
  if (event.shiftKey === chord.shift) {
    return true;
  }
  // Punctuation only reachable with Shift (`+`, `/` on German keyboards).
  return isSymbol(chord.key) && !chord.shift;
}

/* ------------------------------------------------------------------ *
 * The active binding
 * ------------------------------------------------------------------ */

interface Compiled {
  id: string;
  binding: string;
  chords: Chord[];
}

let effective: BindingMap = { ...LUMEN };
let compiled: Compiled[] = [];
let version = 0;
const listeners = new Set<() => void>();

function compile() {
  compiled = [];
  for (const [id, bindings] of Object.entries(effective)) {
    for (const binding of bindings) {
      if (binding === DOUBLE_SHIFT) {
        compiled.push({ id, binding, chords: [] });
        continue;
      }
      const chords = binding.split(/\s+/).map(parseChord).filter((c): c is Chord => c !== null);
      if (chords.length) {
        compiled.push({ id, binding: normalizeBinding(binding), chords });
      }
    }
  }
}
compile();

export const keybindings = {
  /** Preset plus custom bindings; an empty array means a command with no shortcut. */
  configure(preset: PresetId, overrides: BindingMap, defaults: BindingMap = {}) {
    effective = { ...defaults, ...presetBindings(preset) };
    for (const [id, bindings] of Object.entries(overrides)) {
      effective[id] = bindings.map(normalizeBinding);
    }
    compile();
    version++;
    for (const fn of listeners) {
      fn();
    }
  },

  bindingsFor(id: string): string[] {
    return effective[id] ?? [];
  },

  all(): BindingMap {
    return effective;
  },

  /** Commands whose first chord matches and that consist of one chord only. */
  match(event: KeyboardEvent): string[] {
    return compiled
      .filter((c) => c.chords.length === 1 && eventMatches(event, c.chords[0]))
      .map((c) => c.id);
  },

  /** Are there bindings that start with this chord and run longer? */
  isPrefix(event: KeyboardEvent): boolean {
    return compiled.some((c) => c.chords.length > 1 && eventMatches(event, c.chords[0]));
  },

  /** Second chord of a sequence whose first chord was `first`. */
  matchSequence(first: Chord, event: KeyboardEvent): string[] {
    return compiled
      .filter((c) => c.chords.length === 2 && sameChord(c.chords[0], first))
      .filter((c) => eventMatches(event, c.chords[1]))
      .map((c) => c.id);
  },

  doubleShift(): string[] {
    return compiled.filter((c) => c.binding === DOUBLE_SHIFT).map((c) => c.id);
  },

  /** Other commands carrying the same binding. */
  conflicts(binding: string, exceptId?: string): string[] {
    const normalized = normalizeBinding(binding);
    return Object.entries(effective)
      .filter(([id, list]) => id !== exceptId && list.some((b) => normalizeBinding(b) === normalized))
      .map(([id]) => id);
  },

  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  getVersion: () => version,
};

function sameChord(a: Chord, b: Chord) {
  if (a.ctrl !== b.ctrl || a.alt !== b.alt) {
    return false;
  }
  if (a.key === b.key && a.shift === b.shift) {
    return true;
  }
  return a.key === b.key && isSymbol(a.key) && !a.shift;
}

/* ------------------------------------------------------------------ *
 * Display
 * ------------------------------------------------------------------ */

const LABELS_DE: Record<string, string> = {
  Ctrl: 'Strg', Shift: 'Umschalt', Alt: 'Alt', Space: 'Leertaste', Enter: 'Eingabe', Escape: 'Esc',
  Delete: 'Entf', Insert: 'Einfg', Home: 'Pos1', End: 'Ende', PageUp: 'Bild↑', PageDown: 'Bild↓',
  Backspace: 'Rücktaste', Up: '↑', Down: '↓', Left: '←', Right: '→', Tab: 'Tab',
};

const LABELS_EN: Record<string, string> = {
  Ctrl: 'Ctrl', Shift: 'Shift', Alt: 'Alt', Space: 'Space', Enter: 'Enter', Escape: 'Esc',
  Delete: 'Del', Insert: 'Ins', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn',
  Backspace: 'Backspace', Up: '↑', Down: '↓', Left: '←', Right: '→', Tab: 'Tab',
};

const LABELS_MAC: Record<string, string> = {
  ...LABELS_EN, Ctrl: '⌘', Shift: '⇧', Alt: '⌥', Enter: '↩', Backspace: '⌫', Delete: '⌦', Escape: '⎋', Tab: '⇥',
};

const NUMPAD_LABELS: Record<string, string> = {
  NumpadAdd: 'Num +', NumpadSubtract: 'Num −', NumpadMultiply: 'Num ×', NumpadDivide: 'Num ÷', NumpadDecimal: 'Num ,',
};

let platform = 'linux';

export function setKeybindingPlatform(value: string) {
  platform = value;
}

function labels() {
  if (platform === 'darwin') {
    return LABELS_MAC;
  }
  return getLanguage() === 'de' ? LABELS_DE : LABELS_EN;
}

function label(part: string) {
  if (NUMPAD_LABELS[part]) {
    return NUMPAD_LABELS[part];
  }
  if (part.startsWith('NumpadNumber')) {
    return `Num ${part.slice(12)}`;
  }
  return labels()[part] ?? part;
}

/** Readable form: `Ctrl+Shift+P` → “Strg+Umschalt+P” in German. */
export function formatBinding(binding: string): string {
  if (binding === DOUBLE_SHIFT) {
    return `${label('Shift')} ${label('Shift')}`;
  }
  const joiner = platform === 'darwin' ? '' : '+';
  return binding
    .split(/\s+/)
    .map((chord) => {
      const parsed = parseChord(chord);
      if (!parsed) {
        return chord;
      }
      return [parsed.ctrl && 'Ctrl', parsed.alt && 'Alt', parsed.shift && 'Shift', parsed.key]
        .filter((p): p is string => Boolean(p))
        .map(label)
        .join(joiner);
    })
    .join(' ');
}

/** Every binding of a command, readable and joined with “·”. */
export function formatBindingsFor(id: string): string | undefined {
  const list = keybindings.bindingsFor(id);
  if (!list.length) {
    return undefined;
  }
  return list.map(formatBinding).join(' · ');
}
