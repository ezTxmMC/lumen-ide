/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The header, footer and target panel of the “New project” page. */

import { AlertCircle, ArrowRight, ChevronRight, FolderPlus, Loader2, X } from 'lucide-react';
import { tr, useT } from '@/i18n';
import type { ProjectTemplate } from '@/core/types';
import type { ScaffoldProgress } from '@/core/project/scaffold';
import { Button, Kbd } from '../../ui';

export type Step = 'pick' | 'configure';

export function DialogHeader({ step, template, templateCount, onPick, onClose }: {
  step: Step;
  template: ProjectTemplate | undefined;
  templateCount: number;
  onPick: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <header className="flex items-center gap-2 border-b border-edge px-4 py-2.5">
      <FolderPlus size={15} className="text-accent" />
      <button
        type="button"
        onClick={onPick}
        className={`text-[14px] font-medium ${step === 'pick' ? 'text-fg' : 'lm-transition text-muted hover:text-fg'}`}
      >
        {t('forms.newProject.title')}
      </button>
      {step === 'configure' && template && (
        <span className="lm-anim-fade flex min-w-0 items-center gap-2 text-[14px] text-fg">
          <ChevronRight size={13} className="text-subtle" />
          <span className="truncate">{tr(template.name)}</span>
        </span>
      )}
      {step === 'pick' && (
        <span className="text-[11.5px] text-subtle">{t('forms.newProject.templateCount', { count: templateCount })}</span>
      )}
      <span className="flex-1" />
      <Button size="sm" onClick={onClose} title={t('common.closeEsc')}><X size={13} /></Button>
    </header>
  );
}

export function DialogFooter({ step, busy, progress, error, template, onClose, onChoose, onCreate }: {
  step: Step;
  busy: boolean;
  progress: ScaffoldProgress | null;
  error: string | null;
  template: ProjectTemplate | undefined;
  onClose: () => void;
  onChoose: (id: string) => void;
  onCreate: () => void;
}) {
  const t = useT();
  return (
    <footer className="flex items-center gap-3 border-t border-edge px-4 py-2.5">
      <FooterStatus step={step} busy={busy} progress={progress} error={error} template={template} />
      <span className="flex-1" />
      {step === 'configure' && (
        <span className="hidden items-center gap-1 text-[10.5px] text-subtle sm:flex"><Kbd>Ctrl ↵</Kbd> {t('forms.newProject.createHint')}</span>
      )}
      <Button onClick={onClose}>{t('common.cancel')}</Button>
      {step === 'pick' && (
        <Button variant="solid" disabled={!template} onClick={() => template && onChoose(template.id)}>
          {t('forms.newProject.next')}<ArrowRight size={13} />
        </Button>
      )}
      {step === 'configure' && (
        <Button variant="solid" disabled={busy || !template} onClick={onCreate}>
          {busy ? <Loader2 size={13} className="lm-anim-spin" /> : <FolderPlus size={13} />}
          {t('forms.newProject.create')}
        </Button>
      )}
    </footer>
  );
}

/** Where the project will land. */
export function TargetPanel({ target }: { target: string; }) {
  const t = useT();
  return (
    <section className="rounded-lumen border border-edge bg-surface/60 px-3 py-2.5">
      <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">{t('forms.newProject.target')}</div>
      <div className={`break-all font-mono text-[11.5px] ${target ? 'text-fg' : 'text-subtle'}`}>{target || t('forms.newProject.targetHint')}</div>
    </section>
  );
}

function FooterStatus({ step, busy, progress, error, template }: {
  step: Step;
  busy: boolean;
  progress: ScaffoldProgress | null;
  error: string | null;
  template: ProjectTemplate | undefined;
}) {
  const t = useT();
  if (error) {
    return (
      <span role="alert" className="lm-anim-fade flex min-w-0 items-center gap-1.5 rounded-lumen-sm border border-bad/40 bg-bad/10 px-2 py-1 text-[12px] text-bad">
        <AlertCircle size={12} className="shrink-0" />
        <span className="truncate" title={error}>{error}</span>
      </span>
    );
  }
  if (busy) {
    return <ProgressLine progress={progress} />;
  }
  if (step === 'pick' && template) {
    return <span className="truncate text-[12px] text-muted">{t('forms.newProject.selected', { name: tr(template.name) })}</span>;
  }
  return null;
}

function ProgressLine({ progress }: { progress: ScaffoldProgress | null; }) {
  const t = useT();
  const label = (() => {
    if (!progress || progress.step === 'check') {
      return t('forms.newProject.progress.check');
    }
    if (progress.step === 'generate') {
      return t('forms.newProject.progress.generate');
    }
    return t('forms.newProject.progress.write', { done: progress.done, total: progress.total });
  })();
  const share = progress?.step === 'write' && progress.total ? progress.done / progress.total : null;
  return (
    <span className="lm-anim-fade flex min-w-0 items-center gap-2 text-[12px] text-muted" role="status">
      <Loader2 size={12} className="lm-anim-spin shrink-0 text-accent" />
      <span className="truncate">{label}</span>
      <span className="relative h-1 w-28 shrink-0 overflow-hidden rounded-full bg-input">
        {share === null && <span className="lm-shimmer absolute inset-0" />}
        {share !== null && <span className="lm-transition absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${Math.round(share * 100)}%` }} />}
      </span>
    </span>
  );
}
