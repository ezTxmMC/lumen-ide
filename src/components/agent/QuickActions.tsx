/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The agent's quick actions — prompt snippets the user defined — as buttons above the composer. */

import { Zap } from 'lucide-react';
import { useT } from '@/i18n';
import { agentChat, type AgentInfo } from '@/core/agent/chat';

export function QuickActions({ info, running, enabled }: { info: AgentInfo; running: boolean; enabled: boolean; }) {
  const t = useT();
  const actions = agentChat.quickActions(info.key);
  if (actions.length === 0) {
    return null;
  }
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1" aria-label={t('agent.quick.title')}>
      <Zap size={11} className="text-subtle" />
      {actions.map((action) => (
        <button
          key={action.id}
          title={action.description ?? action.prompt}
          disabled={running || !enabled}
          onClick={() => void agentChat.runQuickAction(info.key, action)}
          className="lm-transition max-w-[160px] truncate rounded-full border border-edge px-2 py-0.5 text-[11px] text-muted enabled:hover:border-accent enabled:hover:text-fg disabled:opacity-50"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
