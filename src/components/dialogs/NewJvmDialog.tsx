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
 * “New Java/Kotlin class” and “New package”, as in IntelliJ: `a.b.Name`
 * creates the package folders and the file; the type is chosen from a list.
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useT } from '@/i18n';
import { useStore } from '@/state/store';
import { closeNewJvm, useNewJvm, type NewJvmRequest } from '@/lib/new-jvm-class';
import {
  JAVA_KINDS, JAVA_RETENTIONS, JAVA_TARGETS, KOTLIN_KINDS, KOTLIN_RETENTIONS, KOTLIN_TARGETS,
  javaSource, joinPackage, kotlinSource, locateSource, parseJvmName, validateJvmName,
  type JavaKind, type JvmLanguage, type KotlinKind,
} from '@/core/jvm-class';
import { Button, Select } from '../ui';
import { LAYER } from '../ui/layers';

export function NewJvmDialog() {
  const request = useNewJvm((s) => s.request);
  if (!request) {
    return null;
  }
  return <Dialog request={request} />;
}

interface CreateEnv {
  t: ReturnType<typeof useT>;
  notify: ReturnType<typeof useStore.getState>['notify'];
  openFile: ReturnType<typeof useStore.getState>['openFile'];
  mode: NewJvmRequest['mode'];
  language: JvmLanguage;
  kind: string;
  targets: string[];
  retention: string;
  location: ReturnType<typeof locateSource>;
  packageName: string;
  className: string;
}

/** Creates the package folder, and for a class the source file, then opens it. */
async function createJvm(env: CreateEnv) {
  const { t, notify, openFile, mode, language, kind, targets, retention, location, packageName, className } = env;
  const extension = language === 'java' ? '.java' : '.kt';
  const folder = `${location.root}/${packageName.split('.').filter(Boolean).join('/')}`.replace(/\/$/, '');
  try {
    if (mode !== 'class') {
      await window.lumen.fs.create(folder, true);
      notify(t('explorer.jvmPackageCreated', { name: packageName }), 'success');
      closeNewJvm();
      return;
    }
    const file = `${folder}/${className}${extension}`;
    if (await window.lumen.fs.exists(file)) {
      notify(t('explorer.jvmExists', { name: `${className}${extension}` }), 'warning');
      return;
    }
    const annotation = { targets, retention };
    const text = language === 'java'
      ? javaSource(packageName, className, kind as JavaKind, annotation)
      : kotlinSource(packageName, className, kind as KotlinKind, annotation);
    await window.lumen.fs.create(file, false);
    await window.lumen.fs.writeFile(file, text);
    closeNewJvm();
    await openFile(file).catch(() => {});
  } catch (err) {
    notify((err as Error).message.replace(/^Error: /, ''), 'error');
  }
}

function KindPicker({ language, kinds, kind, onKind }: { language: JvmLanguage; kinds: string[]; kind: string; onKind: (id: string) => void; }) {
  const t = useT();
  return (
    <div>
  <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{t('explorer.jvmType')}</div>
  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
    {kinds.map((id) => (
      <button
        key={id}
        type="button"
        onClick={() => onKind(id)}
        className={`lm-transition rounded-lumen-sm border px-2 py-1.5 text-left text-[12px] ${kind === id ? 'border-accent bg-hover text-fg' : 'border-edge text-muted hover:bg-hover'}`}
      >
        {t(`explorer.jvmKind.${language}.${id}`)}
      </button>
    ))}
  </div>
</div>
  );
}

function AnnotationOptions({ targetList, retentionList, targets, retention, onToggleTarget, onRetention }: {
  targetList: readonly string[];
  retentionList: readonly string[];
  targets: string[];
  retention: string;
  onToggleTarget: (target: string) => void;
  onRetention: (retention: string) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-2">
  <div>
    <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{t('explorer.jvmTargets')}</div>
    <div className="flex flex-wrap gap-1">
      {targetList.map((target) => (
        <button
          key={target}
          type="button"
          onClick={() => onToggleTarget(target)}
          className={`lm-transition rounded-full border px-2 py-0.5 font-mono text-[10.5px] ${targets.includes(target) ? 'border-accent bg-hover text-fg' : 'border-edge text-muted hover:bg-hover'}`}
        >
          {target}
        </button>
      ))}
    </div>
    <p className="mt-1 text-[11px] text-subtle">{t('explorer.jvmTargetsHint')}</p>
  </div>
  <Select label={t('explorer.jvmRetention')} value={retention} options={retentionList.map((id) => ({ value: id, label: id }))} onChange={onRetention} />
</div>
  );
}

function DialogHead({ title, dir, packageName }: { title: string; dir: string; packageName: string; }) {
  const t = useT();
  return (
  <div className="flex items-start gap-2 border-b border-edge px-4 py-3">
    <div className="min-w-0 flex-1">
      <div className="text-[14px] font-medium text-fg">{title}</div>
      <div className="truncate font-mono text-[10.5px] text-subtle" title={dir}>
        {packageName || dir}
      </div>
    </div>
    <button onClick={closeNewJvm} aria-label={t('common.cancel')} className="lm-transition rounded-lumen-sm p-1 text-subtle hover:bg-hover hover:text-fg">
      <X size={14} />
    </button>
  </div>
  );
}

/** What gets created, relative to the folder that was clicked: the new package folders and, for a class, its file. */
function relativeTarget(fileName: string, packageName: string, basePackage: string, isClass: boolean): string {
  const skip = basePackage.split('.').filter(Boolean).length;
  const folders = packageName.split('.').filter(Boolean).slice(skip);
  return [...folders, ...(isClass ? [fileName] : [])].join('/');
}

function NameField({ input, name, isClass, problem, relative, onName }: {
  input: RefObject<HTMLInputElement>;
  name: string;
  isClass: boolean;
  problem: string | null;
  relative: string;
  onName: (name: string) => void;
}) {
  const t = useT();
  return (
    <div>
      <input
        ref={input}
        value={name}
        onChange={(event) => onName(event.target.value)}
        spellCheck={false}
        placeholder={t(isClass ? 'explorer.jvmClassPlaceholder' : 'explorer.jvmPackagePlaceholder')}
        className="lm-transition w-full rounded-lumen-sm border border-edge bg-transparent px-2.5 py-1.5 font-mono text-[12.5px] text-fg outline-none focus:border-accent"
      />
      <p className={`mt-1 min-h-4 text-[11px] ${problem ? 'text-bad' : 'text-subtle'}`}>
        {problem ? t(`explorer.jvmError.${problem}`) : (relative && t('explorer.jvmWillCreate', { path: relative }))}
      </p>
    </div>
  );
}

function Dialog({ request }: { request: NewJvmRequest; }) {
  const t = useT();
  const languages = useStore((s) => s.project?.languages ?? []);
  const notify = useStore((s) => s.notify);
  const openFile = useStore((s) => s.openFile);
  const location = useMemo(() => locateSource(request.dir), [request.dir]);

  const available = (['java', 'kotlin'] as JvmLanguage[]).filter((id) => languages.includes(id));
  const initial: JvmLanguage = location.language ?? available[0] ?? 'java';
  const [language, setLanguage] = useState<JvmLanguage>(initial);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<string>('class');
  const [targets, setTargets] = useState<string[]>([]);
  const [retention, setRetention] = useState('RUNTIME');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);

  const isClass = request.mode === 'class';
  const kinds: string[] = language === 'java' ? JAVA_KINDS : KOTLIN_KINDS;
  const targetList = language === 'java' ? JAVA_TARGETS : KOTLIN_TARGETS;
  const retentionList = language === 'java' ? JAVA_RETENTIONS : KOTLIN_RETENTIONS;

  const switchLanguage = (next: JvmLanguage) => {
    setLanguage(next);
    setKind('class');
    setTargets([]);
    setRetention('RUNTIME');
  };

  const problem = name.trim() ? validateJvmName(name, request.mode) : null;
  const parsed = name.trim() && !problem ? parseJvmName(name, request.mode) : null;
  const packageName = parsed ? joinPackage(location.packageName, parsed.packageParts) : location.packageName;
  const extension = language === 'java' ? '.java' : '.kt';
  const relative = parsed ? relativeTarget(parsed.className + extension, packageName, location.packageName, isClass) : '';

  const create = async () => {
    if (!parsed || busy) {
      return;
    }
    setBusy(true);
    try {
      await createJvm({
        t, notify, openFile, mode: request.mode, language, kind, targets, retention, location, packageName, className: parsed.className,
      });
    } finally {
      setBusy(false);
    }
  };

  const toggleTarget = (target: string) =>
    setTargets((current) => (current.includes(target) ? current.filter((entry) => entry !== target) : [...current, target]));

  return createPortal(
    <div
      className={`lm-anim-fade fixed inset-0 ${LAYER.dialog} flex items-start justify-center bg-black/40 p-6 pt-[10vh]`}
      onMouseDown={(event) => { if (event.target === event.currentTarget) {
        closeNewJvm();
      } }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closeNewJvm();
          return;
        }
        if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
          event.preventDefault();
          void create();
        }
      }}
    >
      <div role="dialog" aria-modal="true" className="lm-glass lm-shadow lm-anim-pop max-h-[80vh] w-[min(520px,94vw)] overflow-y-auto rounded-lumen-lg border border-edge">
        <DialogHead title={t(isClass ? 'explorer.jvmNewClass' : 'explorer.jvmNewPackage')} dir={request.dir} packageName={location.packageName} />

        <div className="space-y-3 px-4 py-3">
          <NameField input={input} name={name} isClass={isClass} problem={problem} relative={relative} onName={setName} />

          {isClass && available.length > 1 && (
            <Select label={t('explorer.jvmLanguage')} value={language} options={available.map((id) => ({ value: id, label: id === 'java' ? 'Java' : 'Kotlin' }))} onChange={switchLanguage} />
          )}

          {isClass && <KindPicker language={language} kinds={kinds} kind={kind} onKind={setKind} />}

          {isClass && kind === 'annotation' && (
            <AnnotationOptions
              targetList={targetList}
              retentionList={retentionList}
              targets={targets}
              retention={retention}
              onToggleTarget={toggleTarget}
              onRetention={setRetention}
            />
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-edge px-4 py-2.5">
          <Button size="sm" variant="outline" onClick={closeNewJvm}>{t('common.cancel')}</Button>
          <Button size="sm" variant="solid" disabled={!parsed || busy} onClick={() => void create()}>{t('explorer.jvmCreate')}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
