/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { type CompletionItem, type CompletionList, type MessageType, type Range } from '../protocol';

export type ClientStatus =
  | 'idle'
  | 'checking'
  | 'unavailable'
  | 'starting'
  | 'ready'
  | 'failed'
  | 'stopped';

export interface Pending {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface ProgressState {
  title: string;
  message?: string;
  percentage?: number;
}

export interface LogLine {
  time: number;
  /** `stderr`, `log` (window/logMessage) or `client` (our own notes). */
  kind: 'stderr' | 'log' | 'client';
  level: MessageType;
  text: string;
}

/** One change in LSP coordinates — for incremental synchronisation. */
export interface ContentChange {
  range: Range;
  text: string;
}

export type CompletionOutcome =
  | { ok: true; list: CompletionList; }
  | { ok: false; error: Error; cancelled: boolean; };

export type CompletionOutcomeResolve =
  | { ok: true; item: CompletionItem; }
  | { ok: false; error: Error; item: CompletionItem; };

/** The options of a formatting request: `tabSize`, `insertSpaces` and any extras the server understands. */
export type FormattingOptions = { tabSize: number; insertSpaces: boolean; } & Record<string, unknown>;
