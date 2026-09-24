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
 * “New project”: a page in two steps. First the template — a category rail,
 * a search, the templates as cards; then its configuration — name, location,
 * the template's fields by section, what runs afterwards — beside a live
 * preview of the files it will generate.
 *
 * The pieces live in `./new-project`; the catalogue logic (categories, search,
 * recent templates) in `core/project/catalog`, the field values with their
 * fetched choices in `hooks/useFormValues`.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/state/store';
import { usePresence } from '@/hooks/usePresence';
import { useFormValues } from '@/hooks/useFormValues';
import { registry } from '@/core/registry';
import { resolveValues, slugify, validateValues, type ScaffoldProgress } from '@/core/project/scaffold';
import {
  ALL_CATEGORY, RECENT_CATEGORY, filterTemplates, knownRecent, templateCategories,
  type CatalogOptions,
} from '@/core/project/catalog';
import { locale, tr, useLanguage, useT } from '@/i18n';
import type { FormValues, ProjectTemplate } from '@/core/types';
import { TemplateBrowser } from './new-project/TemplateBrowser';
import { TemplateConfig } from './new-project/TemplateConfig';
import { FilePreview } from './new-project/FilePreview';
import { DialogFooter, DialogHeader, TargetPanel, type Step } from './new-project/DialogChrome';
import { submitProject } from './new-project/submit';
import { useDialogKeys, useSetupHandover } from './new-project/useDialogEffects';
import { usePreview } from './new-project/usePreview';
import {
  LAYOUT_KEY, OPTIONS_KEY, PARENT_KEY, RECENT_KEY, readStorage, writeStorage, type CreateOptions,
} from './new-project/storage';

/** What the page starts with on each opening: remembered location, options, layout and recent templates. */
function readOpenState() {
  const recent = knownRecent(readStorage<string[]>(RECENT_KEY, []), registry.projectTemplates());
  const state = useStore.getState();
  const stored = readStorage<CreateOptions>(OPTIONS_KEY, {});
  return {
    recent,
    category: recent.length ? RECENT_CATEGORY : ALL_CATEGORY,
    templateId: recent[0] ?? '',
    layout: readStorage<'grid' | 'list'>(LAYOUT_KEY, 'grid') === 'list' ? 'list' as const : 'grid' as const,
    parent: readStorage<string>(PARENT_KEY, '') || (state.workspace ? state.workspace.replace(/[\\/][^\\/]+$/, '') : ''),
    options: { ...stored, window: stored.window ?? (state.effects.openProjectsIn === 'new' ? 'new' : 'this') },
  };
}

/** The category rail and the search result over the registry's templates. */
function useTemplateCatalog(
  templates: ProjectTemplate[],
  languages: ReturnType<typeof registry.languages>,
  recent: string[],
  query: string,
  category: string,
) {
  const t = useT();
  const language = useLanguage();
  const catalog: CatalogOptions = useMemo(
    () => ({ translate: tr, otherLabel: t('forms.newProject.other'), locale: locale() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the language changes the labels
    [t, language],
  );
  const recentIds = useMemo(() => knownRecent(recent, templates), [recent, templates]);
  const categories = useMemo(() => templateCategories(templates, languages, catalog), [templates, languages, catalog]);
  const shown = useMemo(
    () => filterTemplates(templates, languages, { text: query, category, recent: recentIds }, catalog),
    [templates, languages, query, category, recentIds, catalog],
  );
  return { recentIds, categories, shown };
}

interface FormEnv {
  template: ProjectTemplate | undefined;
  templateId: string;
  name: string;
  parent: string;
  touched: FormValues;
  open: boolean;
  /** Whether the configuration step is showing, which is when the file preview is worth computing. */
  configuring: boolean;
}

/** The template's fields with their values and errors, and the file preview for the entered name. */
function useProjectForm({ template, templateId, name, parent, touched, open, configuring }: FormEnv) {
  const t = useT();
  const language = useLanguage();
  const fields = useMemo(() => template?.fields ?? [], [template]);
  const trimmed = name.trim();
  const slug = slugify(trimmed);
  const base = useMemo(() => ({ name: trimmed, slug }), [trimmed, slug]);
  const { values, loaded, retry } = useFormValues(fields, base, touched, `${templateId}|${open}`);
  const errors = useMemo(() => validateValues(fields, values, loaded), [fields, values, loaded, language]);

  // Until a name is typed the preview shows the placeholder's project.
  const previewName = trimmed || t('forms.newProject.namePlaceholder');
  const previewValues = useMemo(
    () => resolveValues(fields, { name: previewName, slug: slugify(previewName) }, touched, loaded),
    [fields, previewName, touched, loaded],
  );
  const preview = usePreview(template, parent, previewName, previewValues, configuring);
  const target = parent && trimmed ? `${parent.replace(/[\\/]$/, '')}/${slug}` : '';

  return { fields, trimmed, slug, values, loaded, retry, errors, previewName, preview, target };
}

/** The wizard's own state. */
function useWizardState() {
  const [step, setStep] = useState<Step>('pick');
  const [templateId, setTemplateId] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORY);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [recent, setRecent] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [parent, setParent] = useState('');
  const [touched, setTouched] = useState<FormValues>({});
  const [options, setOptions] = useState<CreateOptions>({});
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ScaffoldProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  return {
    step, setStep, templateId, setTemplateId, query, setQuery, category, setCategory, layout, setLayout, recent, setRecent,
    name, setName, parent, setParent, touched, setTouched, options, setOptions, showErrors, setShowErrors,
    busy, setBusy, progress, setProgress, error, setError,
  };
}

type Wizard = ReturnType<typeof useWizardState>;

interface EffectsEnv extends Pick<Wizard,
'setRecent' | 'setCategory' | 'setTemplateId' | 'setStep' | 'setQuery' | 'setError' | 'setBusy' | 'setProgress' | 'setName'
| 'setTouched' | 'setShowErrors' | 'setLayout' | 'setParent' | 'setOptions'> {
  open: boolean;
  step: Step;
  shown: ProjectTemplate[];
  templateId: string;
  name: string;
  parent: string;
  touched: FormValues;
}

/** Resetting on opening, keeping the selection visible and clearing stale errors. */
function useWizardEffects(env: EffectsEnv) {
  const {
    open, step, shown, templateId, name, parent, touched,
    setRecent, setCategory, setTemplateId, setStep, setQuery, setError, setBusy, setProgress, setName, setTouched,
    setShowErrors, setLayout, setParent, setOptions,
  } = env;
  // Everything starts afresh on opening; the location, options, layout and recent templates are remembered.
  useEffect(() => {
    if (!open) {
      return;
    }
    const initial = readOpenState();
    setRecent(initial.recent);
    setCategory(initial.category);
    setTemplateId(initial.templateId);
    setStep('pick');
    setQuery('');
    setError(null);
    setBusy(false);
    setProgress(null);
    setName('');
    setTouched({});
    setShowErrors(false);
    setLayout(initial.layout);
    setParent(initial.parent);
    setOptions(initial.options);
  }, [open]);

  // The selection follows the search: a hidden template can't stay selected.
  useEffect(() => {
    if (!open || step !== 'pick' || !shown.length) {
      return;
    }
    if (shown.some((entry) => entry.id === templateId)) {
      return;
    }
    setTemplateId(shown[0].id);
  }, [open, step, shown, templateId]);

  // Another template has other fields.
  useEffect(() => {
    setTouched({});
    setShowErrors(false);
    setError(null);
  }, [templateId]);

  // A stale error goes as soon as the input changes.
  useEffect(() => {
    setError(null);
  }, [name, parent, touched]);
}

export function NewProjectDialog() {
  const open = useStore((s) => s.newProjectOpen);
  const { visible, closing } = usePresence(open);
  const setOpen = useStore((s) => s.setNewProjectOpen);
  const createProject = useStore((s) => s.createProject);
  const registryVersion = useStore((s) => s.registryVersion);
  const workspace = useStore((s) => s.workspace);
  const t = useT();

  const templates = useMemo(() => registry.projectTemplates(), [registryVersion]);
  const languages = useMemo(() => registry.languages(), [registryVersion]);

  const {
    step, setStep, templateId, setTemplateId, query, setQuery, category, setCategory, layout, setLayout, recent, setRecent,
    name, setName, parent, setParent, touched, setTouched, options, setOptions, showErrors, setShowErrors,
    busy, setBusy, progress, setProgress, error, setError,
  } = useWizardState();
  const searchRef = useRef<HTMLInputElement>(null);

  const { recentIds, categories, shown } = useTemplateCatalog(templates, languages, recent, query, category);
  const template: ProjectTemplate | undefined = templates.find((entry) => entry.id === templateId);

  useWizardEffects({
    open, step, shown, templateId, name, parent, touched,
    setRecent, setCategory, setTemplateId, setStep, setQuery, setError, setBusy, setProgress, setName, setTouched,
    setShowErrors, setLayout, setParent, setOptions,
  });

  useSetupHandover(workspace);

  const form = useProjectForm({ template, templateId, name, parent, touched, open, configuring: open && step === 'configure' });
  const { fields, trimmed, slug, values, loaded, retry, errors, previewName, preview, target } = form;

  const choose = (id: string) => {
    setTemplateId(id);
    setStep('configure');
  };

  const create = async () => {
    if (!template || busy) {
      return;
    }
    await submitProject({
      t, template, fields, values, errors, loaded, name: trimmed, parent, options, recentIds, createProject,
      setShowErrors, setError, setBusy, setProgress, setParent,
    });
  };

  useDialogKeys(open, { step, templateId, choose, create, close: () => setOpen(false) });

  if (!visible) {
    return null;
  }

  const chooseParent = async () => {
    const dir = await window.lumen.dialog.chooseFolder(t('forms.newProject.chooseParent'), parent || undefined);
    if (dir) {
      setParent(dir);
    }
  };

  const changeLayout = (next: 'grid' | 'list') => {
    setLayout(next);
    writeStorage(LAYOUT_KEY, next);
  };

  return (
    <div className={`lm-anim-fade fixed inset-0 z-40 flex items-center justify-center bg-black/45 p-4 ${closing ? 'lm-closing' : ''}`} onClick={() => setOpen(false)}>
      <div
        className="lm-glass lm-shadow lm-anim-dialog flex h-[min(820px,94vh)] w-[min(1200px,96vw)] flex-col overflow-hidden rounded-lumen-lg border border-edge"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('forms.newProject.title')}
      >
        <DialogHeader
          step={step}
          template={template}
          templateCount={templates.length}
          onPick={() => setStep('pick')}
          onClose={() => setOpen(false)}
        />

        {step === 'pick' && (
          <TemplateBrowser
            templates={templates}
            visible={shown}
            categories={categories}
            category={category}
            onCategory={setCategory}
            recentCount={recentIds.length}
            query={query}
            onQuery={setQuery}
            selectedId={templateId}
            onSelect={setTemplateId}
            onChoose={choose}
            layout={layout}
            onLayout={changeLayout}
            languages={languages}
            searchRef={searchRef}
          />
        )}

        {step === 'configure' && template && (
          <div className="flex min-h-0 flex-1">
            <TemplateConfig
              key={template.id}
              template={template}
              languages={languages}
              onBack={() => setStep('pick')}
              name={name}
              onName={setName}
              slug={slug}
              nameError={showErrors && !trimmed ? t('forms.newProject.nameMissing') : undefined}
              parent={parent}
              onParent={setParent}
              onChooseParent={() => void chooseParent()}
              parentError={showErrors && !parent.trim() ? t('forms.newProject.chooseParent') : undefined}
              fields={fields}
              values={values}
              errors={showErrors ? errors : {}}
              loaded={loaded}
              onField={(id, value) => setTouched((current) => ({ ...current, [id]: value }))}
              onRetry={retry}
              onSubmit={() => void create()}
              options={options}
              onOptions={(patch) => setOptions((current) => ({ ...current, ...patch }))}
              setup={preview.setup}
              canChooseWindow={Boolean(workspace)}
            />
            <aside className="lm-anim-fade flex w-[330px] shrink-0 flex-col gap-3 border-l border-edge p-4">
              <TargetPanel target={target} />
              <FilePreview preview={preview} rootName={slugify(previewName)} />
            </aside>
          </div>
        )}

        <DialogFooter
          step={step}
          busy={busy}
          progress={progress}
          error={error}
          template={template}
          onClose={() => setOpen(false)}
          onChoose={choose}
          onCreate={() => void create()}
        />
      </div>
    </div>
  );
}
