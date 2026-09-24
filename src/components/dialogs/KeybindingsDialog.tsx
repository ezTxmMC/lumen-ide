/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, Download, Keyboard, Plus, RotateCcw, Search, Upload, X } from 'lucide-react';
import { useStore } from '@/state/store';
import { useDialogVisible } from '@/hooks/usePresence';
import {
  chordFromEvent, chordToString, DOUBLE_SHIFT, formatBinding, keybindings, normalizeBinding,
  presetBindings, PRESETS, type PresetId,
} from '@/core/keybindings';
import { useCommands } from '@/hooks/useCommands';
import { useT } from '@/i18n';
import type { Command } from '@/core/types';
import { Button, Empty } from '../ui';
import { DialogShell, type DialogSection } from './DialogShell';

type Filter = 'all' | 'modified' | 'conflicts' | 'unbound';

const SEQUENCE_WAIT_MS = 1000;

/** Records a key combination, two-chord sequences included. */
function Recorder({ onDone, onCancel, compact = false }: {
  onDone: (binding: string) => void;
  onCancel: () => void;
  compact?: boolean;
}) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [chords, setChords] = useState<string[]>([]);
  const timer = useRef(0);

  useEffect(() => {
    ref.current?.focus();
    return () => window.clearTimeout(timer.current);
  }, []);

  const commit = (list: string[]) => {
    window.clearTimeout(timer.current);
    if (!list.length) {
      return;
    }
    onDone(list.join(' '));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const native = event.nativeEvent;
    if (event.key === 'Escape' && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      onCancel();
      return;
    }
    if (event.key === 'Enter' && chords.length && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      commit(chords);
      return;
    }
    const chord = chordFromEvent(native);
    if (!chord) {
      return;
    }
    const next = chords.length >= 2 ? [chordToString(chord)] : [...chords, chordToString(chord)];
    setChords(next);
    window.clearTimeout(timer.current);
    if (next.length === 2) {
      commit(next);
      return;
    }
    // Without a second chord inside the wait, the first stands alone.
    timer.current = window.setTimeout(() => commit(next), compact ? 0 : SEQUENCE_WAIT_MS);
  };

  return (
    <div
      ref={ref}
      tabIndex={0}
      data-keybinding-recorder
      onKeyDown={onKeyDown}
      onBlur={onCancel}
      className="lm-anim-pop lm-anim-glow flex min-w-[180px] items-center gap-2 rounded-lumen-sm border border-accent bg-input px-2 py-1 outline-none"
      title={t('keybindings.recordingHint')}
    >
      <Keyboard size={12} className="shrink-0 text-accent" />
      <span className="font-mono text-[11.5px] text-fg">
        {chords.length ? formatBinding(chords.join(' ')) : t('keybindings.recording')}
      </span>
    </div>
  );
}

function KeyChip({ binding, conflicts, onRemove, removeLabel }: {
  binding: string;
  conflicts: string[];
  onRemove?: () => void;
  removeLabel: string;
}) {
  const t = useT();
  return (
    <span
      className={[
        'group/chip lm-transition inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[10.5px]',
        conflicts.length ? 'border-warn/60 bg-warn/10 text-warn' : 'border-edge bg-input text-muted',
      ].join(' ')}
      title={conflicts.length ? t('keybindings.conflict', { commands: conflicts.join(', ') }) : undefined}
    >
      {conflicts.length > 0 && <AlertTriangle size={9} />}
      {binding === DOUBLE_SHIFT ? t('keybindings.doubleShift') : formatBinding(binding)}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={removeLabel}
          className="lm-transition -mr-0.5 hidden rounded-sm text-subtle hover:text-bad group-hover/chip:inline-flex"
        >
          <X size={9} />
        </button>
      )}
    </span>
  );
}

interface KeyRow {
  command: Command;
  bindings: string[];
  modified: boolean;
  conflicts: Record<string, string[]>;
  source: 'user' | 'preset' | 'addon' | 'none';
}

const hasConflict = (row: KeyRow) => Object.values(row.conflicts).some((list) => list.length);

function buildRows(commands: Command[], overrides: Record<string, string[] | null>, preset: PresetId): KeyRow[] {
  const titleOf = new Map(commands.map((c) => [c.id, c.title]));
  const unique = new Map<string, Command>();
  for (const command of commands) {
    if (!unique.has(command.id)) {
      unique.set(command.id, command);
    }
  }
  const base = presetBindings(preset);
  return [...unique.values()].map((command) => {
    const bindings = keybindings.bindingsFor(command.id);
    const modified = command.id in overrides;
    const conflicts = Object.fromEntries(bindings.map((b) => [
      b,
      keybindings.conflicts(b, command.id).map((id) => titleOf.get(id) ?? id),
    ]));
    const source = sourceOf(modified, command.id in base, bindings.length > 0);
    return { command, bindings, modified, conflicts, source };
  });
}

function filterRows(rows: KeyRow[], filter: Filter, query: string, keySearch: string | null): KeyRow[] {
  const needle = query.trim().toLowerCase();
  const keyNeedle = keySearch ? normalizeBinding(keySearch) : null;
  return rows.filter((row) => {
    if (filter === 'modified' && !row.modified) {
      return false;
    }
    if (filter === 'conflicts' && !hasConflict(row)) {
      return false;
    }
    if (filter === 'unbound' && row.bindings.length) {
      return false;
    }
    if (keyNeedle) {
      return row.bindings.some((b) => normalizeBinding(b) === keyNeedle || normalizeBinding(b).startsWith(`${keyNeedle} `));
    }
    if (!needle) {
      return true;
    }
    const haystack = `${row.command.title} ${row.command.id} ${row.command.category ?? ''} ${row.bindings.map(formatBinding).join(' ')}`.toLowerCase();
    return needle.split(/\s+/).every((part) => haystack.includes(part));
  });
}

function groupByCategory(rows: KeyRow[]) {
  const groups = new Map<string, KeyRow[]>();
  for (const row of rows) {
    const key = row.command.category ?? '—';
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return groups;
}

type Recording = { id: string; replace?: string; } | null;

function PresetPicker({ preset, onPick }: { preset: PresetId; onPick: (id: PresetId, name: string) => void; }) {
  const t = useT();
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-[13px] font-medium text-fg">{t('keybindings.preset')}</span>
        <span className="text-[11.5px] text-subtle">{t('keybindings.presetHint')}</span>
      </div>
      <div className="lm-stagger grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {PRESETS.map((entry) => (
          <button
            key={entry.id}
            onClick={() => onPick(entry.id, entry.name)}
            className={[
              'lm-transition lm-lift lm-press rounded-lumen border px-3 py-2.5 text-left',
              preset === entry.id ? 'border-accent bg-accent/10' : 'border-edge hover:border-edge-strong hover:bg-hover',
            ].join(' ')}
          >
            <div className={`text-[12.5px] font-medium ${preset === entry.id ? 'text-accent' : 'text-fg'}`}>{entry.name}</div>
            <div className="mt-0.5 font-mono text-[10px] text-subtle">
              {formatBinding(presetBindings(entry.id)['search.everywhere']?.[0] ?? presetBindings(entry.id)['view.commandPalette']?.[0] ?? '')}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function BindingRow({ row, recordingFor, onRecord, onApply, onSetBindings }: {
  row: KeyRow;
  recordingFor: Recording;
  onRecord: (recording: Recording) => void;
  onApply: (id: string, binding: string, replace?: string) => void;
  onSetBindings: (id: string, bindings: string[] | null) => void;
}) {
  const t = useT();
  const recording = recordingFor?.id === row.command.id;
  return (
    <div
      className="lm-transition group flex min-h-[34px] items-center gap-3 border-b border-edge/60 px-3 py-1 last:border-b-0 hover:bg-hover"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] text-fg" title={row.command.id}>{row.command.title}</div>
      </div>

      <div className="flex min-w-[220px] flex-wrap items-center justify-end gap-1">
        {row.bindings.map((binding) => (
          recording && recordingFor?.replace === binding
            ? null
            : (
              <button
                key={binding}
                onDoubleClick={() => onRecord({ id: row.command.id, replace: binding })}
                title={t('keybindings.change')}
              >
                <KeyChip
                  binding={binding}
                  conflicts={row.conflicts[binding] ?? []}
                  removeLabel={t('keybindings.remove')}
                  onRemove={() => onSetBindings(row.command.id, row.bindings.filter((b) => b !== binding))}
                />
              </button>
            )
        ))}
        {!row.bindings.length && !recording && (
          <span className="text-[11px] text-subtle">{t('keybindings.notBound')}</span>
        )}
        {recording && (
          <Recorder
            onDone={(binding) => { onApply(row.command.id, binding, recordingFor?.replace); onRecord(null); }}
            onCancel={() => onRecord(null)}
          />
        )}
      </div>

      <span className={`w-[64px] shrink-0 text-right text-[10.5px] ${row.modified ? 'text-accent' : 'text-subtle'}`}>
        {t(`keybindings.source.${row.source}`)}
      </span>

      <div className="flex w-[52px] shrink-0 justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Button size="sm" title={t('keybindings.add')} onClick={() => onRecord({ id: row.command.id })}>
          <Plus size={12} />
        </Button>
        {row.modified && (
          <Button size="sm" title={t('keybindings.reset')} onClick={() => onSetBindings(row.command.id, null)}>
            <RotateCcw size={11} />
          </Button>
        )}
      </div>
    </div>
  );
}

/** Search by pressed keys, plus export and import of the whole keymap. */
function HeaderExtra({ keySearch, keySearchActive, onKeySearch, onActive, onClearQuery, onExport, onImport }: {
  keySearch: string | null;
  keySearchActive: boolean;
  onKeySearch: (binding: string | null) => void;
  onActive: (active: boolean) => void;
  onClearQuery: () => void;
  onExport: () => void;
  onImport: () => void;
}) {
  const t = useT();
  return (
    <div className="flex items-center gap-1">
      {keySearchActive
        ? (
          <Recorder
            compact
            onDone={(binding) => { onKeySearch(binding); onActive(false); onClearQuery(); }}
            onCancel={() => onActive(false)}
          />
        )
        : (
          <Button size="sm" variant={keySearch ? 'solid' : 'ghost'} title={t('keybindings.searchByKeysHint')} onClick={() => { onKeySearch(null); onActive(true); }}>
            <Search size={11} /><Keyboard size={12} />
            {keySearch ? formatBinding(keySearch) : t('keybindings.searchByKeys')}
          </Button>
        )}
      <Button size="sm" title={t('keybindings.exportKeys')} onClick={onExport}><Download size={12} /></Button>
      <Button size="sm" title={t('keybindings.importKeys')} onClick={onImport}><Upload size={12} /></Button>
    </div>
  );
}

/** Reads a keymap file: the preset and the per-command overrides. */
function parseKeymap(content: string) {
  const parsed = JSON.parse(content) as { preset?: PresetId; overrides?: Record<string, string[]>; };
  if (!parsed.overrides || typeof parsed.overrides !== 'object') {
    throw new Error('invalid');
  }
  return parsed as { preset?: PresetId; overrides: Record<string, string[]>; };
}

function BindingGroups({ groups, recordingFor, onRecord, onApply, onSetBindings }: {
  groups: Map<string, KeyRow[]>;
  recordingFor: Recording;
  onRecord: (recording: Recording) => void;
  onApply: (id: string, binding: string, replace?: string) => void;
  onSetBindings: (id: string, bindings: string[] | null) => void;
}) {
  return (
    <>
    {[...groups.entries()].map(([category, list]) => (
      <section key={category} className="mb-3">
        <h4 className="sticky top-0 z-10 mb-1 bg-overlay/95 py-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle backdrop-blur">
          {category}
        </h4>
        <div className="overflow-hidden rounded-lumen border border-edge">
          {list.map((row) => (
            <BindingRow
              key={row.command.id}
              row={row}
              recordingFor={recordingFor}
              onRecord={onRecord}
              onApply={onApply}
              onSetBindings={onSetBindings}
            />
          ))}
        </div>
      </section>
    ))}
    </>
  );
}

function KeymapFooter({ shown, total, canReset, onReset }: { shown: number; total: number; canReset: boolean; onReset: () => void; }) {
  const t = useT();
  return (
    <>
      <span className="text-[11.5px] text-subtle">{t('keybindings.count', { shown, total })}</span>
      <span className="flex-1" />
      <Button
        size="sm"
        variant="outline"
        disabled={!canReset}
        onClick={() => { if (confirm(t('keybindings.confirmResetAll'))) {
          onReset();
        } }}
      >
        <RotateCcw size={11} /> {t('keybindings.resetAll')}
      </Button>
    </>
  );
}

/** Export and import of the whole keymap as a JSON file. */
function useKeymapFile(
  preset: PresetId,
  overrides: Record<string, string[] | null>,
  setPreset: (id: PresetId) => void,
  setKeybinding: (id: string, bindings: string[] | null) => void,
) {
  const t = useT();
  const notify = useStore((s) => s.notify);
  const exportKeys = async () => {
    const target = await window.lumen.dialog.saveFile('lumen-keybindings.json');
    if (!target) {
      return;
    }
    await window.lumen.fs.writeFile(target, `${JSON.stringify({ preset, overrides }, null, 2)}\n`);
  };

  const importKeys = async () => {
    const picked = await window.lumen.dialog.openFile();
    if (!picked) {
      return;
    }
    try {
      const parsed = parseKeymap(picked.content);
      if (parsed.preset && PRESETS.some((p) => p.id === parsed.preset)) {
        setPreset(parsed.preset);
      }
      for (const [id, list] of Object.entries(parsed.overrides)) {
        if (Array.isArray(list)) {
          setKeybinding(id, list.filter((b) => typeof b === 'string'));
        }
      }
      notify(t('keybindings.imported'), 'success');
    } catch {
      notify(t('keybindings.invalidImport'), 'error');
    }
  };

  return { exportKeys, importKeys };
}

export function KeybindingsDialog() {
  const t = useT();
  const open = useDialogVisible('keybindings');
  const preset = useStore((s) => s.keymapPreset);
  const overrides = useStore((s) => s.keybindingOverrides);
  const setPreset = useStore((s) => s.setKeymapPreset);
  const setKeybinding = useStore((s) => s.setKeybinding);
  const resetKeybindings = useStore((s) => s.resetKeybindings);
  const notify = useStore((s) => s.notify);
  useSyncExternalStore(keybindings.subscribe, keybindings.getVersion);
  const commands = useCommands({ includeHidden: true });

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [recordingFor, setRecordingFor] = useState<Recording>(null);
  const [keySearch, setKeySearch] = useState<string | null>(null);
  const [keySearchActive, setKeySearchActive] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery('');
    setRecordingFor(null);
    setKeySearch(null);
    setKeySearchActive(false);
  }, [open]);

  const rows = useMemo(() => buildRows(commands, overrides, preset), [commands, overrides, preset]);

  if (!open) {
    return null;
  }

  const visible = filterRows(rows, filter, query, keySearch);
  const groups = groupByCategory(visible);

  const counts: Record<Filter, number> = {
    all: rows.length,
    modified: rows.filter((r) => r.modified).length,
    conflicts: rows.filter(hasConflict).length,
    unbound: rows.filter((r) => !r.bindings.length).length,
  };

  const sections: DialogSection[] = (['all', 'modified', 'conflicts', 'unbound'] as const).map((id) => ({
    id,
    label: t(`keybindings.filter.${id}`),
    badge: String(counts[id]),
  }));

  const applyBinding = (id: string, binding: string, replace?: string) => {
    const current = keybindings.bindingsFor(id);
    const without = replace ? current.filter((b) => normalizeBinding(b) !== normalizeBinding(replace)) : current;
    if (without.some((b) => normalizeBinding(b) === normalizeBinding(binding))) {
      return;
    }
    setKeybinding(id, [...without, binding]);
  };

  const { exportKeys, importKeys } = useKeymapFile(preset, overrides, setPreset, setKeybinding);

  return (
    <DialogShell
      id="keybindings"
      title={t('shell.dialog.keybindings')}
      icon={Keyboard}
      wide
      sections={sections}
      section={filter}
      onSection={(id) => setFilter(id as Filter)}
      search={query}
      onSearch={(value) => { setKeySearch(null); setQuery(value); }}
      searchPlaceholder={t('keybindings.searchPlaceholder')}
      headerExtra={
        <HeaderExtra
          keySearch={keySearch}
          keySearchActive={keySearchActive}
          onKeySearch={setKeySearch}
          onActive={setKeySearchActive}
          onClearQuery={() => setQuery('')}
          onExport={() => void exportKeys()}
          onImport={() => void importKeys()}
        />
      }
      footer={
        <KeymapFooter shown={visible.length} total={rows.length} canReset={counts.modified > 0} onReset={resetKeybindings} />
      }
    >
      <div className="px-5 py-4">
        <PresetPicker
          preset={preset}
          onPick={(id, name) => {
            setPreset(id);
            notify(t('keybindings.presetApplied', { preset: name }), 'info');
          }}
        />

        {visible.length === 0 && <Empty icon={<Keyboard size={24} strokeWidth={1.4} />} title={t('common.nothingFound')} />}

        <BindingGroups
          groups={groups}
          recordingFor={recordingFor}
          onRecord={setRecordingFor}
          onApply={applyBinding}
          onSetBindings={setKeybinding}
        />
      </div>
    </DialogShell>
  );
}

function sourceOf(modified: boolean, inPreset: boolean, bound: boolean): 'user' | 'preset' | 'addon' | 'none' {
  if (modified) {
    return 'user';
  }
  if (inPreset) {
    return 'preset';
  }
  if (bound) {
    return 'addon';
  }
  return 'none';
}
