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
 * “This window or a new one?” — asked when a project is picked from the
 * switcher while another one is open and the setting says `ask`. With
 * “Remember my choice” the answer goes into the setting (Settings › General).
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppWindow, PanelsTopLeft, X } from 'lucide-react';
import { useT } from '@/i18n';
import { resolveOpenChoice, useOpenChoice, type OpenTarget } from '@/lib/open-project';
import { LAYER } from '../ui/layers';

export function OpenProjectChoice() {
  const pending = useOpenChoice((s) => s.pending);
  if (!pending) {
    return null;
  }
  return <ChoiceDialog name={pending.name} path={pending.path} />;
}

function ChoiceDialog({ name, path }: { name: string; path: string; }) {
  const t = useT();
  const [remember, setRemember] = useState(false);
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => { first.current?.focus(); }, []);

  const choose = (target: OpenTarget | null) => resolveOpenChoice(target, remember);

  const options: { target: OpenTarget; icon: typeof AppWindow; label: string; hint: string; }[] = [
    { target: 'this', icon: PanelsTopLeft, label: t('projectSwitcher.choice.this'), hint: t('projectSwitcher.choice.thisHint') },
    { target: 'new', icon: AppWindow, label: t('projectSwitcher.choice.new'), hint: t('projectSwitcher.choice.newHint') },
  ];

  return createPortal(
    <div
      className={`lm-anim-fade fixed inset-0 ${LAYER.dialog} flex items-start justify-center bg-black/40 p-6 pt-[16vh]`}
      onMouseDown={(event) => { if (event.target === event.currentTarget) {
        choose(null);
      } }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        choose(null);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('projectSwitcher.choice.title', { name })}
        data-open-choice=""
        className="lm-glass lm-shadow lm-anim-pop w-[min(440px,94vw)] overflow-hidden rounded-lumen-lg border border-edge"
      >
        <div className="flex items-start gap-2 border-b border-edge px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-medium text-fg">{t('projectSwitcher.choice.title', { name })}</div>
            <div className="truncate font-mono text-[10.5px] text-subtle" title={path}>{path}</div>
          </div>
          <button
            onClick={() => choose(null)}
            aria-label={t('projectSwitcher.choice.cancel')}
            className="lm-transition rounded-lumen-sm p-1 text-subtle hover:bg-hover hover:text-fg"
          >
            <X size={14} />
          </button>
        </div>

        <div className="space-y-2 px-4 py-3">
          <p className="text-[12px] text-muted">{t('projectSwitcher.choice.message')}</p>
          <div className="grid grid-cols-2 gap-2">
            {options.map(({ target, icon: Icon, label, hint }, index) => (
              <button
                key={target}
                ref={index === 0 ? first : undefined}
                data-choice={target}
                onClick={() => choose(target)}
                className="lm-transition lm-press flex flex-col items-start gap-1 rounded-lumen border border-edge px-3 py-2.5 text-left hover:border-accent hover:bg-hover focus-visible:border-accent focus-visible:outline-none"
              >
                <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg">
                  <Icon size={14} className="text-accent" />
                  {label}
                </span>
                <span className="text-[11px] leading-snug text-subtle">{hint}</span>
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-start gap-2 pt-1 select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              className="mt-0.5 accent-[var(--c-accent)]"
              data-choice-remember=""
            />
            <span>
              <span className="block text-[12px] text-fg">{t('projectSwitcher.choice.remember')}</span>
              <span className="block text-[11px] text-subtle">{t('projectSwitcher.choice.rememberHint')}</span>
            </span>
          </label>
        </div>

        <div className="flex justify-end border-t border-edge px-4 py-2.5">
          <button
            onClick={() => choose(null)}
            className="lm-transition inline-flex h-7 items-center rounded-lumen-sm px-2.5 text-[12.5px] font-medium text-muted hover:bg-hover hover:text-fg"
          >
            {t('projectSwitcher.choice.cancel')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
