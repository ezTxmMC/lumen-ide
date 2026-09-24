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
 * The Add-on Studio — building add-ons of your own inside Lumen: metadata,
 * languages with a live preview, commands and events as node graphs, project
 * templates, themes, and an editable raw JSON view.
 *
 * Keys: Ctrl+S saves, Esc closes (asking first when there are changes). The
 * overlay carries `data-keybinding-recorder` so the global keyboard dispatcher
 * fires nothing here — otherwise Ctrl+S would save the file instead.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useStore } from '@/state/store';
import { t, useT } from '@/i18n';
import { userAddons } from '@/core/user-addons/manager';
import { createUserAddon, type UserAddonModel } from '@/core/user-addons/schema';
import { createToolkitStarter } from '@/core/user-addons/starter';
import {
  blockingIssues, validateAddon, type StudioSection, type ValidationIssue,
} from '@/core/user-addons/validate';
import { StudioHeader, StudioNav, StudioPage } from './AddonStudioParts';

/** An empty add-on, or an example as a starting point. */
function newModel(starter: 'toolkit' | undefined, ids: string[]): UserAddonModel {
  if (starter === 'toolkit') {
    return createToolkitStarter(ids);
  }
  return createUserAddon(t('addonStudio.studio.newName'), ids);
}

type StudioState = NonNullable<ReturnType<typeof useStore.getState>['addonStudio']>;

/** The add-on being edited: loading it, validating, saving and deleting. */
function useStudioDraft(studio: StudioState | null, onOpened: () => void, onBlocked: (issue: ValidationIssue) => void) {
  const closeStudio = useStore((s) => s.closeAddonStudio);
  const notify = useStore((s) => s.notify);
  const t = useT();
  const [draft, setDraft] = useState<UserAddonModel | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedJson, setSavedJson] = useState('');
  const [saving, setSaving] = useState(false);

  // On opening: load the existing add-on, or create a new one.
  useEffect(() => {
    if (!studio) {
      setDraft(null);
      return;
    }
    const existing = userAddons.get(studio.addonId);
    const model = existing ? structuredClone(existing) : newModel(studio.starter, userAddons.ids());
    setDraft(model);
    setSavedId(existing ? existing.id : null);
    setSavedJson(JSON.stringify(model));
    onOpened();
    // Only on opening, or when switching add-on.
  }, [studio]);

  const issues = useMemo(() => (draft ? validateAddon(draft) : []), [draft]);
  const dirty = useMemo(() => Boolean(draft && JSON.stringify(draft) !== savedJson), [draft, savedJson]);

  const update = useCallback((fn: (model: UserAddonModel) => UserAddonModel) => {
    setDraft((current) => (current ? fn(current) : current));
  }, []);

  const save = async () => {
    if (!draft || saving) {
      return false;
    }
    setSaving(true);
    try {
      const result = await userAddons.save(draft, savedId);
      const blocking = blockingIssues(result);
      if (blocking.length) {
        notify(t('addonStudio.studio.saveBlocked', { message: blocking[0].message }), 'error');
        onBlocked(blocking[0]);
        return false;
      }
      setSavedId(draft.id);
      setSavedJson(JSON.stringify(draft));
      notify(t('common.saved', { name: draft.name }), 'success');
      return true;
    } catch (err) {
      notify((err as Error).message, 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const requestClose = () => {
    if (dirty && !confirm(t('addonStudio.studio.confirmDiscard'))) {
      return;
    }
    closeStudio();
  };

  const remove = async () => {
    if (!draft || !savedId) {
      return;
    }
    if (!confirm(t('common.confirmDelete', { name: draft.name }))) {
      return;
    }
    await userAddons.remove(savedId);
    notify(t('addonStudio.dialog.deleted', { name: draft.name }), 'info');
    closeStudio();
  };

  return {
    draft, setDraft, savedId, saving, issues, dirty, update, save, requestClose, remove,
  };
}

export function AddonStudio() {
  const t = useT();
  const studio = useStore((s) => s.addonStudio);
  const formOpen = useStore((s) => Boolean(s.formDialog));
  useSyncExternalStore(userAddons.subscribe, userAddons.getVersion);

  const [section, setSection] = useState<StudioSection>('general');
  const [focus, setFocus] = useState<{ index: number; token: number; } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const jump = (issue: ValidationIssue) => {
    setSection(issue.section);
    if (issue.index !== undefined) {
      setFocus({ index: issue.index, token: Date.now() });
    }
  };

  const {
    draft, setDraft, savedId, saving, issues, dirty, update, save, requestClose, remove,
  } = useStudioDraft(studio, () => {
    setSection('general');
    setFocus(null);
    requestAnimationFrame(() => rootRef.current?.focus());
  }, jump);

  if (!studio || !draft) {
    return null;
  }

  const errorSections = new Set(blockingIssues(issues).map((i) => i.section));
  const blockingCount = blockingIssues(issues).length;

  return (
    <div
      className={`lm-anim-fade fixed inset-0 flex items-center justify-center bg-black/45 p-3 ${formOpen ? 'z-40' : 'z-50'}`}
    >
      <div
        ref={rootRef}
        tabIndex={-1}
        data-keybinding-recorder
        role="dialog"
        aria-label={t('addonStudio.studio.title')}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
            event.preventDefault();
            event.stopPropagation();
            void save();
            return;
          }
          if (event.key !== 'Escape' || event.defaultPrevented) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          requestClose();
        }}
        className="lm-glass lm-shadow lm-anim-dialog flex h-full w-full max-w-[1600px] flex-col overflow-hidden rounded-lumen-lg border border-edge outline-none"
      >
        <StudioHeader
          draft={draft}
          dirty={dirty}
          saving={saving}
          canDelete={Boolean(savedId)}
          blockingCount={blockingCount}
          onUpdate={update}
          onProblems={() => setSection('general')}
          onDelete={() => void remove()}
          onClose={requestClose}
          onSave={() => void save()}
        />

        <div className="flex min-h-0 flex-1">
          <StudioNav draft={draft} section={section} errorSections={errorSections} onSection={setSection} />
          <StudioPage
            section={section}
            draft={draft}
            issues={issues}
            focus={focus}
            onJump={jump}
            onUpdate={update}
            onReplace={(model) => setDraft(model)}
          />
        </div>
      </div>
    </div>
  );
}
