/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import type { ProjectTemplate } from '../../../../src/core/types';
import { architecturyTemplate } from './architectury';
import { forgeTemplate } from './forge';
import { fabricTemplate, quiltTemplate } from './loom';
import { neoforgeTemplate } from './neoforge';
import { PLUGIN_TEMPLATES } from './plugins';

export const TEMPLATES: ProjectTemplate[] = [
  ...PLUGIN_TEMPLATES,
  fabricTemplate,
  neoforgeTemplate,
  forgeTemplate,
  quiltTemplate,
  architecturyTemplate,
];
