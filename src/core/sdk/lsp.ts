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
 * Starting language servers with the active JDK: JAVA_HOME and PATH for the
 * Java and Kotlin servers, plus `java.configuration.runtimes` for jdtls, so
 * projects are built against the chosen JDK.
 */

import type { LspConfig } from '@/core/types';
import { activeSdk, sdkEnvironment } from './env';
import { jdtlsRuntimeName } from './java';
import type { InstalledSdk } from './types';

/** jdtls itself needs Java 21 or newer to run. */
const JDTLS_MIN_RUNTIME = 21;
const JVM_LANGUAGES = new Set(['java', 'kotlin', 'groovy', 'scala']);

interface Runtime {
  name: string;
  path: string;
  default?: boolean;
}

function runtimesFor(installed: InstalledSdk[], activeHome: string, activeMajor: number): Runtime[] {
  const runtimes: Runtime[] = [];
  const names = new Set<string>();
  if (activeMajor >= 8) {
    const name = jdtlsRuntimeName(activeMajor);
    runtimes.push({ name, path: activeHome, default: true });
    names.add(name);
  }
  const candidates = installed
    .filter((sdk) => !sdk.runtimeOnly && sdk.major >= 8)
    .sort((a, b) => b.version.localeCompare(a.version, 'en', { numeric: true }));
  for (const sdk of candidates) {
    const name = jdtlsRuntimeName(sdk.major);
    if (names.has(name)) {
      continue;
    }
    names.add(name);
    runtimes.push({ name, path: sdk.home });
  }
  return runtimes;
}

interface JavaSettings {
  configuration?: Record<string, unknown>;
  import?: { gradle?: Record<string, unknown> & { java?: Record<string, unknown>; }; } & Record<string, unknown>;
}

/**
 * The runtimes, and the JDK Gradle runs with during the import: without it
 * jdtls starts Gradle on its own Java, and a build that needs another one
 * (Minecraft mods on 21, older projects on 17) fails to import — every class
 * of a sibling module then “cannot be resolved”.
 */
function withRuntimes(settings: unknown, runtimes: Runtime[], gradleJavaHome: string): unknown {
  if (!settings || typeof settings !== 'object') {
    return settings;
  }
  const clone = JSON.parse(JSON.stringify(settings)) as { java?: JavaSettings; };
  if (!clone.java) {
    return settings;
  }
  clone.java.configuration = { ...(clone.java.configuration ?? {}), runtimes };
  const gradle = clone.java.import?.gradle ?? {};
  clone.java.import = { ...(clone.java.import ?? {}), gradle: { ...gradle, java: { ...(gradle.java ?? {}), home: gradleJavaHome } } };
  return clone;
}

/**
 * `java.import.exclusions` without the patterns that would swallow the project
 * itself: jdtls matches them against absolute paths, so `**\/run/**` hides every
 * module of a project that lives below a folder called `run` (measured: no
 * completion at all). `**\/<name>/**` goes when the root path has that segment.
 */
export function safeImportExclusions(settings: unknown, root: string): unknown {
  const java = (settings as { java?: { import?: { exclusions?: string[]; }; }; } | null)?.java;
  const exclusions = java?.import?.exclusions;
  if (!Array.isArray(exclusions)) {
    return settings;
  }
  const segments = new Set(root.split(/[\\/]/).filter(Boolean));
  const kept = exclusions.filter((pattern) => {
    const name = /^\*\*\/([^*/]+)\/\*\*$/.exec(pattern)?.[1];
    return !name || !segments.has(name);
  });
  if (kept.length === exclusions.length) {
    return settings;
  }
  const clone = JSON.parse(JSON.stringify(settings)) as { java: { import: { exclusions: string[]; }; }; };
  clone.java.import.exclusions = kept;
  return clone;
}

/**
 * `java.project.sourcePaths` for a project without a build file. Left alone,
 * jdtls guesses the source roots of such an "invisible project" from the
 * files it sees first — measured: `src/app/Main.java` (package `app`) became
 * the roots `src/app` and `src/other`, the package check failed, same-package
 * classes were offered with an import and postfix templates resolved to
 * garbage. Naming the root fixes all of it.
 */
export function withSourcePaths(settings: unknown, paths: string[]): unknown {
  if (!settings || typeof settings !== 'object' || !paths.length) {
    return settings;
  }
  const clone = JSON.parse(JSON.stringify(settings)) as { java?: { project?: Record<string, unknown>; }; };
  if (!clone.java) {
    return settings;
  }
  if (Array.isArray(clone.java.project?.sourcePaths)) {
    return settings;
  }
  clone.java.project = { ...(clone.java.project ?? {}), sourcePaths: paths };
  return clone;
}

/** A decorator for `lsp.addConfigDecorator`; `installed` supplies the detected JDKs. */
export function createJvmServerDecorator(installed: () => InstalledSdk[]) {
  return (given: LspConfig, languageId: string, root?: string): LspConfig => {
    if (!JVM_LANGUAGES.has(languageId)) {
      return given;
    }
    const isJdtls = /jdtls|jdt\.ls/i.test(`${given.command} ${given.label}`);
    const init0 = given.initializationOptions as { settings?: unknown; } | undefined;
    const config: LspConfig = !isJdtls ? given : {
      ...given,
      settings: safeImportExclusions(given.settings, root ?? ''),
      initializationOptions: init0 && typeof init0 === 'object' ? { ...init0, settings: safeImportExclusions(init0.settings, root ?? '') } : init0,
    };
    const java = activeSdk('java');
    if (!java) {
      return config;
    }

    const canRunServer = !isJdtls || java.major === 0 || java.major >= JDTLS_MIN_RUNTIME;
    const env = canRunServer ? { ...sdkEnvironment(), ...(config.env ?? {}) } : config.env;
    if (!isJdtls) {
      return { ...config, env };
    }

    const runtimes = runtimesFor(installed(), java.home, java.major);
    const init = config.initializationOptions as { settings?: unknown; } | undefined;
    const settingsFor = (settings: unknown) => withRuntimes(settings, runtimes, java.home);
    return {
      ...config,
      env,
      settings: settingsFor(config.settings),
      initializationOptions: init && typeof init === 'object'
        ? { ...init, settings: settingsFor(init.settings) }
        : init,
    };
  };
}

/** Add the init script to jdtls' Gradle import arguments, in the settings and the initialization options. */
function withGradleInitScript(settings: unknown, script: string): unknown {
  if (!settings || typeof settings !== 'object') {
    return settings;
  }
  const clone = JSON.parse(JSON.stringify(settings)) as { java?: JavaSettings; };
  if (!clone.java) {
    return settings;
  }
  const gradle = clone.java.import?.gradle ?? {};
  const current = Array.isArray(gradle.arguments) ? gradle.arguments as string[] : [];
  if (current.includes(script)) {
    return clone;
  }
  clone.java.import = { ...(clone.java.import ?? {}), gradle: { ...gradle, arguments: [...current, '--init-script', script] } };
  return clone;
}

/**
 * A decorator giving jdtls' Gradle import Lumen's init script
 * (`electron/features/jdtls-support.ts`): module dependencies Gradle's
 * Eclipse model drops — Architectury's `namedElements`, `compileOnly
 * project(':common')` next to ModDevGradle — become visible to the server.
 */
export function createGradleImportDecorator(script: () => string | null) {
  return (config: LspConfig, languageId: string): LspConfig => {
    const path = script();
    if (!path || languageId !== 'java' || !/jdtls|jdt\.ls/i.test(`${config.command} ${config.label}`)) {
      return config;
    }
    const init = config.initializationOptions as { settings?: unknown; } | undefined;
    return {
      ...config,
      settings: withGradleInitScript(config.settings, path),
      initializationOptions: init && typeof init === 'object'
        ? { ...init, settings: withGradleInitScript(init.settings, path) }
        : init,
    };
  };
}

/** The JDK majors jdtls' javac backend runs on (`lsp:jdtlsJavacBackend`). */
export interface JavacBackendRange {
  minJava: number;
  buildJava: number;
}

/**
 * The JVM options that switch jdtls to its javac backend
 * (`org.eclipse.jdt.core.javac`) — as the bundle's own `p2.inf` lists them.
 */
const JAVAC_BACKEND_OPTIONS = [
  ...['main', 'util', 'tree', 'api', 'file', 'parser', 'comp', 'code', 'processing', 'jvm', 'model', 'platform', 'resources']
    .map((pkg) => `--add-opens=jdk.compiler/com.sun.tools.javac.${pkg}=ALL-UNNAMED`),
  '--add-opens=jdk.javadoc/jdk.javadoc.internal.doclint=ALL-UNNAMED',
  '--add-opens=jdk.javadoc/jdk.javadoc.internal.doclets.formats.html.taglets.snippet=ALL-UNNAMED',
  '--add-opens=jdk.javadoc/jdk.javadoc.internal.doclets.formats.html.taglets=ALL-UNNAMED',
  '--add-opens=java.base/sun.nio.ch=ALL-UNNAMED',
  '--add-opens=jdk.zipfs/jdk.nio.zipfs=ALL-UNNAMED',
  '--add-opens=java.compiler/javax.tools=ALL-UNNAMED',
  '-DICompilationUnitResolver=org.eclipse.jdt.core.dom.JavacCompilationUnitResolver',
  '-DAbstractImageBuilder.compilerFactory=org.eclipse.jdt.internal.javac.JavacCompilerFactory',
  '-DCompilationUnit.DOM_BASED_OPERATIONS=true',
  '-DICompletionEngineProvider=org.eclipse.jdt.core.dom.DOMCompletionEngineProvider',
  '-DSourceIndexer.DOM_BASED_INDEXER=true',
  '-DMatchLocator.DOM_BASED_MATCH=true',
  '-DIJavaSearchDelegate=org.eclipse.jdt.internal.core.search.DOMJavaSearchDelegate',
  '-Xss16m',
];

/**
 * The JDK to run jdtls on for its javac backend. The backend reaches into
 * javac's internals and runs only on the JDKs its manifest names — a newer
 * one fails to compile anything (`NoSuchFieldError`). The active JDK when it
 * fits, otherwise the installed one closest to the JDK the backend was built
 * with; `null` when none fits — the server then keeps the Eclipse compiler.
 */
export function javacBackendRuntime(
  active: { home: string; major: number; } | null,
  installed: InstalledSdk[],
  range: JavacBackendRange,
): { home: string; switched: boolean; } | null {
  const fits = (major: number) => major >= range.minJava && major <= range.buildJava;
  if (active && fits(active.major)) {
    return { home: active.home, switched: false };
  }
  const best = installed
    .filter((sdk) => fits(sdk.major))
    .sort((a, b) => b.major - a.major || b.version.localeCompare(a.version, 'en', { numeric: true }))[0];
  if (!best) {
    return null;
  }
  return { home: best.home, switched: true };
}

/** The launcher arguments that start jdtls with its javac backend on the given JDK. */
export function javacBackendArgs(runtime: { home: string; switched: boolean; }, agent: string): string[] {
  const java = runtime.switched ? [`--java-executable=${runtime.home}/bin/java`] : [];
  const options = [`-javaagent:${agent}`, ...JAVAC_BACKEND_OPTIONS];
  return [...java, ...options.map((option) => `--jvm-arg=${option}`)];
}

/**
 * A decorator that lets jdtls check Java with javac instead of the Eclipse
 * compiler (ECJ). ECJ rejects code javac compiles — generic inference through
 * a captured wildcard (`registerBlockEntity(cap, type.get(), …)` with
 * `Supplier<? extends BlockEntityType<?>>`), for one — and then shows errors
 * the build does not have. Applies only where the installed jdtls ships the
 * backend (`backend`) and a JDK it runs on is there; the project is still
 * compiled against its own JDK through `java.configuration.runtimes`.
 */
export function createJavacBackendDecorator(options: {
  enabled: () => boolean;
  /** Settles once the installed JDKs are known — a project's server may start before. */
  ready: Promise<unknown>;
  installed: () => InstalledSdk[];
  backend: (command: string) => Promise<JavacBackendRange | null>;
  /** The repair agent for the backend's class cache (`electron/features/jdtls-agent.ts`). */
  agent: (command: string, javaHome: string) => Promise<string | null>;
}) {
  return async (config: LspConfig, languageId: string, _root: string, command: string): Promise<LspConfig> => {
    if (languageId !== 'java' || !options.enabled() || !/jdtls|jdt\.ls/i.test(`${config.command} ${config.label}`)) {
      return config;
    }
    const range = await options.backend(command).catch(() => null);
    if (!range) {
      return config;
    }
    await options.ready;
    const runtime = javacBackendRuntime(activeSdk('java'), options.installed(), range);
    if (!runtime) {
      return config;
    }
    // Unrepaired, the backend reports false “cannot access …” errors — then rather the Eclipse compiler.
    const agent = await options.agent(command, runtime.home).catch(() => null);
    if (!agent) {
      return config;
    }
    return { ...config, args: [...(config.args ?? []), ...javacBackendArgs(runtime, agent)] };
  };
}

/** The NetBeans Java server runs on Java 17 or newer. */
const NETBEANS_MIN_RUNTIME = 17;

/** Long-term-support releases: 17, 21, 25, 29 … */
const isLts = (major: number) => major === 17 || (major >= 21 && (major - 21) % 4 === 0);

/**
 * The JDK for the NetBeans Java server — it also runs the project's Gradle
 * import with it. The active one when it is new enough; otherwise the newest
 * installed LTS, since a fresh early-access JDK is usually newer than the
 * build's Gradle can run on (“Unsupported class file major version”); only
 * then any other.
 */
export function netBeansRuntime(active: { home: string; major: number; } | null, installed: InstalledSdk[]): string | null {
  if (active && active.major >= NETBEANS_MIN_RUNTIME) {
    return active.home;
  }
  const candidates = installed
    .filter((sdk) => sdk.major >= NETBEANS_MIN_RUNTIME && !sdk.runtimeOnly)
    .sort((a, b) => Number(isLts(b.major)) - Number(isLts(a.major)) || b.major - a.major);
  return candidates[0]?.home ?? null;
}

/**
 * A decorator giving the NetBeans Java server (`nbcode`) its JDK — a Minecraft
 * 1.16 project on Java 8 still gets a server. Without a known JDK the launcher
 * looks for one itself (JAVA_HOME, PATH).
 */
export function createNetBeansDecorator(options: { ready: Promise<unknown>; installed: () => InstalledSdk[]; }) {
  return async (config: LspConfig, languageId: string): Promise<LspConfig> => {
    if (languageId !== 'java' || config.command !== 'nbcode') {
      return config;
    }
    await options.ready;
    const home = netBeansRuntime(activeSdk('java'), options.installed());
    if (!home) {
      return config;
    }
    return { ...config, args: [...(config.args ?? []), '--jdkhome', home] };
  };
}
