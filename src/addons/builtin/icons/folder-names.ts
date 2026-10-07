/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The icons of folders with a role. */

import type { IconDef } from '@/core/types';
import { same, MUTED, P, B } from './palette';

/* ------------------------------------------------------------------ *
 * Folders
 * ------------------------------------------------------------------ */

export const FOLDER_NAMES: Record<string, IconDef> = {
  // Sources
  ...same(['src', 'source', 'sources', 'app', 'main', 'code', 'pkg', 'internal', 'cmd'], { shape: 'folder-src', color: P.indigo }),
  ...same(['lib', 'libs', 'library', 'libraries', 'shared', 'common', 'core'], { shape: 'folder-library', color: P.teal }),
  ...same(['include', 'includes', 'inc', 'headers'], { shape: 'folder-types', color: '#8fb4e0' }),
  ...same(['java'], { shape: 'folder-java', color: B.java }),
  ...same(['kotlin'], { shape: 'folder-src', color: B.kotlin }),
  ...same(['python', 'py'], { shape: 'folder-src', color: B.python }),
  ...same(['typescript', 'ts'], { shape: 'folder-src', color: B.typescript }),
  ...same(['javascript', 'js'], { shape: 'folder-src', color: B.javascript }),

  // Tests
  ...same(['test', 'tests', 'testing', '__tests__', 'unit', 'integration', 'it'], { shape: 'folder-test', color: P.green }),
  ...same(['spec', 'specs', 'e2e', 'cypress', 'playwright'], { shape: 'folder-test', color: P.teal }),
  ...same(['__mocks__', 'mocks', 'mock', '__fixtures__', 'fixtures', 'fixture', 'stubs', 'testdata', 'test-data', '__snapshots__', 'snapshots'], { shape: 'folder-mock', color: P.rose }),
  ...same(['bench', 'benches', 'benchmark', 'benchmarks', 'perf'], { shape: 'folder-temp', color: P.orange }),
  ...same(['coverage', '.nyc_output', 'htmlcov'], { shape: 'folder-check', color: P.rose }),

  // Documentation and examples
  ...same(['docs', 'doc', 'documentation', 'manual', 'guide', 'guides', 'wiki', 'site'], { shape: 'folder-docs', color: P.sky }),
  ...same(['examples', 'example', 'samples', 'sample', 'demo', 'demos', 'playground', 'sandbox', 'showcase'], { shape: 'folder-examples', color: P.amber }),
  ...same(['content', 'posts', 'blog', 'articles', 'pages'], { shape: 'folder-content', color: P.sky }),
  ...same(['.storybook', 'stories', 'storybook'], { shape: 'folder-docs', color: '#ff4785' }),

  // Assets
  ...same(['assets', 'asset', 'resources', 'res', 'static', 'data', 'raw'], { shape: 'folder-image', color: P.amber }),
  ...same(['images', 'image', 'img', 'imgs', 'pictures', 'photos', 'screenshots', 'icons', 'icon', 'sprites', 'textures', 'drawable', 'mipmap'], { shape: 'folder-image', color: P.violet }),
  ...same(['public', 'www', 'wwwroot', 'webroot', 'htdocs', 'html'], { shape: 'folder-public', color: P.teal }),
  ...same(['fonts', 'font', 'typefaces'], { shape: 'folder-font', color: P.red }),
  ...same(['media', 'audio', 'sounds', 'sound', 'music', 'video', 'videos', 'movies'], { shape: 'folder-media', color: P.pink }),
  ...same(['models3d', 'meshes', 'mesh'], { shape: 'folder-package', color: P.teal }),

  // Web application structure
  ...same(['components', 'component', 'widgets', 'widget', 'ui', 'elements', 'atoms', 'molecules', 'organisms'], { shape: 'folder-component', color: B.react }),
  ...same(['hooks', 'hook', 'composables', 'directives'], { shape: 'folder-plugin', color: P.pink }),
  ...same(['utils', 'util', 'utilities', 'helpers', 'helper', 'tools', 'toolkit'], { shape: 'folder-util', color: P.teal }),
  ...same(['api', 'apis', 'endpoints', 'rest', 'graphql', 'rpc', 'controllers', 'controller', 'handlers', 'resolvers'], { shape: 'folder-api', color: P.violet }),
  ...same(['routes', 'route', 'router', 'routing', 'navigation'], { shape: 'folder-route', color: P.orange }),
  ...same(['views', 'view', 'screens', 'screen', 'layouts', 'layout', 'templates', 'template', 'partials'], { shape: 'folder-view', color: P.indigo }),
  ...same(['styles', 'style', 'css', 'scss', 'sass', 'less', 'stylesheets', 'themes', 'theme'], { shape: 'folder-style', color: B.css }),
  ...same(['models', 'model', 'entities', 'entity', 'schemas', 'schema', 'domain', 'dto', 'dtos'], { shape: 'folder-model', color: P.purple }),
  ...same(['services', 'service', 'providers', 'provider', 'repositories', 'repository', 'repos', 'usecases'], { shape: 'folder-service', color: P.yellow }),
  ...same(['store', 'stores', 'state', 'redux', 'reducers', 'slices', 'atoms-state'], { shape: 'folder-model', color: P.violet }),
  ...same(['types', 'typings', '@types', 'interfaces', 'contracts'], { shape: 'folder-types', color: B.typescript }),
  ...same(['middleware', 'middlewares', 'interceptors', 'guards', 'pipes', 'filters'], { shape: 'folder-plugin', color: P.slate }),
  ...same(['plugins', 'plugin', 'addons', 'addon', 'extensions', 'extension', 'modules', 'mods'], { shape: 'folder-plugin', color: '#f0b429' }),
  ...same(['features', 'feature', 'packages-src'], { shape: 'folder-src', color: P.cyan }),
  ...same(['events', 'event', 'listeners', 'jobs', 'queues', 'workers', 'tasks', 'cron'], { shape: 'folder-temp', color: P.lime }),
  ...same(['mail', 'mails', 'emails', 'email', 'notifications'], { shape: 'folder-content', color: P.rose }),
  ...same(['auth', 'security', 'secure', 'secrets', 'certs', 'certificates', 'keys', 'ssl', '.ssh', '.gnupg', 'credentials'], { shape: 'folder-secure', color: P.red }),

  // Languages and data
  ...same(['i18n', 'l10n', 'locales', 'locale', 'lang', 'langs', 'languages', 'translations', 'messages', 'intl'], { shape: 'folder-i18n', color: P.cyan }),
  ...same(['db', 'database', 'databases', 'sql', 'data-access', 'dao', 'seeds', 'seeders', 'prisma', 'drizzle'], { shape: 'folder-database', color: P.amber }),
  ...same(['migrations', 'migration', 'migrate'], { shape: 'folder-database', color: P.orange }),
  ...same(['server', 'backend', 'back-end', 'functions', 'lambda', 'lambdas', 'edge'], { shape: 'folder-api', color: P.violet }),
  ...same(['client', 'frontend', 'front-end', 'web', 'webapp'], { shape: 'folder-public', color: P.sky }),

  // Configuration and scripts
  ...same(['config', 'configs', 'configuration', 'conf', '.config', 'settings', 'env', 'environments', 'environment'], { shape: 'folder-cog', color: P.pink }),
  ...same(['scripts', 'script', 'bin', 'sbin', 'tasks-sh', 'shell', 'hack'], { shape: 'folder-script', color: P.lime }),
  ...same(['.husky', 'githooks', '.githooks'], { shape: 'folder-script', color: P.brown }),
  ...same(['.vscode', '.vscode-test'], { shape: 'folder-editor', color: '#23a9f2' }),
  ...same(['.idea', '.fleet', '.zed', '.helix', '.nvim', '.vim', '.emacs.d'], { shape: 'folder-editor', color: P.violet }),
  '.lumen': { shape: 'folder-cog', color: P.indigo },
  ...same(['.claude', '.cursor', '.codex', '.gemini', '.windsurf', '.continue', '.aider'], { shape: 'folder-cog', color: '#d97757' }),
  ...same(['.devcontainer'], { shape: 'folder-docker', color: B.docker }),

  // Build output and caches
  ...same(['build', 'builds', 'dist', 'out', 'output', 'target', 'release', 'releases', 'artifacts', 'publish', 'bundle', '.output', 'lib-dist', 'esm', 'cjs', 'umd'], { shape: 'folder-dist', color: P.gray }),
  ...same(['obj', 'debug', 'x64', 'x86', 'arm64', 'cmake-build-debug', 'cmake-build-release', 'builddir'], { shape: 'folder-dist', color: P.slate }),
  ...same(['.next', '.nuxt', '.svelte-kit', '.astro', '.angular', '.vercel', '.netlify', '.turbo', '.parcel-cache', '.expo', '.docusaurus'], { shape: 'folder-dist', color: P.slate }),
  ...same(['tmp', 'temp', '.tmp', '.temp', 'cache', '.cache', '.pytest_cache', '.mypy_cache', '.ruff_cache', '__pycache__', '.sass-cache', '.eslintcache'], { shape: 'folder-temp', color: P.slate }),
  ...same(['logs', 'log'], { shape: 'folder-clock', color: P.slate }),
  ...same(['backup', 'backups', 'archive', 'archives', 'old', 'legacy', 'deprecated'], { shape: 'folder-archive', color: P.brown }),

  // Dependencies
  'node_modules': { shape: 'folder-package', color: '#8b5a5a' },
  ...same(['vendor', 'third_party', 'third-party', 'thirdparty', 'external', 'externals', 'deps', 'dependencies', 'packages', 'bower_components', 'jspm_packages', 'subprojects', 'vcpkg_installed', '.pnpm-store', '.yarn'], { shape: 'folder-package', color: P.brown }),
  ...same(['.venv', 'venv', '.env-py', 'virtualenv', '.virtualenv', 'site-packages', '.tox', '.nox'], { shape: 'folder-package', color: B.python }),
  ...same(['gradle', '.gradle', 'buildsrc', 'build-logic'], { shape: 'folder-cog', color: B.gradle }),
  ...same(['.mvn', 'maven'], { shape: 'folder-cog', color: B.maven }),
  ...same(['.cargo'], { shape: 'folder-cog', color: B.rust }),
  ...same(['.dart_tool', '.pub-cache'], { shape: 'folder-package', color: '#0175c2' }),

  // Version control and CI
  '.git': { shape: 'folder-git', color: B.git },
  ...same(['.github'], { shape: 'folder-github', color: MUTED }),
  ...same(['workflows', '.circleci', '.buildkite', '.azure-pipelines', 'ci', '.ci', 'pipelines'], { shape: 'folder-ci', color: P.orange }),
  ...same(['.gitlab'], { shape: 'folder-ci', color: B.gitlab }),
  ...same(['.changeset', '.changesets'], { shape: 'folder-docs', color: P.green }),

  // Infrastructure and platforms
  ...same(['.docker', 'docker', 'containers', 'container'], { shape: 'folder-docker', color: B.docker }),
  ...same(['k8s', 'kubernetes', 'helm', 'charts', 'manifests', 'deploy', 'deployment', 'deployments', 'infra', 'infrastructure', 'terraform', 'ansible', '.terraform', 'cloud', 'aws', 'azure', 'gcp'], { shape: 'folder-cloud', color: '#326ce5' }),
  ...same(['android', 'app-android'], { shape: 'folder-android', color: '#3ddc84' }),
  ...same(['ios', 'macos', 'osx', 'darwin', 'app-ios'], { shape: 'folder-apple', color: P.gray }),
  ...same(['mobile', 'native', 'expo', 'flutter'], { shape: 'folder-mobile', color: P.sky }),
  ...same(['desktop', 'electron', 'tauri', 'src-tauri', 'windows', 'linux'], { shape: 'folder-view', color: P.cyan }),
  ...same(['game', 'games', 'levels', 'scenes', 'prefabs'], { shape: 'folder-game', color: P.purple }),

  // Minecraft
  ...same(['mixin', 'mixins'], { shape: 'folder-plugin', color: '#dbd0b4' }),
  ...same(['datagen', 'generated'], { shape: 'folder-dist', color: '#8bc34a' }),
};
