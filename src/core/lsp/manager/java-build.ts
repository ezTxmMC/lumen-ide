/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */
import { globToRegExp } from './glob';

/**
 * What changes a Java classpath but that jdtls does not always register a
 * watcher for: Gradle properties, the version catalog, settings and build
 * scripts (also of `buildSrc`), poms and jars.
 */
export const JAVA_BUILD_WATCH_GLOBS = [
  '**/gradle.properties', '**/*.versions.toml', '**/settings.gradle', '**/settings.gradle.kts',
  '**/build.gradle', '**/build.gradle.kts', '**/buildSrc/**', '**/pom.xml', '**/*.jar',
];

const JAVA_BUILD_WATCH = JAVA_BUILD_WATCH_GLOBS.map(globToRegExp);

/** Build outputs and caches: their jars and scripts are not the project's inputs. */
const JAVA_BUILD_NOISE = /(^|\/)(build|\.gradle|node_modules|target|out|run|\.git)\//;

/** Does a change to this file alter the classpath of a Java project? */
export function isJavaBuildFile(path: string, root = ''): boolean {
  const normal = path.replace(/\\/g, '/');
  const base = root.replace(/\\/g, '/').replace(/\/$/, '');
  const inside = base && normal.startsWith(`${base}/`) ? normal.slice(base.length) : `/${normal}`;
  if (JAVA_BUILD_NOISE.test(inside)) {
    return false;
  }
  return JAVA_BUILD_WATCH.some((re) => re.test(path));
}
