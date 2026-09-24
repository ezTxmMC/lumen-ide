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
 * Tests the project templates, the project detection and the package managers
 * without Electron.
 *
 * - Every template is created with its defaults and with each choice on its
 *   own; the files must be valid (JSON that parses, no “undefined”) and be
 *   detected as the project kind expected.
 * - “Add a dependency” is run for every package manager.
 * - Along with that the configuration, glob patterns, text edits and URI helpers.
 *
 *   npm run check:project
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const lumen = {
  fs: {
    readFile: (p: string) => fs.readFile(p, 'utf8'),
    writeFile: async (p: string, c: string) => { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, c); return true; },
    create: async (p: string, dir: boolean) => {
      if (dir) {
        await fs.mkdir(p, { recursive: true });
        return true;
      }
      await fs.writeFile(p, '', { flag: 'wx' });
      return true;
    },
    exists: (p: string) => fs.access(p).then(() => true, () => false),
    list: async (p: string) => {
      try {
        return (await fs.readdir(p, { withFileTypes: true })).map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
      } catch {
        return [];
      }
    },
  },
  // Lumen's own per-project folder — as in the main process, outside the project.
  projectData: {
    dir: async (root: string) => {
      const dir = path.join(os.tmpdir(), 'lumen-check-projects', path.basename(root));
      await fs.mkdir(dir, { recursive: true });
      return dir;
    },
  },
}
;(globalThis as unknown as { window: unknown; }).window = { lumen };

/* A minimal DOM for XML (pom.xml, .csproj). */
class El {
  children: El[] = [];
  private text = '';
  constructor(readonly localName: string, private readonly attrs: Record<string, string>) {}
  get textContent(): string {
    return this.text + this.children.map((c) => c.textContent).join('');
  }
  appendText(t: string) { this.text += t; }
  getAttribute(name: string) { return this.attrs[name] ?? null; }
  getElementsByTagName(name: string): El[] {
    return this.children.flatMap((c) => [...(c.localName === name ? [c] : []), ...c.getElementsByTagName(name)]);
  }
}
(globalThis as unknown as { DOMParser: unknown; }).DOMParser = class {
  parseFromString(text: string) {
    const stack: El[] = [new El('#root', {})];
    const re = /<\?[^>]*\?>|<!--[\s\S]*?-->|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;
    for (const m of text.matchAll(re)) {
      if (m[1]) {
        stack.pop();
        continue;
      }
      if (m[2]) {
        const attrs = Object.fromEntries(Array.from((m[3] ?? '').matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)).map((a) => [a[1], a[2]]));
        const el = new El(m[2].replace(/^.*:/, ''), attrs);
        stack[stack.length - 1].children.push(el);
        if (!m[4]) {
          stack.push(el);
        }
        continue;
      }
      if (m[5]) {
        stack[stack.length - 1].appendText(m[5]);
      }
    }
    return { documentElement: stack[0].children[0] ?? null, querySelector: () => null };
  }
};

const { ALL_ADDONS } = await import('@/addons');
const { extensionAddons, extensionsBuilt } = await import('./lib/extension-addons');
if (!extensionsBuilt()) {
  console.log('extensions/dist is missing — run `npm run build:ext` first.');
  process.exit(1);
}

// Built in and from an extension alike: most project kinds and templates are
// extensions now, and they are exactly what the check is here for.
const ADDONS = [...ALL_ADDONS, ...extensionAddons()];
const { detectProject, projectContext, markerMatches, insertIntoBlock } = await import('@/core/project/detect');
const { resolveValues, scaffoldProject, validateValues, visibleFields } = await import('@/core/project/scaffold');
const { fieldChoices } = await import('@/core/project/choices');
const { loadProjectConfig, saveProjectConfig } = await import('@/core/project/config');
const { globToRegExp } = await import('@/core/lsp/manager');
const { applyTextEdits } = await import('@/lib/workspace-edit');
const { toLocations, pathToUri, uriToPath, isVirtualUri } = await import('@/core/lsp/protocol');
type ProjectTemplate = import('@/core/types').ProjectTemplate;
type FormValues = import('@/core/types').FormValues;

let failures = 0;
let passed = 0;
const ok = (cond: boolean, label: string, quiet = false) => {
  if (cond) {
    passed++;
  }
  if (!cond) {
    failures++;
  }
  if (cond && quiet) {
    return;
  }
  console.log(`  ${cond ? '✓' : '✗'}  ${label}`);
};

const kinds = [...new Map(ADDONS.flatMap((a) => a.projectKinds ?? []).map((k) => [k.id, k])).values()];
const templates = [...new Map(ADDONS.flatMap((a) => a.projectTemplates ?? []).map((t) => [t.id, t])).values()];
const languageIds = new Set(ADDONS.flatMap((a) => a.languages ?? []).map((l) => l.id));
console.log(`${kinds.length} project kinds, ${templates.length} templates, ${kinds.filter((k) => k.dependencies).length} package managers\n`);

// An extension may bring a language and nothing else — six of them do, their
// project kinds never having been migrated. That is a known state, not a
// fault, so it is listed rather than failed.
const languagesOnly = ADDONS.filter((a) => a.languages?.length && !a.projectTemplates?.length).map((a) => a.name);
if (languagesOnly.length) {
  console.log(`  ·  languages only, no templates: ${languagesOnly.join(', ')}`);
}

const base = await fs.mkdtemp(path.join(os.tmpdir(), 'lumen-check-'));
let counter = 0;

/** The variants: the defaults, each choice on its own, each toggle turned over. */
function variants(template: ProjectTemplate): FormValues[] {
  const fields = template.fields ?? [];
  const defaults = resolveValues(fields, { name: 'Probe', slug: 'probe' });
  const out: FormValues[] = [{}];
  for (const field of fields) {
    // Fetched choices (loadChoices) stay at their defaults here — no network in the check.
    if (field.type === 'select' || field.type === 'combobox') {
      for (const choice of fieldChoices(field, defaults)) {
        if (choice.value === defaults[field.id]) {
          continue;
        }
        const touched = { [field.id]: choice.value };
        const values = resolveValues(fields, { name: 'Probe', slug: 'probe' }, touched);
        if (!visibleFields(fields, values).some((f) => f.id === field.id)) {
          continue;
        }
        out.push(touched);
      }
    }
    if (field.type === 'toggle') {
      out.push({ [field.id]: defaults[field.id] === 'true' ? 'false' : 'true' });
    }
  }
  // Check a dependent choice (CMake + package manager) in combination as well.
  if (fields.some((f) => f.id === 'packages')) {
    for (const pm of ['vcpkg', 'conan']) {
      for (const tests of ['gtest', 'catch2', 'plain', 'none']) {
        out.push({ build: 'cmake', packages: pm, tests });
      }
    }
    for (const build of ['meson', 'xmake', 'bazel', 'make']) {
      out.push({ build, tests: 'gtest' }, { build, type: 'library' });
    }
  }
  return out;
}

console.log('Templates:');
for (const template of templates) {
  ok(!template.languageId || languageIds.has(template.languageId), `${template.id}: Sprache ${template.languageId} existiert`, true);
  let scaffolds = 0;
  const detectedKinds = new Set<string>();
  for (const touched of variants(template)) {
    const name = `Probe ${++counter}`;
    const label = `${template.id} ${JSON.stringify(touched)}`;
    const values = resolveValues(template.fields ?? [], { name, slug: `probe-${counter}` }, touched);
    const errors = validateValues(template.fields ?? [], values);
    ok(Object.keys(errors).length === 0, `${label}: Standardwerte gültig ${JSON.stringify(errors)}`, true);
    let result;
    try {
      result = await scaffoldProject(template, base, name, touched);
    } catch (err) {
      ok(false, `${label}: ${(err as Error).message}`);
      continue;
    }
    scaffolds++;
    const files = await walk(result.dir);
    ok(files.length >= result.written.length && files.length > 0, `${label}: Dateien geschrieben`, true);

    for (const file of files) {
      const text = await fs.readFile(file, 'utf8');
      const rel = path.relative(result.dir, file);
      ok(!/\bundefined\b|\[object Object\]|NaN/.test(text), `${label}: ${rel} enthält keine undefined/NaN-Reste`, true);
      if (/\.json$/.test(file) && !/tsconfig|jsconfig/.test(file)) {
        let parsed = true;
        try { JSON.parse(text); } catch { parsed = false; }
        ok(parsed, `${label}: ${rel} ist gültiges JSON`, true);
      }
    }
    if (result.open) {
      ok(await lumen.fs.exists(result.open), `${label}: zu öffnende Datei ${path.relative(result.dir, result.open)} existiert`, true);
    }
    for (const task of result.setup) {
      ok(Boolean(task.command) && Array.isArray(task.args), `${label}: Setup-Aufgabe ${task.id} vollständig`, true);
    }

    const expected = typeof template.kindId === 'function' ? template.kindId(values) : template.kindId;
    const info = await detectProject(result.dir, kinds, 'linux');
    if (info.primary) {
      detectedKinds.add(info.primary.kind.id);
    }
    // A template may name a kind from another extension. Where that one is not
    // installed, there is nothing to detect and nothing to assert.
    const known = !expected || kinds.some((k) => k.id === expected);
    if (expected && known) {
      ok(info.primary?.kind.id === expected, `${label}: erkannt als ${expected} (ist ${info.primary?.kind.id ?? '—'})`, true);
      ok(info.tasks.length > 0, `${label}: Aufgaben vorhanden`, true);
    }
    if (!expected) {
      ok(!info.primary || info.primary.kind.id !== 'npm' || template.id === 'html-site', `${label}: keine unerwartete Art`, true);
    }
  }
  console.log(`  ${'·'}  ${template.id.padEnd(18)} ${String(scaffolds).padStart(2)} variants → ${[...detectedKinds].join(', ') || 'no build system'}`);
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...await walk(full));
    }
    if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Package managers
 * ------------------------------------------------------------------ */

console.log('\nAdding dependencies:');

// Ids are bare here; an extension prefixes its own with the add-on id, so
// `go` also answers to `ext.go.go`.
const suffix = (id: string) => (candidate: { id: string; }) => candidate.id === id || candidate.id.endsWith(`.${id}`);
const kindOf = (id: string) => kinds.find(suffix(id));
const templateOf = (id: string) => templates.find(suffix(id));
const kind = (id: string) => kindOf(id)!;

const skipped: string[] = [];

/**
 * A block of checks, run only when what it needs is installed.
 *
 * Project kinds that never made it into an extension — CMake, Meson, xmake,
 * vcpkg, Conan — have nothing to check any more. Saying so beats a failure
 * that reads as a fault.
 */
async function group(needs: string[], run: () => Promise<void>) {
  const missing = needs.filter((id) => !kindOf(id) && !templateOf(id));
  if (missing.length) {
    skipped.push(...missing);
    return;
  }
  await run();
}

async function project(files: Record<string, string>) {
  const dir = await fs.mkdtemp(path.join(base, 'dep-'));
  for (const [rel, content] of Object.entries(files)) {
    await lumen.fs.writeFile(path.join(dir, rel), content);
  }
  return projectContext(dir, 'linux');
}

async function scaffold(templateId: string, touched: FormValues) {
  const template = templateOf(templateId)!;
  const result = await scaffoldProject(template, base, `Dep ${++counter}`, touched);
  return projectContext(result.dir, 'linux');
}

// Maven
{
  const ctx = await scaffold('java-project', { build: 'maven' });
  const action = await kind('maven').dependencies!.add(ctx, { name: 'org.slf4j:slf4j-api', version: '2.0.16' });
  const content = action.type === 'edit' ? action.content : '';
  const doc = new DOMParser().parseFromString(content, 'application/xml').documentElement;
  const deps = doc?.getElementsByTagName('dependency') ?? [];
  ok(action.type === 'edit' && deps.some((d) => d.textContent.includes('slf4j-api')) && deps.length === 2, 'Maven: <dependency> in pom.xml eingetragen');
  await lumen.fs.writeFile(path.join(ctx.root, 'pom.xml'), content);
  const info = await detectProject(ctx.root, kinds, 'linux');
  ok(info.meta.dependencies?.some((d) => d.name === 'org.slf4j:slf4j-api' && d.version === '2.0.16') ?? false, 'Maven: neue Abhängigkeit wird erkannt');
  const managed = await project({ 'pom.xml': '<project>\n  <dependencyManagement>\n    <dependencies>\n    </dependencies>\n  </dependencyManagement>\n  <build>\n  </build>\n</project>\n' });
  const second = await kind('maven').dependencies!.add(managed, { name: 'a:b', version: '1', scope: 'test' });
  const text = second.type === 'edit' ? second.content : '';
  ok(text.indexOf('<artifactId>b</artifactId>') > text.indexOf('</dependencyManagement>') && text.includes('<scope>test</scope>'), 'Maven: neuer Block außerhalb von dependencyManagement');
}

// Gradle
for (const build of ['gradle-kts', 'gradle-groovy']) {
  const ctx = await scaffold('java-project', { build });
  const action = await kind('gradle').dependencies!.add(ctx, { name: 'io.ktor:ktor-client-core', version: '3.0.3', scope: 'implementation' });
  const content = action.type === 'edit' ? action.content : '';
  const line = build === 'gradle-kts' ? 'implementation("io.ktor:ktor-client-core:3.0.3")' : "implementation 'io.ktor:ktor-client-core:3.0.3'";
  const inside = content.slice(content.indexOf('dependencies {'), content.indexOf('}', content.indexOf(line)) + 1);
  ok(inside.includes(`    ${line}`), `Gradle (${build}): ${line} im dependencies-Block`);
}

// Node
for (const [pm, lock, expected] of [['npm', 'package-lock.json', 'install -D'], ['pnpm', 'pnpm-lock.yaml', 'add -D'], ['yarn', 'yarn.lock', 'add -D'], ['bun', 'bun.lock', 'add -d']] as const) {
  const ctx = await project({ 'package.json': '{"name":"x"}', [lock]: '' });
  const action = await kind('npm').dependencies!.add(ctx, { name: 'vitest', version: '^2.1.0', scope: 'devDependencies' });
  ok(action.type === 'task' && action.task.command === pm && action.task.args.join(' ') === `${expected} vitest@^2.1.0`, `Node: ${pm} ${expected} vitest@^2.1.0`);
}

// Python
await group(['python'], async () => {
  const pip = await project({ 'requirements.txt': 'flask\n' });
  const a = await kind('python').dependencies!.add(pip, { name: 'requests', version: '2.32.3' });
  ok(a.type === 'edit' && a.content === 'flask\nrequests==2.32.3\n' && a.then?.args.includes('-r') === true, 'Python/pip: requirements.txt ergänzt, dann pip install');
  const uv = await project({ 'pyproject.toml': '[project]\nname = "x"\n', 'uv.lock': '' });
  const b = await kind('python').dependencies!.add(uv, { name: 'pytest', scope: 'dev' });
  ok(b.type === 'task' && b.task.command === 'uv' && b.task.args.join(' ') === 'add --dev pytest', 'Python/uv: uv add --dev pytest');
  const poetry = await project({ 'pyproject.toml': '[tool.poetry]\nname = "x"\n' });
  const c = await kind('python').dependencies!.add(poetry, { name: 'httpx', version: '>=0.28' });
  ok(c.type === 'task' && c.task.args.join(' ') === 'add httpx>=0.28', 'Python/Poetry: poetry add httpx>=0.28');
});

// C/C++
await group(['cpp-project', 'c-project', 'cmake', 'vcpkg', 'conan', 'xmake', 'meson', 'ninja'], async () => {
  const vcpkg = await scaffold('cpp-project', { build: 'cmake', packages: 'vcpkg' });
  const a = await kind('vcpkg').dependencies!.add(vcpkg, { name: 'fmt' });
  ok(a.type === 'task' && a.task.args.join(' ') === 'add port fmt', 'vcpkg: vcpkg add port fmt');
  const vcpkgTasks = await kind('cmake').tasks(vcpkg);
  ok(vcpkgTasks.some((t) => t.id === 'cmake:configure:debug'), 'CMake: Presets werden zu Aufgaben');
  const conan = await scaffold('cpp-project', { build: 'cmake', packages: 'conan' });
  const b = await kind('conan').dependencies!.add(conan, { name: 'fmt', version: '11.0.2', scope: 'requires' });
  ok(b.type === 'edit' && /\[requires\]\nfmt\/11\.0\.2\n/.test(b.content) && b.then?.command === 'conan', 'Conan: [requires] ergänzt, dann conan install');
  const xmake = await scaffold('cpp-project', { build: 'xmake' });
  const c = await kind('xmake').dependencies!.add(xmake, { name: 'fmt', version: '11.0.2' });
  const xm = c.type === 'edit' ? c.content : '';
  ok(xm.includes('add_requires("fmt 11.0.2")') && xm.indexOf('add_requires("fmt') < xm.indexOf('target('), 'xmake: add_requires vor den Zielen');
  const bazel = await scaffold('c-project', { build: 'bazel' });
  const d = await kind('bazel').dependencies!.add(bazel, { name: 'abseil-cpp', version: '20240722.0' });
  ok(d.type === 'edit' && d.content.includes('bazel_dep(name = "abseil-cpp", version = "20240722.0")'), 'Bazel: bazel_dep angehängt');
  const meson = await scaffold('c-project', { build: 'meson' });
  const e = await kind('meson').dependencies!.add(meson, { name: 'zlib' });
  ok(e.type === 'task' && e.task.args.join(' ') === 'wrap install zlib', 'Meson: meson wrap install zlib');
  const ninja = await project({ 'build.ninja': 'rule cc\n  command = cc $in -o $out\nbuild app: cc main.c\nbuild all: phony app\n' });
  const ninjaTasks = await kind('ninja').tasks(ninja);
  ok(ninjaTasks.some((t) => t.args.join(' ') === 'all'), 'Ninja: phony-Ziele werden Aufgaben');
  const info = await detectProject(conan.root, kinds, 'linux');
  ok(info.primary?.kind.id === 'cmake' && info.kinds.some((k) => k.kind.id === 'conan'), 'CMake bleibt Hauptart neben Conan');
});

// Further languages
await group(['rust-cargo', 'cargo'], async () => {
  const cargo = await scaffold('rust-cargo', {});
  const a = await kind('cargo').dependencies!.add(cargo, { name: 'serde --features derive', version: '1', scope: 'normal' });
  ok(a.type === 'task' && a.task.args.join(' ') === 'add serde@1 --features derive', 'Cargo: cargo add serde@1 --features derive');
});
await group(['go-module', 'go'], async () => {
  const go = await scaffold('go-module', {});
  const b = await kind('go').dependencies!.add(go, { name: 'github.com/spf13/cobra', version: 'v1.8.1' });
  ok(b.type === 'task' && b.task.args.join(' ') === 'get github.com/spf13/cobra@v1.8.1', 'Go: go get …@v1.8.1');
});
await group(['php-composer', 'composer'], async () => {
  const php = await scaffold('php-composer', {});
  const c = await kind('composer').dependencies!.add(php, { name: 'guzzlehttp/guzzle', version: '^7.9', scope: 'require-dev' });
  ok(c.type === 'task' && c.task.args.join(' ') === 'require --dev guzzlehttp/guzzle:^7.9', 'Composer: composer require --dev');
});
await group(['dotnet-csharp', 'dotnet'], async () => {
  const dotnet = await scaffold('dotnet-csharp', { namespace: 'Probe' });
  const d = await kind('dotnet').dependencies!.add(dotnet, { name: 'Serilog', version: '4.2.0' });
  ok(d.type === 'task' && d.task.args.join(' ') === 'add package Serilog --version 4.2.0', `NuGet: dotnet add package (${d.type === 'task' ? d.task.args.join(' ') : ''})`);
  const dotnetInfo = await detectProject(dotnet.root, kinds, 'linux');
  ok(dotnetInfo.primary?.kind.id.endsWith('dotnet') === true, '.NET: Solution im Stamm wird über *.slnx erkannt');
});
await group(['crystal-shards', 'shards'], async () => {
  const shards = await scaffold('crystal-shards', {});
  const e = await kind('shards').dependencies!.add(shards, { name: 'kemalcr/kemal', version: '~> 1.6' });
  ok(e.type === 'edit' && e.content.includes('dependencies:\n  kemal:\n    github: kemalcr/kemal\n    version: ~> 1.6'), 'Shards: dependencies-Block angelegt');
});
await group(['novus-project', 'novus'], async () => {
  const novus = await scaffold('novus-project', {});
  const f = await kind('novus').dependencies!.add(novus, { name: 'github.com/user/geo' });
  ok(f.type === 'task' && f.task.args.join(' ') === 'deps add github.com/user/geo', 'Novus: novusc deps add');
});
await group(['deno'], async () => {
  const deno = await project({ 'deno.json': '{}' });
  const g = await kind('deno').dependencies!.add(deno, { name: 'jsr:@std/path' });
  ok(g.type === 'task' && g.task.args.join(' ') === 'add jsr:@std/path', 'Deno: deno add jsr:@std/path');
});

if (skipped.length) {
  console.log(`  ·  not installed, skipped: ${[...new Set(skipped)].sort().join(', ')}`);
}

/* ------------------------------------------------------------------ *
 * JVM multi-module builds and custom tasks
 * ------------------------------------------------------------------ */

console.log('\nJVM modules and custom tasks:');
{
  const jvmTasks = await import('@/addons/lib/jvm-tasks');
  const jvmModules = await import('@/addons/lib/jvm-modules');
  const pomOf = (inner: string) => `<?xml version="1.0"?>\n<project>\n  <modelVersion>4.0.0</modelVersion>\n${inner}\n</project>\n`;

  // Maven: a reactor with a nested aggregator, plugin goals and profiles.
  const maven = await project({
    'pom.xml': pomOf(`  <groupId>de.example</groupId>
  <artifactId>shop</artifactId>
  <version>1.0.0</version>
  <packaging>pom</packaging>
  <modules>
    <module>core</module>
    <module>services/pom.xml</module>
  </modules>
  <build>
    <plugins>
      <plugin><groupId>org.apache.maven.plugins</groupId><artifactId>maven-compiler-plugin</artifactId></plugin>
      <plugin>
        <groupId>com.google.cloud.tools</groupId><artifactId>jib-maven-plugin</artifactId>
        <executions><execution><id>docker</id><goals><goal>build</goal></goals></execution></executions>
      </plugin>
      <plugin>
        <groupId>com.acme</groupId><artifactId>acme-tool</artifactId>
        <executions><execution><goals><goal>generate</goal></goals></execution></executions>
      </plugin>
    </plugins>
  </build>
  <profiles>
    <profile><id>native</id></profile>
    <profile><id>ci</id><activation><activeByDefault>true</activeByDefault></activation></profile>
  </profiles>`),
    'core/pom.xml': pomOf('  <artifactId>shop-core</artifactId>\n  <name>Shop Core</name>'),
    'services/pom.xml': pomOf('  <artifactId>services</artifactId>\n  <packaging>pom</packaging>\n  <modules>\n    <module>api</module>\n    <module>impl</module>\n  </modules>'),
    'services/api/pom.xml': pomOf('  <artifactId>api</artifactId>\n  <build><plugins><plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin></plugins></build>'),
    'services/impl/pom.xml': pomOf('  <artifactId>impl</artifactId>\n  <dependencies><dependency><groupId>de.example</groupId><artifactId>api</artifactId><version>1.0.0</version></dependency></dependencies>'),
  });
  const mavenInfo = await detectProject(maven.root, kinds, 'linux');
  const [core, services] = mavenInfo.modules;
  ok(mavenInfo.modules.length === 2 && core?.name === 'Shop Core' && services?.path === 'services', 'Maven: root modules core and services (…/pom.xml stripped)');
  ok(services?.modules?.map((m) => m.path).join(',') === 'services/api,services/impl', 'Maven: nested aggregator modules');
  const api = services?.modules?.[0];
  ok(api?.tasks.some((t) => t.args.join(' ') === '-pl services/api spring-boot:run' && t.group === 'run') === true, 'Maven: module run task through spring-boot:run');
  ok(core?.tasks.some((t) => t.args.join(' ') === '-q -pl core -am compile') === true, 'Maven: module compile with -pl -am');
  ok(!core?.tasks.some((t) => t.group === 'run'), 'Maven: no run task without a runner plugin');
  ok(services?.modules?.[1]?.dependencies?.some((d) => d.name === 'de.example:api') === true, 'Maven: module dependencies');
  const goals = mavenInfo.customTasks.map((t) => t.args[t.args.length - 1]);
  ok(goals.includes('jib:build@docker') && goals.includes('jib:dockerBuild'), 'Maven: plugin goals with execution ids and known goals');
  ok(goals.includes('com.acme:acme-tool:generate'), 'Maven: plugin without a prefix uses groupId:artifactId:goal');
  ok(!goals.some((g) => g.startsWith('compiler:')), 'Maven: lifecycle plugins left out');
  ok(mavenInfo.customTasks.some((t) => t.args.join(' ') === '-P native package' && t.category === 'profiles'), 'Maven: profiles become tasks');
  ok(jvmTasks.mavenPrefix('maven-shade-plugin') === 'shade' && jvmTasks.mavenPrefix('quarkus-maven-plugin') === 'quarkus' && jvmTasks.mavenPrefix('native-maven-plugin') === 'native' && jvmTasks.mavenPrefix('plain') === null, 'Maven: plugin prefixes');
  ok(jvmTasks.parseMavenProfiles(await maven.readFile('pom.xml') ?? '').find((p) => p.id === 'ci')?.activeByDefault === true, 'Maven: activeByDefault profile');

  // Gradle, Kotlin DSL: nested includes, an implied parent, a projectDir override.
  const gradleKts = await project({
    'settings.gradle.kts': `rootProject.name = "demo"\n// include(":commented")\ninclude(":app", "libs:core")\ninclude(\n    "tools",\n)\nproject(":tools").projectDir = file("build-tools")\n`,
    'build.gradle.kts': 'plugins {\n    base\n}\n\ntasks.register("release") {\n    group = "publishing"\n    description = "Cuts a release"\n}\n',
    'app/build.gradle.kts': 'plugins {\n    application\n    kotlin("jvm") version "2.1.20"\n}\n\ntasks.register<Copy>("bundle") {\n    group = "distribution"\n}\n',
    'libs/core/build.gradle.kts': 'plugins {\n    `java-library`\n}\n\ndependencies {\n    implementation(project(":app"))\n    api("com.google.guava:guava:33.0.0-jre")\n}\n',
    'build-tools/build.gradle': "plugins {\n    id 'java'\n}\n",
  });
  const gradleInfo = await detectProject(gradleKts.root, kinds, 'linux');
  const byId = new Map(jvmModules.flattenModules(gradleInfo.modules).map((m) => [m.id, m]));
  ok(gradleInfo.modules.map((m) => m.id).join(',') === ':app,:libs,:tools', `Gradle (kts): root modules (${gradleInfo.modules.map((m) => m.id).join(',')})`);
  ok(byId.get(':libs')?.kind === 'container' && byId.get(':libs')?.modules?.[0]?.id === ':libs:core', 'Gradle (kts): implied parent :libs holds :libs:core');
  ok(byId.get(':tools')?.path === 'build-tools' && byId.get(':tools')?.kind === 'jvm', 'Gradle (kts): projectDir override');
  ok(byId.get(':app')?.kind === 'application' && byId.get(':app')?.tasks.some((t) => t.args.includes(':app:run')) === true, 'Gradle (kts): application module gets :app:run');
  ok(byId.get(':libs:core')?.kind === 'library' && !byId.get(':libs:core')?.tasks.some((t) => t.group === 'run'), 'Gradle (kts): java-library without a run task');
  ok(byId.get(':app')?.tasks.some((t) => t.args.includes(':app:bundle') && t.category === 'distribution') === true, 'Gradle (kts): module custom task with its group');
  ok(byId.get(':libs:core')?.dependencies?.some((d) => d.name === ':app') === true, 'Gradle (kts): project dependencies');
  ok(gradleInfo.customTasks.some((t) => t.label === 'release' && t.category === 'publishing' && t.detail === 'Cuts a release'), 'Gradle (kts): root custom task');
  ok(!byId.has(':commented'), 'Gradle (kts): commented includes ignored');

  // Gradle, Groovy DSL: an include continued over lines.
  const groovy = jvmModules.parseGradleSettings("rootProject.name = 'demo'\ninclude 'a', 'b:c',\n        'd'\nincludeBuild('../plugins')\nproject(':d').projectDir = new File(rootDir, 'modules/d')\n");
  ok(groovy.includes.join(',') === ':a,:b:c,:d' && groovy.rootName === 'demo', 'Gradle (groovy): include over several lines');
  ok(groovy.dirs[':d'] === 'modules/d' && groovy.includedBuilds[0] === '../plugins', 'Gradle (groovy): new File(rootDir, …) and includeBuild');
  const groovyTasks = jvmTasks.parseGradleCustomTasks("task hello(type: Copy) {\n    group 'demo'\n    description 'Says hello'\n}\ntask('two')\ntasks.register('three')\ntasks.named('test') {}\n");
  ok(groovyTasks.map((t) => t.name).join(',') === 'three,hello,two' && groovyTasks.find((t) => t.name === 'hello')?.group === 'demo', 'Gradle (groovy): task declarations with group');
  ok(jvmTasks.parseGradleCustomTasks('val fatJar by tasks.registering(Jar::class) {\n    description = "Fat jar"\n}\n')[0]?.description === 'Fat jar', 'Gradle (kts): val … by tasks.registering');
  ok(jvmModules.parseGradlePlugins("plugins {\n    id 'org.springframework.boot' version '3.4.0'\n    alias(libs.plugins.kotlin.jvm)\n}\napply plugin: 'war'\n").join(',') === 'org.springframework.boot,kotlin-jvm,war', 'Gradle: plugin ids, aliases and apply plugin');

  // The report of `gradle tasks --all`.
  const report = [
    '', '------------------------------------------------------------', "Tasks runnable from root project 'demo'",
    '------------------------------------------------------------', '', 'Application tasks', '-----------------',
    'run - Runs this project as a JVM application', '', 'Build tasks', '-----------', 'assemble - Assembles the outputs of this project.',
    'app:build - Assembles and tests this project.', '', 'Other tasks', '-----------', 'app:compileJava - Compiles main Java source.', 'prepareKotlinBuildScriptModel',
    '', 'Rules', '-----', 'Pattern: clean<TaskName>: Cleans the output files of a task.', '',
    'To see all tasks and more detail, run gradle help --task <task>',
  ].join('\n');
  const parsed = jvmTasks.parseGradleTasksOutput(report);
  ok(parsed.length === 5 && parsed[0].name === 'run' && parsed[0].group === 'Application', `gradle tasks --all: ${parsed.length} tasks with groups`);
  ok(parsed.find((t) => t.name === 'app:build')?.description === 'Assembles and tests this project.' && parsed.some((t) => t.name === 'prepareKotlinBuildScriptModel' && t.group === 'Other'), 'gradle tasks --all: module tasks and tasks without a description');
  ok(!parsed.some((t) => t.name.startsWith('Pattern') || t.name === 'To'), 'gradle tasks --all: rules and footer skipped');
}

console.log('\nGradle plugin tasks (Minecraft mods, Spring Boot …):');
{
  const plugins = await import('@/addons/lib/gradle-plugins');
  const jvmModules = await import('@/addons/lib/jvm-modules');
  const names = (tasks: { label: string; }[]) => tasks.map((task) => task.label);

  // Fabric: Loom creates runClient and runServer without any runs block.
  const fabric = `plugins {\n  id 'fabric-loom' version '1.10-SNAPSHOT'\n  id 'maven-publish'\n}\ndependencies {\n  minecraft "com.mojang:minecraft:1.21.4"\n  mappings loom.officialMojangMappings()\n}\n`;
  const fabricTasks = plugins.pluginTasks(fabric).map((task) => task.name);
  ok(fabricTasks.includes('runClient') && fabricTasks.includes('runServer') && fabricTasks.includes('genSources') && fabricTasks.includes('publishToMavenLocal'),
    'Fabric Loom: runClient, runServer, genSources and publishing');

  // NeoForge ModDevGradle: only the declared runs exist, whatever their shape.
  const neo = `plugins {\n  id("net.neoforged.moddev") version "2.0.78"\n}\nneoForge {\n  version = "21.4.10"\n  runs {\n    client {\n      client()\n    }\n    server { server() }\n    create("data") { data() }\n    register("gameTestServer") { type = "gameTestServer" }\n  }\n}\n`;
  const neoTasks = plugins.pluginTasks(neo).map((task) => task.name);
  ok(['runClient', 'runServer', 'runData', 'runGameTestServer'].every((name) => neoTasks.includes(name)) && !neoTasks.includes('runClientClient'),
    'NeoForge ModDevGradle: a run task per declared run');
  ok(plugins.parseRuns(neo).join(',') === 'client,server,data,gameTestServer', 'runs block: names only, not what is configured inside');

  // `apply false` is declared, not applied; plugins from subprojects {} are inherited.
  const root = `plugins {\n  id "architectury-plugin" version "3.4-SNAPSHOT"\n  id "dev.architectury.loom" version "1.9-SNAPSHOT" apply false\n}\nsubprojects {\n  apply plugin: "dev.architectury.loom"\n}\n`;
  ok(!plugins.appliedPlugins(root).includes('dev.architectury.loom'), 'apply false: not applied to the root');
  ok(plugins.inheritedPlugins(root).includes('dev.architectury.loom'), 'subprojects { apply plugin: … } is inherited');
  ok(plugins.impliedPlugins('architectury {\n  platformSetupLoomIde()\n  neoForge()\n}\n').includes('dev.architectury.loom'), 'architectury { neoForge() } implies Loom');

  // An Architectury multi-loader build end to end: the modules get their run tasks.
  const multi = await project({
    'settings.gradle': `include "common", "fabric", "neoforge"\nrootProject.name = "mymod"\n`,
    'build.gradle': root,
    'common/build.gradle': `architectury {\n  common(rootProject.enabled_platforms.split(","))\n}\n`,
    'fabric/build.gradle': `architectury {\n  platformSetupLoomIde()\n  fabric()\n}\n`,
    'neoforge/build.gradle': `plugins { id "com.github.johnrengelman.shadow" }\narchitectury {\n  platformSetupLoomIde()\n  neoForge()\n}\n`,
  });
  const tree = jvmModules.flattenModules(await jvmModules.gradleModuleTree(multi, './gradlew'));
  const fabricModule = tree.find((module) => module.id === ':fabric');
  const neoModule = tree.find((module) => module.id === ':neoforge');
  ok(Boolean(fabricModule && names(fabricModule.tasks).includes('runClient') && names(fabricModule.tasks).includes('runServer')), 'Architectury: :fabric gets runClient and runServer');
  ok(Boolean(neoModule && names(neoModule.tasks).includes('runClient') && names(neoModule.tasks).includes('shadowJar')), 'Architectury: :neoforge gets its runs and the Shadow tasks');
  ok(fabricModule?.kind === 'minecraft-mod', 'Loom modules are recognised as Minecraft mods');
  const runClient = fabricModule?.tasks.find((task) => task.label === 'runClient');
  ok(runClient?.args.join(' ') === '--console=plain :fabric:runClient' && runClient.group === 'run' && !runClient.category, 'Module run tasks run the module\'s task and sit with the standard tasks');

  // Spring Boot and the Application plugin do not produce duplicate `run` tasks.
  const boot = jvmModules.gradleModuleTasks(':api', 'spring-boot', `plugins {\n  id 'org.springframework.boot'\n  id 'application'\n}\n`, 'gradle', []);
  const bootTargets = boot.map((task) => task.args[task.args.length - 1]);
  ok(bootTargets.filter((target) => target === ':api:bootRun').length === 1 && bootTargets.includes(':api:bootJar') && bootTargets.filter((target) => target === ':api:run').length === 1,
    'Spring Boot: bootRun once, plus bootJar and run');

  // The fetched task list maps into modules.
  const { tasksOfModule, rootTasks } = await import('@/lib/gradle-tasks');
  const list = { loading: false, tasks: ['build', 'fabric:runClient', 'fabric:runDatagen', 'fabric:sub:x'].map((name) => ({ id: name, label: name, command: 'gradle', args: [name] })) };
  ok(names(tasksOfModule(list, ':fabric')).join(',') === 'runClient,runDatagen', 'Fetched tasks go to their module, without deeper modules');
  ok(names(rootTasks(list)).join(',') === 'build', 'The root keeps only its own fetched tasks');
}


/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

console.log('\nHelpers:');
const cfgDir = await fs.mkdtemp(path.join(base, 'cfg-'));
await saveProjectConfig(cfgDir, { name: 'X', tasks: [{ id: 'custom:a', label: 'A', command: 'echo', args: ['hi'], group: 'build' }], defaults: { build: 'custom:a' }, env: { A: '1' }, lsp: { java: 'jdtls' }, openFiles: ['pom.xml'] });
const cfg = await loadProjectConfig(cfgDir);
ok(cfg.tasks.length === 1 && cfg.defaults.build === 'custom:a' && cfg.env.A === '1' && cfg.lsp.java === 'jdtls' && cfg.openFiles?.[0] === 'pom.xml', 'Projektkonfiguration round-trip');
ok(!(await lumen.fs.exists(path.join(cfgDir, '.lumen'))), 'Project configuration stays out of the project folder');

ok(markerMatches('*.csproj', 'App.csproj') && !markerMatches('*.csproj', 'App.csproj.user') && markerMatches('pom.xml', 'pom.xml'), 'Marker mit *');
ok(insertIntoBlock('deps {\n    a\n}\n', /^deps\s*\{/m, '}', 'b') === 'deps {\n    a\n    b\n}\n', 'insertIntoBlock: vor schließender Klammer');
ok(insertIntoBlock('deps {}\n', /^deps\s*\{/m, '}', 'b') === 'deps {\n    b\n}\n', 'insertIntoBlock: leerer Block auf einer Zeile');
ok(globToRegExp('**/*.java').test('/a/b/C.java') && !globToRegExp('**/*.java').test('/a/b/c.kt'), 'glob **/*.java');
ok(globToRegExp('**/*.{c,cpp,h}').test('/x/y.cpp'), 'glob *.{c,cpp,h}');
ok(applyTextEdits('abc\ndef', [{ range: { start: { line: 0, character: 1 }, end: { line: 0, character: 2 } }, newText: 'X' }, { range: { start: { line: 1, character: 0 }, end: { line: 1, character: 0 } }, newText: '>' }]) === 'aXc\n>def', 'applyTextEdits');
ok(uriToPath(pathToUri('/tmp/ä b/x.java')) === '/tmp/ä b/x.java', 'pathToUri/uriToPath round-trip');
ok(isVirtualUri('jdt://contents/x.class') && !isVirtualUri('/tmp/x') && !isVirtualUri('file:///tmp/x'), 'isVirtualUri');
ok(toLocations([{ targetUri: 'file:///a', targetRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, targetSelectionRange: { start: { line: 0, character: 2 }, end: { line: 0, character: 3 } } }])[0].range.start.character === 2, 'toLocations LocationLink');

const { checkFormValues } = await import('./lib/check-form-values');
await checkFormValues(ok, base);

await fs.rm(base, { recursive: true, force: true });
console.log(`\n${passed} checks passed, ${failures} error(s)`);
process.exit(failures ? 1 : 0);

{
  const { fitsApp } = await import('@/core/extensions/compat');
  console.log('\nExtension compatibility:');
  const ok2 = (cond: boolean, msg: string) => { console.log(`  ${cond ? '✓' : '✗'}  ${msg}`); if (!cond) {
    process.exitCode = 1;
  } };
  ok2(fitsApp(undefined, '0.5.0'), 'No requirement always fits');
  ok2(fitsApp('0.6.0', '0.6.0') && fitsApp('0.6.0', '0.10.1'), 'An equal or newer Lumen fits');
  ok2(!fitsApp('0.6.0', '0.5.9') && !fitsApp('1.0.0', '0.9.0'), 'An older Lumen does not');
  ok2(fitsApp("0.5.0", "0.5.0-beta.2"), 'A tagged build of the required number fits');
  ok2(fitsApp('nonsense', '0.1.0'), 'An unreadable requirement does not block');
}
