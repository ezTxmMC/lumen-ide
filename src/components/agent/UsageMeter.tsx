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
 * The live numbers an agent reports under the chat's head: how full the
 * context window is, what the session cost so far, the rate limits and the
 * model and mode that are actually active.
 */

import { useT } from '@/i18n';
import { agentChat, type AgentInfo } from '@/core/agent/chat';
import { formatNumber } from './ChatItems';

/** Where the bar changes colour: the window is nearly full. */
const WARN_AT = 0.8;
const DANGER_AT = 0.92;

function toneFor(share: number): string {
  if (share >= DANGER_AT) {
    return 'bg-bad';
  }
  if (share >= WARN_AT) {
    return 'bg-warn';
  }
  return 'bg-accent';
}

function ContextBar({ used, total }: { used: number; total: number | undefined; }) {
  const t = useT();
  if (!total) {
    return <span title={t('agent.usage.contextLabel')}>{t('agent.usage.contextUsed', { used: formatNumber(used) })}</span>;
  }
  const share = Math.min(1, used / total);
  const percent = Math.round(share * 100);
  return (
    <span className="flex items-center gap-1" title={t('agent.usage.context', { used: formatNumber(used), total: formatNumber(total), percent })}>
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-edge">
        <span className={`block h-full ${toneFor(share)}`} style={{ width: `${percent}%` }} />
      </span>
      {percent} %
    </span>
  );
}

export function UsageMeter({ info }: { info: AgentInfo; }) {
  const t = useT();
  const chat = agentChat.activeChat(info.key);
  const { usage } = chat;
  const mode = info.agent.modes?.find((entry) => entry.id === usage.mode);
  const cost = usage.costUsd ?? chat.spentUsd;
  const limits = usage.rateLimits ?? [];
  const hasContext = usage.contextUsed !== undefined;
  if (!hasContext && !cost && !limits.length && !mode && !chat.model) {
    return null;
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[10px] text-subtle">
      {chat.model && <span className="max-w-[160px] truncate" title={t('agent.model.reported', { model: chat.model })}>{chat.model}</span>}
      {mode && <span title={mode.description}>{mode.label}</span>}
      {hasContext && <ContextBar used={usage.contextUsed ?? 0} total={usage.contextTotal} />}
      {cost > 0 && <span title={t('agent.usage.sessionCost')}>{t('agent.usage.cost', { cost: cost.toFixed(cost < 0.01 ? 4 : 2) })}</span>}
      {limits.map((limit) => (
        <span
          key={limit.label}
          className={(limit.usedPercent ?? 0) >= 90 ? 'text-bad' : ''}
          title={limit.resetsAt ? t('agent.usage.resets', { time: new Date(limit.resetsAt).toLocaleString() }) : undefined}
        >
          {limit.label}{limit.usedPercent === undefined ? '' : ` ${Math.round(limit.usedPercent)} %`}
        </span>
      ))}
    </div>
  );
}
