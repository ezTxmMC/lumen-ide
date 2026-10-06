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
 * Credentials committed to a project.
 *
 * These are not attacks — somebody made a mistake — so they never go above
 * `medium`. The patterns are the vendors' own token formats, specific enough
 * that ordinary text does not trip them, and each skips the placeholder values
 * the vendors print in their documentation.
 */

import { projectRule } from './define.js';

const PLACEHOLDER = /EXAMPLE|XXXX|your[-_]?(?:key|token)|<[^>]+>|\*{4}/i;
const real = (match) => !PLACEHOLDER.test(match[0]);

export const SECRET_RULES = [
  projectRule('SEC-SCR-001', 'medium', 'secret', 'AWS access key committed',
    'An AWS access key id in a project grants whoever reads it access to the account until it is revoked.',
    /\bAKIA[0-9A-Z]{16}\b/, undefined, { confirm: real }),
  projectRule('SEC-SCR-002', 'medium', 'secret', 'GitHub token committed',
    'A GitHub personal access or OAuth token in a project gives repository access to everyone who sees it.',
    /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b/, undefined, { confirm: real }),
  projectRule('SEC-SCR-003', 'medium', 'secret', 'Slack token committed',
    'A Slack token in a project lets anyone act as that bot or user.',
    /\bxox[baprs]-[A-Za-z0-9-]{10,}/, undefined, { confirm: real }),
  projectRule('SEC-SCR-004', 'medium', 'secret', 'Private key committed',
    'A private key block in a project should never be shared; anyone holding it can impersonate its owner.',
    /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/, undefined),
  projectRule('SEC-SCR-005', 'medium', 'secret', 'Anthropic API key committed',
    'An Anthropic API key in a project lets anyone spend the owner\'s quota.',
    /\bsk-ant-[A-Za-z0-9_-]{20,}/, undefined, { confirm: real }),
  projectRule('SEC-SCR-006', 'medium', 'secret', 'OpenAI API key committed',
    'An OpenAI project key in a project lets anyone spend the owner\'s quota.',
    /\bsk-proj-[A-Za-z0-9_-]{32,}/, undefined, { confirm: real }),
  projectRule('SEC-SCR-007', 'low', 'secret', 'Google API key committed',
    'A Google API key in a project can be used by others against the owner\'s quota unless it is restricted.',
    /\bAIza[0-9A-Za-z_-]{35}\b/, undefined, { confirm: real }),
  projectRule('SEC-SCR-008', 'medium', 'secret', 'Stripe live key committed',
    'A live Stripe secret key lets anyone move money in the owner\'s account.',
    /\b(?:sk|rk)_live_[0-9a-zA-Z]{24,}\b/, undefined, { confirm: real }),
  projectRule('SEC-SCR-009', 'low', 'secret', 'Discord webhook URL committed',
    'Anyone who sees a webhook URL can post to that channel.',
    /\bdiscord(?:app)?\.com\/api\/webhooks\/\d{15,}\/[\w-]{40,}/, undefined),
];
