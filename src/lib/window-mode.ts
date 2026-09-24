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
 * Which kind of window this is. At start Lumen opens a small window that shows
 * only the project screen (`?view=projects`, see `electron/main.ts`); once a
 * project is chosen the main window opens and that one goes.
 */

// The check scripts load this under Node, where `window` is missing or a bare stand-in.
const params = new URLSearchParams(typeof window === 'undefined' ? '' : (window.location?.search ?? ''));

export const isProjectsWindow = params.get('view') === 'projects';

/** The main window was opened to work without a project. */
export const startsEmpty = params.has('empty');

/** The saved workspace (several folders) the main window was opened for. */
export const startWorkspace = params.get('workspace');
