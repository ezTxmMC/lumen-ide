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
 * How a language server can be installed on this machine.
 *
 * A server may offer several ways, tried in this order of preference:
 *
 *   managed   into Lumen's own environment under `~/.lumen/lsp` (`package`,
 *             or one read from a plain `npm i -g …`) — no root, no system change
 *   system    through the system's package manager (`systemPackages`), for the
 *             managers found on this machine; root where the manager needs it
 *   command   the add-on's install command for this platform
 *
 * Pure functions: `npm run check:lsp` tests them without Electron.
 */

import type { LspConfig, LspPackage } from '@/core/types';
import {
  PACKAGE_MANAGERS, commandNeedsRoot, formatInvocation, installInvocation, isPackageManager,
  type PackageManagerId,
} from '../../../electron/features/package-managers';
import { packageFromCommand, packageSource } from './manager';

/** What the main process reports about the machine (`privileged:system`). */
export interface SystemInfo {
  platform: string;
  distro?: { id: string; name: string; };
  managers: PackageManagerId[];
  isRoot: boolean;
  sudo: boolean;
  pkexec: boolean;
}

export type InstallPlan =
  | { kind: 'managed'; spec: LspPackage; summary: string; }
  | { kind: 'system'; manager: PackageManagerId; packages: string[]; root: boolean; summary: string; }
  | { kind: 'command'; command: string; root: boolean; summary: string; };

export interface PlanContext {
  /** `linux`, `darwin`, `win32`. */
  platform: string;
  /** `linux-x64`, `darwin-arm64` … */
  platformKey?: string;
  system: SystemInfo | null;
}

/** The install command on record for this platform. */
export function platformCommand(config: LspConfig, platform: string): string | null {
  const key = platform as 'linux' | 'darwin' | 'win32';
  return config.installCommands?.[key] ?? null;
}

/** The package for Lumen's own environment: given, or read from a plain install command. */
export function managedPackage(config: LspConfig, platform: string): LspPackage | null {
  if (config.package) {
    return config.package;
  }
  return packageFromCommand(platformCommand(config, platform) ?? config.install ?? '');
}

/** Whether a package has a download for this platform. */
export function packageFits(spec: LspPackage, platformKey: string | undefined): boolean {
  if (spec.type === 'github') {
    return Boolean(spec.assets[platformKey ?? '']);
  }
  if (spec.type === 'archive' && typeof spec.url !== 'string') {
    return Boolean(spec.url[platformKey ?? '']);
  }
  return true;
}

/** A package-manager plan, or null when the entry names nothing usable. */
function systemPlan(manager: PackageManagerId, names: string, isRoot: boolean): InstallPlan | null {
  const packages = names.trim().split(/\s+/).filter(Boolean);
  if (!packages.length) {
    return null;
  }
  try {
    const invocation = installInvocation(manager, packages);
    const root = invocation.root && !isRoot;
    return { kind: 'system', manager, packages, root, summary: formatInvocation(invocation, root) };
  } catch {
    return null;
  }
}

/** Every way to install the server here, the preferred one first. */
export function installPlans(config: LspConfig, ctx: PlanContext): InstallPlan[] {
  const plans: InstallPlan[] = [];
  const spec = managedPackage(config, ctx.platform);
  if (spec && packageFits(spec, ctx.platformKey)) {
    plans.push({ kind: 'managed', spec, summary: `~/.lumen/lsp ← ${packageSource(spec)}` });
  }

  for (const manager of ctx.system?.managers ?? []) {
    if (!isPackageManager(manager)) {
      continue;
    }
    const names = config.systemPackages?.[manager];
    if (!names) {
      continue;
    }
    const plan = systemPlan(manager, names, ctx.system?.isRoot ?? false);
    if (plan) {
      plans.push(plan);
    }
  }

  const command = platformCommand(config, ctx.platform);
  // A command that merely says what the managed package already does adds nothing.
  if (command && !(spec && !config.package && plans[0]?.kind === 'managed')) {
    const root = ctx.platform !== 'win32' && commandNeedsRoot(command) && !(ctx.system?.isRoot ?? false);
    plans.push({ kind: 'command', command, root, summary: command });
  }
  return plans;
}

/** The display name of a plan's package manager. */
export function managerLabel(manager: PackageManagerId): string {
  return PACKAGE_MANAGERS[manager]?.label ?? manager;
}

/** A stable key for a plan — to remember which one was chosen. */
export function planKey(plan: InstallPlan): string {
  if (plan.kind === 'managed') {
    return 'managed';
  }
  if (plan.kind === 'system') {
    return `system:${plan.manager}`;
  }
  return 'command';
}
