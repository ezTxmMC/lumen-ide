/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import { createContext, useContext } from 'react';

/** The window a component is drawn in: the main one, or a pop-out's. */
export interface Owner {
  win: Window;
  doc: Document;
}

const MAIN: Owner = { win: window, doc: document };

export const OwnerContext = createContext<Owner>(MAIN);

/**
 * Overlays (menus, dropdowns), global listeners and measuring belong to the
 * window that holds the component — a popped-out view's context menu opens in
 * its own window, and a drag there follows that window's pointer.
 */
export const useOwner = () => useContext(OwnerContext);

/** The window an element sits in, for code that has an element but no hook. */
export const windowOf = (el: Element | null | undefined): Window & typeof globalThis =>
  (el?.ownerDocument.defaultView as (Window & typeof globalThis) | null | undefined) ?? window;
