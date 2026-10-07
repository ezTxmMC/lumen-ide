/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { LspConfig } from '@/core/types';
import { type ClientStatus } from '../client';

export interface LspStatus {
  status: ClientStatus | 'none';
  label: string;
  detail: string;
  /** How to install the server, shown when it is missing. */
  install?: string;
  /** A progress message in flight (indexing …). */
  busy?: string | null;
}

export interface ServerEntry {
  id: string;
  label: string;
  command: string;
  languages: string[];
  status: ClientStatus;
  detail: string;
  root: string;
  documents: number;
  busy: string | null;
  startedAt: number;
  version?: string;
  config: LspConfig;
}

export interface FsChange {
  path: string;
  /** 1 created · 2 changed · 3 deleted */
  type: 1 | 2 | 3;
}

export interface Paths {
  home: string;
  userData: string;
  platform: string;
  /** `linux-x64`, `darwin-arm64` … — which `github` downloads fit. */
  platformKey?: string;
}

/**
 * Extends a server's configuration before it starts. `command` is the
 * resolved program — the path of the jdtls launcher, say.
 */
export type ConfigDecorator = (config: LspConfig, languageId: string, root: string, command: string) => LspConfig | Promise<LspConfig>;

/** Programs to try before a server's own command and candidates — the chosen SDK's, say. */
export type CandidateProvider = (config: LspConfig) => string[];
