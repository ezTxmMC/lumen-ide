/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Zap, ZapOff, RotateCw, Square, Download, ExternalLink, Trash2, RefreshCw, Loader2,
} from 'lucide-react';
import { useStore } from '@/state/store';
import { lsp } from '@/core/lsp/manager';
import { registry } from '@/core/registry';
import { openLspInstall } from '@/lib/lsp-install';
import { statusDot } from '@/lib/status';
import { locale, tr, useT } from '@/i18n';
import { Button } from '../ui';

const STATE_LABEL = new Set(['idle', 'checking', 'starting', 'ready', 'unavailable', 'failed', 'stopped']);

const LEVEL_TONE: Record<number, string> = {
  1: 'text-bad', 2: 'text-warn', 3: 'text-muted', 4: 'text-subtle', 5: 'text-subtle',
};

function uptime(since: number) {
  const s = Math.floor((Date.now() - since) / 1000);
  if (s < 60) {
    return `${s} s`;
  }
  if (s < 3600) {
    return `${Math.floor(s / 60)} min`;
  }
  return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
}

type Server = ReturnType<typeof lsp.list>[number];

function ServerCard({ server, selected, languageName, onToggle, onRestart }: {
  server: Server;
  selected: boolean;
  languageName(id: string): string;
  onToggle(): void;
  onRestart(): void;
}) {
  const t = useT();
  return (
    <div
      key={server.id}
      className={[
        'lm-transition mb-1 rounded-lumen-sm border px-2 py-1.5',
        selected ? 'border-accent bg-active' : 'border-edge hover:bg-hover',
      ].join(' ')}
      onClick={onToggle}
      title={`${server.command}\n${server.root}`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`size-1.5 shrink-0 rounded-full ${statusDot(server.status)}`} />
        <span className="min-w-0 flex-1 truncate text-[12px] text-fg">{server.label}</span>
        {server.version && <span className="shrink-0 font-mono text-[10px] text-subtle">{server.version}</span>}
        <span className="shrink-0 text-[10.5px] text-subtle">{STATE_LABEL.has(server.status) ? t(`panels.lsp.state.${server.status}`) : server.status}</span>
      </div>
      <div className="mt-0.5 flex items-center gap-1 text-[10.5px] text-subtle">
        <span className="min-w-0 flex-1 truncate">
          {server.languages.map(languageName).join(', ') || '—'} · {t('panels.lsp.documents', { count: server.documents })} · {uptime(server.startedAt)}
        </span>
        <span className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          <button title={t('panels.lsp.restart')} onClick={() => onRestart()} className="lm-transition rounded p-0.5 hover:text-fg"><RotateCw size={11} /></button>
          <button title={t('panels.lsp.stop')} onClick={() => void lsp.stopClient(server.id)} className="lm-transition rounded p-0.5 hover:text-bad"><Square size={10} /></button>
          {server.config.docs && (
            <button title={t('panels.lsp.docs')} onClick={() => void window.lumen.shell.openExternal(server.config.docs!)} className="lm-transition rounded p-0.5 hover:text-fg"><ExternalLink size={11} /></button>
          )}
        </span>
      </div>
      {server.busy && (
        <div className="mt-0.5 flex items-center gap-1 truncate text-[10.5px] text-accent">
          <Loader2 size={9} className="lm-anim-spin" /> {server.busy}
        </div>
      )}
      {server.detail && server.status === 'failed' && (
        <div className="mt-0.5 truncate text-[10.5px] text-bad">{server.detail}</div>
      )}
    </div>
  );
}

type MissingServer = ReturnType<typeof lsp.missingServers>[number];

function MissingServerCard({ languageId, config, languageName }: {
  languageId: string;
  config: MissingServer['config'];
  languageName(id: string): string;
}) {
  const t = useT();
      const alternatives = registry.languages().find((l) => l.id === languageId)?.lsp ?? [config];
      const command = lsp.installHint(alternatives.find((candidate) => lsp.canInstall(candidate)) ?? config);
  return (
    <div key={languageId} className="mb-1 rounded-lumen-sm border border-dashed border-edge px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <ZapOff size={10} className="shrink-0 text-subtle" />
        <span className="min-w-0 flex-1 truncate text-[12px] text-muted">{config.label}</span>
        <span className="shrink-0 text-[10.5px] text-subtle">{languageName(languageId)}</span>
      </div>
      <p className="mt-0.5 text-[10.5px] leading-snug text-subtle">{tr(config.install)}</p>
      <div className="mt-1 flex items-center gap-1">
        {command && (
          <Button size="sm" variant="outline" title={command} onClick={() => openLspInstall(languageId, { server: config.label })}>
            <Download size={11} /> {t('common.install')}
          </Button>
        )}
        {config.docs && (
          <Button size="sm" title={t('panels.lsp.docs')} onClick={() => void window.lumen.shell.openExternal(config.docs!)}>
            <ExternalLink size={11} />
          </Button>
        )}
      </div>
    </div>
  );
}

function LogPane({ servers, logs, filter, stderr, onStderr, bottom }: {
  servers: Server[];
  logs: ReturnType<typeof lsp.logs>;
  filter: string | null;
  stderr: boolean;
  onStderr(value: boolean): void;
  bottom: React.RefObject<HTMLDivElement>;
}) {
  const t = useT();
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-edge px-2 py-1 text-[11px] text-subtle">
        <span className="flex-1 truncate">
          {t('panels.lsp.log')}{filter ? ` · ${servers.find((s) => s.id === filter)?.label ?? ''}` : ''}
        </span>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={stderr} onChange={(e) => onStderr(e.target.checked)} /> stderr
        </label>
        <Button size="sm" title={t('panels.lsp.clearLog')} onClick={() => lsp.clearLogs()}>
          <Trash2 size={11} />
        </Button>
      </div>
      <div className="flex-1 overflow-auto px-3 py-1 font-mono text-[11px] leading-[1.5]">
        {logs.length === 0 && (
          <p className="py-3 text-subtle">{t('panels.lsp.logEmpty')}</p>
        )}
        {logs.map((line, i) => (
          <div key={i} className={`whitespace-pre-wrap break-all ${LEVEL_TONE[line.level] ?? 'text-muted'}`}>
            <span className="text-subtle">{new Date(line.time).toLocaleTimeString(locale(), { hour12: false })} </span>
            {!filter && <span className="text-subtle">[{line.server.split(/[\s-]/)[0]}] </span>}
            {line.kind === 'stderr' && <span className="text-subtle">stderr: </span>}
            {line.text.length > 600 ? `${line.text.slice(0, 600)}…` : line.text}
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <div className="border-t border-edge px-3 py-1 text-[10.5px] text-subtle">
        {t('panels.lsp.dataDir')}{' '}
        <button className="text-muted hover:text-fg" onClick={() => void useStore.getState().openProjectConfig()}>
          {t('panels.lsp.projectDefaults')}
        </button>
      </div>
    </div>
  );
}

export function LspPanel() {
  const t = useT();
  const lspVersion = useStore((s) => s.lspVersion);
  const lspLogVersion = useStore((s) => s.lspLogVersion);
  const registryVersion = useStore((s) => s.registryVersion);
  const enabled = useStore((s) => s.effects.lsp);
  const setEffects = useStore((s) => s.setEffects);
  const notify = useStore((s) => s.notify);
  const [filter, setFilter] = useState<string | null>(null);
  const [stderr, setStderr] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const servers = useMemo(() => lsp.list(), [lspVersion]);
  const missing = useMemo(() => lsp.missingServers(), [lspVersion]);
  const logs = useMemo(
    () => lsp.logs(filter ?? undefined).filter((l) => stderr || l.kind !== 'stderr').slice(-300),
    [lspLogVersion, lspVersion, filter, stderr],
  );
  const languageName = (id: string) => registry.languages().find((l) => l.id === id)?.name ?? id;
  void registryVersion;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [logs.length]);

  const restart = async (id: string) => {
    notify(t('panels.lsp.restarting'), 'info');
    await lsp.restartClient(id);
  };

  return (
    <div className="flex h-full">
      {/* Serverliste */}
      <div className="flex w-[300px] shrink-0 flex-col border-r border-edge">
        <div className="flex items-center gap-1 border-b border-edge px-2 py-1 text-[11px] text-subtle">
          <span className="flex-1">{t('panels.lsp.servers', { count: servers.length })}</span>
          <Button size="sm" title={t('panels.lsp.rescan')} onClick={() => { lsp.rescan(); notify(t('panels.lsp.rescanning'), 'info'); }}>
            <RefreshCw size={11} />
          </Button>
          <Button size="sm" title={enabled ? t('panels.lsp.disable') : t('panels.lsp.enable')} onClick={() => setEffects({ lsp: !enabled })}>
            {enabled ? <Zap size={11} className="text-ok" /> : <ZapOff size={11} />}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5">
          {servers.length === 0 && missing.length === 0 && (
            <p className="px-1 py-3 text-[11.5px] leading-relaxed text-subtle">
              {enabled ? t('panels.lsp.noServer') : t('panels.lsp.off')}
            </p>
          )}
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              selected={filter === server.id}
              languageName={languageName}
              onToggle={() => setFilter(filter === server.id ? null : server.id)}
              onRestart={() => void restart(server.id)}
            />
          ))}

          {missing.length > 0 && (
            <div className="mt-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-subtle">{t('panels.lsp.notInstalled')}</div>
          )}
          {missing.map(({ languageId, config }) => (
            <MissingServerCard key={languageId} languageId={languageId} config={config} languageName={languageName} />
          ))}
        </div>
      </div>

      {/* Protokoll */}
      <LogPane servers={servers} logs={logs} filter={filter} stderr={stderr} onStderr={setStderr} bottom={bottom} />
    </div>
  );
}
