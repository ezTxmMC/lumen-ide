/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useSyncExternalStore, type MutableRefObject, type RefObject } from 'react';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import {
  EditorView, keymap, lineNumbers, highlightActiveLineGutter,
  highlightSpecialChars, drawSelection, dropCursor, rectangularSelection,
  crosshairCursor, placeholder as cmPlaceholder,
} from '@codemirror/view';
import { history, indentWithTab, standardKeymap } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { activeLineHighlight } from './active-line';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { lintGutter } from '@codemirror/lint';

import { useStore } from '@/state/store';
import { registry } from '@/core/registry';
import { editorExtensionFor } from '@/core/language';
import { formatExtension, formatFor } from '@/core/format-settings';
import { foldingFor, foldingUi } from '@/core/folding';
import { editorTheme } from '@/core/theme';
import { lsp } from '@/core/lsp/manager';
import type { ContentChange } from '@/core/lsp/client';
import { completionExtension } from '@/core/completion';
import { editorBridge } from '@/lib/editor-bridge';
import {
  editorExtensions, getEditorExtensionVersion, subscribeEditorExtensions,
} from '@/lib/editor-extensions';
import { t } from '@/i18n';
import { indentGuides } from './indent-guides';
import { minimap } from './minimap';
import {
  applyDiagnostics, formatDocument, lspExtension, lspRefresh, offsetToPos, organizeImports,
} from './lsp-extension';
import type { LanguageSpec } from '@/core/types';
import type { Tab } from '@/state/types';

const themeComp = new Compartment();
const langComp = new Compartment();
const optionsComp = new Compartment();
/** Completion, hover and diagnostics — these depend on the language *and* the file. */
const assistComp = new Compartment();
const readonlyComp = new Compartment();
/** Contributions from other features, such as the debugger. */
const featureComp = new Compartment();
/** The store listener knows its group — a state carried into another group (a tab moved into a pop-out) must get the new one. */
const listenerComp = new Compartment();

/**
 * The editor's key bindings: basic movement and input aids only. Everything
 * reassignable — commenting, moving lines, searching, folding — runs through
 * the shortcut system in `core/keybindings.ts`.
 */
const EDITOR_KEYMAP = [
  ...closeBracketsKeymap,
  ...standardKeymap,
  ...completionKeymap.filter((binding) => binding.key !== 'Mod-Space' && binding.key !== 'Ctrl-Space'),
  ...searchKeymap.filter((binding) => binding.key === 'Escape'),
  indentWithTab,
];

function baseExtensions(): Extension[] {
  return [
    history(),
    highlightSpecialChars(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    crosshairCursor(),
    highlightSelectionMatches(),
    search({ top: true }),
    foldingUi((count) => t('editor.foldedLines', { count })),
    keymap.of(EDITOR_KEYMAP),
    lintGutter(),
    cmPlaceholder(t('editor.emptyFile')),
  ];
}

/** Completion (static plus LSP), hover and navigation commands for one file. */
function assistExtensions(
  spec: LanguageSpec | null,
  filePath: string | null,
  effects: ReturnType<typeof useStore.getState>['effects'],
): Extension {
  return [
    completionExtension(spec, filePath),
    lspExtension(filePath, spec, effects),
  ];
}

/** CodeMirror changes → LSP changes, back to front, in the old coordinates. */
function toContentChanges(update: { startState: EditorState; changes: { iterChanges(f: (fromA: number, toA: number, fromB: number, toB: number, inserted: { toString(): string; }) => void): void; }; }): ContentChange[] {
  const doc = update.startState.doc;
  const out: ContentChange[] = [];
  update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    out.push({
      range: { start: offsetToPos(doc, fromA), end: offsetToPos(doc, toA) },
      text: inserted.toString(),
    });
  });
  // Backwards, so earlier positions stay untouched by later insertions.
  return out.reverse();
}

/* ------------------------------------------------------------------ *
 * View state per file
 * ------------------------------------------------------------------ */

/** Editor state (undo history, selection, folds) per group and tab. */
const editorStates = new Map<string, EditorState>();
/** When each state was stored, to tell which of a tab's states is the newest. */
const stateStamps = new Map<string, number>();
let stampCounter = 0;

function storeState(groupId: string, tabId: string, state: EditorState) {
  const key = stateKey(groupId, tabId);
  editorStates.set(key, state);
  stateStamps.set(key, ++stampCounter);
}

/**
 * The state a group opens a tab with: its own, unless the tab has been in
 * another group since and was left there later — a tab moved into a window of
 * its own (or back) keeps its undo history, selection and folds.
 */
function stateForTab(groupId: string, tabId: string): EditorState | undefined {
  const own = stateKey(groupId, tabId);
  let best = own;
  for (const key of editorStates.keys()) {
    if (key === own || !key.endsWith(`:${tabId}`)) {
      continue;
    }
    const holder = key.slice(0, key.length - tabId.length - 1);
    const stillShown = useStore.getState().groups.find((g) => g.id === holder)?.tabIds.includes(tabId);
    if (stillShown) {
      continue;
    }
    if ((stateStamps.get(key) ?? 0) > (stateStamps.get(best) ?? 0)) {
      best = key;
    }
  }
  return editorStates.get(best);
}

interface ScrollMemory {
  /** An exact restore, as long as the text is unchanged. */
  snapshot: ReturnType<EditorView['scrollSnapshot']>;
  doc: string;
  /** The stand-in for when the text has changed. */
  top: number;
  left: number;
}

/**
 * Scroll position per tab — shared across groups, so a file always continues
 * where you left it, whichever group it opens in.
 */
const scrollMemory = new Map<string, ScrollMemory>();

/** The live views per group — so server updates reach all of them. */
const liveViews = new Map<string, EditorView>();

const stateKey = (groupId: string, tabId: string) => `${groupId}:${tabId}`;

/** The one span that differs between two texts — replacing only it keeps cursor and scroll position. */
function middleChange(doc: string, next: string) {
  let start = 0;
  const max = Math.min(doc.length, next.length);
  while (start < max && doc.charCodeAt(start) === next.charCodeAt(start)) {
    start++;
  }
  let endDoc = doc.length;
  let endNew = next.length;
  while (endDoc > start && endNew > start && doc.charCodeAt(endDoc - 1) === next.charCodeAt(endNew - 1)) {
    endDoc--;
    endNew--;
  }
  return { from: start, to: endDoc, insert: next.slice(start, endNew) };
}

function rememberScroll(view: EditorView, tabId: string) {
  scrollMemory.set(tabId, {
    snapshot: view.scrollSnapshot(),
    doc: view.state.doc.toString(),
    top: view.scrollDOM.scrollTop,
    left: view.scrollDOM.scrollLeft,
  });
}

function restoreScroll(view: EditorView, tabId: string) {
  const memory = scrollMemory.get(tabId);
  if (!memory) {
    view.scrollDOM.scrollTop = 0;
    view.scrollDOM.scrollLeft = 0;
    return;
  }
  if (memory.doc === view.state.doc.toString()) {
    view.dispatch({ effects: memory.snapshot });
    return;
  }
  // The text changed: back to the old height after the next measuring pass.
  requestAnimationFrame(() => {
    view.scrollDOM.scrollTop = memory.top;
    view.scrollDOM.scrollLeft = memory.left;
  });
}

/** Tab closed: discard the states we remembered. */
function forgetTab(tabId: string) {
  scrollMemory.delete(tabId);
  for (const key of [...editorStates.keys()]) {
    if (!key.endsWith(`:${tabId}`)) {
      continue;
    }
    editorStates.delete(key);
    stateStamps.delete(key);
  }
}

/* ------------------------------------------------------------------ *
 * The editor of one group
 * ------------------------------------------------------------------ */

/** The extension sets the compartments are filled with, rebuilt as their inputs change. */
interface ExtensionSet {
  theme: Extension;
  options: Extension[];
  assist: Extension;
  language: Extension;
  feature: Extension;
  readonly: Extension;
}

interface ActiveTab {
  activeTabId: string | null;
  activePath: string | null;
  languageId: string | null;
  readonly: boolean;
}

function useExtensionSet(groupId: string, tab: ActiveTab): ExtensionSet {
  const { activeTabId, activePath, languageId, readonly } = tab;
  const themeId = useStore((s) => s.themeId);
  const effects = useStore((s) => s.effects);
  const registryVersion = useStore((s) => s.registryVersion);
  const formatSettings = useStore((s) => s.formatSettings);
  const lspEnabled = useStore((s) => s.effects.lsp);
  const extensionVersion = useSyncExternalStore(subscribeEditorExtensions, getEditorExtensionVersion);

  const themeSpec = useMemo(
    () => registry.themes().find((t) => t.id === themeId) ?? registry.themes()[0],
    [themeId, registryVersion],
  );

  const options = useMemo<Extension[]>(() => {
    const list: Extension[] = [];
    if (effects.showLineNumbers) {
      list.push(lineNumbers(), highlightActiveLineGutter());
    }
    if (effects.highlightActiveLine) {
      list.push(activeLineHighlight);
    }
    if (effects.showIndentGuides) {
      list.push(indentGuides);
    }
    if (effects.wordWrap) {
      list.push(EditorView.lineWrapping);
    }
    if (effects.minimap && themeSpec) {
      list.push(minimap({ theme: themeSpec, width: effects.minimapWidth, characters: effects.minimapRenderCharacters }));
    }
    if (effects.foldingOnHover) {
      list.push(EditorView.editorAttributes.of({ class: 'lm-fold-hover' }));
    }
    return list;
  }, [
    effects.showLineNumbers, effects.highlightActiveLine, effects.showIndentGuides, effects.wordWrap,
    effects.minimap, effects.minimapWidth, effects.minimapRenderCharacters, effects.foldingOnHover, themeSpec,
  ]);

  const theme = useMemo(
    () => (themeSpec ? editorTheme(themeSpec, effects) : []),
    [themeSpec, effects],
  );

  const assist = useMemo(
    () => {
      const state = useStore.getState();
      const found = state.tabs.find((t) => t.id === activeTabId) ?? null;
      const spec = found ? state.languageFor(found) : null;
      // Virtual documents (jdt://) get no LSP wiring — syntax only.
      return assistExtensions(spec, found?.virtual ? null : activePath, state.effects);
    },
    // `lspEnabled` and `registryVersion` force the rebuild when the server
    // state or the language association changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      activeTabId, activePath, languageId, lspEnabled, registryVersion,
      effects.inlayHints, effects.signatureHelp, effects.documentHighlight,
    ],
  );

  const language = useMemo(() => {
    const state = useStore.getState();
    const found = state.tabs.find((t) => t.id === activeTabId) ?? null;
    const spec = found ? state.languageFor(found) : null;
    const format = formatFor(state.formatSettings, spec?.id, spec?.indentUnit);
    return [editorExtensionFor(spec), foldingFor(spec), formatExtension(format)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, languageId, registryVersion, formatSettings]);

  const feature = useMemo<Extension>(() => {
    if (!activeTabId) {
      return [];
    }
    return editorExtensions({ tabId: activeTabId, groupId, path: activePath, languageId, readonly });
  }, [activeTabId, groupId, activePath, languageId, readonly, extensionVersion]);

  const readonlyExt = useMemo<Extension>(
    () => (readonly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
    [readonly],
  );

  return { theme, options, assist, language, feature, readonly: readonlyExt };
}

/** A shared listener: contents into the store, cursor position into the status bar. */
function useGroupListener(groupId: string, current: MutableRefObject<string | null>) {
  const updateContent = useStore((s) => s.updateContent);
  const setCursor = useStore((s) => s.setCursor);
  return useMemo(
    () => EditorView.updateListener.of((update) => {
      if (update.docChanged && current.current) {
        updateContent(current.current, update.state.doc.toString(), toContentChanges(update));
      }
      if (update.focusChanged && update.view.hasFocus) {
        const state = useStore.getState();
        if (state.activeGroupId !== groupId) {
          const index = state.groups.findIndex((g) => g.id === groupId);
          if (index !== -1) {
            state.focusGroup(index);
          }
        }
      }
      if ((update.selectionSet || update.docChanged || update.focusChanged) && useStore.getState().activeGroupId === groupId) {
        setCursor(offsetToPos(update.state.doc, update.state.selection.main.head));
      }
    }),
    [updateContent, setCursor, groupId, current],
  );
}

/** Creates the CodeMirror view once, and files its state away on teardown. */
function useCreateEditor(
  host: RefObject<HTMLDivElement | null>,
  view: MutableRefObject<EditorView | null>,
  current: MutableRefObject<string | null>,
  groupId: string,
  listener: Extension,
) {
  useEffect(() => {
    if (!host.current || view.current) {
      return;
    }
    view.current = new EditorView({
      parent: host.current,
      // A group in a pop-out lives in another document: measuring, selection and styles follow it there.
      root: host.current.ownerDocument,
      state: EditorState.create({ doc: '', extensions: [...baseExtensions(), listenerComp.of(listener)] }),
    });
    liveViews.set(groupId, view.current);
    // Keep noting the scroll position, so it survives closing the group too.
    const scroller = view.current.scrollDOM;
    let timer = 0;
    const onScroll = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (view.current && current.current) {
          rememberScroll(view.current, current.current);
        }
      }, 120);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      scroller.removeEventListener('scroll', onScroll);
      if (view.current && current.current) {
        rememberScroll(view.current, current.current);
        storeState(groupId, current.current, view.current.state);
      }
      if (editorBridge.view === view.current) {
        editorBridge.attach(null, null);
      }
      liveViews.delete(groupId);
      view.current?.destroy();
      view.current = null;
      current.current = null;
    };
  }, [listener, groupId, host, view, current]);
}

/** Loads a tab into the editor: its remembered state, or a fresh one, with the current extensions. */
function loadTab(
  cm: EditorView,
  tab: Tab,
  groupId: string,
  exts: ExtensionSet,
  listener: Extension,
) {
  const extensions: Extension[] = [
    ...baseExtensions(),
    langComp.of(exts.language),
    themeComp.of(exts.theme),
    optionsComp.of(exts.options),
    assistComp.of(exts.assist),
    readonlyComp.of(exts.readonly),
    featureComp.of(exts.feature),
    listenerComp.of(listener),
  ];

  const stored = stateForTab(groupId, tab.id);
  // Reloaded from disk while in the background (an agent's edit, say): take
  // over just the difference, so cursor and undo history survive.
  const cached = stored && stored.doc.toString() !== tab.content
    ? stored.update({ changes: middleChange(stored.doc.toString(), tab.content), userEvent: 'external' }).state
    : stored;
  // Carry the state over, undo history included; a tab seen for the first time starts afresh.
  const reuse = cached !== undefined;
  cm.setState(reuse && cached ? cached : EditorState.create({ doc: tab.content, extensions }));
  if (!reuse) {
    return;
  }
  cm.dispatch({
    effects: [
      themeComp.reconfigure(exts.theme),
      optionsComp.reconfigure(exts.options),
      langComp.reconfigure(exts.language),
      assistComp.reconfigure(exts.assist),
      readonlyComp.reconfigure(exts.readonly),
      featureComp.reconfigure(exts.feature),
      listenerComp.reconfigure(listener),
    ],
  });
}

/** Tab switch: remember and restore state and scroll position per tab. */
function useTabSwitch(
  view: MutableRefObject<EditorView | null>,
  current: MutableRefObject<string | null>,
  groupId: string,
  activeTabId: string | null,
  activeViewer: string | null,
  exts: ExtensionSet,
  listener: Extension,
) {
  const setCursor = useStore((s) => s.setCursor);
  useEffect(() => {
    const cm = view.current;
    if (!cm) {
      return;
    }

    const tab = useStore.getState().tabs.find((t) => t.id === activeTabId) ?? null;

    if (current.current && (current.current !== tab?.id || tab.viewer)) {
      rememberScroll(cm, current.current);
      storeState(groupId, current.current, cm.state);
    }
    // A tab shown in a non-text viewer leaves the editor idle (and out of the bridge) behind it.
    if (!tab || tab.viewer) {
      current.current = null;
      if (tab && editorBridge.view === cm) {
        editorBridge.attach(null, null);
      }
      return;
    }
    if (current.current === tab.id) {
      return;
    }

    loadTab(cm, tab, groupId, exts, listener);

    current.current = tab.id;
    restoreScroll(cm, tab.id);
    if (useStore.getState().activeGroupId === groupId) {
      editorBridge.attach(cm, tab.id);
      cm.focus();
      setCursor(offsetToPos(cm.state.doc, cm.state.selection.main.head));
    }
    applyDiagnostics(cm, lsp.diagnostics(tab.path), tab.path ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, groupId, activeViewer]);
}

/** The active group changed: the bridge and the status bar follow. */
function useActiveGroupSync(
  view: MutableRefObject<EditorView | null>,
  current: MutableRefObject<string | null>,
  isActiveGroup: boolean,
) {
  const setCursor = useStore((s) => s.setCursor);
  useEffect(() => {
    const cm = view.current;
    if (!cm || !isActiveGroup) {
      return;
    }
    editorBridge.attach(cm, current.current);
    if (!cm.hasFocus && !cm.dom.ownerDocument.activeElement?.closest('input, textarea, .lm-terminal, [role="dialog"]')) {
      cm.focus();
    }
    setCursor(offsetToPos(cm.state.doc, cm.state.selection.main.head));
  }, [isActiveGroup, setCursor, view, current]);
}

/** Tab contents changed from outside (reload, dependency, WorkspaceEdit, another group): adopt them. */
function useAdoptExternalContent(
  view: MutableRefObject<EditorView | null>,
  current: MutableRefObject<string | null>,
  activeTabId: string | null,
) {
  const activeContent = useStore((s) => s.tabs.find((t) => t.id === activeTabId)?.content ?? null);
  useEffect(() => {
    const cm = view.current;
    if (!cm || activeContent === null || current.current !== activeTabId) {
      return;
    }
    const doc = cm.state.doc.toString();
    if (doc === activeContent) {
      return;
    }
    cm.dispatch({ changes: middleChange(doc, activeContent), userEvent: 'external' });
  }, [activeContent, activeTabId, view, current]);
}

/** Jump to a spot (definition, reference, outline, problems). */
function useRevealJump(
  view: MutableRefObject<EditorView | null>,
  current: MutableRefObject<string | null>,
  groupId: string,
  activeTabId: string | null,
  isActiveGroup: boolean,
) {
  const reveal = useStore((s) => s.reveal);
  const consumeReveal = useStore((s) => s.consumeReveal);
  useEffect(() => {
    if (!reveal || !view.current) {
      return;
    }
    if (reveal.tabId !== current.current) {
      return;
    }
    if (reveal.groupId && reveal.groupId !== groupId) {
      return;
    }
    if (!reveal.groupId && !isActiveGroup) {
      return;
    }
    editorBridge.attach(view.current, current.current);
    editorBridge.reveal(reveal.line, reveal.character, reveal.endLine, reveal.endCharacter);
    consumeReveal();
  }, [reveal, activeTabId, consumeReveal, groupId, isActiveGroup, view, current]);
}

/** Keep theme, options and extensions in step. */
function useReconfigure(view: MutableRefObject<EditorView | null>, activeTabId: string | null, exts: ExtensionSet) {
  useEffect(() => {
    view.current?.dispatch({
      effects: [
        themeComp.reconfigure(exts.theme),
        optionsComp.reconfigure(exts.options),
        readonlyComp.reconfigure(exts.readonly),
        featureComp.reconfigure(exts.feature),
      ],
    });
  }, [exts.theme, exts.options, exts.readonly, exts.feature, view]);

  useEffect(() => {
    if (!activeTabId) {
      return;
    }
    view.current?.dispatch({
      effects: [
        langComp.reconfigure(exts.language),
        assistComp.reconfigure(exts.assist),
      ],
    });
  }, [activeTabId, exts.language, exts.assist, view]);
}

/** Mirror the diagnostics; once the server is ready, fetch the outline and hints. */
function useDiagnosticsMirror(view: MutableRefObject<EditorView | null>, activePath: string | null) {
  useEffect(() => {
    let wasReady = lsp.clientForPath(activePath)?.status === 'ready';
    return lsp.subscribe(() => {
      const cm = view.current;
      if (!cm || !activePath) {
        return;
      }
      applyDiagnostics(cm, lsp.diagnostics(activePath), activePath);
      const ready = lsp.clientForPath(activePath)?.status === 'ready';
      if (ready && !wasReady) {
        cm.dispatch({ effects: lspRefresh.of('all') });
      }
      wasReady = ready;
    });
  }, [activePath, view]);
}

export function Editor({ groupId }: { groupId: string; }) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const current = useRef<string | null>(null);

  const activeTabId = useStore((s) => s.groups.find((g) => g.id === groupId)?.activeTabId ?? null);
  const isActiveGroup = useStore((s) => s.activeGroupId === groupId);
  const languageId = useStore(
    (s) => s.tabs.find((t) => t.id === activeTabId)?.languageId ?? null,
  );
  const readonly = useStore(
    (s) => Boolean(s.tabs.find((t) => t.id === activeTabId)?.readonly),
  );
  const activePath = useStore(
    (s) => s.tabs.find((t) => t.id === activeTabId)?.path ?? null,
  );
  /** Set while the active tab shows in a non-text viewer (an SVG can switch back and forth). */
  const activeViewer = useStore(
    (s) => s.tabs.find((t) => t.id === activeTabId)?.viewer ?? null,
  );

  const exts = useExtensionSet(groupId, { activeTabId, activePath, languageId, readonly });
  const listener = useGroupListener(groupId, current);

  useCreateEditor(host, view, current, groupId, listener);
  useTabSwitch(view, current, groupId, activeTabId, activeViewer, exts, listener);
  useActiveGroupSync(view, current, isActiveGroup);
  useAdoptExternalContent(view, current, activeTabId);
  useRevealJump(view, current, groupId, activeTabId, isActiveGroup);
  useReconfigure(view, activeTabId, exts);
  useDiagnosticsMirror(view, activePath);

  return <div ref={host} className="h-full w-full overflow-hidden" />;
}

/* ------------------------------------------------------------------ *
 * The wiring shared by every group
 * ------------------------------------------------------------------ */

/** Once in the editor area: the save hook, server updates, and cleanup. */
export function useEditorServices() {
  const tabIds = useStore((s) => s.tabs.map((t) => t.id).join(' '));

  /* Before saving: organise imports, format (in the active view). */
  useEffect(() => {
    editorBridge.beforeSave = async (tabId) => {
      const cm = editorBridge.view;
      const state = useStore.getState();
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!cm || !tab?.path || editorBridge.tabId !== tabId) {
        return;
      }
      if (state.effects.organizeImportsOnSave) {
        await organizeImports(cm, tab.path);
      }
      if (state.effects.formatOnSave) {
        await formatDocument(cm, tab.path);
      }
    };
    return () => { editorBridge.beforeSave = null; };
  }, []);

  /* The server asks for a recomputation — inlay hints after a project import, say. */
  useEffect(() => {
    lsp.onRefresh = (what) => {
      for (const cm of liveViews.values()) {
        cm.dispatch({ effects: lspRefresh.of(what === 'inlayHint' ? 'inlayHint' : 'all') });
      }
    };
    return () => { lsp.onRefresh = () => {}; };
  }, []);

  /* Clear out orphaned states of closed tabs. */
  useEffect(() => {
    const live = new Set(tabIds.split(' '));
    for (const id of [...scrollMemory.keys()]) {
      if (!live.has(id)) {
        forgetTab(id);
      }
    }
    for (const key of [...editorStates.keys()]) {
      const id = key.slice(key.indexOf(':') + 1);
      if (live.has(id)) {
        continue;
      }
      editorStates.delete(key);
      stateStamps.delete(key);
    }
  }, [tabIds]);
}
