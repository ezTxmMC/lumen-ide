/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { type DebugChoice } from './state/config';

export type ConsoleKind = 'stdout' | 'stderr' | 'console' | 'important' | 'input' | 'result' | 'error' | 'adapter' | 'system';

export interface ConsoleEntry {
  id: number;
  kind: ConsoleKind;
  text: string;
  sessionId?: string;
  variablesReference?: number;
}

export interface MissingAdapter {
  label: string;
  language: string;
  install?: string;
  installCommand?: string;
  docs?: string;
}

export interface WatchResult {
  value: string;
  type?: string;
  variablesReference: number;
  error?: boolean;
}

export interface Focus {
  sessionId: string;
  threadId: number | null;
  frameId: number | null;
}

export interface ExecLocation {
  path: string;
  /** 0-based. */
  line: number;
  /** The topmost frame, unless a deeper one was chosen. */
  top: boolean;
}

export interface InlineValues {
  path: string;
  line: number;
  values: Map<string, string>;
}

export interface Endpoint {
  transport: 'stdio' | 'tcp';
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  host?: string;
  port?: number;
}

export interface SessionMeta {
  choice: DebugChoice;
  /** For child sessions: TCP adapters reconnect, stdio adapters start again. */
  childEndpoint: Endpoint;
  revealed: boolean;
}
