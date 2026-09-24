#!/usr/bin/env node
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
 * Tests of the Minecraft extension.
 *
 *   node extensions/minecraft/test.mjs             # offline: rules, parsers, templates from the defaults
 *   node extensions/minecraft/test.mjs --network   # also the live version sources
 */

import process from 'node:process';
import { runTs } from './tools/run.mjs';

const network = process.argv.includes('--network');
await runTs('test/unit.ts');
if (network) { await runTs('test/network.ts'); }
