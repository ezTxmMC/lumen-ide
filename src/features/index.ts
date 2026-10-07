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
 * Features that register themselves after startup — commands, editor
 * extensions, registry entries. Each file exports `init()`.
 */

import { init as initSdk } from './project/sdk';
import { init as initDebug } from './debug';
import { init as initUserAddons } from './addons/userAddons';
import { init as initUpdater } from './updater';
import { init as initRecentProjects } from './project/recentProjects';
import { init as initLspInstall } from './project/lspInstall';
import { init as initToolInstall } from './project/toolInstall';
import { init as initExtensions, initInstalled as initInstalledExtensions } from './addons/extensions';
import { init as initAgents } from './agents';
import { init as initGradleTasks } from './project/gradleTasks';
import { init as initMerge } from './merge';
import { init as initMenubar } from './menu/menubar';
import { init as initNativeMenu } from './menu/nativeMenu';
import { init as initChecks } from './checks';
import { init as initSecurity } from './security';

let started = false;

export function initFeatures() {
  if (started) {
    return;
  }
  started = true;
  for (const [name, init] of [['sdk', initSdk], ['debug', initDebug], ['userAddons', initUserAddons], ['updater', initUpdater], ['recentProjects', initRecentProjects], ['lspInstall', initLspInstall], ['toolInstall', initToolInstall], ['extensions', initExtensions], ['agents', initAgents], ['gradleTasks', initGradleTasks], ['merge', initMerge], ['menubar', initMenubar], ['nativeMenu', initNativeMenu], ['checks', initChecks], ['security', initSecurity]] as const) {
    try {
      void init();
    } catch (err) {
      console.error(`[lumen] Feature "${name}" failed to start:`, err);
    }
  }
}

let projectsStarted = false;

/** The project screen's window has no editor or docks — only what its add-ons dialog and updater notices read. */
export function initProjectsFeatures() {
  if (projectsStarted) {
    return;
  }
  projectsStarted = true;
  for (const [name, init] of [['userAddons', initUserAddons], ['updater', initUpdater], ['extensions', initInstalledExtensions]] as const) {
    try {
      void init();
    } catch (err) {
      console.error(`[lumen] Feature "${name}" failed to start:`, err);
    }
  }
}
