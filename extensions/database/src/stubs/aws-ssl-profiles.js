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
 * Stands in for `aws-ssl-profiles`, the Amazon RDS certificate bundle mysql2
 * loads for its deprecated `ssl: 'Amazon RDS'` profile. The extension passes
 * TLS options itself (and a CA file where needed); the bundle would only add
 * weight.
 */
export const ca = [];
export default { ca };
