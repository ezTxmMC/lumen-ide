/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useState } from 'react';
import { Copy, Download, FolderOpen, Pencil, RefreshCw, Trash2, TriangleAlert } from 'lucide-react';
import { useStore } from '@/state/store';
import { registry } from '@/core/registry';
import { useT } from '@/i18n';
import { userAddons } from '@/core/user-addons/manager';
import { extensions } from '@/core/extensions/manager';
import type { AvailableUpdate } from '@/core/extensions/catalog';
import { hostOf } from '@/core/extensions/trust';
import { installExtension } from '@/core/extensions/flow';
import type { Addon } from '@/core/types';
import { Button } from '../../ui';
import { AddonSdks } from '../../sdk/AddonSdks';
import { CommandsSection, DetailSection, KindsSection, LanguagesSection, TemplatesSection, ThemesSection } from './AddonSections';
import { Switch, AddonIcon } from './AddonCards';

/** Updating and removing an extension. */
function useExtensionActions(addon: Addon, update: AvailableUpdate | undefined) {
  const t = useT();
  const notify = useStore((s) => s.notify);
  const extension = extensions.get(addon.id);
  const [busy, setBusy] = useState(false);

  const updateExtension = async () => {
    if (!update) {
      return;
    }
    setBusy(true);
    try {
      await installExtension(update.server.url, update.id, update.to, () => {
        notify(t('extensions.updated', { names: update.name }), 'success');
      });
    } catch (err) {
      notify(t('extensions.updateFailed', { name: update.name, error: (err as Error).message }), 'error');
    } finally {
      setBusy(false);
    }
  };

  const uninstallExtension = async () => {
    if (!extension) {
      return;
    }
    if (!confirm(t('common.confirmDelete', { name: extension.manifest.name }))) {
      return;
    }
    setBusy(true);
    try {
      await extensions.uninstall(extension.manifest.id);
      notify(t('extensions.removedNotice', { name: extension.manifest.name }), 'info');
    } finally {
      setBusy(false);
    }
  };

  return { extension, busy, updateExtension, uninstallExtension };
}

function AddonHeader({ addon, extension }: { addon: Addon; extension: ReturnType<typeof extensions.get>; }) {
  const t = useT();
  const active = registry.isActive(addon.id);
  return (
    <div className="flex items-start gap-3 px-5 pt-4 pb-3">
      <AddonIcon addon={addon} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h3 className="truncate text-[16px] font-medium text-fg">{addon.name}</h3>
          <span className="font-mono text-[11px] text-subtle">v{addon.version}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-subtle">
          <span className="font-mono">{addon.id}</span>
          {addon.author && <span>{t('common.author')}: {addon.author}</span>}
          <span>{t(active ? 'common.enabled' : 'common.disabled')}</span>
          {extension?.server && <span>{t('extensions.fromServer', { server: hostOf(extension.server) ?? extension.server })}</span>}
        </div>
        {addon.description && <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{addon.description}</p>}
      </div>
      <Switch addon={addon} />
    </div>
  );
}

function AddonActions({ addon, update, onSelect }: { addon: Addon; update?: AvailableUpdate; onSelect: (id: string) => void; }) {
  const t = useT();
  const openStudio = useStore((s) => s.openAddonStudio);
  const notify = useStore((s) => s.notify);
  const model = addon.user ? userAddons.get(addon.id) : undefined;
  const { extension, busy, updateExtension, uninstallExtension } = useExtensionActions(addon, update);

  const copyAsUser = async () => {
    const copy = await userAddons.copyFromAddon(addon);
    if (!copy) {
      return;
    }
    notify(t('addonStudio.dialog.copied', { name: copy.name }), 'success');
    openStudio(copy.id);
  };

  return (
    <div className="flex flex-wrap gap-1.5 px-5 pb-3">
      {update && (
        <Button size="sm" variant="solid" disabled={busy} onClick={() => void updateExtension()}>
          <RefreshCw size={12} className={busy ? 'lm-anim-spin' : ''} />
          {t('extensions.updateTo', { version: update.to })}
        </Button>
      )}
      {extension && (
        <Button size="sm" variant="danger" disabled={busy} onClick={() => void uninstallExtension()}>
          <Trash2 size={12} /> {t('extensions.uninstall')}
        </Button>
      )}
      {model && !extension && (
        <>
          <Button size="sm" variant="solid" onClick={() => openStudio(model.id)}><Pencil size={12} /> {t('common.edit')}</Button>
          <Button size="sm" variant="outline" onClick={async () => {
            const copy = await userAddons.duplicate(model.id);
            if (copy) {
              onSelect(copy.id);
            }
          }}>
            <Copy size={12} /> {t('common.duplicate')}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void userAddons.exportModel(model)}><Download size={12} /> {t('common.export')}</Button>
          <Button size="sm" variant="danger" onClick={async () => {
            if (!confirm(t('common.confirmDelete', { name: model.name }))) {
              return;
            }
            await userAddons.remove(model.id);
            notify(t('addonStudio.dialog.deleted', { name: model.name }), 'info');
          }}>
            <Trash2 size={12} /> {t('common.delete')}
          </Button>
        </>
      )}
      {!addon.user && ((addon.languages?.length ?? 0) > 0 || (addon.themes?.length ?? 0) > 0) && (
        <Button size="sm" variant="outline" onClick={() => void copyAsUser()} title={t('addonStudio.dialog.copyAsUserHint')}>
          <Copy size={12} /> {t('addonStudio.dialog.copyAsUser')}
        </Button>
      )}
    </div>
  );
}

export function AddonDetails({ addon, update, onSelect }: { addon: Addon; update?: AvailableUpdate; onSelect: (id: string) => void; }) {
  const t = useT();
  const openStudio = useStore((s) => s.openAddonStudio);
  const closeDialog = useStore((s) => s.closeDialog);
  const active = registry.isActive(addon.id);
  const model = addon.user ? userAddons.get(addon.id) : undefined;
  const extension = extensions.get(addon.id);

  const languages = addon.languages ?? [];
  const kinds = addon.projectKinds ?? [];
  const templates = addon.projectTemplates ?? [];
  const commands = addon.commands ?? [];
  const themes = addon.themes ?? [];

  return (
    <div className="lm-anim-fade">
      <AddonHeader addon={addon} extension={extension} />
      {registry.blockedReason(addon.id) && (
        <div className="mx-5 mb-3 flex items-center gap-2 rounded-lumen-sm border border-warn/40 bg-warn/10 px-3 py-1.5 text-[12px] text-fg">
          <TriangleAlert size={12} className="shrink-0 text-warn" />
          {registry.blockedReason(addon.id)}
        </div>
      )}
      {update && (
        <div className="mx-5 mb-3 flex items-center gap-2 rounded-lumen-sm border border-accent/40 bg-accent/10 px-3 py-1.5 text-[12px] text-fg">
          <RefreshCw size={12} className="shrink-0 text-good" />
          {t('extensions.updateBanner', { from: update.from, to: update.to })}
        </div>
      )}
      <AddonActions addon={addon} update={update} onSelect={onSelect} />
      <AddonSdks requires={extension?.manifest.requires} />

      {languages.length > 0 && <LanguagesSection languages={languages} />}

      {kinds.length > 0 && <KindsSection kinds={kinds} />}

      {templates.length > 0 && <TemplatesSection templates={templates} />}

      {commands.length > 0 && <CommandsSection commands={commands} />}

      {themes.length > 0 && <ThemesSection themes={themes} active={active} />}

      {!languages.length && !kinds.length && !templates.length && !commands.length && !themes.length && (
        <DetailSection title={t('addonStudio.dialog.contents')}>
          <p className="text-[12px] text-subtle">{t('addonStudio.dialog.noContents')}</p>
          {model && (
            <Button size="sm" variant="outline" className="mt-2" onClick={() => { closeDialog(); openStudio(model.id); }}>
              <Pencil size={12} /> {t('common.edit')}
            </Button>
          )}
        </DetailSection>
      )}
    </div>
  );
}

export function LoadProblems() {
  const t = useT();
  const problems = userAddons.problems();
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lumen-sm border border-dashed border-edge px-2.5 py-1.5">
      <div className="min-w-0 flex-1 text-[11.5px] text-subtle">
        {problems.length === 0 && t('addonStudio.dialog.folderHint')}
        {problems.map((p) => (
          <div key={p.file} className="truncate text-bad" title={p.message}>{p.file}: {p.message}</div>
        ))}
      </div>
      <Button size="sm" title={t('addonStudio.dialog.openFolder')} onClick={async () => {
        const dir = await window.lumen.userAddons.dir();
        void window.lumen.shell.showItemInFolder(dir);
      }}>
        <FolderOpen size={12} />
      </Button>
    </div>
  );
}
