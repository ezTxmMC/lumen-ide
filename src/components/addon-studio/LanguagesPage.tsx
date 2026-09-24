/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** Studio-Bereich „Sprachen“: Liste, Formular, Live-Vorschau, Snippets. */

import { useEffect, useMemo, useState } from 'react';
import { Code2, Copy, Pencil, Trash2 } from 'lucide-react';
import { t as translate, useT } from '@/i18n';
import { TOKEN_KINDS, type LspConfig, type RunConfig, type Snippet, type StringRule } from '@/core/types';
import { compileLanguage } from '@/core/user-addons/compile';
import { checkRegex, type ValidationIssue } from '@/core/user-addons/validate';
import type { UserLanguage } from '@/core/user-addons/schema';
import { Button, Empty } from '../ui';
import {
  AddButton, AreaField, CheckField, ChipInput, ColorField, Heading, ItemList, NumberField, TextField, inputClass,
} from './fields';
import { LanguagePreview, sampleFor } from './LanguagePreview';

export function newLanguage(existing: UserLanguage[]): UserLanguage {
  let n = existing.length + 1;
  while (existing.some((l) => l.id === `sprache${n}`)) {
    n++;
  }
  return {
    id: `sprache${n}`,
    name: translate('addonStudio.languages.defaultName', { n }),
    extensions: [`.s${n}`],
    comments: { line: '//' },
    keywords: [],
    controls: [],
    constants: ['true', 'false'],
    snippets: [],
    run: [],
    lsp: [],
  };
}

type Patch = (next: Partial<UserLanguage>) => void;

type FieldError = (field: string) => string | null;

function LanguageBasics({ lang, fieldError, patch }: { lang: UserLanguage; fieldError: FieldError; patch: Patch; }) {
  const t = useT();
  return (
    <>
    <Heading title={t('addonStudio.languages.basics')} />
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
      <TextField label={t('addonStudio.languages.id')} value={lang.id} mono error={fieldError('id')} onChange={(id) => patch({ id })} hint={t('addonStudio.languages.idHint')} />
      <TextField label={t('common.name')} value={lang.name} error={fieldError('name')} onChange={(name) => patch({ name })} />
      <TextField label={t('addonStudio.general.icon')} value={lang.icon} onChange={(icon) => patch({ icon })} placeholder="Lu" />
      <ColorField label={t('addonStudio.general.color')} value={lang.color} onChange={(color) => patch({ color })} />
      <ChipInput className="col-span-2" label={t('addonStudio.languages.extensions')} values={lang.extensions} onChange={(extensions) => patch({ extensions })} placeholder=".lua .luau" hint={fieldError('extensions') ?? t('addonStudio.languages.extensionsHint')} />
      <ChipInput className="col-span-2" allowSpaces label={t('addonStudio.languages.filenames')} values={lang.filenames} onChange={(filenames) => patch({ filenames })} placeholder="Makefile, Dockerfile" />
      <NumberField label={t('addonStudio.languages.priority')} value={lang.priority} onChange={(priority) => patch({ priority })} hint={t('addonStudio.languages.priorityHint')} />
      <NumberField label={t('addonStudio.languages.indentUnit')} value={lang.indentUnit} min={1} max={16} onChange={(indentUnit) => patch({ indentUnit })} />
    </div>
    </>
  );
}

function LanguageComments({ lang, fieldError, patch }: { lang: UserLanguage; fieldError: FieldError; patch: Patch; }) {
  const t = useT();
  return (
    <>
    <Heading title={t('addonStudio.languages.comments')} />
    <div className="grid grid-cols-3 gap-x-3">
      <TextField mono label={t('addonStudio.languages.lineComment')} value={lang.comments?.line} placeholder="//" onChange={(line) => patch({ comments: { ...lang.comments, line: line || undefined } })} />
      <TextField mono label={t('addonStudio.languages.blockStart')} value={lang.comments?.block?.[0]} placeholder="/*" onChange={(start) => patch({ comments: { ...lang.comments, block: blockOf(start, lang.comments?.block?.[1]) } })} />
      <TextField mono label={t('addonStudio.languages.blockEnd')} value={lang.comments?.block?.[1]} placeholder="*/" onChange={(end) => patch({ comments: { ...lang.comments, block: blockOf(lang.comments?.block?.[0], end) } })} error={fieldError('comments')} />
    </div>
    </>
  );
}

function LanguageWords({ lang, patch }: { lang: UserLanguage; patch: Patch; }) {
  const t = useT();
  return (
    <>
    <Heading title={t('addonStudio.languages.words')} hint={t('addonStudio.languages.wordsHint')} />
    <div className="grid grid-cols-1 gap-2.5">
      <ChipInput label={t('addonStudio.languages.keywords')} values={lang.keywords} onChange={(keywords) => patch({ keywords })} />
      <ChipInput label={t('addonStudio.languages.controls')} values={lang.controls} onChange={(controls) => patch({ controls })} />
      <ChipInput label={t('addonStudio.languages.types')} values={lang.types} onChange={(types) => patch({ types })} />
      <ChipInput label={t('addonStudio.languages.builtins')} values={lang.builtins} onChange={(builtins) => patch({ builtins })} />
      <ChipInput label={t('addonStudio.languages.constants')} values={lang.constants} onChange={(constants) => patch({ constants })} />
      <ChipInput label={t('addonStudio.languages.completions')} values={lang.completions} onChange={(completions) => patch({ completions })} />
      <div className="flex flex-wrap gap-x-6">
        <CheckField label={t('addonStudio.languages.capitalizedAsType')} checked={Boolean(lang.capitalizedAsType)} onChange={(v) => patch({ capitalizedAsType: v || undefined })} />
        <CheckField label={t('addonStudio.languages.caseInsensitive')} checked={Boolean(lang.caseInsensitive)} onChange={(v) => patch({ caseInsensitive: v || undefined })} />
      </div>
    </div>
    </>
  );
}

function LanguageStrings({ lang, patch }: { lang: UserLanguage; patch: Patch; }) {
  const t = useT();
  return (
    <>
    <Heading
      title={t('addonStudio.languages.strings')}
      hint={t('addonStudio.languages.stringsHint')}
      action={<AddButton label={t('common.add')} onClick={() => patch({ strings: [...(lang.strings ?? []), { start: '"', escapes: true }] })} />}
    />
    {(lang.strings ?? []).map((rule, i) => (
      <StringRuleRow
        key={i}
        rule={rule}
        onChange={(next) => patch({ strings: (lang.strings ?? []).map((r, j) => (j === i ? next : r)) })}
        onRemove={() => patch({ strings: (lang.strings ?? []).filter((_, j) => j !== i) })}
      />
    ))}
    </>
  );
}

function LanguageRegex({ lang, patch }: { lang: UserLanguage; patch: Patch; }) {
  const t = useT();
  return (
    <>
    <Heading title={t('addonStudio.languages.regex')} hint={t('addonStudio.languages.regexHint')} />
    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
      {(['numbers', 'identifier', 'operators', 'meta', 'indentOpen', 'indentClose'] as const).map((field) => (
        <TextField
          key={field}
          mono
          label={t(`addonStudio.languages.${field}`)}
          value={lang[field]}
          placeholder={REGEX_PLACEHOLDERS[field]}
          error={checkRegex(lang[field])}
          onChange={(value) => patch({ [field]: value || undefined })}
        />
      ))}
    </div>
    </>
  );
}

function PreviewPanel({ spec, doc, editing, onToggleEdit, onDoc }: {
  spec: ReturnType<typeof compileLanguage>;
  doc: string;
  editing: boolean;
  onToggleEdit: () => void;
  onDoc: (text: string) => void;
}) {
  const t = useT();
  return (
  <div className="flex w-[360px] shrink-0 flex-col gap-2 border-l border-edge p-3">
    <div className="flex items-center gap-2">
      <h4 className="flex-1 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-subtle">{t('addonStudio.languages.preview')}</h4>
      <Button size="sm" title={t('addonStudio.languages.editSample')} onClick={onToggleEdit}>
        <Pencil size={11} />
      </Button>
    </div>
    {editing && (
      <textarea
        value={doc}
        rows={8}
        spellCheck={false}
        onChange={(e) => onDoc(e.target.value)}
        className={`${inputClass} border-edge resize-y font-mono text-[11.5px]`}
      />
    )}
    <LanguagePreview spec={spec} doc={doc} className="flex-1" />
    <p className="text-[11px] leading-relaxed text-subtle">{t('addonStudio.languages.previewHint')}</p>
  </div>
  );
}

export function LanguagesPage({
  languages, onChange, issues, focus,
}: {
  languages: UserLanguage[];
  onChange: (languages: UserLanguage[]) => void;
  issues: ValidationIssue[];
  focus?: { index: number; token: number; } | null;
}) {
  const t = useT();
  const [selected, setSelected] = useState(0);
  const [sample, setSample] = useState<Record<string, string>>({});
  const [editSample, setEditSample] = useState(false);

  useEffect(() => {
    if (focus) {
      setSelected(focus.index);
    }
  }, [focus]);

  const index = Math.min(selected, languages.length - 1);
  const lang = languages[index];
  const errorIndexes = new Set(issues.filter((i) => !i.warning && i.index !== undefined).map((i) => i.index as number));

  const spec = useMemo(() => (lang ? compileLanguage(lang) : null), [lang]);

  const patch = (next: Partial<UserLanguage>) => {
    onChange(languages.map((l, i) => (i === index ? { ...l, ...next } : l)));
  };

  if (!lang || !spec) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <Empty icon={<Code2 size={28} strokeWidth={1.4} />} title={t('addonStudio.languages.empty')} hint={t('addonStudio.languages.emptyHint')} />
        <Button variant="solid" onClick={() => { onChange([newLanguage(languages)]); setSelected(0); }}>
          {t('addonStudio.languages.add')}
        </Button>
      </div>
    );
  }

  const fieldError = (field: string) => issues.find((i) => i.index === index && i.field === field)?.message ?? null;
  const doc = sample[lang.id] ?? sampleFor(spec);

  return (
    <div className="flex h-full min-h-0">
      <ItemList
        items={languages}
        selected={index}
        onSelect={setSelected}
        render={(l) => ({ title: l.name || l.id, subtitle: l.extensions.join(' '), color: l.color })}
        onAdd={() => {
          onChange([...languages, newLanguage(languages)]);
          setSelected(languages.length);
        }}
        addLabel={t('addonStudio.languages.add')}
        errorIndexes={errorIndexes}
      />

      <div className="min-w-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="mb-2 flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[14px] font-medium">{lang.name || lang.id}</h3>
          <Button size="sm" title={t('common.duplicate')} onClick={() => {
            const copy = { ...structuredClone(lang), id: `${lang.id}-2`, name: `${lang.name} 2` };
            onChange([...languages, copy]);
            setSelected(languages.length);
          }}>
            <Copy size={12} />
          </Button>
          <Button size="sm" variant="danger" title={t('common.delete')} onClick={() => {
            if (!confirm(t('common.confirmDelete', { name: lang.name || lang.id }))) {
              return;
            }
            onChange(languages.filter((_, i) => i !== index));
            setSelected(Math.max(0, index - 1));
          }}>
            <Trash2 size={12} />
          </Button>
        </div>

        <LanguageBasics lang={lang} fieldError={fieldError} patch={patch} />

        <LanguageComments lang={lang} fieldError={fieldError} patch={patch} />

        <LanguageWords lang={lang} patch={patch} />

        <LanguageStrings lang={lang} patch={patch} />

        <LanguageRegex lang={lang} patch={patch} />

        <SnippetsSection lang={lang} spec={spec} onChange={(snippets) => patch({ snippets })} />
        <RunSection runs={lang.run ?? []} onChange={(run) => patch({ run })} />
        <LspSection servers={lang.lsp ?? []} onChange={(lsp) => patch({ lsp })} />
        <div className="h-6" />
      </div>

      <PreviewPanel
        spec={spec}
        doc={doc}
        editing={editSample}
        onToggleEdit={() => setEditSample((v) => !v)}
        onDoc={(text) => setSample({ ...sample, [lang.id]: text })}
      />
    </div>
  );
}

const REGEX_PLACEHOLDERS: Record<string, string> = {
  numbers: String.raw`\d+(?:\.\d+)?`,
  identifier: '[A-Za-z_][A-Za-z0-9_]*',
  operators: '[+\\-*/%=<>!&|^~?:]+',
  meta: String.raw`#\w+`,
  indentOpen: String.raw`[{[(]\s*$`,
  indentClose: String.raw`^\s*[}\])]`,
};

function blockOf(start: string | undefined, end: string | undefined): [string, string] | undefined {
  if (!start && !end) {
    return undefined;
  }
  return [start ?? '', end ?? ''];
}

function StringRuleRow({ rule, onChange, onRemove }: { rule: StringRule; onChange: (rule: StringRule) => void; onRemove: () => void; }) {
  const t = useT();
  return (
    <div className="mb-1.5 flex flex-wrap items-end gap-2 rounded-lumen-sm border border-edge p-2">
      <TextField className="w-[70px]" mono label={t('addonStudio.languages.stringStart')} value={rule.start} onChange={(start) => onChange({ ...rule, start })} />
      <TextField className="w-[70px]" mono label={t('addonStudio.languages.stringEnd')} value={rule.end} onChange={(end) => onChange({ ...rule, end: end || undefined })} />
      <TextField className="w-[80px]" mono label={t('addonStudio.languages.interpolate')} value={rule.interpolate} placeholder="${" onChange={(interpolate) => onChange({ ...rule, interpolate: interpolate || undefined })} />
      <label className="min-w-0">
        <span className="mb-1 block text-[11.5px] text-muted">{t('addonStudio.languages.stringKind')}</span>
        <select
          value={rule.kind ?? 'string'}
          onChange={(e) => onChange({ ...rule, kind: e.target.value === 'string' ? undefined : e.target.value as StringRule['kind'] })}
          className={`${inputClass} border-edge`}
        >
          {TOKEN_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
        </select>
      </label>
      <CheckField label={t('addonStudio.languages.multiline')} checked={Boolean(rule.multiline)} onChange={(multiline) => onChange({ ...rule, multiline: multiline || undefined })} />
      <CheckField label={t('addonStudio.languages.escapes')} checked={rule.escapes !== false} onChange={(escapes) => onChange({ ...rule, escapes })} />
      <span className="flex-1" />
      <Button size="sm" variant="danger" title={t('common.remove')} onClick={onRemove}><Trash2 size={12} /></Button>
    </div>
  );
}

function SnippetsSection({ lang, spec, onChange }: { lang: UserLanguage; spec: ReturnType<typeof compileLanguage>; onChange: (snippets: Snippet[]) => void; }) {
  const t = useT();
  const snippets = lang.snippets ?? [];
  const [open, setOpen] = useState<number | null>(null);
  const update = (i: number, next: Partial<Snippet>) => onChange(snippets.map((s, j) => (j === i ? { ...s, ...next } : s)));
  return (
    <>
      <Heading
        title={t('addonStudio.languages.snippets', { count: snippets.length })}
        hint={t('addonStudio.languages.snippetsHint')}
        action={<AddButton label={t('common.add')} onClick={() => {
          onChange([...snippets, { label: t('addonStudio.languages.snippetDefault'), detail: '', body: '$0' }]);
          setOpen(snippets.length);
        }} />}
      />
      {snippets.map((snippet, i) => (
        <div key={i} className="mb-1.5 rounded-lumen-sm border border-edge">
          <button onClick={() => setOpen(open === i ? null : i)} className="lm-transition flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-hover">
            <span className="font-mono text-[12px] text-fg">{snippet.label}</span>
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-subtle">{snippet.detail}</span>
          </button>
          {open === i && (
            <div className="lm-anim-fade grid grid-cols-2 gap-x-3 gap-y-2 border-t border-edge p-2">
              <TextField mono label={t('addonStudio.languages.snippetLabel')} value={snippet.label} onChange={(label) => update(i, { label })} />
              <TextField label={t('addonStudio.languages.snippetDetail')} value={snippet.detail} onChange={(detail) => update(i, { detail })} />
              <AreaField className="col-span-2" rows={5} label={t('addonStudio.languages.snippetBody')} value={snippet.body} onChange={(body) => update(i, { body })} hint={t('addonStudio.languages.snippetBodyHint')} />
              <div className="col-span-2">
                <span className="mb-1 block text-[11.5px] text-muted">{t('addonStudio.languages.preview')}</span>
                <LanguagePreview spec={spec} doc={snippetPreview(snippet.body)} className="max-h-[180px]" />
              </div>
              <div className="col-span-2 flex justify-end">
                <Button size="sm" variant="danger" onClick={() => { onChange(snippets.filter((_, j) => j !== i)); setOpen(null); }}>
                  <Trash2 size={12} /> {t('common.remove')}
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </>
  );
}

/** `${1:name}` → `name`, `$0` → Cursor-Markierung. */
function snippetPreview(body: string) {
  return body
    .replace(/\$\{\d+:([^}]*)\}/g, '$1')
    .replace(/\$\{\d+\}/g, '')
    .replace(/\$0/g, '▌')
    .replace(/\$\d+/g, '');
}

function RunSection({ runs, onChange }: { runs: RunConfig[]; onChange: (runs: RunConfig[]) => void; }) {
  const t = useT();
  const update = (i: number, next: Partial<RunConfig>) => onChange(runs.map((r, j) => (j === i ? { ...r, ...next } : r)));
  return (
    <>
      <Heading
        title={t('addonStudio.languages.run')}
        hint={t('addonStudio.languages.runHint')}
        action={<AddButton label={t('common.add')} onClick={() => onChange([...runs, { label: t('addonStudio.languages.runDefault'), command: '', args: ['${file}'] }])} />}
      />
      {runs.map((run, i) => (
        <div key={i} className="mb-1.5 grid grid-cols-2 gap-x-3 gap-y-2 rounded-lumen-sm border border-edge p-2">
          <TextField label={t('addonStudio.languages.runLabel')} value={run.label} onChange={(label) => update(i, { label })} />
          <TextField mono label={t('addonStudio.languages.command')} value={run.command} onChange={(command) => update(i, { command })} placeholder="lua" />
          <ChipInput className="col-span-2" allowSpaces label={t('addonStudio.languages.args')} values={run.args} onChange={(args) => onChange(runs.map((r, j) => (j === i ? { ...r, args } : r)))} placeholder="${file}" />
          <TextField mono label={t('addonStudio.languages.thenCommand')} value={run.then?.command} onChange={(command) => update(i, { then: command ? { command, args: run.then?.args ?? [] } : undefined })} />
          <ChipInput allowSpaces label={t('addonStudio.languages.thenArgs')} values={run.then?.args} onChange={(args) => update(i, { then: { command: run.then?.command ?? '', args } })} />
          <div className="col-span-2 flex justify-end">
            <Button size="sm" variant="danger" onClick={() => onChange(runs.filter((_, j) => j !== i))}><Trash2 size={12} /> {t('common.remove')}</Button>
          </div>
        </div>
      ))}
    </>
  );
}

function LspSection({ servers, onChange }: { servers: LspConfig[]; onChange: (servers: LspConfig[]) => void; }) {
  const t = useT();
  const update = (i: number, next: Partial<LspConfig>) => onChange(servers.map((s, j) => (j === i ? { ...s, ...next } : s)));
  return (
    <>
      <Heading
        title={t('addonStudio.languages.lsp')}
        hint={t('addonStudio.languages.lspHint')}
        action={<AddButton label={t('common.add')} onClick={() => onChange([...servers, { label: '', command: '', args: [] }])} />}
      />
      {servers.map((server, i) => (
        <div key={i} className="mb-1.5 grid grid-cols-2 gap-x-3 gap-y-2 rounded-lumen-sm border border-edge p-2">
          <TextField label={t('addonStudio.languages.lspLabel')} value={server.label} onChange={(label) => update(i, { label })} placeholder="lua-language-server" />
          <TextField mono label={t('addonStudio.languages.command')} value={server.command} onChange={(command) => update(i, { command })} />
          <ChipInput allowSpaces label={t('addonStudio.languages.args')} values={server.args} onChange={(args) => update(i, { args })} placeholder="--stdio" />
          <ChipInput allowSpaces label={t('addonStudio.languages.rootMarkers')} values={server.rootMarkers} onChange={(rootMarkers) => update(i, { rootMarkers })} placeholder=".luarc.json" />
          <TextField className="col-span-2" label={t('addonStudio.languages.install')} value={server.install} onChange={(install) => update(i, { install: install || undefined })} />
          {(['linux', 'darwin', 'win32'] as const).map((platform) => (
            <TextField
              key={platform}
              mono
              label={t('addonStudio.languages.installCommand', { platform })}
              value={server.installCommands?.[platform]}
              onChange={(value) => update(i, { installCommands: { ...server.installCommands, [platform]: value || undefined } })}
            />
          ))}
          <TextField mono label={t('addonStudio.languages.docs')} value={server.docs} onChange={(docs) => update(i, { docs: docs || undefined })} placeholder="https://…" />
          <div className="col-span-2 flex justify-end">
            <Button size="sm" variant="danger" onClick={() => onChange(servers.filter((_, j) => j !== i))}><Trash2 size={12} /> {t('common.remove')}</Button>
          </div>
        </div>
      ))}
    </>
  );
}
