/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useStore } from '@/state/store';
import { validateValues } from '@/core/project/scaffold';
import { useFormValues } from '@/hooks/useFormValues';
import { escapeOwnedByPopover } from './escape';
import type { FormValues } from '@/core/types';
import { FormFields } from './FormFields';
import { tr, useLanguage, useT } from '@/i18n';
import { Button } from '../ui';
import { useLastValue, usePresence } from '@/hooks/usePresence';

/** Field types that take typing — the first of them gets the focus. */
const TEXT_TYPES = new Set(['text', 'password']);
const NO_BASE = {};

/** Escape cancels the form — unless a popover inside it owns the key. */
function useEscapeToCancel(current: ReturnType<typeof useStore.getState>['formDialog'], closeForm: () => void) {
  useEffect(() => {
    if (!current) {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || escapeOwnedByPopover()) {
        return;
      }
      e.stopPropagation();
      closeForm();
      current.onCancel?.();
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [current, closeForm]);
}

function FormFooter({ busy, submitLabel, onCancel, onSubmit }: {
  busy: boolean;
  submitLabel?: string;
  onCancel(): void;
  onSubmit(): void;
}) {
  const t = useT();
  return (
    <div className="flex items-center justify-end gap-2 border-t border-edge px-4 py-2.5">
      <Button onClick={onCancel}>{t('common.cancel')}</Button>
      <Button variant="solid" disabled={busy} onClick={() => onSubmit()}>
        {busy && <Loader2 size={13} className="lm-anim-spin" />}
        {submitLabel ? tr(submitLabel) : t('common.ok')}
      </Button>
    </div>
  );
}

/** The generic form dialog, driven by `store.openForm`. */
export function FormDialog() {
  const current = useStore((s) => s.formDialog);
  const { visible, closing } = usePresence(Boolean(current));
  // While fading out, the last open form stays put.
  const spec = useLastValue(current);
  const closeForm = useStore((s) => s.closeForm);
  const t = useT();
  const language = useLanguage();
  const [touched, setTouched] = useState<FormValues>({});
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!current) {
      return;
    }
    setTouched(current.initial ?? {});
    setShowErrors(false);
    setBusy(false);
    setError(null);
  }, [current]);

  /** Close without submitting; whoever opened the form hears about it. */
  const close = () => {
    const open = useStore.getState().formDialog;
    closeForm();
    open?.onCancel?.();
  };

  useEscapeToCancel(current, closeForm);

  const fields = useMemo(() => spec?.fields ?? [], [spec]);
  const { values, loaded, retry } = useFormValues(fields, NO_BASE, touched, spec);
  const errors = useMemo(() => validateValues(fields, values, loaded), [fields, values, loaded, language]);

  if (!spec || !visible) {
    return null;
  }

  const submit = async () => {
    if (busy) {
      return;
    }
    setShowErrors(true);
    if (Object.keys(errors).length) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await spec.onSubmit(values);
      if (typeof result === 'string') {
        setError(result);
        return;
      }
      closeForm();
    } catch (err) {
      setError((err as Error).message.replace(/^Error: /, ''));
    } finally {
      setBusy(false);
    }
  };

  const firstText = spec.fields.find((f) => TEXT_TYPES.has(f.type ?? 'text') && (!f.when || f.when(values)));

  return (
    <div className={`lm-anim-fade fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6 pt-[14vh] ${closing ? 'lm-closing' : ''}`} onClick={close}>
      <div
        role="dialog"
        aria-label={tr(spec.title)}
        className="lm-glass lm-shadow lm-anim-pop w-[min(520px,94vw)] overflow-hidden rounded-lumen-lg border border-edge"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-edge px-4 py-3">
          <span className="flex-1 text-[14px] font-medium text-fg">{tr(spec.title)}</span>
          <Button size="sm" onClick={close} title={t('common.closeEsc')}><X size={13} /></Button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
          {spec.description && <p className="mb-3 text-[12px] text-subtle">{tr(spec.description)}</p>}
          <FormFields
            fields={spec.fields}
            values={values}
            errors={showErrors ? errors : {}}
            onChange={(id, value) => setTouched((t) => ({ ...t, [id]: value }))}
            autoFocus={firstText?.id}
            onSubmit={() => void submit()}
            loaded={loaded}
            onRetry={retry}
          />
          {error && <p className="rounded-lumen-sm border border-bad/40 bg-bad/10 px-2.5 py-1.5 text-[12px] text-bad">{error}</p>}
        </div>
        <FormFooter busy={busy} submitLabel={spec.submitLabel} onCancel={close} onSubmit={() => void submit()} />
      </div>
    </div>
  );
}
