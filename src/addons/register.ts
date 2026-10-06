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
 * The one place where the add-ons that ship with the app meet the registry.
 *
 * They go in through `registry.register` exactly like an extension from a
 * server does — the app's own code never imports an add-on, it asks the
 * registry. The entry point (`main.tsx`) imports this file before anything
 * reads the registry; that is the whole connection.
 */

import { registry } from '@/core/registry';
import { ALL_ADDONS } from './index';

registry.register(...ALL_ADDONS);
