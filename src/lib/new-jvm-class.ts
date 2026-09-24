/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The open “New Java/Kotlin class or package” dialog, if any. */

import { create } from 'zustand';

export interface NewJvmRequest {
  /** The folder the dialog was opened on. */
  dir: string;
  mode: 'class' | 'package';
}

export const useNewJvm = create<{ request: NewJvmRequest | null; }>(() => ({ request: null }));

export const openNewJvm = (dir: string, mode: NewJvmRequest['mode']) => useNewJvm.setState({ request: { dir, mode } });
export const closeNewJvm = () => useNewJvm.setState({ request: null });
