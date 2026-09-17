/**
 * The bundled icon packs.
 *
 * “Lumen” (the default): languages as coloured abbreviations, the basic files
 * and the build tools as shapes — package managers, lockfiles, build scripts,
 * Git, Docker, CI, documentation, media, folders with a role.
 * “Lumen Classic”: the abbreviations and colours of the language add-ons alone,
 * folders as tinted arrows.
 */

import type { Addon, IconDef, IconPack } from '@/core/types'

/** Several keys sharing one icon. */
function same(keys: string[], def: IconDef): Record<string, IconDef> {
  return Object.fromEntries(keys.map((key) => [key, def]))
}

const MUTED = 'var(--c-text-muted)'
const SUBTLE = 'var(--c-text-subtle)'

/* ------------------------------------------------------------------ *
 * Languages
 * ------------------------------------------------------------------ */

const LANGUAGES: Record<string, IconDef> = {
  java: { shape: 'coffee', color: '#e76f00' },
  kotlin: { glyph: 'Kt', color: '#a97bff' },
  groovy: { glyph: 'Gy', color: '#4298b8' },
  python: { glyph: 'Py', color: '#4b8bbe' },
  javascript: { glyph: 'JS', color: '#f7df1e' },
  typescript: { glyph: 'TS', color: '#3178c6' },
  'react-tsx': { shape: 'atom', color: '#61dafb' },
  'react-jsx': { shape: 'atom', color: '#61dafb' },
  vue: { glyph: 'V', color: '#42b883' },
  astro: { glyph: 'As', color: '#ff5d01' },
  'angular-html': { glyph: 'A', color: '#dd0031' },
  'angular-ts': { glyph: 'A', color: '#dd0031' },
  html: { glyph: '<>', color: '#e34c26' },
  css: { glyph: '#', color: '#2965f1' },
  tailwind: { glyph: '~', color: '#38bdf8' },
  c: { glyph: 'C', color: '#5c6bc0' },
  cpp: { glyph: '++', color: '#00599c' },
  csharp: { glyph: 'C#', color: '#9b4f96' },
  go: { glyph: 'Go', color: '#00add8' },
  rust: { shape: 'cog', color: '#dea584' },
  php: { glyph: 'Ph', color: '#777bb4' },
  crystal: { shape: 'gem', color: '#c8c8c8' },
  novus: { glyph: 'Nv', color: '#7c5cff' },
  shell: { shape: 'terminal', color: '#89e051' },
  sql: { shape: 'database', color: '#e38c00' },
  json: { shape: 'braces', color: '#f5c518' },
  yaml: { glyph: 'YM', color: '#cb171e' },
  toml: { glyph: 'TM', color: '#9c4221' },
  xml: { glyph: '</>', color: '#e37933' },
  markdown: { glyph: 'M↓', color: '#519aba' },
  mdx: { glyph: 'M+', color: '#fcb32c' },
  properties: { shape: 'settings', color: '#99a3ad' },
  dockerfile: { shape: 'container', color: '#2496ed' },
  cmake: { shape: 'hammer', color: '#3e8ed0' },
  makefile: { shape: 'hammer', color: '#e37933' },
}

/* ------------------------------------------------------------------ *
 * Extensions (without a language add-on too)
 * ------------------------------------------------------------------ */

const TEST = { shape: 'flask', color: '#4ade80' }
const IMAGE = { shape: 'image', color: '#a78bfa' }
const AUDIO = { shape: 'music', color: '#f472b6' }
const VIDEO = { shape: 'video', color: '#f472b6' }
const ARCHIVE = { shape: 'archive', color: '#d4a054' }
const LOCK = { shape: 'lock', color: '#9aa3b0' }
const SHEET = { shape: 'sheet', color: '#22c55e' }
const BINARY = { shape: 'binary', color: '#9aa3b0' }
const CONFIG = { shape: 'settings', color: '#99a3ad' }
const KEY = { shape: 'key', color: '#fbbf24' }

const EXTENSIONS: Record<string, IconDef> = {
  'd.ts': { glyph: 'TS', color: '#7aa7e0' },
  'd.mts': { glyph: 'TS', color: '#7aa7e0' },
  ...same(['test.ts', 'spec.ts', 'test.tsx', 'spec.tsx', 'test.js', 'spec.js', 'test.jsx', 'spec.jsx', 'test.mjs', 'spec.mjs'], TEST),
  'min.js': { glyph: 'JS', color: '#b0a33a' },
  'min.css': { glyph: '#', color: '#5b7fd1' },
  ...same(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'tiff'], IMAGE),
  svg: { shape: 'image', color: '#ffb13b' },
  ...same(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'], AUDIO),
  ...same(['mp4', 'webm', 'mov', 'mkv', 'avi'], VIDEO),
  ...same(['zip', 'tar', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'zst'], ARCHIVE),
  ...same(['jar', 'war', 'ear'], { shape: 'package', color: '#e76f00' }),
  lock: LOCK,
  pdf: { shape: 'file-text', color: '#f87171' },
  txt: { shape: 'file-text', color: MUTED },
  log: { shape: 'receipt', color: '#9aa3b0' },
  ...same(['csv', 'tsv', 'xlsx', 'xls', 'ods'], SHEET),
  ...same(['db', 'sqlite', 'sqlite3'], { shape: 'database', color: '#e38c00' }),
  ...same(['pem', 'key', 'crt', 'cer', 'p12', 'pfx', 'pub', 'gpg', 'asc'], KEY),
  ...same(['sh', 'bash', 'zsh', 'fish'], { shape: 'terminal', color: '#89e051' }),
  ps1: { shape: 'terminal', color: '#5391fe' },
  ...same(['bat', 'cmd'], { shape: 'terminal', color: '#c1f12e' }),
  ...same(['exe', 'dll', 'so', 'dylib', 'o', 'a', 'lib', 'class', 'pyc'], BINARY),
  wasm: { shape: 'binary', color: '#654ff0' },
  ...same(['proto'], { shape: 'workflow', color: '#4285f4' }),
  ...same(['graphql', 'gql'], { shape: 'webhook', color: '#e535ab' }),
  ...same(['ini', 'cfg', 'conf', 'config'], CONFIG),
  ...same(['csproj', 'fsproj', 'vbproj', 'sln', 'slnx'], { shape: 'package', color: '#9b4f96' }),
  ...same(['props', 'targets'], { shape: 'settings', color: '#9b4f96' }),
  ...same(['scss', 'sass'], { glyph: 'S', color: '#cd6799' }),
  less: { glyph: 'L', color: '#3d6ba8' },
  lua: { glyph: 'Lu', color: '#51a0cf' },
  rb: { glyph: 'Rb', color: '#cc342d' },
  swift: { glyph: 'Sw', color: '#f05138' },
  dart: { glyph: 'Dt', color: '#0175c2' },
  ...same(['scala', 'sc'], { glyph: 'Sc', color: '#dc322f' }),
  zig: { glyph: 'Zg', color: '#f7a41d' },
  hs: { glyph: 'Hs', color: '#8f4e8b' },
  ...same(['ex', 'exs'], { glyph: 'Ex', color: '#a97bd6' }),
  r: { glyph: 'R', color: '#276dc3' },
  jl: { glyph: 'Jl', color: '#9558b2' },
  nix: { glyph: 'Nx', color: '#7ebae4' },
  ...same(['tf', 'tfvars', 'hcl'], { glyph: 'TF', color: '#7b42bc' }),
  ...same(['glsl', 'vert', 'frag', 'wgsl', 'hlsl'], { shape: 'triangle', color: '#5586a4' }),
  ...same(['ttf', 'otf', 'woff', 'woff2'], { shape: 'type', color: '#f87171' }),
  mcfunction: { shape: 'pickaxe', color: '#8bc34a' },
  mcmeta: { shape: 'pickaxe', color: '#8bc34a' },
}

/* ------------------------------------------------------------------ *
 * File names: the basic files and the build tools
 * ------------------------------------------------------------------ */

const NPM = '#cb3837'
const GRADLE = '#4fb4c8'
const MAVEN = '#c71a36'
const PYTHON = '#4b8bbe'
const DOCKER = '#2496ed'
const GIT = '#f05032'

const FILE_NAMES: Record<string, IconDef> = {
  // JavaScript and TypeScript
  'package.json': { shape: 'package', color: NPM },
  'package-lock.json': { shape: 'lock', color: NPM },
  '.npmrc': { shape: 'settings', color: NPM },
  '.nvmrc': { shape: 'settings', color: '#3c873a' },
  'pnpm-lock.yaml': { shape: 'lock', color: '#f69220' },
  'pnpm-workspace.yaml': { shape: 'boxes', color: '#f69220' },
  'yarn.lock': { shape: 'lock', color: '#2c8ebb' },
  '.yarnrc.yml': { shape: 'settings', color: '#2c8ebb' },
  'bun.lock': { shape: 'lock', color: '#d9a86c' },
  'bun.lockb': { shape: 'lock', color: '#d9a86c' },
  'bunfig.toml': { shape: 'settings', color: '#d9a86c' },
  ...same(['deno.json', 'deno.jsonc'], { shape: 'package', color: '#70ffaf' }),
  'deno.lock': { shape: 'lock', color: '#70ffaf' },
  'tsconfig.json': { shape: 'settings', color: '#3178c6' },
  'jsconfig.json': { shape: 'settings', color: '#f7df1e' },
  ...same(['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'vitest.config.ts'], { shape: 'zap', color: '#bd34fe' }),
  ...same(['webpack.config.js', 'webpack.config.ts'], { shape: 'boxes', color: '#8dd6f9' }),
  ...same(['rollup.config.js', 'rollup.config.mjs', 'rollup.config.ts'], { shape: 'layers', color: '#ef3335' }),
  ...same(['eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts', '.eslintrc', '.eslintrc.json', '.eslintrc.js', '.eslintrc.cjs'], { shape: 'shield-check', color: '#8080f2' }),
  ...same(['.prettierrc', '.prettierrc.json', 'prettier.config.js', 'prettier.config.mjs'], { shape: 'sparkles', color: '#f7b93e' }),
  ...same(['biome.json', 'biome.jsonc'], { shape: 'shield-check', color: '#60a5fa' }),
  ...same(['tailwind.config.js', 'tailwind.config.ts', 'tailwind.config.cjs'], { glyph: '~', color: '#38bdf8' }),
  ...same(['babel.config.js', 'babel.config.json', '.babelrc'], { shape: 'settings', color: '#f9dc3e' }),
  ...same(['next.config.js', 'next.config.mjs', 'next.config.ts'], { glyph: 'N', color: MUTED }),
  ...same(['nuxt.config.ts', 'nuxt.config.js'], { glyph: 'Nx', color: '#00dc82' }),
  ...same(['astro.config.mjs', 'astro.config.ts'], { glyph: 'As', color: '#ff5d01' }),
  'angular.json': { glyph: 'A', color: '#dd0031' },

  // The JVM: Maven, Gradle, Ant
  'pom.xml': { shape: 'package', color: MAVEN },
  ...same(['mvnw', 'mvnw.cmd'], { shape: 'terminal', color: MAVEN }),
  'maven-wrapper.properties': { shape: 'settings', color: MAVEN },
  ...same(['build.gradle', 'build.gradle.kts'], { shape: 'hammer', color: GRADLE }),
  ...same(['settings.gradle', 'settings.gradle.kts', 'gradle.properties', 'gradle-wrapper.properties'], { shape: 'settings', color: GRADLE }),
  ...same(['gradlew', 'gradlew.bat'], { shape: 'terminal', color: GRADLE }),
  'libs.versions.toml': { shape: 'list-tree', color: GRADLE },
  'build.xml': { shape: 'hammer', color: '#e76f00' },

  // C and C++
  'cmakelists.txt': { shape: 'hammer', color: '#3e8ed0' },
  ...same(['cmakepresets.json', 'cmakeuserpresets.json'], { shape: 'settings', color: '#3e8ed0' }),
  ...same(['makefile', 'gnumakefile'], { shape: 'hammer', color: '#e37933' }),
  'meson.build': { shape: 'hammer', color: '#6ea1d8' },
  ...same(['meson_options.txt', 'meson.options'], { shape: 'settings', color: '#6ea1d8' }),
  'xmake.lua': { shape: 'hammer', color: '#22a079' },
  ...same(['conanfile.txt', 'conanfile.py'], { shape: 'package', color: '#6699cb' }),
  'vcpkg.json': { shape: 'package', color: '#7c5cff' },
  'vcpkg-configuration.json': { shape: 'settings', color: '#7c5cff' },
  'build.ninja': { shape: 'zap', color: '#9ca3af' },
  'compile_commands.json': { shape: 'list-tree', color: '#5c6bc0' },
  'compile_flags.txt': { shape: 'settings', color: '#5c6bc0' },
  ...same(['.clangd', '.clang-tidy'], { shape: 'shield-check', color: '#5c6bc0' }),
  '.clang-format': { shape: 'sparkles', color: '#5c6bc0' },
  ...same(['module.bazel', 'build.bazel', 'workspace', 'workspace.bazel', '.bazelrc', '.bazelversion'], { shape: 'hexagon', color: '#43a047' }),

  // Rust, Go
  'cargo.toml': { shape: 'package', color: '#dea584' },
  'cargo.lock': { shape: 'lock', color: '#dea584' },
  ...same(['rust-toolchain', 'rust-toolchain.toml', 'rustfmt.toml', 'clippy.toml'], { shape: 'settings', color: '#dea584' }),
  ...same(['go.mod', 'go.work'], { shape: 'package', color: '#00add8' }),
  ...same(['go.sum', 'go.work.sum'], { shape: 'lock', color: '#00add8' }),

  // Python
  'pyproject.toml': { shape: 'package', color: PYTHON },
  ...same(['requirements.txt', 'requirements-dev.txt', 'constraints.txt'], { shape: 'list-tree', color: PYTHON }),
  'setup.py': { shape: 'hammer', color: PYTHON },
  ...same(['setup.cfg', 'tox.ini', '.python-version', 'ruff.toml', '.flake8', 'mypy.ini'], { shape: 'settings', color: PYTHON }),
  'pipfile': { shape: 'package', color: PYTHON },
  ...same(['pipfile.lock', 'poetry.lock', 'pdm.lock'], { shape: 'lock', color: PYTHON }),
  'uv.lock': { shape: 'lock', color: '#de5fe9' },
  ...same(['environment.yml', 'environment.yaml'], { shape: 'package', color: '#44a833' }),

  // PHP, Ruby, .NET, Crystal
  'composer.json': { shape: 'package', color: '#c68e5a' },
  'composer.lock': { shape: 'lock', color: '#c68e5a' },
  'gemfile': { shape: 'gem', color: '#cc342d' },
  'gemfile.lock': { shape: 'lock', color: '#cc342d' },
  'rakefile': { shape: 'hammer', color: '#cc342d' },
  ...same(['global.json', 'nuget.config', 'directory.build.props', 'directory.packages.props'], { shape: 'settings', color: '#8c6cf0' }),
  'shard.yml': { shape: 'package', color: '#c8c8c8' },
  'shard.lock': { shape: 'lock', color: '#c8c8c8' },

  // Containers and deployment
  ...same(['dockerfile', 'containerfile'], { shape: 'container', color: DOCKER }),
  ...same(['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'], { shape: 'ship', color: DOCKER }),
  '.dockerignore': { shape: 'container', color: '#6b7280' },
  ...same(['vercel.json', 'netlify.toml', 'fly.toml', 'wrangler.toml'], { shape: 'cloud', color: '#9ca3af' }),
  ...same(['nginx.conf', '.htaccess'], { shape: 'server', color: '#009639' }),
  'procfile': { shape: 'server', color: '#a78bfa' },

  // Git and CI
  ...same(['.gitignore', '.gitattributes', '.gitkeep'], { shape: 'git-branch', color: GIT }),
  '.gitmodules': { shape: 'git-merge', color: GIT },
  '.gitlab-ci.yml': { shape: 'workflow', color: '#fc6d26' },
  'jenkinsfile': { shape: 'workflow', color: '#d33833' },
  'azure-pipelines.yml': { shape: 'workflow', color: '#0078d4' },
  '.travis.yml': { shape: 'workflow', color: '#cd4a4e' },
  'codeowners': { shape: 'github', color: MUTED },

  // The environment and the editor
  ...same(['.env', '.env.local', '.env.development', '.env.production', '.env.test', '.env.example', '.env.sample'], KEY),
  '.editorconfig': { shape: 'settings', color: MUTED },

  // Documentation and law
  ...same(['readme', 'readme.md', 'readme.txt', 'readme.rst'], { shape: 'book-open', color: '#519aba' }),
  ...same(['changelog', 'changelog.md', 'changes.md', 'history.md'], { shape: 'receipt', color: '#4ade80' }),
  ...same(['license', 'license.md', 'license.txt', 'licence', 'copying', 'notice'], { shape: 'scale', color: '#d4b106' }),
  ...same(['contributing.md', 'code_of_conduct.md', 'authors', 'authors.md'], { shape: 'book-marked', color: '#519aba' }),
  'security.md': { shape: 'shield-check', color: '#f87171' },
  'robots.txt': { shape: 'globe', color: '#9ca3af' },

  // Minecraft
  ...same(['fabric.mod.json', 'mods.toml', 'neoforge.mods.toml', 'quilt.mod.json'], { shape: 'pickaxe', color: '#dbd0b4' }),
  ...same(['plugin.yml', 'paper-plugin.yml', 'bungee.yml', 'velocity-plugin.json'], { shape: 'puzzle', color: '#f0b429' }),
}

/* ------------------------------------------------------------------ *
 * Folders
 * ------------------------------------------------------------------ */

const FOLDER_NAMES: Record<string, IconDef> = {
  ...same(['src', 'source', 'lib', 'app', 'main', 'include'], { shape: 'folder-code', color: '#7c8cff' }),
  ...same(['test', 'tests', 'spec', 'specs', '__tests__', 'e2e'], { shape: 'flask', color: '#4ade80' }),
  ...same(['docs', 'doc', 'documentation'], { shape: 'book-open', color: '#38bdf8' }),
  ...same(['assets', 'public', 'static', 'images', 'img', 'icons', 'media', 'resources'], { shape: 'image', color: '#fbbf24' }),
  ...same(['config', '.config', 'settings', '.vscode', '.idea', '.lumen', '.zed'], { shape: 'folder-cog', color: '#f472b6' }),
  ...same(['scripts', 'bin', 'tools'], { shape: 'terminal', color: '#f472b6' }),
  ...same(['build', 'dist', 'out', 'target', 'obj', 'release', '.next', '.nuxt', '.output'], { shape: 'archive', color: '#9aa3b0' }),
  '.git': { shape: 'folder-git', color: GIT },
  '.github': { shape: 'github', color: MUTED },
  '.gitlab': { shape: 'workflow', color: '#fc6d26' },
  'node_modules': { shape: 'package', color: '#8b5a5a' },
  ...same(['vendor', 'third_party', 'external', 'deps', 'packages'], { shape: 'boxes', color: '#b48ead' }),
  ...same(['gradle', '.gradle'], { shape: 'hammer', color: GRADLE }),
  '.mvn': { shape: 'hammer', color: MAVEN },
  ...same(['components', 'widgets', 'ui'], { shape: 'component', color: '#61dafb' }),
  ...same(['styles', 'css', 'scss', 'themes'], { shape: 'palette', color: '#2965f1' }),
  ...same(['i18n', 'locales', 'locale', 'lang', 'translations'], { shape: 'languages', color: '#38bdf8' }),
  ...same(['db', 'database', 'migrations', 'sql'], { shape: 'database', color: '#e38c00' }),
  ...same(['api', 'server', 'backend'], { shape: 'server', color: '#a78bfa' }),
  ...same(['hooks', 'plugins', 'addons', 'extensions'], { shape: 'puzzle', color: '#f0b429' }),
  ...same(['.docker', 'docker'], { shape: 'container', color: DOCKER }),
  ...same(['.venv', 'venv', 'env'], { shape: 'box', color: PYTHON }),
}

export const lumenIconPack: IconPack = {
  id: 'lumen-icons',
  name: 'Lumen',
  author: 'Lumen',
  description: 'Kürzel für Sprachen, Formen für Grunddateien, Build-Werkzeuge und Ordner mit Rolle.',
  languages: LANGUAGES,
  extensions: EXTENSIONS,
  fileNames: FILE_NAMES,
  folderNames: FOLDER_NAMES,
  file: { shape: 'file', color: SUBTLE },
  folder: { shape: 'folder', color: MUTED },
}

export const classicIconPack: IconPack = {
  id: 'lumen-classic',
  name: 'Lumen Classic',
  author: 'Lumen',
  description: 'Nur Kürzel und Farben der Sprach-Add-ons, Ordner als getönte Pfeile.',
  folderNames: {
    ...same(['src', 'lib', 'app'], { color: '#7c8cff' }),
    ...same(['test', 'tests', 'spec'], { color: '#4ade80' }),
    ...same(['docs', 'doc'], { color: '#38bdf8' }),
    ...same(['assets', 'public', 'static', 'images'], { color: '#fbbf24' }),
    ...same(['config', 'scripts'], { color: '#f472b6' }),
  },
}

export const DEFAULT_ICON_PACK_ID = lumenIconPack.id

export const iconsAddon: Addon = {
  id: 'icons.lumen',
  name: 'Lumen Icons',
  version: '1.0.0',
  description: 'Icon-Pakete „Lumen“ und „Lumen Classic“ für Explorer, Tabs und Suchlisten.',
  icon: '◈',
  builtin: true,
  category: 'theme',
  iconPacks: [lumenIconPack, classicIconPack],
}
