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
 * The Studio's “project kinds” area: detection through marker files and
 * content rules, tasks (build, run, test …) with an optional wrapper, and
 * facts for the project panel. On the right, a test against the open folder.
 */

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleSlash, FolderSearch, Hammer, Trash2 } from 'lucide-react';
import { t as translate, useT } from '@/i18n';
import { useStore } from '@/state/store';
import { registry } from '@/core/registry';
import { markerMatches, projectContext } from '@/core/project/detect';
import { compileProjectKind } from '@/core/user-addons/compile';
import type { UserAddonModel, UserKindTask, UserProjectKind } from '@/core/user-addons/schema';
import type { ValidationIssue } from '@/core/user-addons/validate';
import type { ProjectMeta, ProjectTask } from '@/core/types';
import { Button, Empty } from '../ui';
import {
  AddButton, ChipInput, ColorField, Heading, ItemList, NumberField, TextField, inputClass,
} from './fields';

const GROUPS = ['build', 'run', 'test', 'clean', 'other'] as const;

export function newKind(existing: UserProjectKind[]): UserProjectKind {
  let n = existing.length + 1;
  while (existing.some((kind) => kind.id === `art${n}`)) {
    n++;
  }
  return {
    id: `art${n}`,
    name: translate('studioProject.kinds.defaultName', { n }),
    icon: 'P',
    markers: ['build.gradle.kts'],
    rules: [],
    tasks: [{ id: 'build', label: translate('studioProject.kinds.defaultTask'), command: 'gradle', args: ['build'], group: 'build', wrapper: 'gradlew' }],
    facts: [],
  };
}

interface TestResult {
  markers: string[];
  detected: boolean;
  tasks: ProjectTask[];
  meta: ProjectMeta;
}

type Patch = (next: Partial<UserProjectKind>) => void;

type FieldError = (field: string) => string | null;

function KindBasics({ model, kind, languageIds, fieldError, patch }: { model: UserAddonModel; kind: UserProjectKind; languageIds: string[]; fieldError: FieldError; patch: Patch; }) {
  const t = useT();
  return (
    <>
    <Heading title={t('studioProject.kinds.basics')} hint={t('studioProject.kinds.basicsHint', { id: `${model.id}.${kind.id}` })} />
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
      <TextField mono label={t('studioProject.kinds.id')} value={kind.id} error={fieldError('id')} onChange={(id) => patch({ id })} />
      <TextField label={t('common.name')} value={kind.name} error={fieldError('name')} onChange={(name) => patch({ name })} />
      <TextField label={t('studioProject.kinds.icon')} value={kind.icon} onChange={(icon) => patch({ icon: icon.slice(0, 2) || undefined })} />
      <ColorField label={t('addonStudio.general.color')} value={kind.color} onChange={(color) => patch({ color })} />
      <NumberField label={t('studioProject.kinds.priority')} hint={t('studioProject.kinds.priorityHint')} value={kind.priority ?? 0} min={-100} max={100} onChange={(priority) => patch({ priority })} />
      <ChipInput label={t('studioProject.kinds.languages')} values={kind.languageIds} placeholder={languageIds.slice(0, 3).join(', ')} onChange={(languageIds) => patch({ languageIds })} />
    </div>

    <Heading title={t('studioProject.kinds.detection')} hint={t('studioProject.kinds.detectionHint')} />
    <ChipInput allowSpaces label={t('studioProject.kinds.markers')} hint={t('studioProject.kinds.markersHint')} values={kind.markers} onChange={(markers) => patch({ markers })} />
    {fieldError('markers') && <p className="mt-1 text-[11px] text-bad">{fieldError('markers')}</p>}
    </>
  );
}

function KindRules({ kind, fieldError, patch }: { kind: UserProjectKind; fieldError: FieldError; patch: Patch; }) {
  const t = useT();
  const rules = kind.rules ?? [];
  return (
    <>
    <Heading
      title={t('studioProject.kinds.rules')}
      hint={t('studioProject.kinds.rulesHint')}
      action={<AddButton label={t('common.add')} onClick={() => patch({ rules: [...rules, { file: kind.markers[0] ?? '', pattern: '' }] })} />}
    />
    {fieldError('rules') && <p className="mb-1.5 text-[11px] text-bad">{fieldError('rules')}</p>}
    {rules.map((rule, i) => (
      <div key={i} className="mb-1.5 grid grid-cols-[1fr_2fr_auto] items-end gap-2 rounded-lumen-sm border border-edge p-2">
        <TextField mono label={t('studioProject.kinds.ruleFile')} value={rule.file} onChange={(file) => patch({ rules: rules.map((r, j) => (j === i ? { ...r, file } : r)) })} />
        <TextField mono label={t('studioProject.kinds.rulePattern')} placeholder="io\.papermc\.paperweight" value={rule.pattern} onChange={(pattern) => patch({ rules: rules.map((r, j) => (j === i ? { ...r, pattern: pattern || undefined } : r)) })} />
        <Button size="sm" variant="danger" title={t('common.remove')} onClick={() => patch({ rules: rules.filter((_, j) => j !== i) })}>
          <Trash2 size={12} />
        </Button>
      </div>
    ))}
    </>
  );
}

function KindTasks({ kind, fieldError, patch }: { kind: UserProjectKind; fieldError: FieldError; patch: Patch; }) {
  const t = useT();
  const patchTask = (i: number, next: Partial<UserKindTask>) => patch({ tasks: kind.tasks.map((task, j) => (j === i ? { ...task, ...next } : task)) });
  return (
    <>
    <Heading
      title={t('studioProject.kinds.tasks')}
      hint={t('studioProject.kinds.tasksHint')}
      action={<AddButton label={t('common.add')} onClick={() => patch({ tasks: [...kind.tasks, { id: `aufgabe${kind.tasks.length + 1}`, label: '', command: '', args: [], group: 'other' }] })} />}
    />
    {fieldError('tasks') && <p className="mb-1.5 text-[11px] text-bad">{fieldError('tasks')}</p>}
    {kind.tasks.map((task, i) => (
      <div key={i} className="mb-1.5 grid grid-cols-4 items-end gap-2 rounded-lumen-sm border border-edge p-2">
        <TextField mono label={t('studioProject.kinds.taskId')} value={task.id} onChange={(id) => patchTask(i, { id })} />
        <TextField label={t('addonStudio.languages.runLabel')} value={task.label} onChange={(label) => patchTask(i, { label })} />
        <label className="min-w-0">
          <span className="mb-1 block text-[11.5px] text-muted">{t('studioProject.kinds.group')}</span>
          <select value={task.group ?? 'other'} onChange={(e) => patchTask(i, { group: e.target.value as UserKindTask['group'] })} className={`${inputClass} border-edge`}>
            {GROUPS.map((group) => <option key={group} value={group}>{t(`studioProject.kinds.groups.${group}`)}</option>)}
          </select>
        </label>
        <div className="flex justify-end">
          <Button size="sm" variant="danger" title={t('common.remove')} onClick={() => patch({ tasks: kind.tasks.filter((_, j) => j !== i) })}>
            <Trash2 size={12} />
          </Button>
        </div>
        <TextField mono label={t('addonStudio.languages.command')} value={task.command} onChange={(command) => patchTask(i, { command })} />
        <TextField mono label={t('studioProject.kinds.wrapper')} hint={t('studioProject.kinds.wrapperHint')} placeholder="gradlew" value={task.wrapper} onChange={(wrapper) => patchTask(i, { wrapper: wrapper || undefined })} />
        <ChipInput className="col-span-2" allowSpaces label={t('addonStudio.languages.args')} values={task.args} onChange={(args) => patchTask(i, { args })} />
      </div>
    ))}
    </>
  );
}

function KindFacts({ kind, fieldError, patch }: { kind: UserProjectKind; fieldError: FieldError; patch: Patch; }) {
  const t = useT();
  const facts = kind.facts ?? [];
  return (
    <>
    <Heading
      title={t('studioProject.kinds.facts')}
      hint={t('studioProject.kinds.factsHint')}
      action={<AddButton label={t('common.add')} onClick={() => patch({ facts: [...facts, { label: '', file: kind.markers[0] ?? '', pattern: '' }] })} />}
    />
    {fieldError('facts') && <p className="mb-1.5 text-[11px] text-bad">{fieldError('facts')}</p>}
    {facts.map((fact, i) => (
      <div key={i} className="mb-1.5 grid grid-cols-[1fr_1fr_2fr_1fr_auto] items-end gap-2 rounded-lumen-sm border border-edge p-2">
        <TextField label={t('studioProject.kinds.factLabel')} value={fact.label} onChange={(label) => patch({ facts: facts.map((f, j) => (j === i ? { ...f, label } : f)) })} />
        <TextField mono label={t('studioProject.kinds.ruleFile')} value={fact.file} onChange={(file) => patch({ facts: facts.map((f, j) => (j === i ? { ...f, file } : f)) })} />
        <TextField mono label={t('studioProject.kinds.factPattern')} placeholder={'^version\\s*=\\s*"([^"]+)"'} value={fact.pattern} onChange={(pattern) => patch({ facts: facts.map((f, j) => (j === i ? { ...f, pattern } : f)) })} />
        <label className="min-w-0">
          <span className="mb-1 block text-[11.5px] text-muted">{t('studioProject.kinds.factRole')}</span>
          <select value={fact.role ?? ''} onChange={(e) => patch({ facts: facts.map((f, j) => (j === i ? { ...f, role: (e.target.value || undefined) as typeof f.role } : f)) })} className={`${inputClass} border-edge`}>
            <option value="">{t('studioProject.kinds.roles.fact')}</option>
            <option value="name">{t('studioProject.kinds.roles.name')}</option>
            <option value="version">{t('studioProject.kinds.roles.version')}</option>
          </select>
        </label>
        <Button size="sm" variant="danger" title={t('common.remove')} onClick={() => patch({ facts: facts.filter((_, j) => j !== i) })}>
          <Trash2 size={12} />
        </Button>
      </div>
    ))}
    </>
  );
}

export function KindsPage({
  model, onChange, issues, focus,
}: {
  model: UserAddonModel;
  onChange: (kinds: UserProjectKind[]) => void;
  issues: ValidationIssue[];
  focus?: { index: number; token: number; } | null;
}) {
  const t = useT();
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    if (focus) {
      setSelected(focus.index);
    }
  }, [focus]);

  const kinds = model.projectKinds;
  const index = Math.min(selected, kinds.length - 1);
  const kind = kinds[index];
  const languageIds = useMemo(() => [
    ...new Set([...model.languages.map((l) => l.id), ...registry.languages().map((l) => l.id)]),
  ], [model.languages]);

  if (!kind) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <Empty icon={<Hammer size={28} strokeWidth={1.4} />} title={t('studioProject.kinds.empty')} hint={t('studioProject.kinds.emptyHint')} />
        <Button variant="solid" onClick={() => { onChange([newKind(kinds)]); setSelected(0); }}>{t('studioProject.kinds.add')}</Button>
      </div>
    );
  }

  const patch = (next: Partial<UserProjectKind>) => onChange(kinds.map((entry, i) => (i === index ? { ...entry, ...next } : entry)));
  const fieldError = (field: string) => issues.filter((i) => i.index === index && i.field === field).map((i) => i.message).join(' · ') || null;

  return (
    <div className="flex h-full min-h-0">
      <ItemList
        items={kinds}
        selected={index}
        onSelect={setSelected}
        render={(entry) => ({ title: entry.name || entry.id, subtitle: entry.markers.join(', '), color: entry.color ?? model.color })}
        onAdd={() => { onChange([...kinds, newKind(kinds)]); setSelected(kinds.length); }}
        addLabel={t('studioProject.kinds.add')}
        errorIndexes={new Set(issues.filter((i) => i.index !== undefined).map((i) => i.index as number))}
      />

      <div className="min-w-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[14px] font-medium">{kind.name || kind.id}</h3>
          <Button size="sm" variant="danger" title={t('common.delete')} onClick={() => {
            if (!confirm(t('common.confirmDelete', { name: kind.name || kind.id }))) {
              return;
            }
            onChange(kinds.filter((_, i) => i !== index));
            setSelected(Math.max(0, index - 1));
          }}>
            <Trash2 size={12} />
          </Button>
        </div>

        <KindBasics model={model} kind={kind} languageIds={languageIds} fieldError={fieldError} patch={patch} />

        <KindRules kind={kind} fieldError={fieldError} patch={patch} />

        <KindTasks kind={kind} fieldError={fieldError} patch={patch} />

        <KindFacts kind={kind} fieldError={fieldError} patch={patch} />
        <div className="h-6" />
      </div>

      <DetectionTest kind={kind} addonId={model.id} />
    </div>
  );
}

/** Try detection, tasks and facts against the open folder. */
function DetectionTest({ kind, addonId }: { kind: UserProjectKind; addonId: string; }) {
  const t = useT();
  const workspace = useStore((s) => s.workspace);
  const platform = useStore((s) => s.platform);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setResult(null);
    setError(null);
  }, [kind]);

  const run = async () => {
    if (!workspace) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const ctx = projectContext(workspace, platform);
      const compiled = compileProjectKind(kind, addonId);
      const names = (await ctx.list('')).filter((entry) => !entry.isDirectory).map((entry) => entry.name);
      const markers = compiled.markers.filter((marker) => names.some((name) => markerMatches(marker, name)));
      const detected = markers.length > 0 && Boolean(await compiled.detect?.(ctx));
      const tasks = detected ? await compiled.tasks(ctx) : [];
      const meta = detected && compiled.inspect ? await compiled.inspect(ctx) : {};
      setResult({ markers, detected, tasks, meta });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-[300px] shrink-0 overflow-y-auto border-l border-edge p-3">
      <h4 className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">{t('studioProject.kinds.test')}</h4>
      <p className="mb-2 text-[11px] leading-snug text-subtle">
        {workspace ? t('studioProject.kinds.testHint', { folder: workspace.split(/[\\/]/).pop() ?? workspace }) : t('studioProject.kinds.testNoFolder')}
      </p>
      <Button size="sm" variant="outline" disabled={!workspace || busy} onClick={() => void run()}>
        <FolderSearch size={12} /> {t('studioProject.kinds.testRun')}
      </Button>
      {error && <p className="mt-2 text-[11px] text-bad">{error}</p>}
      {result && (
        <div className="lm-anim-fade mt-3 space-y-2 text-[11.5px]">
          <div className={`flex items-center gap-1.5 ${result.detected ? 'text-ok' : 'text-warn'}`}>
            {result.detected ? <CheckCircle2 size={13} /> : <CircleSlash size={13} />}
            {result.detected ? t('studioProject.kinds.detected') : t(result.markers.length ? 'studioProject.kinds.rulesFailed' : 'studioProject.kinds.noMarker')}
          </div>
          {result.markers.length > 0 && <div className="font-mono text-[11px] text-muted">{result.markers.join(', ')}</div>}
          {result.tasks.map((task) => (
            <div key={task.id} className="rounded-[4px] bg-input px-1.5 py-1">
              <div className="text-fg">{task.label}</div>
              <div className="truncate font-mono text-[10.5px] text-subtle">{[task.command, ...task.args].join(' ')}</div>
            </div>
          ))}
          {(result.meta.name || result.meta.version || Object.keys(result.meta.facts ?? {}).length > 0) && (
            <dl className="space-y-0.5">
              {result.meta.name && <Fact label={t('studioProject.kinds.roles.name')} value={result.meta.name} />}
              {result.meta.version && <Fact label={t('studioProject.kinds.roles.version')} value={result.meta.version} />}
              {Object.entries(result.meta.facts ?? {}).map(([label, value]) => <Fact key={label} label={label} value={value} />)}
            </dl>
          )}
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string; }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-subtle">{label}</dt>
      <dd className="truncate font-mono text-muted">{value}</dd>
    </div>
  );
}
