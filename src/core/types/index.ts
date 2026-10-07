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
 * Lumen Add-on API
 * ================
 *
 * An add-on is a plain object. There is nothing to build, compile or
 * register — export the object, list it in `src/addons/index.ts`, done. A
 * new language is usually nothing but a few lists of keywords:
 *
 *   export const myAddon: Addon = {
 *     id: 'lang.lua',
 *     name: 'Lua',
 *     version: '1.0.0',
 *     languages: [{
 *       id: 'lua',
 *       name: 'Lua',
 *       extensions: ['.lua'],
 *       comments: { line: '--', block: ['--[[', ']]'] },
 *       keywords: ['local', 'function', 'end'],
 *       controls: ['if', 'then', 'else', 'for', 'while'],
 *       run: { label: 'Lua', command: 'lua', args: ['${file}'] },
 *     }],
 *   }
 */

export * from './language';
export * from './project';
export * from './forms';
export * from './project-kinds';
export * from './theme';
export * from './icons';
export * from './debug';
export * from './addon';
export * from './tools';
