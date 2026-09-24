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
 * The Icon Studio: create or edit an icon pack. On the left the kinds of
 * mapping, in the middle the entries (glyph, shape, colour, custom SVG path),
 * on the right an explorer preview and a test showing which rule a file name
 * hits. Nothing is stored until “Save”, which also makes the pack active.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Shapes, Spline, Trash2, X } from 'lucide-react';
import { useStore } from '@/state/store';
import { useT } from '@/i18n';
import { registry } from '@/core/registry';
import {
  explainFileIcon, ICON_SHAPE_NAMES, iconPackProblems, resolveFileIcon, resolveFolderIcon,
} from '@/core/icon-pack';
import type { IconDef, IconPack } from '@/core/types';
import { Button, Empty } from '../ui';
import { IconGlyph } from '../icons/FileIcon';
import { PREVIEW_FILES, PREVIEW_FOLDERS } from './IconPacksSection';

type MapKey = 'fileNames' | 'extensions' | 'languages' | 'folderNames';
type Section = MapKey | 'defaults';

const SECTIONS: Section[] = ['fileNames', 'extensions', 'languages', 'folderNames', 'defaults'];

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/** A new entry: a sensible starting value per kind. */
function starterDef(section: MapKey, key: string): IconDef {
  if (section === 'folderNames') {
    return { shape: 'folder', color: '#7c8cff' };
  }
  if (section === 'fileNames') {
    return { shape: 'file', color: '#9aa3b0' };
  }
  return { glyph: key.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '·', color: '#7c8cff' };
}

/** A copy of the mapping under a renamed key, in the same place. */
function renameKey(map: Record<string, IconDef>, from: string, to: string): Record<string, IconDef> {
  return Object.fromEntries(Object.entries(map).map(([key, def]) => [key === from ? to : key, def]));
}

/** Drop empty fields, so the stored pack stays lean. */
function cleanDef(def: IconDef): IconDef {
  return Object.fromEntries(Object.entries(def).filter(([, value]) => value !== undefined && value !== '')) as IconDef;
}

export function IconStudio() {
  const studio = useStore((s) => s.iconStudio);
  if (!studio) {
    return null;
  }
  return <StudioWindow key={studio.draft.id} initial={studio.draft} />;
}

/** Esc asks to discard, like the cancel button. Re-registered every render, as it reads live state. */
function useEscapeCancel(cancel: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
}

function StudioHeader({ draft, dirty, problems, onDraft, onCancel, onCommit }: {
  draft: IconPack;
  dirty: boolean;
  problems: string[];
  onDraft: (pack: IconPack) => void;
  onCancel: () => void;
  onCommit: () => void;
}) {
  const t = useT();
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-2.5 border-b border-edge px-4 py-2.5">
      <Shapes size={16} className="shrink-0 text-accent" />
      <h2 className="shrink-0 text-[14px] font-medium text-fg">{t('iconPacks.studio.title')}</h2>
      <input
        value={draft.name}
        onChange={(e) => onDraft({ ...draft, name: e.target.value })}
        placeholder={t('iconPacks.studio.name')}
        aria-label={t('iconPacks.studio.name')}
        className="lm-transition ml-2 w-[220px] rounded-lumen-sm border border-edge bg-input px-2 py-1 text-[12.5px] outline-none focus:border-accent"
      />
      <input
        value={draft.author ?? ''}
        onChange={(e) => onDraft({ ...draft, author: e.target.value || undefined })}
        placeholder={t('iconPacks.studio.author')}
        aria-label={t('iconPacks.studio.author')}
        className="lm-transition w-[160px] rounded-lumen-sm border border-edge bg-input px-2 py-1 text-[12.5px] outline-none focus:border-accent"
      />
      <span className="font-mono text-[10.5px] text-subtle">{draft.id}</span>
      {dirty && <span className="lm-anim-fade rounded-full bg-warn/15 px-2 py-0.5 text-[10.5px] text-warn">{t('iconPacks.studio.unsaved')}</span>}
      <span className="flex-1" />
      {problems.length > 0 && (
        <span className="rounded-full bg-bad/15 px-2 py-0.5 text-[10.5px] text-bad" title={problems.join('\n')}>
          {t('iconPacks.studio.problems', { count: problems.length })}
        </span>
      )}
      <Button size="sm" variant="outline" onClick={onCancel}>{t('iconPacks.studio.cancel')}</Button>
      <Button size="sm" variant="solid" disabled={problems.length > 0} onClick={onCommit}>{t('iconPacks.studio.save')}</Button>
      <Button size="sm" title={t('common.closeEsc')} onClick={onCancel}><X size={14} /></Button>
    </header>
  );
}

function StudioNav({ section, count, onSection }: { section: Section; count: (key: MapKey) => number; onSection: (id: Section) => void; }) {
  const t = useT();
  return (
  <nav className="flex w-[190px] shrink-0 flex-col gap-0.5 border-r border-edge p-2">
    {SECTIONS.map((id) => (
      <button
        key={id}
        onClick={() => onSection(id)}
        className={[
          'lm-transition flex h-8 items-center gap-2 rounded-lumen-sm px-2.5 text-left text-[12.5px]',
          id === section ? 'bg-active text-fg' : 'text-muted hover:bg-hover hover:text-fg',
        ].join(' ')}
      >
        <span className="min-w-0 flex-1 truncate">{t(`iconPacks.studio.sections.${id}`)}</span>
        {id !== 'defaults' && <span className="font-mono text-[10px] text-subtle">{count(id)}</span>}
      </button>
    ))}
  </nav>
  );
}

function StudioWindow({ initial }: { initial: IconPack; }) {
  const t = useT();
  const close = useStore((s) => s.closeIconStudio);
  const save = useStore((s) => s.saveCustomIconPack);
  const setIconPack = useStore((s) => s.setIconPack);
  const [draft, setDraft] = useState<IconPack>(initial);
  const [section, setSection] = useState<Section>('fileNames');
  const problems = useMemo(() => iconPackProblems(draft), [draft]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);

  const cancel = () => {
    if (dirty && !confirm(t('iconPacks.studio.discard'))) {
      return;
    }
    close();
  };

  const commit = () => {
    if (problems.length) {
      return;
    }
    save(draft);
    setIconPack(draft.id);
    close();
  };

  useEscapeCancel(cancel);

  const count = (key: MapKey) => Object.keys(draft[key] ?? {}).length;

  return (
    <div className="lm-anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div
        role="dialog"
        aria-label={t('iconPacks.studio.title')}
        className="lm-glass lm-shadow lm-anim-dialog flex h-full max-h-[900px] w-full max-w-[1320px] flex-col overflow-hidden rounded-lumen-lg border border-edge"
      >
        <StudioHeader
          draft={draft}
          dirty={dirty}
          problems={problems}
          onDraft={setDraft}
          onCancel={cancel}
          onCommit={commit}
        />

        <div className="flex min-h-0 flex-1">
          <StudioNav section={section} count={count} onSection={setSection} />

          <div key={section} className="lm-anim-fade flex min-w-0 flex-1 flex-col">
            <p className="shrink-0 border-b border-edge/60 px-4 py-2 text-[11.5px] leading-snug text-subtle">
              {t(`iconPacks.studio.hints.${section}`)}
            </p>
            {section === 'defaults'
              ? <DefaultsEditor draft={draft} onChange={setDraft} />
              : <MapEditor section={section} draft={draft} onChange={setDraft} />}
          </div>

          <Preview draft={draft} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Mappings
 * ------------------------------------------------------------------ */

function MapEditor({ section, draft, onChange }: { section: MapKey; draft: IconPack; onChange: (pack: IconPack) => void; }) {
  const t = useT();
  const [newKey, setNewKey] = useState('');
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const map = draft[section] ?? {};
  const languages = useMemo(() => registry.languages(), []);

  const setMap = (next: Record<string, IconDef>) => onChange({ ...draft, [section]: next });

  const add = () => {
    const key = newKey.trim().toLowerCase().replace(section === 'extensions' ? /^\.+/ : /^$/, '');
    if (!key) {
      return;
    }
    if (map[key]) {
      setError(t('iconPacks.studio.exists', { key }));
      return;
    }
    // New entries on top, so they are visible at once.
    setMap({ [key]: starterDef(section, key), ...map });
    setNewKey('');
    setError(null);
  };

  const needle = filter.trim().toLowerCase();
  const entries = Object.entries(map).filter(([key]) => !needle || key.includes(needle));
  const unmapped = languages.filter((language) => !map[language.id]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-2">
        {section === 'languages' ? (
          <select
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="w-[220px] rounded-lumen-sm border border-edge bg-input px-2 py-1 text-[12.5px] outline-none focus:border-accent"
          >
            <option value="">{t('iconPacks.studio.keyPlaceholder.languages')}</option>
            {unmapped.map((language) => <option key={language.id} value={language.id}>{language.name} ({language.id})</option>)}
          </select>
        ) : (
          <input
            value={newKey}
            onChange={(e) => { setNewKey(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') {
              add();
            } }}
            placeholder={t(`iconPacks.studio.keyPlaceholder.${section}`)}
            className="w-[220px] rounded-lumen-sm border border-edge bg-input px-2 py-1 font-mono text-[12.5px] outline-none focus:border-accent"
          />
        )}
        <Button size="sm" variant="solid" disabled={!newKey.trim()} onClick={add}><Plus size={12} /> {t('iconPacks.studio.add')}</Button>
        {error && <span className="text-[11.5px] text-bad">{error}</span>}
        <span className="flex-1" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('iconPacks.studio.filter')}
          className="w-[160px] rounded-lumen-sm border border-edge bg-input px-2 py-1 text-[12px] outline-none focus:border-accent"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {entries.length > 0 && <ColumnHeader />}
        {entries.length === 0 && <Empty icon={<Shapes size={24} />} title={t('iconPacks.studio.empty')} />}
        {entries.map(([key, def]) => (
          <EntryRow
            key={key}
            entryKey={key}
            def={def}
            renameable={section !== 'languages'}
            taken={(candidate) => candidate !== key && Boolean(map[candidate])}
            onRename={(to) => setMap(renameKey(map, key, to))}
            onChange={(next) => setMap({ ...map, [key]: next })}
            onRemove={() => setMap(Object.fromEntries(Object.entries(map).filter(([other]) => other !== key)))}
          />
        ))}
      </div>
    </div>
  );
}

function DefaultsEditor({ draft, onChange }: { draft: IconPack; onChange: (pack: IconPack) => void; }) {
  const t = useT();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
      <ColumnHeader />
      <EntryRow
        entryKey={t('iconPacks.studio.defaultFile')}
        def={draft.file ?? {}}
        onChange={(file) => onChange({ ...draft, file })}
      />
      <EntryRow
        entryKey={t('iconPacks.studio.defaultFolder')}
        def={draft.folder ?? {}}
        onChange={(folder) => onChange({ ...draft, folder })}
      />
    </div>
  );
}

/** Column headers matching `EntryRow`. */
function ColumnHeader() {
  const t = useT();
  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 bg-overlay px-1 py-1.5 text-[10.5px] tracking-wider text-subtle uppercase">
      <span className="w-6 shrink-0" />
      <span className="w-[200px] px-1.5" />
      <span className="w-[64px] text-center">{t('iconPacks.studio.glyph')}</span>
      <span className="w-[120px]">{t('iconPacks.studio.shape')}</span>
      <span>{t('iconPacks.studio.color')}</span>
    </div>
  );
}

function EntryRow({ entryKey, def, renameable = false, taken, onRename, onChange, onRemove }: {
  entryKey: string;
  def: IconDef;
  renameable?: boolean;
  taken?: (candidate: string) => boolean;
  onRename?: (to: string) => void;
  onChange: (def: IconDef) => void;
  onRemove?: () => void;
}) {
  const t = useT();
  const [keyText, setKeyText] = useState(entryKey);
  const [showPath, setShowPath] = useState(Boolean(def.path));
  const update = (patch: Partial<IconDef>) => onChange(cleanDef({ ...def, ...patch }));

  const commitKey = () => {
    const next = keyText.trim().toLowerCase();
    if (!next || next === entryKey || taken?.(next)) {
      setKeyText(entryKey);
      return;
    }
    onRename?.(next);
  };

  return (
    <div className="group rounded-lumen-sm px-1 py-1 hover:bg-hover/60">
      <div className="flex items-center gap-2">
        <span className="flex w-6 shrink-0 justify-center"><IconGlyph icon={def} size={16} /></span>
        {renameable ? (
          <input
            value={keyText}
            onChange={(e) => setKeyText(e.target.value)}
            onBlur={commitKey}
            onKeyDown={(e) => { if (e.key === 'Enter') {
              (e.target as HTMLInputElement).blur();
            } }}
            className="w-[200px] min-w-0 rounded-[5px] border border-transparent bg-transparent px-1.5 py-0.5 font-mono text-[12px] text-fg outline-none hover:border-edge focus:border-accent focus:bg-input"
          />
        ) : (
          <span className="w-[200px] truncate px-1.5 font-mono text-[12px] text-fg">{entryKey}</span>
        )}
        <input
          value={def.glyph ?? ''}
          maxLength={3}
          onChange={(e) => update({ glyph: e.target.value || undefined })}
          placeholder="·"
          title={t('iconPacks.studio.glyph')}
          className="w-[64px] rounded-[5px] border border-edge bg-input px-1.5 py-0.5 text-center font-mono text-[12px] font-bold outline-none focus:border-accent"
        />
        <ShapePicker value={def.shape} color={def.color} onChange={(shape) => update({ shape })} />
        <ColorInput value={def.color} onChange={(color) => update({ color })} />
        <Button size="sm" title={t('iconPacks.studio.path')} onClick={() => setShowPath((v) => !v)}>
          <Spline size={12} className={def.path ? 'text-accent' : ''} />
        </Button>
        <span className="flex-1" />
        {onRemove && (
          <Button size="sm" variant="danger" title={t('iconPacks.studio.remove')} onClick={onRemove}>
            <Trash2 size={12} />
          </Button>
        )}
      </div>
      {showPath && (
        <input
          value={def.path ?? ''}
          onChange={(e) => update({ path: e.target.value || undefined })}
          placeholder={`${t('iconPacks.studio.path')} — M4 4h16v16H4z`}
          className="lm-anim-expand mt-1 ml-8 w-[calc(100%-2.5rem)] rounded-[5px] border border-edge bg-input px-1.5 py-0.5 font-mono text-[11.5px] outline-none focus:border-accent"
        />
      )}
    </div>
  );
}

function ShapePicker({ value, color, onChange }: { value?: string; color?: string; onChange: (shape: string | undefined) => void; }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const needle = filter.trim().toLowerCase();
  const shapes = needle ? ICON_SHAPE_NAMES.filter((shape) => shape.includes(needle)) : ICON_SHAPE_NAMES;

  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (event: MouseEvent) => {
      if (root.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={t('iconPacks.studio.shape')}
        className="lm-transition flex h-[24px] w-[120px] items-center gap-1.5 rounded-[5px] border border-edge bg-input px-1.5 text-[11.5px] text-muted hover:border-edge-strong"
      >
        {value ? <IconGlyph icon={{ shape: value, color }} size={13} /> : <span className="w-[13px]" />}
        <span className="min-w-0 flex-1 truncate text-left">{value ?? t('iconPacks.studio.noShape')}</span>
        <ChevronDown size={11} className="shrink-0" />
      </button>
      {open && (
        <div className="lm-glass lm-shadow lm-anim-pop absolute top-full left-0 z-30 mt-1 w-[304px] rounded-lumen border border-edge p-1.5">
          <button
            onClick={() => { onChange(undefined); setOpen(false); }}
            className="lm-transition mb-1 w-full rounded-[5px] px-2 py-1 text-left text-[11.5px] text-muted hover:bg-hover hover:text-fg"
          >
            {t('iconPacks.studio.noShape')}
          </button>
          <input
            autoFocus
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') {
              setOpen(false);
            } }}
            placeholder={t('iconPacks.studio.shapeFilter')}
            className="mb-1 w-full rounded-[5px] border border-edge bg-input px-2 py-1 text-[11.5px] outline-none focus:border-accent"
          />
          {shapes.length === 0 && <div className="px-2 py-3 text-center text-[11.5px] text-subtle">{t('iconPacks.studio.noShapeFound')}</div>}
          <div className="grid max-h-[260px] grid-cols-8 gap-0.5 overflow-y-auto">
            {shapes.map((shape) => (
              <button
                key={shape}
                title={shape}
                onClick={() => { onChange(shape); setOpen(false); }}
                className={[
                  'lm-transition flex size-[34px] items-center justify-center rounded-[5px] hover:bg-hover',
                  shape === value ? 'bg-active ring-1 ring-accent' : '',
                ].join(' ')}
              >
                <IconGlyph icon={{ shape, color: color ?? 'var(--c-text)' }} size={16} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ColorInput({ value, onChange }: { value?: string; onChange: (color: string | undefined) => void; }) {
  const t = useT();
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  const swatch = value && HEX6.test(value) ? value : '#7c8cff';
  return (
    <div className="flex items-center gap-1" title={t('iconPacks.studio.color')}>
      <input
        type="color"
        value={swatch}
        onChange={(e) => onChange(e.target.value)}
        className="size-[22px] cursor-pointer rounded-[4px] border border-edge bg-transparent p-0"
      />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(text.trim() || undefined)}
        onKeyDown={(e) => { if (e.key === 'Enter') {
          (e.target as HTMLInputElement).blur();
        } }}
        placeholder="#rrggbb"
        className="w-[150px] rounded-[5px] border border-edge bg-input px-1.5 py-0.5 font-mono text-[11.5px] outline-none focus:border-accent"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Preview
 * ------------------------------------------------------------------ */

function Preview({ draft }: { draft: IconPack; }) {
  const t = useT();
  const [name, setName] = useState('');
  const languages = useMemo(() => registry.languages(), []);
  const trimmed = name.trim();
  const rule = trimmed ? explainFileIcon(draft, trimmed, languages) : null;

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-edge">
      <div className="shrink-0 px-3 pt-2.5 pb-1 text-[10.5px] tracking-wider text-subtle uppercase">{t('iconPacks.studio.preview')}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 text-[12.5px]">
        {PREVIEW_FOLDERS.map((folder, index) => {
          const icon = resolveFolderIcon(draft, folder);
          const shaped = Boolean(icon.shape || icon.path || icon.glyph);
          const open = index === 0;
          return (
            <div key={folder}>
              <div className="lm-row text-muted">
                <ChevronRight size={13} className="shrink-0 opacity-70" style={{ transform: open ? 'rotate(90deg)' : 'none', color: shaped ? undefined : icon.color }} />
                {shaped && <IconGlyph icon={open && icon.shape === 'folder' ? { ...icon, shape: 'folder-open' } : icon} size={14} />}
                <span className="truncate text-fg">{folder}</span>
              </div>
              {open && PREVIEW_FILES.map((file) => (
                <div key={file} className="lm-row" style={{ paddingLeft: 28 }}>
                  <span className="flex w-[15px] shrink-0 justify-center"><IconGlyph icon={resolveFileIcon(draft, file, languages)} size={13} /></span>
                  <span className="truncate text-fg">{file}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="shrink-0 border-t border-edge p-2.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('iconPacks.studio.tryName')}
          className="w-full rounded-lumen-sm border border-edge bg-input px-2 py-1 font-mono text-[12px] outline-none focus:border-accent"
        />
        {rule && (
          <div className="lm-anim-fade mt-2 flex items-center gap-2 text-[11.5px] text-muted">
            <IconGlyph icon={resolveFileIcon(draft, trimmed, languages)} size={16} />
            <span className="min-w-0 truncate">{t(`iconPacks.studio.rule.${rule.rule}`, { key: rule.key })}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
