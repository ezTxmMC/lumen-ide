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
 * The install dialog for language servers.
 *
 * Choosing: every server of the language (or of an extension), whether it is
 * already there, and for the chosen one the way it would be installed on this
 * machine — with the exact command shown before anything runs. Commands can be
 * edited; a system package manager that needs root is marked as such.
 *
 * Installing: progress, the streamed log, cancelling — and, when root is
 * needed, a password prompt of its own. The state lives in `lib/lsp-install`,
 * so the install carries on when the dialog is closed.
 */

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Check, Download, ExternalLink, KeyRound, Loader2, ShieldAlert, SquareTerminal, X, Zap,
} from 'lucide-react';
import { useStore } from '@/state/store';
import { lsp } from '@/core/lsp/manager';
import { managerLabel, planKey, type InstallPlan } from '@/core/lsp/install-plan';
import {
  answerPassword, cancelInstall, closeLspInstall, lspInstall, startInstall,
  type InstallRequest, type InstallState, type InstallTarget,
} from '@/lib/lsp-install';
import { editorBridge } from '@/lib/editor-bridge';
import { tr, useT } from '@/i18n';
import { useLastValue, usePresence } from '@/hooks/usePresence';
import type { LspConfig } from '@/core/types';
import { Button } from '../ui';

type Translate = ReturnType<typeof useT>;

const field = 'w-full rounded-lumen-sm border border-edge bg-input px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent';

function planTitle(t: Translate, plan: InstallPlan): string {
  if (plan.kind === 'managed') {
    return t('lsp.dialog.kindManaged');
  }
  if (plan.kind === 'system') {
    return t('lsp.dialog.kindSystem', { manager: managerLabel(plan.manager) });
  }
  return t('lsp.dialog.kindCommand');
}

function planHint(t: Translate, plan: InstallPlan): string {
  if (plan.kind === 'managed') {
    return t('lsp.dialog.kindManagedHint');
  }
  if (plan.kind === 'system') {
    return t('lsp.dialog.kindSystemHint');
  }
  return t('lsp.dialog.kindCommandHint');
}

/** Distribution and package managers, in one line. */
function systemLine(): string | null {
  const info = lsp.systemInfo;
  if (!info) {
    return null;
  }
  const parts = [info.distro?.name, info.managers.map(managerLabel).join(', ')].filter(Boolean);
  if (!parts.length) {
    return null;
  }
  return parts.join(' · ');
}

/* ------------------------------------------------------------------ *
 * Choosing
 * ------------------------------------------------------------------ */

interface Choice {
  selected: string[];
  methods: Record<string, string>;
  commands: Record<string, string>;
}

function PlanDetails({ plans, plan, command, onMethod, onCommand }: {
  plans: InstallPlan[];
  plan: InstallPlan;
  command: string | null;
  onMethod: (key: string) => void;
  onCommand: (value: string) => void;
}) {
  const t = useT();
  return (
    <div className="mt-2 space-y-1.5 pl-6">
  {plans.length > 1 && (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t('lsp.dialog.method')}>
      {plans.map((entry) => {
        const key = planKey(entry);
        const active = key === planKey(plan);
        return (
          <button
            key={key}
            role="radio"
            aria-checked={active}
            onClick={() => onMethod(key)}
            className={[
              'lm-transition rounded-full border px-2 py-0.5 text-[11px]',
              active ? 'border-accent text-fg' : 'border-edge text-muted hover:border-edge-strong',
            ].join(' ')}
          >
            {planTitle(t, entry)}
          </button>
        );
      })}
    </div>
  )}
  <div className="flex items-center gap-1.5 text-[11px] text-subtle">
    {plans.length === 1 && <span className="font-medium text-muted">{planTitle(t, plan)} ·</span>}
    <span className="min-w-0 flex-1">{planHint(t, plan)}</span>
    {plan.kind !== 'managed' && plan.root && (
      <span className="flex shrink-0 items-center gap-1 text-warn"><ShieldAlert size={11} /> {t('lsp.dialog.needsRoot')}</span>
    )}
  </div>
  <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-subtle">{t('lsp.dialog.command')}</div>
  {command === null && (
    <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lumen-sm border border-edge bg-input px-2.5 py-1.5 font-mono text-[11.5px] text-muted">{plan.summary}</pre>
  )}
  {command !== null && (
    <>
      <textarea
        value={command}
        rows={Math.min(4, Math.max(1, Math.ceil(command.length / 70)))}
        spellCheck={false}
        onChange={(e) => onCommand(e.target.value)}
        className={`${field} resize-y font-mono text-[11.5px]`}
      />
      {plan.kind === 'command' && command.trim() !== plan.command.trim() && (
        <p className="text-[11px] text-warn">{t('lsp.dialog.commandEdited')}</p>
      )}
    </>
  )}
</div>
  );
}

function ServerRow({ config, request, choice, installed, onToggle, onMethod, onCommand }: {
  config: LspConfig;
  request: InstallRequest;
  choice: Choice;
  installed: boolean | undefined;
  onToggle: () => void;
  onMethod: (key: string) => void;
  onCommand: (value: string) => void;
}) {
  const t = useT();
  const plans = lsp.installPlans(config);
  const selected = choice.selected.includes(config.label);
  const plan = plans.find((entry) => planKey(entry) === choice.methods[config.label]) ?? plans[0];
  const multi = request.mode === 'batch';
  const disabled = !plans.length;
  const command = plan?.kind === 'command' ? choice.commands[config.label] ?? plan.command : null;

  return (
    <div className={`lm-transition rounded-lumen border px-3 py-2 ${selected ? 'border-accent bg-active' : 'border-edge'} ${disabled ? 'opacity-60' : ''}`}>
      <label className={`flex items-center gap-2 ${disabled ? '' : 'cursor-pointer'}`}>
        <input
          type={multi ? 'checkbox' : 'radio'}
          name="lsp-server"
          className="accent-[var(--c-accent)]"
          checked={selected}
          disabled={disabled}
          onChange={onToggle}
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">{config.label}</span>
        {installed && (
          <span className="flex shrink-0 items-center gap-1 text-[10.5px] text-ok"><Check size={10} /> {t('lsp.dialog.installed')}</span>
        )}
        {config.docs && (
          <button
            title={t('lsp.dialog.docs')}
            onClick={(e) => { e.preventDefault(); void window.lumen.shell.openExternal(config.docs!); }}
            className="lm-transition shrink-0 rounded p-0.5 text-subtle hover:text-fg"
          >
            <ExternalLink size={12} />
          </button>
        )}
      </label>

      {disabled && (
        <p className="mt-1 pl-6 text-[11px] leading-snug text-subtle">
          {t('lsp.dialog.notInstallable')}{config.install ? ` — ${tr(config.install)}` : ''}
        </p>
      )}

      {selected && plan && (
        <PlanDetails plans={plans} plan={plan} command={command} onMethod={onMethod} onCommand={onCommand} />
      )}
    </div>
  );
}

function Chooser({ request, onClose }: { request: InstallRequest; onClose: (decline: boolean) => void; }) {
  const t = useT();
  const [choice, setChoice] = useState<Choice>({ selected: request.preselect, methods: {}, commands: {} });
  const [neverAsk, setNeverAsk] = useState(false);
  const [installed, setInstalled] = useState<Record<string, boolean>>({});
  const lspVersion = useStore((s) => s.lspVersion);

  useEffect(() => {
    let alive = true;
    void Promise.all(request.servers.map(async (config) => [config.label, await lsp.isInstalled(config)] as const))
      .then((entries) => { if (alive) {
        setInstalled(Object.fromEntries(entries));
      } });
    return () => { alive = false; };
  }, [request]);

  const targets = useMemo<InstallTarget[]>(() => {
    void lspVersion;
    return request.servers.flatMap((config) => {
      if (!choice.selected.includes(config.label)) {
        return [];
      }
      const plans = lsp.installPlans(config);
      const plan = plans.find((entry) => planKey(entry) === choice.methods[config.label]) ?? plans[0];
      if (!plan) {
        return [];
      }
      return [{ config, plan, command: plan.kind === 'command' ? choice.commands[config.label] : undefined }];
    });
  }, [request, choice, lspVersion]);

  const toggle = (label: string) => setChoice((current) => {
    if (request.mode === 'language') {
      return { ...current, selected: [label] };
    }
    const has = current.selected.includes(label);
    return { ...current, selected: has ? current.selected.filter((entry) => entry !== label) : [...current.selected, label] };
  });

  const intro = request.mode === 'language'
    ? t('lsp.dialog.introLanguage', { language: request.subject })
    : t('lsp.dialog.introBatch', { name: request.subject });
  const system = systemLine();

  return (
    <>
      <div className="max-h-[60vh] space-y-2 overflow-y-auto px-4 py-3">
        <p className="text-[12px] leading-relaxed text-subtle">{intro}</p>
        {request.servers.map((config) => (
          <ServerRow
            key={config.label}
            config={config}
            request={request}
            choice={choice}
            installed={installed[config.label]}
            onToggle={() => toggle(config.label)}
            onMethod={(key) => setChoice((current) => ({ ...current, methods: { ...current.methods, [config.label]: key } }))}
            onCommand={(value) => setChoice((current) => ({ ...current, commands: { ...current.commands, [config.label]: value } }))}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-edge px-4 py-2.5">
        {request.prompt && request.languageId && (
          <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px] text-muted">
            <input type="checkbox" className="accent-[var(--c-accent)]" checked={neverAsk} onChange={(e) => setNeverAsk(e.target.checked)} />
            {t('lsp.installNeverAsk', { language: request.subject })}
          </label>
        )}
        {!request.prompt && system && <span className="truncate text-[10.5px] text-subtle">{t('lsp.dialog.system', { system })}</span>}
        <span className="flex-1" />
        <Button onClick={() => onClose(neverAsk)}>{t('lsp.dialog.notNow')}</Button>
        <Button
          variant="solid"
          disabled={!targets.length}
          title={targets.length ? undefined : t('lsp.dialog.noneSelected')}
          onClick={() => void startInstall(targets)}
        >
          <Download size={13} />
          {targets.length > 1 ? t('lsp.dialog.installCount', { count: targets.length }) : t('lsp.installSubmit')}
        </Button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Installing
 * ------------------------------------------------------------------ */

function PasswordPrompt({ state }: { state: InstallState; }) {
  const t = useT();
  const [password, setPassword] = useState('');
  const request = state.password;
  // Nothing of the password outlives the prompt.
  useEffect(() => () => setPassword(''), []);
  if (!request) {
    return null;
  }

  const submit = () => {
    if (!password) {
      return;
    }
    const value = password;
    setPassword('');
    answerPassword({ password: value, method: 'sudo' });
  };

  return (
    <div className="rounded-lumen border border-warn/50 bg-warn/5 p-3">
      <div className="flex items-center gap-2 text-[13px] font-medium text-fg">
        <KeyRound size={14} className="text-warn" /> {t('lsp.dialog.passwordTitle')}
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-subtle">{t('lsp.dialog.passwordBody')}</p>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lumen-sm border border-edge bg-input px-2.5 py-1.5 font-mono text-[11.5px] text-muted">{request.command}</pre>
      <label className="mt-2 block text-[11.5px] text-muted" htmlFor="lsp-sudo-password">{t('lsp.dialog.passwordLabel')}</label>
      <input
        id="lsp-sudo-password"
        type="password"
        autoFocus
        autoComplete="off"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') {
            return;
          }
          e.preventDefault();
          submit();
        }}
        className={`${field} mt-1 ${request.wrong ? 'border-bad' : ''}`}
      />
      {request.wrong && <p className="mt-1 text-[11px] text-bad">{t('lsp.dialog.passwordWrong')}</p>}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {request.pkexec && (
          <Button size="sm" onClick={() => { setPassword(''); answerPassword({ password: '', method: 'pkexec' }); }}>
            {t('lsp.dialog.usePkexec')}
          </Button>
        )}
        <span className="flex-1" />
        <Button size="sm" onClick={() => { setPassword(''); answerPassword(null); }}>{t('lsp.dialog.cancel')}</Button>
        <Button size="sm" variant="solid" disabled={!password} onClick={submit}>{t('lsp.dialog.passwordSubmit')}</Button>
      </div>
    </div>
  );
}

function summaryOf(t: Translate, state: InstallState): { text: string; tone: string; } {
  const ok = state.results.filter((result) => result.ok).length;
  const cancelled = state.results.some((result) => result.cancelled);
  if (cancelled && !ok) {
    return { text: t('lsp.dialog.doneCancelled'), tone: 'text-subtle' };
  }
  if (ok === state.results.length && ok > 0) {
    return { text: t('lsp.dialog.doneOk'), tone: 'text-ok' };
  }
  if (ok > 0) {
    return { text: t('lsp.dialog.donePartial'), tone: 'text-warn' };
  }
  return { text: t('lsp.dialog.doneFailed'), tone: 'text-bad' };
}

function resultLabel(t: Translate, result: InstallState['results'][number]) {
  if (result.ok) {
    return <span className="text-ok">{t('lsp.dialog.resultOk')}</span>;
  }
  if (result.cancelled) {
    return <span className="text-subtle">{t('lsp.dialog.resultCancelled')}</span>;
  }
  return <span className="text-bad">{t('lsp.dialog.resultFailed')}</span>;
}

function Progress({ state, onClose }: { state: InstallState; onClose: () => void; }) {
  const t = useT();
  const bottom = useRef<HTMLDivElement>(null);
  const done = state.phase === 'done';
  const summary = done ? summaryOf(t, state) : null;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [state.log.length]);

  const showOutput = () => {
    useStore.getState().showPanel('output');
    onClose();
  };

  return (
    <>
      <div className="max-h-[62vh] space-y-2.5 overflow-y-auto px-4 py-3">
        {!done && (
          <div className="flex items-center gap-2 text-[12.5px] text-fg">
            <Loader2 size={14} className="lm-anim-spin text-accent" />
            {t('lsp.dialog.running', { name: state.current ?? '…', step: state.step, total: state.total })}
          </div>
        )}
        {summary && <div className={`flex items-center gap-2 text-[12.5px] ${summary.tone}`}><Zap size={14} /> {summary.text}</div>}
        {state.results.length > 0 && (
          <ul className="space-y-0.5 text-[12px]">
            {state.results.map((result) => (
              <li key={result.label} className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-muted">{result.label}</span>
                <span className="shrink-0 text-[11px]">{resultLabel(t, result)}</span>
              </li>
            ))}
          </ul>
        )}
        {state.phase === 'password' && <PasswordPrompt state={state} />}
        <div>
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-subtle">{t('lsp.dialog.log')}</div>
          <div className="max-h-[220px] overflow-auto rounded-lumen-sm border border-edge bg-input px-2.5 py-1.5 font-mono text-[11px] leading-[1.5] text-muted">
            {state.log.map((line, index) => (
              <div key={index} className={`whitespace-pre-wrap break-all ${line.startsWith('→') || line.startsWith('$') ? 'text-accent' : ''}`}>{line}</div>
            ))}
            <div ref={bottom} />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-edge px-4 py-2.5">
        <Button onClick={showOutput}><SquareTerminal size={13} /> {t('lsp.dialog.showOutput')}</Button>
        <span className="flex-1" />
        {!done && <Button variant="danger" onClick={cancelInstall}>{t('lsp.dialog.cancel')}</Button>}
        {done && <Button variant="solid" onClick={onClose}>{t('common.close')}</Button>}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

export function LspInstallDialog() {
  const t = useT();
  useSyncExternalStore(lspInstall.subscribe, lspInstall.getVersion);
  const state = lspInstall.state;
  const { visible, closing } = usePresence(Boolean(state.request));
  const request = useLastValue(state.request);
  const busy = state.phase === 'running' || state.phase === 'password';

  const close = (decline = false) => {
    if (busy) {
      return;
    }
    closeLspInstall(decline);
    requestAnimationFrame(() => editorBridge.focus());
  };

  useEffect(() => {
    if (!state.request) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.stopPropagation();
      if (state.phase === 'password') {
        answerPassword(null);
        return;
      }
      close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!request || !visible) {
    return null;
  }

  const title = request.mode === 'language'
    ? t('lsp.dialog.titleLanguage', { language: request.subject })
    : t('lsp.dialog.titleBatch', { name: request.subject });
  const choosing = state.phase === 'choose';

  return (
    <div
      className={`lm-anim-fade fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-6 pt-[12vh] ${closing ? 'lm-closing' : ''}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget) {
        close();
      } }}
    >
      <div role="dialog" aria-label={title} className="lm-glass lm-shadow lm-anim-pop w-[min(600px,94vw)] overflow-hidden rounded-lumen-lg border border-edge">
        <div className="flex items-center gap-2 border-b border-edge px-4 py-3">
          <Zap size={15} className="shrink-0 text-accent" />
          <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-fg">{title}</span>
          <Button size="sm" disabled={busy} onClick={() => close()} title={t('common.closeEsc')}><X size={13} /></Button>
        </div>
        {choosing && <Chooser key={request.id} request={request} onClose={close} />}
        {!choosing && <Progress state={state} onClose={() => close()} />}
      </div>
    </div>
  );
}
