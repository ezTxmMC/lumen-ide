/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import { acknowledgeProject, useSecurityPrompt, type Finding, type Severity } from '@/core/security';
import { useT } from '@/i18n';
import { usePresence, useLastValue } from '@/hooks/usePresence';
import { Button } from '../ui';

/** Colour of a severity: the app's own tones, so the dialog reads like the rest of the window. */
const TONES: Record<Severity, string> = {
  critical: 'border-bad/50 bg-bad/15 text-bad',
  high: 'border-bad/40 bg-bad/10 text-bad',
  medium: 'border-warn/40 bg-warn/10 text-warn',
  low: 'border-edge bg-input text-muted',
  info: 'border-edge bg-input text-subtle',
};

function findingLocation(finding: Finding, t: ReturnType<typeof useT>): string | null {
  if (!finding.file) {
    return null;
  }
  if (!finding.line) {
    return finding.file;
  }
  return t('security.where', { file: finding.file, line: finding.line });
}

type SecurityPrompt = NonNullable<ReturnType<typeof useSecurityPrompt.getState>['prompt']>;

function promptBody(prompt: SecurityPrompt, t: ReturnType<typeof useT>): string {
  if (prompt.kind === 'project') {
    return t('security.project.body', { count: prompt.findings.length });
  }
  if (prompt.kind === 'paste') {
    return t('security.paste.body');
  }
  return t('security.command.body', { label: prompt.label });
}

function FindingRow({ finding }: { finding: Finding; }) {
  const t = useT();
  const where = findingLocation(finding, t);
  return (
    <li className="rounded-lumen-sm border border-edge bg-input/40 px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className={`rounded border px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.06em] ${TONES[finding.severity]}`}>
          {t(`security.severity.${finding.severity}`)}
        </span>
        <span className="flex-1 truncate text-[12.5px] font-medium text-fg">{finding.title}</span>
        <code className="shrink-0 font-mono text-[10.5px] text-subtle">{finding.id}</code>
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-subtle">{finding.message}</p>
      {where && <div className="mt-1 truncate font-mono text-[11px] text-muted">{where}</div>}
      {finding.excerpt && (
        <code className="mt-1 block max-h-16 overflow-hidden whitespace-pre-wrap break-all rounded-lumen-sm bg-input px-2 py-1 font-mono text-[11px] text-muted">
          {finding.excerpt}
        </code>
      )}
    </li>
  );
}

/** The scanner's questions and reports — a dangerous command, a pasted text, the findings of a project. */
export function SecurityDialog() {
  const current = useSecurityPrompt((s) => s.prompt);
  const { visible, closing } = usePresence(Boolean(current));
  const prompt = useLastValue(current);
  const t = useT();

  const dismiss = () => {
    const open = useSecurityPrompt.getState().prompt;
    if (open?.kind === 'project') {
      useSecurityPrompt.setState({ prompt: null });
      return;
    }
    open?.resolve(false);
  };

  useEffect(() => {
    if (!current) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.stopPropagation();
      dismiss();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [current]);

  if (!prompt || !visible) {
    return null;
  }

  const isProject = prompt.kind === 'project';
  const title = isProject
    ? t('security.project.title', { name: prompt.name })
    : t(prompt.kind === 'paste' ? 'security.paste.title' : 'security.command.title');
  const body = promptBody(prompt, t);

  return (
    <div className={`lm-anim-fade fixed inset-0 z-[60] flex items-start justify-center bg-black/50 p-6 pt-[10vh] ${closing ? 'lm-closing' : ''}`} onClick={dismiss}>
      <div
        role="alertdialog"
        aria-label={title}
        className="lm-glass lm-shadow lm-anim-pop w-[min(620px,94vw)] overflow-hidden rounded-lumen-lg border border-edge"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-edge px-4 py-3">
          <ShieldAlert size={16} className="shrink-0 text-bad" />
          <span className="flex-1 text-[14px] font-medium text-fg">{title}</span>
          <Button size="sm" onClick={dismiss} title={t('common.closeEsc')}><X size={13} /></Button>
        </div>
        <div className="max-h-[56vh] overflow-y-auto px-4 py-3">
          <p className="mb-3 text-[12px] text-subtle">{body}</p>
          <ul className="flex flex-col gap-2">
            {prompt.findings.slice(0, 40).map((finding) => <FindingRow key={`${finding.id}:${finding.fingerprint}`} finding={finding} />)}
          </ul>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-edge px-4 py-2.5">
          {prompt.kind === 'project' && (
            <>
              <Button onClick={() => { void acknowledgeProject(prompt.root, prompt.findings); dismiss(); }}>{t('security.project.acknowledge')}</Button>
              <Button variant="solid" onClick={dismiss}>{t('security.project.close')}</Button>
            </>
          )}
          {prompt.kind !== 'project' && (
            <>
              <Button variant="danger" onClick={() => prompt.resolve(true)}>
                {t(prompt.kind === 'paste' ? 'security.paste.send' : 'security.command.run')}
              </Button>
              <Button variant="solid" onClick={() => prompt.resolve(false)}>{t('security.command.cancel')}</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
