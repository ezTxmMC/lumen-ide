/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/** The icons by file name: the basic files and the build tools. */

import type { IconDef } from '@/core/types';
import { same, configFiles, MUTED, P, B, TEST, KEY, ENV, SHELL, LINT, FORMAT, CI, DEPLOY } from './palette';

/* ------------------------------------------------------------------ *
 * File names: the basic files and the build tools
 * ------------------------------------------------------------------ */

export const FILE_NAMES: Record<string, IconDef> = {
  // JavaScript and TypeScript: package managers
  'package.json': { shape: 'npm', color: B.npm },
  'package-lock.json': { shape: 'lock', color: B.npm },
  ...same(['.npmrc', '.npmignore'], { shape: 'npm', color: P.slate }),
  ...same(['.nvmrc', '.node-version'], { shape: 'hexagon', color: B.node }),
  'pnpm-lock.yaml': { shape: 'lock', color: B.pnpm },
  ...same(['pnpm-workspace.yaml', '.pnpmfile.cjs'], { shape: 'boxes', color: B.pnpm }),
  'yarn.lock': { shape: 'lock', color: B.yarn },
  ...same(['.yarnrc', '.yarnrc.yml'], { shape: 'settings', color: B.yarn }),
  ...same(['bun.lock', 'bun.lockb'], { shape: 'lock', color: B.bun }),
  'bunfig.toml': { shape: 'bun', color: B.bun },
  ...same(['deno.json', 'deno.jsonc'], { shape: 'package', color: B.deno }),
  'deno.lock': { shape: 'lock', color: B.deno },
  ...same(['lerna.json', 'nx.json', 'turbo.json', 'rush.json'], { shape: 'boxes', color: P.indigo }),
  ...same(['.browserslistrc', 'browserslist'], { shape: 'globe', color: P.amber }),

  // JavaScript and TypeScript: compilers, bundlers, frameworks
  ...same(['tsconfig.json', 'tsconfig.base.json', 'tsconfig.app.json', 'tsconfig.node.json', 'tsconfig.build.json', 'tsconfig.spec.json', 'tsconfig.lib.json'], { shape: 'settings', color: B.typescript }),
  'jsconfig.json': { shape: 'settings', color: B.javascript },
  ...configFiles('vite.config', { shape: 'zap', color: B.vite }),
  ...configFiles('vitest.config', { shape: 'flask', color: '#729b1b' }),
  ...configFiles('vitest.workspace', { shape: 'flask', color: '#729b1b' }),
  ...configFiles('webpack.config', { shape: 'boxes', color: '#8dd6f9' }),
  ...configFiles('rollup.config', { shape: 'layers', color: '#ef3335' }),
  ...configFiles('rolldown.config', { shape: 'layers', color: P.orange }),
  ...configFiles('esbuild.config', { shape: 'zap', color: '#ffcf00' }),
  ...configFiles('tsup.config', { shape: 'package', color: P.amber }),
  ...configFiles('electron-builder', { shape: 'atom', color: '#9feaf9' }, ['json', 'yml', 'yaml', 'js', 'ts']),
  ...configFiles('next.config', { shape: 'triangle', color: MUTED }),
  ...configFiles('nuxt.config', { shape: 'mountain', color: '#00dc82' }),
  ...configFiles('astro.config', { shape: 'rocket', color: B.astro }),
  ...configFiles('svelte.config', { shape: 'svelte', color: B.svelte }),
  ...configFiles('remix.config', { shape: 'route', color: P.sky }),
  ...configFiles('gatsby-config', { shape: 'rocket', color: '#663399' }),
  ...configFiles('quasar.config', { shape: 'vue', color: '#1976d2' }),
  ...configFiles('angular', { shape: 'angular', color: B.angular }, ['json']),
  ...configFiles('tailwind.config', { shape: 'tailwind', color: B.tailwind }),
  ...configFiles('postcss.config', { shape: 'hash', color: '#dd3a0a' }),
  ...same(['.postcssrc', '.postcssrc.json'], { shape: 'hash', color: '#dd3a0a' }),
  ...configFiles('babel.config', { shape: 'settings', color: '#f9dc3e' }),
  ...same(['.babelrc', '.babelrc.json', '.swcrc'], { shape: 'settings', color: '#f9dc3e' }),
  ...configFiles('capacitor.config', { shape: 'smartphone', color: '#119eff' }),
  'app.json': { shape: 'smartphone', color: P.indigo },
  'manifest.json': { shape: 'app-window', color: P.sky },
  ...same(['.env.d.ts', 'vite-env.d.ts', 'env.d.ts', 'global.d.ts', 'globals.d.ts'], { glyph: 'TS', color: '#7aa7e0' }),

  // JavaScript and TypeScript: quality
  ...configFiles('eslint.config', LINT),
  ...same(['.eslintrc', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.yml', '.eslintrc.yaml', '.eslintignore'], LINT),
  ...configFiles('prettier.config', FORMAT),
  ...same(['.prettierrc', '.prettierrc.json', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.yaml', '.prettierrc.yml', '.prettierrc.toml', '.prettierignore'], FORMAT),
  ...same(['biome.json', 'biome.jsonc'], { shape: 'shield-check', color: '#60a5fa' }),
  ...same(['oxlintrc.json', '.oxlintrc.json'], { shape: 'shield-check', color: P.cyan }),
  ...configFiles('stylelint.config', { shape: 'shield-check', color: P.pink }),
  ...same(['.stylelintrc', '.stylelintrc.json'], { shape: 'shield-check', color: P.pink }),
  ...configFiles('commitlint.config', { shape: 'git-commit', color: P.green }),
  ...same(['.commitlintrc', '.commitlintrc.json', '.czrc'], { shape: 'git-commit', color: P.green }),
  ...same(['.lintstagedrc', '.lintstagedrc.json', 'lint-staged.config.js', 'lint-staged.config.mjs'], { shape: 'list-checks', color: P.lime }),
  ...same(['.huskyrc', '.huskyrc.json'], { shape: 'dog', color: P.brown }),
  ...same(['.editorconfig'], { shape: 'settings', color: MUTED }),

  // JavaScript and TypeScript: testing
  ...configFiles('jest.config', { shape: 'test-tube', color: '#c21325' }),
  ...configFiles('playwright.config', { shape: 'drama', color: '#2ead33' }),
  ...configFiles('cypress.config', { shape: 'test-tubes', color: P.teal }),
  ...configFiles('karma.conf', { shape: 'test-tube', color: '#56c5a8' }),
  ...same(['.mocharc', '.mocharc.json', '.mocharc.yml', '.mocharc.js', '.nycrc', '.nycrc.json', '.c8rc', '.c8rc.json'], { shape: 'test-tube', color: '#a0725a' }),
  ...configFiles('storybook.config', { shape: 'book-open', color: '#ff4785' }),

  // The JVM: Maven, Gradle, Ant, sbt
  'pom.xml': { shape: 'feather', color: B.maven },
  ...same(['mvnw', 'mvnw.cmd'], { shape: 'shell', color: B.maven }),
  ...same(['maven-wrapper.properties', 'settings.xml', 'extensions.xml', 'maven.config', 'jvm.config'], { shape: 'settings', color: B.maven }),
  ...same(['build.gradle', 'build.gradle.kts'], { shape: 'hammer', color: B.gradle }),
  ...same(['settings.gradle', 'settings.gradle.kts'], { shape: 'list-tree', color: B.gradle }),
  ...same(['gradle.properties', 'gradle-wrapper.properties', 'init.gradle', 'init.gradle.kts'], { shape: 'settings', color: B.gradle }),
  ...same(['gradlew', 'gradlew.bat'], { shape: 'shell', color: B.gradle }),
  'gradle-wrapper.jar': { shape: 'package', color: B.gradle },
  'libs.versions.toml': { shape: 'tags', color: B.gradle },
  ...same(['build.xml', 'ivy.xml'], { shape: 'hammer', color: B.java }),
  ...same(['build.sbt'], { shape: 'hammer', color: '#dc322f' }),
  ...same(['lombok.config'], { shape: 'settings', color: '#bc2b2b' }),
  ...same(['application.properties', 'application.yml', 'application.yaml', 'bootstrap.yml', 'bootstrap.properties'], { shape: 'leaf', color: '#6db33f' }),
  ...same(['log4j2.xml', 'log4j.properties', 'logback.xml', 'logback-spring.xml'], { shape: 'scroll', color: P.orange }),
  ...same(['module-info.java'], { shape: 'package', color: B.java }),
  ...same(['package-info.java'], { shape: 'file-text', color: B.java }),

  // C and C++
  'cmakelists.txt': { shape: 'cmake', color: B.cmake },
  ...same(['cmakepresets.json', 'cmakeuserpresets.json', 'cmakecache.txt'], { shape: 'settings', color: B.cmake }),
  ...same(['makefile', 'gnumakefile', 'makefile.am', 'makefile.in', 'bsdmakefile'], { shape: 'hammer', color: P.orange }),
  ...same(['configure', 'configure.ac', 'configure.in', 'autogen.sh'], { shape: 'shell', color: P.orange }),
  'meson.build': { shape: 'hammer', color: '#6ea1d8' },
  ...same(['meson_options.txt', 'meson.options'], { shape: 'settings', color: '#6ea1d8' }),
  'xmake.lua': { shape: 'hammer', color: '#22a079' },
  'premake5.lua': { shape: 'hammer', color: '#8be9fd' },
  ...same(['sconstruct', 'sconscript'], { shape: 'hammer', color: '#c0322b' }),
  ...same(['conanfile.txt', 'conanfile.py'], { shape: 'package', color: '#6699cb' }),
  'conan.lock': { shape: 'lock', color: '#6699cb' },
  'vcpkg.json': { shape: 'package', color: '#7c5cff' },
  'vcpkg-configuration.json': { shape: 'settings', color: '#7c5cff' },
  'build.ninja': { shape: 'zap', color: P.gray },
  'compile_commands.json': { shape: 'list-tree', color: '#6a7bd1' },
  'compile_flags.txt': { shape: 'settings', color: '#6a7bd1' },
  ...same(['.clangd', '.clang-tidy'], { shape: 'shield-check', color: '#6a7bd1' }),
  '.clang-format': { shape: 'sparkles', color: '#6a7bd1' },
  ...same(['.ccls', '.ycm_extra_conf.py'], { shape: 'settings', color: '#6a7bd1' }),
  ...same(['module.bazel', 'module.bazel.lock', 'build.bazel', 'build', 'workspace', 'workspace.bazel', '.bazelrc', '.bazelversion', '.bazelignore'], { shape: 'hexagon', color: '#43a047' }),
  ...same(['doxyfile'], { shape: 'book-text', color: '#2c4aa8' }),

  // Rust, Go, Zig
  'cargo.toml': { shape: 'package', color: B.rust },
  'cargo.lock': { shape: 'lock', color: B.rust },
  ...same(['rust-toolchain', 'rust-toolchain.toml', 'rustfmt.toml', '.rustfmt.toml', 'clippy.toml', '.clippy.toml', 'deny.toml'], { shape: 'settings', color: B.rust }),
  'build.rs': { shape: 'hammer', color: B.rust },
  ...same(['go.mod', 'go.work'], { shape: 'package', color: B.go }),
  ...same(['go.sum', 'go.work.sum'], { shape: 'lock', color: B.go }),
  ...same(['.golangci.yml', '.golangci.yaml', '.goreleaser.yml', '.goreleaser.yaml'], { shape: 'shield-check', color: B.go }),
  ...same(['build.zig', 'build.zig.zon'], { shape: 'hammer', color: '#f7a41d' }),

  // Python
  'pyproject.toml': { shape: 'python', color: B.python },
  ...same(['requirements.txt', 'requirements-dev.txt', 'requirements-test.txt', 'dev-requirements.txt', 'constraints.txt', 'requirements.in'], { shape: 'list', color: B.python }),
  ...same(['setup.py', 'manage.py', 'noxfile.py', 'fabfile.py', 'tasks.py', 'dodo.py'], { shape: 'hammer', color: B.python }),
  ...same(['setup.cfg', 'tox.ini', '.python-version', 'ruff.toml', '.ruff.toml', '.flake8', 'mypy.ini', '.mypy.ini', 'pytest.ini', '.pylintrc', 'pylintrc', '.coveragerc', '.isort.cfg', 'pyrightconfig.json'], { shape: 'settings', color: B.python }),
  ...same(['pipfile'], { shape: 'package', color: B.python }),
  ...same(['pipfile.lock', 'poetry.lock', 'pdm.lock', 'pylock.toml'], { shape: 'lock', color: B.python }),
  'uv.lock': { shape: 'lock', color: '#de5fe9' },
  ...same(['environment.yml', 'environment.yaml', 'conda.yml', 'conda.yaml', 'meta.yaml'], { shape: 'package', color: '#44a833' }),
  '__init__.py': { shape: 'python', color: P.slate },
  ...same(['conftest.py'], TEST),
  '__main__.py': { shape: 'python', color: P.amber },

  // PHP, Ruby, .NET, Crystal, Elixir, Dart, Haskell
  'composer.json': { shape: 'package', color: '#c68e5a' },
  'composer.lock': { shape: 'lock', color: '#c68e5a' },
  ...same(['phpunit.xml', 'phpunit.xml.dist', 'phpstan.neon', 'phpstan.neon.dist', 'psalm.xml', '.php-cs-fixer.php', '.php-cs-fixer.dist.php'], { shape: 'shield-check', color: B.php }),
  'artisan': { shape: 'shell', color: '#ff2d20' },
  ...same(['gemfile', 'gems.rb'], { shape: 'ruby', color: B.ruby }),
  ...same(['gemfile.lock', 'gems.locked'], { shape: 'lock', color: B.ruby }),
  ...same(['rakefile', 'guardfile', 'capfile', 'podfile', 'fastfile', 'appfile', 'brewfile'], { shape: 'hammer', color: B.ruby }),
  ...same(['.rubocop.yml', '.rspec', '.ruby-version'], { shape: 'settings', color: B.ruby }),
  ...same(['global.json', 'nuget.config', 'directory.build.props', 'directory.build.targets', 'directory.packages.props', 'dotnet-tools.json', 'launchsettings.json', 'appsettings.json', 'appsettings.development.json'], { shape: 'settings', color: B.dotnet }),
  'packages.lock.json': { shape: 'lock', color: B.dotnet },
  'shard.yml': { shape: 'package', color: '#c8c8c8' },
  'shard.lock': { shape: 'lock', color: '#c8c8c8' },
  'mix.exs': { shape: 'droplet', color: '#a97bd6' },
  'mix.lock': { shape: 'lock', color: '#a97bd6' },
  ...same(['pubspec.yaml', 'pubspec.yml'], { shape: 'package', color: '#0175c2' }),
  'pubspec.lock': { shape: 'lock', color: '#0175c2' },
  ...same(['stack.yaml', 'cabal.project'], { shape: 'package', color: '#8f4e8b' }),
  'project.nv': { shape: 'lumen', color: '#7c5cff' },
  ...same(['package.swift'], { shape: 'package', color: '#f05138' }),
  ...same(['description', 'namespace', '.rprofile'], { shape: 'settings', color: '#276dc3' }),

  // Containers, infrastructure and deployment
  ...same(['dockerfile', 'containerfile'], { shape: 'docker', color: B.docker }),
  ...same(['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml', 'docker-compose.override.yml', 'compose.override.yml'], { shape: 'ship', color: B.docker }),
  ...same(['.dockerignore', '.containerignore'], { shape: 'docker', color: P.slate }),
  ...same(['devcontainer.json', '.devcontainer.json'], { shape: 'container', color: B.docker }),
  ...same(['chart.yaml', 'values.yaml', 'helmfile.yaml', 'kustomization.yaml', 'skaffold.yaml', 'tiltfile'], { shape: 'ship-wheel', color: '#326ce5' }),
  ...same(['vagrantfile'], { shape: 'box', color: '#1868f2' }),
  ...same(['ansible.cfg', 'playbook.yml', 'site.yml'], { shape: 'settings', color: '#ee0000' }),
  ...same(['.terraform.lock.hcl'], { shape: 'lock', color: '#7b42bc' }),
  ...same(['vercel.json', '.vercelignore'], { shape: 'triangle', color: MUTED }),
  ...same(['netlify.toml', '_redirects', '_headers'], { shape: 'cloud', color: '#32e6e2' }),
  ...same(['fly.toml', 'render.yaml', 'railway.json', 'railway.toml', 'app.yaml', 'serverless.yml', 'serverless.yaml', 'sst.config.ts', 'amplify.yml'], DEPLOY),
  ...same(['wrangler.toml', 'wrangler.json', 'wrangler.jsonc'], { shape: 'cloud', color: '#f38020' }),
  ...same(['firebase.json', '.firebaserc', 'firestore.rules', 'storage.rules'], { shape: 'flame', color: '#ffca28' }),
  ...same(['supabase.toml'], { shape: 'zap', color: '#3ecf8e' }),
  ...same(['nginx.conf', '.htaccess', 'httpd.conf', 'caddyfile', 'apache2.conf'], { shape: 'server', color: '#009639' }),
  ...same(['procfile', 'procfile.dev'], { shape: 'server', color: P.violet }),
  ...same(['nixpacks.toml', 'flake.nix', 'flake.lock', 'default.nix', 'shell.nix'], { shape: 'snowflake', color: '#7ebae4' }),
  ...same(['justfile', '.justfile', 'taskfile.yml', 'taskfile.yaml', 'magefile.go'], { shape: 'list-checks', color: P.amber }),
  ...same(['.tool-versions', '.mise.toml', 'mise.toml', '.sdkmanrc', '.envrc'], { shape: 'sliders', color: P.teal }),

  // Git
  ...same(['.gitignore', '.gitattributes', '.gitkeep', '.keep', '.git-blame-ignore-revs', '.mailmap'], { shape: 'git', color: B.git }),
  ...same(['.gitmodules'], { shape: 'git-merge', color: B.git }),
  ...same(['.gitconfig', '.gitmessage'], { shape: 'settings', color: B.git }),
  ...same(['.pre-commit-config.yaml', '.pre-commit-hooks.yaml', 'lefthook.yml', 'lefthook.yaml'], { shape: 'git-commit', color: P.amber }),

  // CI, bots, hosting
  '.gitlab-ci.yml': { shape: 'gitlab', color: B.gitlab },
  ...same(['jenkinsfile'], { shape: 'workflow', color: '#d33833' }),
  ...same(['azure-pipelines.yml', 'azure-pipelines.yaml'], { shape: 'workflow', color: '#0078d4' }),
  ...same(['.travis.yml'], { shape: 'workflow', color: '#cd4a4e' }),
  ...same(['bitbucket-pipelines.yml'], { shape: 'workflow', color: '#2684ff' }),
  ...same(['.drone.yml', 'appveyor.yml', '.appveyor.yml', 'buildkite.yml', 'codemagic.yaml', 'cloudbuild.yaml', 'cloudbuild.yml'], CI),
  ...same(['codeowners', 'funding.yml', 'pull_request_template.md', 'issue_template.md'], { shape: 'github', color: B.github }),
  ...same(['dependabot.yml', 'renovate.json', 'renovate.json5', '.renovaterc', '.renovaterc.json'], { shape: 'bot', color: P.sky }),
  ...same(['.codecov.yml', 'codecov.yml', 'sonar-project.properties', '.snyk'], { shape: 'gauge', color: P.rose }),

  // The environment
  ...same(['.env', '.env.local', '.env.development', '.env.development.local', '.env.production', '.env.production.local', '.env.test', '.env.test.local', '.env.staging', '.env.example', '.env.sample', '.env.template', '.env.defaults', '.env.vault'], ENV),
  ...same(['.flaskenv'], ENV),

  // Editors and tools
  ...same(['.vscodeignore', 'settings.json', 'launch.json', 'tasks.json', 'extensions.json', 'keybindings.json'], { shape: 'settings', color: '#23a9f2' }),
  ...same(['.lumen-workspace.json'], { shape: 'lumen', color: P.indigo }),
  ...same(['.ignore', '.rgignore', '.fdignore', '.gcloudignore', '.slugignore'], { shape: 'eye', color: P.slate }),
  ...same(['.htpasswd', 'known_hosts', 'authorized_keys', 'id_rsa', 'id_ed25519', 'id_ecdsa'], KEY),
  ...same(['id_rsa.pub', 'id_ed25519.pub', 'id_ecdsa.pub'], KEY),
  ...same(['.bashrc', '.bash_profile', '.bash_logout', '.zshrc', '.zprofile', '.zshenv', '.profile', '.inputrc', 'config.fish'], SHELL),
  ...same(['.tmux.conf', '.wezterm.lua', 'kitty.conf', 'alacritty.toml', 'alacritty.yml'], { shape: 'square-terminal', color: P.lime }),
  ...same(['.vimrc', '.gvimrc', 'init.vim', 'init.lua'], { glyph: 'V', color: '#019733' }),

  // Documentation, law and community
  ...same(['readme', 'readme.md', 'readme.txt', 'readme.rst', 'readme.adoc', 'readme.org'], { shape: 'book-open', color: B.markdown }),
  ...same(['changelog', 'changelog.md', 'changelog.txt', 'changes', 'changes.md', 'history.md', 'news.md', 'releases.md', 'release-notes.md'], { shape: 'history', color: P.green }),
  ...same(['license', 'license.md', 'license.txt', 'licence', 'licence.md', 'licence.txt', 'copying', 'copying.lesser', 'unlicense', 'notice', 'notice.md', 'third-party-notices.md'], { shape: 'scale', color: P.yellow }),
  ...same(['contributing.md', 'contributing', 'code_of_conduct.md', 'governance.md', 'support.md', 'maintainers.md'], { shape: 'users', color: P.sky }),
  ...same(['authors', 'authors.md', 'contributors', 'contributors.md', 'credits.md', 'acknowledgements.md'], { shape: 'users', color: P.violet }),
  ...same(['security.md', 'security.txt'], { shape: 'shield-check', color: P.red }),
  ...same(['todo', 'todo.md', 'todo.txt', 'roadmap.md'], { shape: 'list-todo', color: P.amber }),
  ...same(['claude.md', 'agents.md', 'gemini.md', '.cursorrules', '.windsurfrules', 'copilot-instructions.md', 'llms.txt'], { shape: 'bot', color: '#d97757' }),
  'robots.txt': { shape: 'bot', color: P.gray },
  ...same(['sitemap.xml', 'humans.txt'], { shape: 'globe', color: P.gray }),
  ...same(['favicon.ico', 'favicon.svg', 'apple-touch-icon.png'], { shape: 'star', color: P.amber }),
  ...same(['mkdocs.yml', 'mkdocs.yaml', 'docusaurus.config.js', 'docusaurus.config.ts', '_config.yml', 'book.toml', 'conf.py', '.readthedocs.yml', '.readthedocs.yaml'], { shape: 'book-text', color: P.sky }),
  ...same(['citation.cff'], { shape: 'quote', color: P.sky }),

  // Minecraft
  ...same(['fabric.mod.json', 'mods.toml', 'neoforge.mods.toml', 'quilt.mod.json', 'pack.mcmeta', 'architectury.common.json'], { shape: 'pickaxe', color: '#dbd0b4' }),
  ...same(['plugin.yml', 'paper-plugin.yml', 'bungee.yml', 'velocity-plugin.json', 'config.yml'], { shape: 'puzzle', color: '#f0b429' }),
  ...same(['server.properties', 'eula.txt', 'ops.json', 'whitelist.json', 'bukkit.yml', 'spigot.yml', 'paper.yml'], { shape: 'server', color: '#8bc34a' }),

  // Lumen itself
  'lumen-extension.json': { shape: 'lumen', color: P.indigo },
};
