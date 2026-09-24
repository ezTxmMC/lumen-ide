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
 * One setting of an installed extension, drawn for its type.
 *
 * The values live in the application settings rather than in the manifest, so
 * updating the extension never overwrites what someone typed. Secrets are the
 * exception: they go straight to the main process, encrypted with the
 * system's key store, and the interface only learns whether one is set.
 */

import { useEffect, useState } from 'react';
import { FolderOpen, KeyRound, Plus, RotateCcw, X } from 'lucide-react';
import { useStore } from '@/state/store';
import { useLanguage, useT } from '@/i18n';
import type { ExtensionSetting } from '@/core/extensions/types';
import { localizeSetting } from '@/core/extensions/localize';
import { Button, Select, Toggle } from '../ui';

const inputClass = 'lm-transition w-full rounded-lumen-sm border border-edge bg-input px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-accent';

/** The value a setting has when nobody changed it. */
export function settingDefault(setting: ExtensionSetting): string {
  return setting.default ?? (setting.type === 'toggle' ? 'false' : '');
}

/** The value a setting has for its extension, with its default. */
export function settingValue(values: Record<string, string> | undefined, setting: ExtensionSetting): string {
  return values?.[setting.key] ?? settingDefault(setting);
}

/** Differs from the default? Secrets are never counted — their value is not known here. */
export function settingChanged(values: Record<string, string> | undefined, setting: ExtensionSetting): boolean {
  if (setting.type === 'secret') {
    return false;
  }
  return settingValue(values, setting) !== settingDefault(setting);
}

/** `multiselect` values are comma-separated, `list` values one per line. */
export const splitMulti = (value: string) => value.split(',').map((part) => part.trim()).filter(Boolean);
export const splitList = (value: string) => value.split('\n').filter((line) => line.trim() !== '');

/**
 * Does `when` hold? `"key"` needs a toggle that is on (or any non-empty
 * value), `"key=value"` an exact value, `"!key"` the opposite of `"key"`.
 */
export function settingVisible(setting: ExtensionSetting, settings: ExtensionSetting[], values: Record<string, string> | undefined): boolean {
  const condition = setting.when?.trim();
  if (!condition) {
    return true;
  }
  const negated = condition.startsWith('!');
  const [key, expected] = condition.replace(/^!/, '').split('=', 2);
  const other = settings.find((entry) => entry.key === key);
  if (!other) {
    return true;
  }
  const value = settingValue(values, other);
  const holds = expected === undefined ? value !== '' && value !== 'false' : value === expected;
  return negated ? !holds : holds;
}

function Label({ text, htmlFor }: { text: string; htmlFor?: string; }) {
  return <label htmlFor={htmlFor} className="mb-1 block text-[11.5px] text-muted">{text}</label>;
}

/** Marks a changed value and offers to put the default back. */
function ChangedMark({ changed, onReset }: { changed: boolean; onReset: () => void; }) {
  const t = useT();
  if (!changed) {
    return null;
  }
  return (
    <button
      type="button"
      onClick={onReset}
      title={t('settings.ext.reset')}
      className="lm-transition absolute -left-4 top-3 flex size-3 items-center justify-center rounded-full text-accent opacity-80 hover:opacity-100"
    >
      <span className="size-1.5 rounded-full bg-accent group-hover/setting:hidden" />
      <RotateCcw size={11} className="hidden group-hover/setting:block" />
    </button>
  );
}

function MultiSelectSetting({ setting, label, current, write }: {
  setting: ExtensionSetting;
  label: string;
  current: string;
  write: (next: string) => void;
}) {
  const selected = new Set(splitMulti(current));
  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) {
      next.delete(value);
    }
    if (!selected.has(value)) {
      next.add(value);
    }
    write((setting.choices ?? []).map((choice) => choice.value).filter((choice) => next.has(choice)).join(','));
  };
  return (
    <div className="py-2">
      <Label text={label} />
      <div className="flex flex-wrap gap-1.5">
        {(setting.choices ?? []).map((choice) => (
          <button
            key={choice.value}
            type="button"
            onClick={() => toggle(choice.value)}
            className={[
              'lm-transition rounded-full border px-2.5 py-0.5 text-[11.5px]',
              selected.has(choice.value) ? 'border-accent bg-accent/15 text-fg' : 'border-edge text-muted hover:border-edge-strong hover:text-fg',
            ].join(' ')}
          >
            {choice.label}
          </button>
        ))}
      </div>
      <Hint text={setting.hint} />
    </div>
  );
}

function ListSetting({ setting, label, current, write }: {
  setting: ExtensionSetting;
  label: string;
  current: string;
  write: (next: string) => void;
}) {
  const t = useT();
  const entries = splitList(current);
  const [draft, setDraft] = useState('');
  const set = (next: string[]) => write(next.join('\n'));
  const add = () => {
    if (!draft.trim()) {
      return;
    }
    set([...entries, draft.trim()]);
    setDraft('');
  };
  return (
    <div className="py-2">
      <Label text={label} />
      <div className="flex flex-col gap-1">
        {entries.map((entry, index) => (
          <div key={`${index}-${entry}`} className="group flex items-center gap-1.5">
            <input
              value={entry}
              spellCheck={false}
              onChange={(e) => set(entries.map((old, i) => (i === index ? e.target.value : old)))}
              className={inputClass}
            />
            <Button size="sm" title={t('settings.ext.removeEntry')} onClick={() => set(entries.filter((_, i) => i !== index))}>
              <X size={12} />
            </Button>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <input
            value={draft}
            spellCheck={false}
            placeholder={setting.placeholder ?? t('settings.ext.addEntry')}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') {
              add();
            } }}
            className={inputClass}
          />
          <Button size="sm" variant="outline" disabled={!draft.trim()} title={t('settings.ext.addEntry')} onClick={add}>
            <Plus size={12} />
          </Button>
        </div>
      </div>
      <Hint text={setting.hint} />
    </div>
  );
}

function Hint({ text }: { text?: string; }) {
  if (!text) {
    return null;
  }
  return <p className="mt-1 text-[11.5px] leading-snug text-subtle">{text}</p>;
}

function SecretSetting({ extensionId, setting, label }: { extensionId: string; setting: ExtensionSetting; label: string; }) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const [isSet, setIsSet] = useState<boolean | null>(null);
  const notify = useStore((s) => s.notify);

  useEffect(() => {
    void window.lumen.extensionHost.hasSecret(extensionId, setting.key).then(setIsSet).catch(() => setIsSet(false));
  }, [extensionId, setting.key]);

  const save = async (value: string) => {
    try {
      await window.lumen.extensionHost.setSecret(extensionId, setting.key, value);
      setIsSet(Boolean(value));
      setDraft('');
      notify(t(value ? 'settings.ext.secretSaved' : 'settings.ext.secretCleared'), 'success');
    } catch (err) {
      notify((err as Error).message, 'error');
    }
  };

  return (
    <div className="py-2">
      <Label text={label} />
      <div className="flex items-center gap-1.5">
        <KeyRound size={13} className={isSet ? 'shrink-0 text-ok' : 'shrink-0 text-subtle'} />
        <input
          type="password"
          autoComplete="off"
          value={draft}
          placeholder={isSet ? t('settings.ext.secretSet') : (setting.placeholder ?? t('settings.ext.secretNotSet'))}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && draft) {
            void save(draft);
          } }}
          className={inputClass}
        />
        <Button size="sm" variant="outline" disabled={!draft} onClick={() => void save(draft)}>{t('common.save')}</Button>
        {isSet && <Button size="sm" variant="danger" onClick={() => void save('')}>{t('settings.ext.secretClear')}</Button>}
      </div>
      <Hint text={setting.hint} />
    </div>
  );
}

/**
 * A setting with the mark for a changed value in front. `extensionName` goes
 * before the label where settings of several extensions stand together (the
 * search results); on an extension's own page it is left out.
 */
export function ExtensionSettingRow(props: {
  extensionId: string;
  extensionName?: string;
  setting: ExtensionSetting;
}) {
  const values = useStore((s) => s.extensionSettings[props.extensionId]);
  const setSetting = useStore((s) => s.setExtensionSetting);
  const changed = settingChanged(values, props.setting);
  return (
    <div className="group/setting relative">
      <ChangedMark changed={changed} onReset={() => setSetting(props.extensionId, props.setting.key, settingDefault(props.setting))} />
      <SettingControl {...props} />
    </div>
  );
}

interface BasicProps {
  setting: ExtensionSetting;
  label: string;
  current: string;
  write(next: string): void;
}

function SelectSetting({ setting, label, current, write }: BasicProps) {
  return (
    <div className="py-2">
      <Select
        label={label}
        value={current}
        options={(setting.choices ?? []).map((choice) => ({ value: choice.value, label: choice.label }))}
        onChange={write}
      />
      <Hint text={setting.hint} />
    </div>
  );
}

function TextareaSetting({ setting, label, current, write }: BasicProps) {
  return (
    <div className="py-2">
      <Label text={label} />
      <textarea
        value={current}
        rows={setting.rows ?? 4}
        spellCheck={false}
        placeholder={setting.placeholder}
        onChange={(e) => write(e.target.value)}
        className={`${inputClass} resize-y`}
      />
      <Hint text={setting.hint} />
    </div>
  );
}

function ColorSetting({ setting, label, current, write }: BasicProps) {
  return (
    <div className="py-2">
      <Label text={label} />
      <div className="flex items-center gap-2">
        <input type="color" value={current || '#7c8cff'} onChange={(e) => write(e.target.value)} className="h-7 w-10 shrink-0 cursor-pointer rounded border border-edge bg-input" />
        <input value={current} spellCheck={false} onChange={(e) => write(e.target.value)} className={inputClass} />
      </div>
      <Hint text={setting.hint} />
    </div>
  );
}

function PathSetting({ setting, label, current, write }: BasicProps) {
  const t = useT();
  const choose = async () => {
    const picked = setting.pathKind === 'folder'
      ? await window.lumen.dialog.chooseFolder(setting.label, current || undefined)
      : await window.lumen.dialog.chooseFile(setting.label, current || undefined);
    if (picked) {
      write(picked);
    }
  };
  return (
    <div className="py-2">
      <Label text={label} />
      <div className="flex items-center gap-1.5">
        <input value={current} spellCheck={false} placeholder={setting.placeholder} onChange={(e) => write(e.target.value)} className={inputClass} />
        <Button size="sm" variant="outline" title={t('settings.ext.choose')} onClick={() => void choose()}>
          <FolderOpen size={12} />
        </Button>
      </div>
      <Hint text={setting.hint} />
    </div>
  );
}

/** Numbers and plain text. */
function TextSetting({ setting, label, current, write }: BasicProps) {
  return (
    <div className="py-2">
      <Label text={label} />
      <input
        type={setting.type === 'number' ? 'number' : 'text'}
        min={setting.min}
        max={setting.max}
        step={setting.step}
        value={current}
        spellCheck={false}
        placeholder={setting.placeholder}
        onChange={(e) => write(e.target.value)}
        className={inputClass}
      />
      <Hint text={setting.hint} />
    </div>
  );
}

function SettingControl({ extensionId, extensionName, setting: declared }: {
  extensionId: string;
  extensionName?: string;
  setting: ExtensionSetting;
}) {
  const setting = localizeSetting(declared, useLanguage());
  const values = useStore((s) => s.extensionSettings[extensionId]);
  const setSetting = useStore((s) => s.setExtensionSetting);
  const current = settingValue(values, setting);
  const label = extensionName ? `${extensionName} · ${setting.label}` : setting.label;
  const write = (next: string) => setSetting(extensionId, setting.key, next);

  if (setting.type === 'multiselect') {
    return <MultiSelectSetting setting={setting} label={label} current={current} write={write} />;
  }
  if (setting.type === 'list') {
    return <ListSetting setting={setting} label={label} current={current} write={write} />;
  }

  if (setting.type === 'secret') {
    return <SecretSetting extensionId={extensionId} setting={setting} label={label} />;
  }

  if (setting.type === 'toggle') {
    return <Toggle label={label} hint={setting.hint} checked={current === 'true'} onChange={(v) => write(String(v))} />;
  }

  const basic = { setting, label, current, write };
  if (setting.type === 'select') {
    return <SelectSetting {...basic} />;
  }
  if (setting.type === 'textarea') {
    return <TextareaSetting {...basic} />;
  }
  if (setting.type === 'color') {
    return <ColorSetting {...basic} />;
  }
  if (setting.type === 'path') {
    return <PathSetting {...basic} />;
  }
  return <TextSetting {...basic} />;
}
