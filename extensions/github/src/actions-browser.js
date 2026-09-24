/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

import path from 'node:path';

export function browserActions({ api, t, notify, context, requireRepo, openUrl }) {
  /* ---------------------------------------------------------------- *
   * Browser
   * ---------------------------------------------------------------- */

  function repoUrl() {
    const repo = context()?.repo;
    if (!repo) {
      return null;
    }
    return `${api.hosts().web}/${repo.owner}/${repo.name}`;
  }

  function openRepo() {
    if (!requireRepo()) {
      return;
    }
    openUrl(repoUrl());
  }

  function openFile(file) {
    const ctxInfo = context();
    if (!requireRepo()) {
      return;
    }
    if (!file) {
      notify(t('error.noFile'), 'warning');
      return;
    }
    const relative = path.relative(ctxInfo.root, file);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      notify(t('error.noFile'), 'warning');
      return;
    }
    const ref = ctxInfo.hasUpstream && ctxInfo.branch ? ctxInfo.branch : ctxInfo.sha;
    const repo = ctxInfo.fork ?? ctxInfo.repo;
    const route = relative.split(path.sep).map(encodeURIComponent).join('/');
    openUrl(`${api.hosts().web}/${repo.owner}/${repo.name}/blob/${encodeURIComponent(ref ?? 'HEAD')}/${route}`);
  }

  return { repoUrl, openRepo, openFile };
}
