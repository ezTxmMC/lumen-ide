/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useId } from 'react';
import { AlertCircle, Loader2, RotateCw } from 'lucide-react';
import type { FieldChoice, FormField, FormValues } from '@/core/types';
import { visibleFields } from '@/core/project/scaffold';
import { fieldChoices, groupChoices, type ChoiceState, type LoadedChoices } from '@/core/project/choices';
import { tr, useT } from '@/i18n';
import { ChoiceBadge, Combobox } from './Combobox';

const inputClass =
  'w-full rounded-lumen-sm border bg-input px-2.5 py-1.5 text-[13px] outline-none focus:border-accent';

/** A select with more choices than this turns into a combobox on its own. */
const COMBOBOX_THRESHOLD = 40;

/**
 * Renders form fields grouped by `section`. `loaded` and `onRetry` come from
 * `useFormValues`, for fields that fetch their choices. `variant="cards"`
 * puts each section on a card of its own (the project page).
 */
export function FormFields({
  fields, values, errors, onChange, autoFocus, onSubmit, loaded = {}, onRetry, variant = 'plain',
}: {
  fields: FormField[];
  values: FormValues;
  errors: Record<string, string>;
  onChange: (id: string, value: string) => void;
  autoFocus?: string;
  onSubmit?: () => void;
  loaded?: LoadedChoices;
  onRetry?: (id: string) => void;
  variant?: 'plain' | 'cards';
}) {
  useT();
  const shown = visibleFields(fields, values);
  const sections = [...new Set(shown.map((f) => f.section ?? ''))];
  const frame = variant === 'cards'
    ? 'lm-anim-fade mb-3 rounded-lumen border border-edge bg-surface/60 px-3.5 pt-2.5 pb-3'
    : 'mb-3';

  return (
    <>
      {sections.map((section) => {
        const inSection = shown.filter((f) => (f.section ?? '') === section);
        const toggles = inSection.filter((f) => f.type === 'toggle');
        const others = inSection.filter((f) => f.type !== 'toggle');
        return (
          <fieldset key={section || '_'} className={frame}>
            {section && (
              <legend className={`${variant === 'cards' ? 'float-left mb-2 w-full' : 'mb-1.5'} text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle`}>
                {tr(section)}
              </legend>
            )}
            {others.length > 0 && (
              <div className="clear-both grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-2">
                {others.map((field) => (
                  <Field
                    key={field.id}
                    field={field}
                    values={values}
                    value={values[field.id] ?? ''}
                    error={errors[field.id]}
                    state={field.loadChoices ? loaded[field.id] : undefined}
                    choices={fieldChoices(field, values, loaded)}
                    onChange={(v) => onChange(field.id, v)}
                    onRetry={onRetry ? () => onRetry(field.id) : undefined}
                    autoFocus={autoFocus === field.id}
                    onSubmit={onSubmit}
                  />
                ))}
              </div>
            )}
            {toggles.length > 0 && (
              <div className="clear-both mt-2 flex flex-col gap-1.5">
                {toggles.map((field) => (
                  <label key={field.id} className="flex cursor-pointer items-start gap-2 text-[12.5px] text-muted">
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-[var(--c-accent)]"
                      checked={values[field.id] === 'true'}
                      onChange={(e) => onChange(field.id, String(e.target.checked))}
                    />
                    <span>
                      {tr(field.label)}
                      {field.hint && <span className="block text-[11px] text-subtle">{tr(field.hint)}</span>}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        );
      })}
    </>
  );
}

/** A field's suggestions, resolved against the current values. */
function suggestionsOf(field: FormField, values: FormValues): string[] {
  const source = field.suggestions;
  if (!source) {
    return [];
  }
  if (typeof source === 'function') {
    return source(values);
  }
  return source;
}

/** Select, combobox — or a select long enough to be better off as a combobox. */
function choiceKind(field: FormField, choices: FieldChoice[]): 'select' | 'combobox' | null {
  if (field.type === 'combobox') {
    return 'combobox';
  }
  if (field.type !== 'select') {
    return null;
  }
  if (choices.length > COMBOBOX_THRESHOLD) {
    return 'combobox';
  }
  return 'select';
}

function TextArea({ id, value, placeholder, className, autoFocus, onChange, onSubmit }: {
  id: string;
  value: string;
  placeholder: string;
  className: string;
  autoFocus?: boolean;
  onChange(value: string): void;
  onSubmit?: () => void;
}) {
  return (
    <textarea
      id={id}
      autoFocus={autoFocus}
      value={value}
      rows={5}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) {
          return;
        }
        e.preventDefault();
        onSubmit?.();
      }}
      className={className}
    />
  );
}

function TextInput({ id, field, value, secret, suggestions, className, autoFocus, onChange, onSubmit }: {
  id: string;
  field: FormField;
  value: string;
  secret: boolean;
  suggestions: string[];
  className: string;
  autoFocus?: boolean;
  onChange(value: string): void;
  onSubmit?: () => void;
}) {
  return (
    <>
      <input
        id={id}
        type={secret ? 'password' : 'text'}
        autoComplete={secret ? 'off' : undefined}
        autoFocus={autoFocus}
        value={value}
        placeholder={tr(field.placeholder)}
        spellCheck={false}
        list={suggestions.length ? `${id}-suggestions` : undefined}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') {
            return;
          }
          e.preventDefault();
          onSubmit?.();
        }}
        className={className}
      />
      {/* Suggestions: typing further, the browser filters them itself. */}
      {suggestions.length > 0 && (
        <datalist id={`${id}-suggestions`}>
          {suggestions.map((entry) => <option key={entry} value={entry} />)}
        </datalist>
      )}
    </>
  );
}

function FieldStatus({ field, state, error, failed, current, kind, onRetry }: {
  field: FormField;
  state?: ChoiceState;
  error?: string;
  failed: boolean;
  current?: FieldChoice;
  kind: 'select' | 'combobox' | null;
  onRetry?: () => void;
}) {
  const t = useT();
  return (
    <>
      {failed && (
        <span className="lm-anim-fade mt-1 flex items-start gap-1.5 text-[11px] text-bad">
          <AlertCircle size={11} className="mt-px shrink-0" />
          <span className="min-w-0 flex-1 break-words">{t('forms.choices.failedWith', { error: state?.error ?? '' })}</span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="lm-transition inline-flex shrink-0 items-center gap-1 rounded px-1 text-accent hover:bg-hover">
              <RotateCw size={10} />{t('forms.choices.retry')}
            </button>
          )}
        </span>
      )}
      {error && <span className="mt-1 block text-[11px] text-bad">{error}</span>}
      {!error && !failed && field.hint && <span className="mt-1 block text-[11px] leading-snug text-subtle">{tr(field.hint)}</span>}
      {!error && !failed && current?.hint && kind === 'select' && (
        <span className="mt-1 flex items-center gap-1.5 text-[11px] text-subtle">
          {current.badge && <ChoiceBadge text={current.badge} />}
          {tr(current.hint)}
        </span>
      )}
    </>
  );
}

function Field({
  field, values, value, error, state, choices, onChange, onRetry, autoFocus, onSubmit,
}: {
  field: FormField;
  values: FormValues;
  value: string;
  error?: string;
  state?: ChoiceState;
  choices: FieldChoice[];
  onChange: (value: string) => void;
  onRetry?: () => void;
  autoFocus?: boolean;
  onSubmit?: () => void;
}) {
  const id = useId();
  const t = useT();
  const kind = choiceKind(field, choices);
  const loading = state?.status === 'loading';
  const failed = state?.status === 'error';
  // Load states speak for themselves beside the field; the error line is for real mistakes.
  const shownError = loading || failed ? undefined : error;
  const border = shownError ? 'border-bad' : 'border-edge';
  const mono = field.mono ? 'font-mono text-[12px]' : '';
  const secret = field.type === 'password';
  // A password is never offered back as a suggestion.
  const suggestions = secret ? [] : suggestionsOf(field, values);
  const current = choices.find((c) => c.value === value);

  return (
    <div className={kind ? '' : 'min-w-0'}>
      <label htmlFor={id} className="mb-1 flex items-center gap-1.5 text-[11.5px] text-muted">
        <span>{tr(field.label)}</span>
        {field.required === false && !kind && <span className="text-subtle">{t('forms.optional')}</span>}
        {loading && (
          <span className="lm-anim-fade inline-flex items-center gap-1 text-[10.5px] text-subtle">
            <Loader2 size={10} className="lm-anim-spin" />{t('forms.choices.loading')}
          </span>
        )}
      </label>
      {field.type === 'textarea' && (
        <TextArea id={id} value={value} placeholder={tr(field.placeholder)} className={`${inputClass} ${border} ${mono} resize-y`} autoFocus={autoFocus} onChange={onChange} onSubmit={onSubmit} />
      )}
      {kind === 'select' && (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} ${border} ${loading ? 'opacity-70' : ''}`}
        >
          {/* A value from before the list arrived stays selectable until it does. */}
          {!current && value && <option value={value}>{value}</option>}
          <ChoiceOptions choices={choices} />
        </select>
      )}
      {kind === 'combobox' && (
        <Combobox
          id={id}
          value={value}
          choices={choices}
          onChange={onChange}
          loading={loading}
          invalid={Boolean(shownError)}
          mono={field.mono}
          placeholder={tr(field.placeholder)}
          onSubmit={onSubmit}
        />
      )}
      {!kind && field.type !== 'textarea' && (
        <TextInput id={id} field={field} value={value} secret={secret} suggestions={suggestions} className={`${inputClass} ${border} ${mono}`} autoFocus={autoFocus} onChange={onChange} onSubmit={onSubmit} />
      )}
      <FieldStatus field={field} state={state} error={shownError} failed={failed} current={current} kind={kind} onRetry={onRetry} />
    </div>
  );
}

/** Options, under `<optgroup>`s when the choices name groups; the badge rides along in the text. */
function ChoiceOptions({ choices }: { choices: FieldChoice[]; }) {
  const option = (c: FieldChoice) => (
    <option key={c.value} value={c.value}>{c.badge ? `${tr(c.label)} · ${tr(c.badge)}` : tr(c.label)}</option>
  );
  return (
    <>
      {groupChoices(choices).map((group) => {
        if (!group.group) {
          return group.choices.map(option);
        }
        return <optgroup key={group.group} label={tr(group.group)}>{group.choices.map(option)}</optgroup>;
      })}
    </>
  );
}
