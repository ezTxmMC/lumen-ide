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
 * The picture for the project folder and its `src` folder in a Minecraft
 * project: the logo of the platform it builds for — Paper, Leaf, Velocity,
 * NeoForge — and the grass block for every other Minecraft project (Spigot,
 * Fabric, Forge, Architectury …) and for one that builds for several at once.
 */

import { useStore } from '@/state/store';
import type { ProjectInfo } from '@/core/project/detect';
import grassBlock from '@/assets/minecraft/grass_block.svg?raw';
import leaf from '@/assets/minecraft/leafmc.svg?raw';
import neoforge from '@/assets/minecraft/neoforge.svg?raw';
import paper from '@/assets/minecraft/papermc.svg?raw';
import velocity from '@/assets/minecraft/velocity.svg?raw';

const asImage = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const GRASS = asImage(grassBlock);

/** By the platform a plugin kind reports (`Paper`, `Leaf`, `Spigot` …); anything without a logo of its own gets the grass block. */
const PLATFORMS: Record<string, string> = {
  paper: asImage(paper),
  leaf: asImage(leaf),
};

/** By project kind id. */
const KINDS: Record<string, string> = {
  'minecraft-velocity': asImage(velocity),
  'minecraft-neoforge': asImage(neoforge),
};

const PREFIX = 'minecraft-';

/** The image (a data URL) for a project, or `null` when it is no Minecraft project. */
export function minecraftIcon(project: ProjectInfo | null): string | null {
  const kinds = project?.kinds.filter((entry) => entry.kind.id.startsWith(PREFIX)) ?? [];
  if (kinds.length === 0) {
    return null;
  }
  // Several Minecraft platforms in one project: no single logo fits.
  if (kinds.length > 1) {
    return GRASS;
  }
  const [only] = kinds;
  if (only.kind.id === 'minecraft-bukkit') {
    // The first fact is the platform.
    const platform = Object.values(only.meta.facts ?? {})[0]?.toLowerCase() ?? '';
    return PLATFORMS[platform] ?? GRASS;
  }
  return KINDS[only.kind.id] ?? GRASS;
}

const normal = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '');

/** The picture for a folder of the open project — the project folder itself or its `src` — or `null`. */
export function useMinecraftFolderIcon(path: string): string | null {
  const project = useStore((s) => s.project);
  const extraProjects = useStore((s) => s.extraProjects);
  const moduleProjects = useStore((s) => s.moduleProjects);
  const here = normal(path);
  // Every project of a workspace and every module of them, not only the open project.
  const owner = [project, ...Object.values(extraProjects), ...Object.values(moduleProjects)].find((entry) => {
    if (!entry) {
      return false;
    }
    const root = normal(entry.root);
    return here === root || here === `${root}/src`;
  });
  return minecraftIcon(owner ?? null);
}
