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
 * “New module…” in the Explorer's context menu: a folder with its build file
 * below the parent build (Maven or Gradle), listed in the parent — as
 * `<module>` in the parent pom, or `include` in Gradle's settings.
 */

import { useStore } from '@/state/store';
import { t } from '@/i18n';
import {
  MODULE_NAME, addGradleInclude, addMavenModule, mavenCoordinates, mavenModulePom,
} from '@/core/project/new-module';

const fs = () => window.lumen.fs;

type Build = { kind: 'maven' | 'gradle'; dir: string; };

/** The nearest folder from `dir` upwards (up to the project root) that has a Maven or Gradle build. */
async function findBuild(dir: string): Promise<Build | null> {
  const root = useStore.getState().project?.root ?? useStore.getState().workspace ?? dir;
  let current = dir.replace(/[\\/]+$/, '');
  for (let depth = 0; depth < 12; depth++) {
    if (await fs().exists(`${current}/pom.xml`)) {
      return { kind: 'maven', dir: current };
    }
    for (const file of ['settings.gradle.kts', 'settings.gradle', 'build.gradle.kts', 'build.gradle']) {
      if (await fs().exists(`${current}/${file}`)) {
        return { kind: 'gradle', dir: current };
      }
    }
    if (current === root.replace(/[\\/]+$/, '') || !current.includes('/')) {
      break;
    }
    current = current.slice(0, current.lastIndexOf('/'));
  }
  return null;
}

async function createMaven(build: Build, name: string, packaging: 'jar' | 'pom') {
  const parentFile = `${build.dir}/pom.xml`;
  const parent = await fs().readFile(parentFile);
  const folder = `${build.dir}/${name}`;
  await fs().create(folder, true);
  await fs().create(`${folder}/pom.xml`, false);
  await fs().writeFile(`${folder}/pom.xml`, mavenModulePom(mavenCoordinates(parent), name, packaging));
  if (packaging === 'jar') {
    await fs().create(`${folder}/src/main/java`, true);
    await fs().create(`${folder}/src/test/java`, true);
  }
  await fs().writeFile(parentFile, addMavenModule(parent, name));
  return `${folder}/pom.xml`;
}

async function createGradle(build: Build, name: string) {
  const kotlin = await fs().exists(`${build.dir}/settings.gradle.kts`) || (!(await fs().exists(`${build.dir}/settings.gradle`)) && await fs().exists(`${build.dir}/build.gradle.kts`));
  const settingsFile = `${build.dir}/settings.gradle${kotlin ? '.kts' : ''}`;
  const settings = await fs().exists(settingsFile) ? await fs().readFile(settingsFile) : '';
  const folder = `${build.dir}/${name}`;
  const buildFile = `${folder}/build.gradle${kotlin ? '.kts' : ''}`;
  await fs().create(folder, true);
  await fs().create(buildFile, false);
  await fs().writeFile(buildFile, kotlin ? 'plugins {\n    java\n}\n' : "plugins {\n    id 'java'\n}\n");
  await fs().create(`${folder}/src/main/java`, true);
  if (!(await fs().exists(settingsFile))) {
    await fs().create(settingsFile, false);
  }
  await fs().writeFile(settingsFile, addGradleInclude(settings, name, kotlin));
  return buildFile;
}

/** Ask for a name (and, for Maven, the packaging), then create the module below the build that `dir` belongs to. */
export async function openNewModule(dir: string) {
  const state = useStore.getState();
  const build = await findBuild(dir);
  if (!build) {
    state.notify(t('explorer.moduleNoBuild'), 'warning');
    return;
  }
  state.openForm({
    title: t('explorer.moduleNew'),
    description: t('explorer.moduleWhere', { path: build.dir }),
    submitLabel: t('explorer.jvmCreate'),
    fields: [
      { id: 'name', label: t('explorer.moduleName'), required: true, placeholder: 'my-module' },
      ...(build.kind === 'maven' ? [{
        id: 'packaging',
        label: t('explorer.modulePackaging'),
        type: 'select' as const,
        default: 'jar',
        choices: [
          { value: 'jar', label: 'jar', hint: t('explorer.modulePackagingJar') },
          { value: 'pom', label: 'pom', hint: t('explorer.modulePackagingPom') },
        ],
      }] : []),
    ],
    onSubmit: async (values) => {
      const name = String(values.name ?? '').trim();
      if (!MODULE_NAME.test(name)) {
        return t('explorer.moduleInvalid');
      }
      if (await fs().exists(`${build.dir}/${name}`)) {
        return t('explorer.moduleExists', { name });
      }
      try {
        const file = build.kind === 'maven'
          ? await createMaven(build, name, values.packaging === 'pom' ? 'pom' : 'jar')
          : await createGradle(build, name);
        useStore.getState().notify(t('explorer.moduleCreated', { name }), 'success');
        void useStore.getState().refreshProject();
        void useStore.getState().openFile(file).catch(() => {});
      } catch (err) {
        return (err as Error).message.replace(/^Error: /, '');
      }
    },
  });
}
