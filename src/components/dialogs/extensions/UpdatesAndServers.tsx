/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { appVersion } from '@/core/extensions/compat/app-version';
import { type AvailableUpdate, catalog } from '@/core/extensions/catalog';
import { fitsApp } from '@/core/extensions/compat/compat';
import { extensions as installedExtensions } from '@/core/extensions/manager';
import { hostOf, isOfficial, isTrusted } from '@/core/extensions/trust';
import type { ExtensionServer } from '@/core/extensions/types';
import { useT } from '@/i18n';
import { useStore } from '@/state/store';
import { CheckCircle2, Plus, RefreshCw, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import { Button, Empty } from '../../ui';
import { trustLabel, Badge } from './ExtensionBadges';

/** Why a server's catalogue is missing or out of date, one line per failing server. */
export function ServerProblems({ servers }: { servers: ExtensionServer[] }) {
  const t = useT();
  useSyncExternalStore(catalog.subscribe, catalog.getVersion);
  const failing = servers.filter((server) => catalog.of(server.url)?.error);
  if (!failing.length) {
    return null;
  }
  return (
    <div className="mb-3 flex flex-col gap-1">
      {failing.map((server) => {
        const state = catalog.of(server.url);
        const host = hostOf(server.url) ?? server.url;
        const error = state?.error ?? "";
        const cached = state?.stale
          ? t("extensions.showingSaved", { time: new Date(state.fetchedAt).toLocaleString() })
          : "";
        const text = state?.offline
          ? t("extensions.unreachable", { server: host })
          : t("extensions.loadFailed", { server: host, error });
        return (
          <div
            key={server.url}
            className="flex items-center gap-2 rounded-lumen-sm border border-dashed border-edge px-2.5 py-1.5 text-[11.5px] text-bad"
            title={error}
          >
            <ShieldAlert size={12} className="shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {cached ? `${text} ${cached}` : text}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void catalog.retryNow()}
              disabled={state?.loading}
            >
              <RefreshCw size={11} className={state?.loading ? "lm-anim-spin" : ""} />
              {t("extensions.retry")}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

export function UpdateList({ updates, servers, busy, onUpdate, onUpdateAll }: {
  updates: AvailableUpdate[];
  servers: ExtensionServer[];
  busy: string | null;
  onUpdate: (update: AvailableUpdate) => void;
  onUpdateAll: () => void;
}) {
  const t = useT();
  const loading = catalog.loading();
  const fits = (update: AvailableUpdate) =>
    fitsApp(update.minAppVersion, appVersion());
  const ready = updates.filter(fits).length;

  const body = () => {
    if (loading && !updates.length) {
      return (
        <Empty
          icon={<RefreshCw size={22} className="lm-anim-spin" />}
          title={t("extensions.loading")}
        />
      );
    }
    if (!updates.length) {
      return (
        <Empty
          icon={<CheckCircle2 size={22} />}
          title={t("extensions.updatesNone")}
        />
      );
    }
    return (
      <div className="flex flex-col gap-2">
        {updates.map((update) => {
          const manifest = installedExtensions.get(update.id)?.manifest;
          return (
            <div
              key={update.id}
              className="flex items-center gap-3 rounded-lumen border border-edge bg-elevated p-3"
            >
              <Badge icon={manifest?.icon} color={manifest?.color} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-fg">
                  {update.name}
                </div>
                <div className="truncate font-mono text-[11.5px] text-subtle">
                  {update.from} → {update.to} ·{" "}
                  {update.server.name ?? hostOf(update.server.url) ??
                    update.server.url}
                </div>
              </div>
              <Button
                size="sm"
                variant="solid"
                disabled={!fits(update) || busy === update.id || busy === "*"}
                onClick={() => onUpdate(update)}
              >
                {busy === update.id && (
                  <RefreshCw size={12} className="lm-anim-spin" />
                )}
                {fits(update)
                  ? t("extensions.update")
                  : t("extensions.requiresApp", {
                    required: update.minAppVersion ?? "",
                  })}
              </Button>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-4">
      {updates.length > 0 && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[12px] text-muted">
            {t("extensions.updatesFound", { count: updates.length })}
          </span>
          <span className="flex-1" />
          <Button
            size="sm"
            variant="solid"
            disabled={busy === "*" || ready === 0}
            onClick={onUpdateAll}
          >
            <RefreshCw
              size={12}
              className={busy === "*" ? "lm-anim-spin" : ""}
            />
            {t("extensions.updateAll")}
          </Button>
        </div>
      )}
      <ServerProblems servers={servers} />
      {body()}
    </div>
  );
}

export function ServerList({ servers, onAdd, onRemove, onPatch }: {
  servers: ExtensionServer[];
  onAdd: (url: string) => Promise<string | null>;
  onRemove: (url: string) => void;
  onPatch: (url: string, patch: Partial<ExtensionServer>) => void;
}) {
  const t = useT();
  const notify = useStore((s) => s.notify);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const submit = async () => {
    if (!draft.trim() || adding) {
      return;
    }
    setAdding(true);
    setError(null);
    const message = await onAdd(draft);
    setAdding(false);
    if (message) {
      setError(message);
      return;
    }
    notify(t("extensions.serverAdded", { name: draft.trim() }), "success");
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1.5 flex gap-2">
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void submit();
              }
            }}
            placeholder={t("extensions.serverPlaceholder")}
            spellCheck={false}
            className="lm-transition w-full rounded-lumen-sm border border-edge bg-input px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-accent"
          />
          <Button
            className="w-1/4"
            onClick={() => void submit()}
            disabled={adding || !draft.trim()}
          >
            <Plus size={12} />
            {t("extensions.addServer")}
          </Button>
        </div>
        {error && <span className="text-[11.5px] text-bad">{error}</span>}
      </div>

      <div className="flex flex-col gap-2">
        {servers.map((server) => {
          const official = isOfficial(server.url);
          const trusted = isTrusted(server.url, servers);
          return (
            <div
              key={server.url}
              className="flex items-center gap-3 rounded-lumen border border-edge bg-elevated p-3"
            >
              {trusted
                ? <ShieldCheck size={15} className="shrink-0 text-good" />
                : <ShieldAlert size={15} className="shrink-0 text-warn" />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-fg">
                  {server.name ?? hostOf(server.url)}
                </div>
                <div className="truncate font-mono text-[11.5px] text-subtle">
                  {server.url}
                </div>
                <div className="text-[11.5px] text-muted">
                  {t(trustLabel(official, trusted))}
                </div>
              </div>
              {!official && (
                <>
                  <label
                    className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-muted"
                    title={t("extensions.trustHint")}
                  >
                    <input
                      type="checkbox"
                      className="accent-[var(--c-accent)]"
                      checked={server.trusted === true}
                      onChange={(e) =>
                        onPatch(server.url, { trusted: e.target.checked })}
                    />
                    {t("extensions.trustServer")}
                  </label>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => onRemove(server.url)}
                    title={t("extensions.removeServer")}
                  >
                    <Trash2 size={12} />
                  </Button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
