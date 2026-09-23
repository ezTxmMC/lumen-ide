/**
 * Offline tests of the Minecraft extension: the version rules, the parsers,
 * the cache, the messages — and every template generated from the built-in
 * defaults with the network switched off.
 *
 *   node extensions/minecraft/test.mjs
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { Catalog, type Net } from '../src/catalog'
import {
  bukkitApiVersion, fabricApiBranch, fabricApiMatches, fabricApiModId, fabricFeatures, forgeLoaderRange,
  forgeToolchain, gradleChoicesFrom, gradleDependencyVersion, isUnobfuscated, javaFor, latestBuildRange, mcRange,
  neoFeatures, neoToolchain, neoforgeMinecraft, neoforgePrefix, nextPatch, packFormat, packMeta, quiltSupports,
  rangeMinecraft, velocityHasBrigadier, velocityJava,
} from '../src/eras'
import { setLumen, useStore } from '../src/lumen'
import { MESSAGES } from '../src/messages'
import { compareVersions, mcAtLeast, sortVersions } from '../src/semver'
import {
  apiGameVersions, apiMinecraft, apiVersionsFor, bungeeEntries, fabricApiFromMaven, fabricApiFromModrinth,
  forgeFor, forgeGameVersions, forgeMavenVersion, gradleReleases, loaderEntries, mavenVersions, metaGameVersions,
  mojangVersions, neoforgeFor, neoforgeGameVersions, supportedReleases, velocityEntries,
} from '../src/sources'
import { TEMPLATES } from '../src/templates'
import { splitQuiltApi } from '../src/templates/loom'
import { fakeLumen, offlineNet } from './fake-lumen'
import { fill, generate } from './form'

let passed = 0
const failures: string[] = []

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed++
    process.stdout.write(`✓ ${name}\n`)
  } catch (err) {
    failures.push(name)
    process.stdout.write(`✗ ${name}\n  ${(err as Error).stack ?? err}\n`)
  }
}

const template = (id: string) => {
  const found = TEMPLATES.find((tpl) => tpl.id === id)
  if (!found) throw new Error(`no template ${id}`)
  return found
}

// Offline: every list comes from the built-in defaults.
setLumen(fakeLumen({ net: offlineNet }))
useStore(null)

/* ------------------------------------------------------------------ *
 * Versions
 * ------------------------------------------------------------------ */

await test('semver: numbers, pre-releases, build metadata, build scheme', () => {
  assert.ok(compareVersions('1.21.11', '1.21.9') > 0)
  assert.ok(compareVersions('26.1', '1.21.11') > 0)
  assert.ok(compareVersions('21.1.250-beta', '21.1.250') < 0)
  assert.ok(compareVersions('0.116.17+1.21.1', '0.116.9+1.21.1') > 0)
  assert.ok(compareVersions('26.2.build.128-stable', '26.2.build.99-stable') > 0)
  assert.ok(compareVersions('0.19.5', '0.19.4') > 0)
  assert.ok(compareVersions('4.2.1-SNAPSHOT', '4.2.1') < 0)
  assert.deepEqual(sortVersions(['1.20', '1.21.1', '1.20.4', '1.21.1', '26.1']), ['26.1', '1.21.1', '1.20.4', '1.20'])
  assert.ok(mcAtLeast('1.20.5', '1.20.5') && mcAtLeast('26.1', '1.21.11') && !mcAtLeast('1.20.4', '1.20.5'))
})

await test('java per Minecraft version follows Mojang', () => {
  const expected: Record<string, number> = {
    '1.7.10': 8, '1.12.2': 8, '1.16.5': 8, '1.17': 16, '1.17.1': 16, '1.18': 17, '1.19.4': 17, '1.20.4': 17,
    '1.20.5': 21, '1.21.1': 21, '1.21.11': 21, '26.1': 25, '26.3': 25, '26.4-snapshot-1': 25,
  }
  for (const [mc, java] of Object.entries(expected)) assert.equal(javaFor(mc), java, mc)
  assert.ok(isUnobfuscated('26.1') && !isUnobfuscated('1.21.11'))
  assert.equal(mcRange('1.21.11'), '[1.21.11,1.21.12)')
  assert.equal(nextPatch('26.2'), '26.2.1')
})

await test('NeoForge version prefix and its inverse', () => {
  assert.equal(neoforgePrefix('1.21.1'), '21.1.')
  assert.equal(neoforgePrefix('1.21'), '21.0.')
  assert.equal(neoforgePrefix('1.20.4'), '20.4.')
  assert.equal(neoforgePrefix('26.2'), '26.2.0.')
  assert.equal(neoforgePrefix('26.1.2'), '26.1.2.')
  assert.equal(neoforgeMinecraft('21.1.251'), '1.21.1')
  assert.equal(neoforgeMinecraft('21.0.167'), '1.21')
  assert.equal(neoforgeMinecraft('20.6.141'), '1.20.6')
  assert.equal(neoforgeMinecraft('26.2.0.88'), '26.2')
  assert.equal(neoforgeMinecraft('26.1.2.109'), '26.1.2')
  assert.equal(neoforgeMinecraft('26.3.0.13-beta'), '26.3')
  assert.equal(neoforgeMinecraft('0.25w14craftmine.3-beta'), null)
})

await test('NeoForge toolchain per era', () => {
  assert.equal(neoToolchain('1.20.1')?.plugin, 'mdg-legacy')
  assert.equal(neoToolchain('1.20.2'), null)
  assert.equal(neoToolchain('1.20.3'), null)
  assert.equal(neoToolchain('1.20.4')?.plugin, 'mdg')
  assert.equal(neoToolchain('26.3')?.plugin, 'mdg')
  assert.equal(neoFeatures('1.20.4').metadataFile, 'mods.toml')
  assert.equal(neoFeatures('1.20.5').metadataFile, 'neoforge.mods.toml')
  assert.ok(!neoFeatures('1.21').clientClass && neoFeatures('1.21.1').clientClass)
  assert.ok(!neoFeatures('1.21.3').clientData && neoFeatures('1.21.4').clientData)
})

await test('Forge toolchain per era (MDK)', () => {
  assert.deepEqual(forgeToolchain('1.7.10'), { plugin: 'rfg', gradle: '9.5.0', code: 'fml-1.7', reobf: true })
  assert.equal(forgeToolchain('1.12.2')?.code, 'fml-1.12')
  for (const mc of ['1.8.9', '1.10.2', '1.12.1', '1.13.2', '1.15.2', '1.16.4', '1.17']) assert.equal(forgeToolchain(mc), null, mc)
  for (const mc of ['1.17.1', '1.18', '1.18.1', '1.19', '1.19.1', '1.19.3']) assert.deepEqual(forgeToolchain(mc), { plugin: 'mdg-legacy', gradle: '9.2.1', code: 'classic', reobf: true }, mc)
  assert.deepEqual(forgeToolchain('1.16.5'), { plugin: 'fg6', gradle: '8.14.5', code: 'classic', reobf: true })
  assert.deepEqual(forgeToolchain('1.20.1'), { plugin: 'fg6', gradle: '8.14.5', code: 'classic', reobf: true })
  assert.deepEqual(forgeToolchain('1.20.6'), { plugin: 'fg7', gradle: '9.3.1', code: 'classic', reobf: false })
  assert.deepEqual(forgeToolchain('1.21.6'), { plugin: 'fg6', gradle: '8.14.5', code: 'eventbus7', reobf: false })
  assert.deepEqual(forgeToolchain('26.3'), { plugin: 'fg7', gradle: '9.7.1', code: 'eventbus7', reobf: false })
  assert.equal(forgeToolchain('27.1')?.plugin, 'fg7')
  assert.equal(forgeLoaderRange('1.20.1', '47.4.23'), '[47,)')
  assert.equal(forgeLoaderRange('1.21.1', '52.1.16'), '[0,)')
  assert.equal(forgeLoaderRange('26.3', '66.0.3'), '[66,)')
})

await test('pack formats per era', () => {
  assert.equal(packFormat('1.20.1'), 15)
  assert.equal(packFormat('1.21.1'), 34)
  assert.equal(packFormat('26.3'), 121)
  assert.deepEqual(packMeta('1.20.1', 'x'), { pack: { description: 'x', pack_format: 15 } })
  assert.deepEqual(packMeta('1.21.11', 'x'), { pack: { description: 'x', min_format: 94, max_format: 94 } })
})

await test('Fabric: support, features, API branch and mod id', () => {
  assert.ok(!fabricFeatures('1.16.5').slf4j && fabricFeatures('1.18').slf4j)
  assert.ok(!fabricFeatures('1.18.2').splitSources && fabricFeatures('1.19').splitSources)
  assert.equal(fabricApiBranch('1.16.5'), '1.16')
  assert.equal(fabricApiBranch('1.18.1'), '1.18')
  assert.equal(fabricApiBranch('1.18.2'), '1.18.2')
  assert.ok(fabricApiMatches('0.42.0+1.16', '1.16.5'))
  assert.ok(fabricApiMatches('0.3.2+build.212-1.15', '1.15.2'))
  assert.ok(fabricApiMatches('0.116.17+1.21.1', '1.21.1'))
  assert.ok(!fabricApiMatches('0.141.6+1.21.11', '1.21.1'))
  assert.ok(fabricApiMatches('0.44.0+1.18', '1.18') && !fabricApiMatches('0.44.1+1.18', '1.18'))
  assert.equal(fabricApiModId('0.42.0+1.16'), 'fabric')
  assert.equal(fabricApiModId('0.92.2+1.20.1'), 'fabric-api')
  assert.ok(quiltSupports('1.20.1') && !quiltSupports('26.1') && !quiltSupports('1.18.1'))
})

await test('Gradle choices stay within the toolchain major', () => {
  const releases = ['9.7.1', '9.5.0', '9.3.1', '9.2.1', '8.14.5', '8.12.1', '8.8', '8.4']
  assert.deepEqual(gradleChoicesFrom(releases, '8.8'), ['8.14.5', '8.12.1', '8.8'])
  assert.deepEqual(gradleChoicesFrom(releases, '9.3.1'), ['9.7.1', '9.5.0', '9.3.1'])
  assert.deepEqual(gradleChoicesFrom([], '9.2.1'), ['9.2.1'])
})

await test('plugins: api-version, latest-build range, Velocity Java', () => {
  assert.equal(bukkitApiVersion('1.12.2'), null)
  assert.equal(bukkitApiVersion('1.13.2'), '1.13')
  assert.equal(bukkitApiVersion('1.20.4'), '1.20')
  assert.equal(bukkitApiVersion('1.20.6'), '1.20.6')
  assert.equal(bukkitApiVersion('26.2'), '26.2')
  assert.equal(latestBuildRange('26.2'), '[26.2.build,26.2.1)')
  assert.equal(latestBuildRange('26.1.2'), '[26.1.2.build,26.1.3)')
  assert.equal(rangeMinecraft('[26.1.2.build,26.1.3)'), '26.1.2')
  assert.equal(rangeMinecraft('26.2.build.128-stable'), null)
  assert.equal(gradleDependencyVersion('[26.2.build,26.2.1)'), '26.2.build.+')
  assert.equal(gradleDependencyVersion('1.21.11-R0.1-SNAPSHOT'), '1.21.11-R0.1-SNAPSHOT')
  assert.equal(velocityJava('1.1.9'), 8)
  assert.equal(velocityJava('3.1.1'), 11)
  assert.equal(velocityJava('3.4.0'), 17)
  assert.equal(velocityJava('3.5.1'), 21)
  assert.equal(velocityJava('4.2.0'), 25)
  assert.ok(!velocityHasBrigadier('1.1.9') && velocityHasBrigadier('3.0.0'))
})

/* ------------------------------------------------------------------ *
 * Parsers
 * ------------------------------------------------------------------ */

await test('maven-metadata and Mojang manifest', () => {
  const xml = '<metadata><versioning><versions><version>1.0</version>\n<version> 1.1 </version></versions></versioning></metadata>'
  assert.deepEqual(mavenVersions(xml), ['1.0', '1.1'])
  const manifest = {
    versions: [
      { id: '26.4-snapshot-1', type: 'snapshot' },
      { id: '26.3', type: 'release' },
      { id: '26.3-rc-1', type: 'snapshot' },
      { id: '1.7.10', type: 'release' },
      { id: '1.7.2', type: 'release' },
      { id: 'b1.7.3', type: 'old_beta' },
    ],
  }
  assert.deepEqual(mojangVersions(manifest), { releases: ['26.3', '1.7.10'], snapshots: ['26.4-snapshot-1'] })
  assert.deepEqual(metaGameVersions([{ version: '26.4-snapshot-1', stable: false }, { version: '26.3', stable: true }, { version: '26.3-rc-1', stable: false }]), { releases: ['26.3'], snapshots: ['26.4-snapshot-1'] })
})

await test('loaders and Fabric API lists with badges', () => {
  const loaders = loaderEntries([{ version: '0.19.4', stable: false }, { version: '0.19.5', stable: true }, { version: '0.19.3', stable: true }])
  assert.deepEqual(loaders.map((l) => [l.version, l.badge]), [['0.19.5', 'latest'], ['0.19.4', 'beta'], ['0.19.3', undefined]])
  const modrinth = fabricApiFromModrinth([
    { version_number: '0.116.17+1.21.1', version_type: 'release', game_versions: ['1.21.1'], loaders: ['fabric'] },
    { version_number: '0.116.16+1.21.1', version_type: 'release', game_versions: ['1.21.1'], loaders: ['fabric'] },
    { version_number: '0.117.0+1.21.2', version_type: 'beta', game_versions: ['1.21.2'], loaders: ['fabric'] },
  ], '1.21.1')
  assert.deepEqual(modrinth.map((e) => e.version), ['0.116.17+1.21.1', '0.116.16+1.21.1'])
  assert.equal(modrinth[0].badge, 'latest')
  assert.deepEqual(fabricApiFromMaven(['0.42.0+1.16', '0.41.3+1.16', '0.28.5+1.14', '0.3.0-pre+build.135'], '1.16.5').map((e) => e.version), ['0.42.0+1.16', '0.41.3+1.16'])
})

await test('NeoForge lists: builds per version, 1.20.1 from the legacy fork', () => {
  const all = ['21.1.250', '21.1.251', '21.1.252-beta', '20.4.251', '26.2.0.88', '26.3.0.13-beta', '0.25w14craftmine.3-beta']
  const legacy = ['1.20.1-47.1.105', '1.20.1-47.1.106', '47.1.82']
  assert.deepEqual(neoforgeGameVersions(all, legacy), ['26.3', '26.2', '1.21.1', '1.20.4', '1.20.1'])
  const neo = neoforgeFor(all, legacy, '1.21.1')
  assert.deepEqual(neo.map((e) => [e.version, e.badge]), [['21.1.252-beta', 'beta'], ['21.1.251', 'latest'], ['21.1.250', undefined]])
  assert.deepEqual(neoforgeFor(all, legacy, '1.20.1').map((e) => e.version), ['1.20.1-47.1.106', '1.20.1-47.1.105'])
  assert.deepEqual(neoforgeFor(all, legacy, '26.3').map((e) => e.badge), ['beta'])
})

await test('Forge lists: builds with promotions, branch suffixes', () => {
  const all = ['1.20.1-47.4.23', '1.20.1-47.4.10', '1.20.1-47.4.9', '1.7.10-10.13.4.1614-1.7.10', '1.7.10-10.13.4.1566-1.7.10', '1.7.10_pre4-10.12.2.1149-prerelease']
  const promos = { '1.20.1-recommended': '47.4.10', '1.20.1-latest': '47.4.23', '1.7.10-latest': '10.13.4.1614', '1.7.10-recommended': '10.13.4.1614' }
  assert.deepEqual(forgeFor(all, promos, '1.20.1').map((e) => [e.version, e.badge]), [['47.4.23', 'latest'], ['47.4.10', 'recommended'], ['47.4.9', undefined]])
  assert.deepEqual(forgeFor(all, promos, '1.7.10').map((e) => [e.version, e.badge]), [['10.13.4.1614', 'recommended'], ['10.13.4.1566', undefined]])
  assert.equal(forgeMavenVersion(all, '1.7.10', '10.13.4.1614'), '1.7.10-10.13.4.1614-1.7.10')
  assert.deepEqual(forgeGameVersions(promos), ['1.20.1', '1.7.10'])
})

await test('server APIs: both version schemes, channels, Paper latest', () => {
  const all = ['1.21.11-R0.1-SNAPSHOT', '1.21.11-R0.2-SNAPSHOT', '1.21.11-rc3-R0.1-SNAPSHOT', '26.2.build.127-stable', '26.2.build.128-stable', '26.2-rc-2.build.9-alpha', '26.3.build.36-alpha']
  assert.equal(apiMinecraft('26.2-rc-2.build.9-alpha'), null)
  assert.deepEqual(apiGameVersions(all), ['26.3', '26.2', '1.21.11'])
  assert.deepEqual(apiVersionsFor(all, '26.2').map((e) => [e.version, e.badge]), [['26.2.build.128-stable', 'latest'], ['26.2.build.127-stable', undefined]])
  assert.deepEqual(apiVersionsFor(all, '26.3').map((e) => e.badge), ['alpha'])
  assert.deepEqual(apiVersionsFor(all, '1.21.11').map((e) => e.version), ['1.21.11-R0.2-SNAPSHOT', '1.21.11-R0.1-SNAPSHOT'])
})

await test('proxies and Gradle releases', () => {
  const velocity = velocityEntries(['1.1.9', '3.4.0', '3.4.0-SNAPSHOT', '4.2.0', '4.2.1-SNAPSHOT', '2.0.0-SNAPSHOT'])
  assert.deepEqual(velocity.map((e) => [e.version, e.badge]), [['4.2.1-SNAPSHOT', 'snapshot'], ['4.2.0', 'latest'], ['3.4.0', undefined], ['1.1.9', undefined]])
  const bungee = bungeeEntries(['1.21-R0.4', '1.21-R0.3'], ['1.21-R0.5-SNAPSHOT', '26.1-R0.1-SNAPSHOT'])
  assert.deepEqual(bungee.map((e) => e.version), ['26.1-R0.1-SNAPSHOT', '1.21-R0.4', '1.21-R0.3'])
  assert.deepEqual(gradleReleases([
    { version: '9.8.0-rc-1', rcFor: '9.8.0' }, { version: '9.7.1' }, { version: '9.7.0', broken: true }, { version: '8.14.5' }, { version: '9.8.0-20260901', nightly: true },
  ]), ['9.7.1', '8.14.5'])
  assert.deepEqual(supportedReleases(['26.3', '1.21.11', '1.21.5', '1.20.1'], ['1.20.1', '1.21.5-no-moonrise', '26.3', '1.21.11'], (mc) => mc !== '1.21.11'), ['26.3', '1.20.1'])
})

/* ------------------------------------------------------------------ *
 * The cache
 * ------------------------------------------------------------------ */

await test('catalogue cache: fresh, stale, offline fallbacks, refresh report', async () => {
  const memory = new Map<string, unknown>()
  const store = { get: <T>(key: string, fallback: T) => (memory.has(key) ? memory.get(key) as T : fallback), set: (key: string, value: unknown) => void memory.set(key, value) }
  let now = 1_000_000
  let calls = 0
  let online = true
  const net: Net = {
    async fetchText() {
      calls++
      if (!online) throw new Error('down')
      return '<version>4.2.0</version>'
    },
    async fetchJson() {
      calls++
      throw new Error('down')
    },
  }
  const catalog = new Catalog(net, store, { ttlHours: () => 1, now: () => now })
  assert.equal((await catalog.velocity())[0].version, '4.2.0')
  await catalog.velocity()
  assert.equal(calls, 1, 'a fresh entry is used without fetching')
  now += 2 * 3_600_000
  online = false
  assert.equal((await catalog.velocity())[0].version, '4.2.0', 'a stale entry serves while offline')
  assert.equal(calls, 2)
  const games = await catalog.games()
  assert.ok(games.releases.includes('1.7.10'), 'no entry, no network: the built-in defaults')
  const yarn = catalog.yarn('1.21.1')
  await assert.rejects(yarn, 'without any fallback the error surfaces')
  const failed = await catalog.refresh()
  assert.ok(failed.some((f) => f.startsWith('Velocity')), failed.join(', '))
  catalog.clear()
  assert.equal(store.get('v2:velocity', 'gone'), null)
})

/* ------------------------------------------------------------------ *
 * Messages
 * ------------------------------------------------------------------ */

await test('messages: every language has every key', () => {
  const english = Object.keys(MESSAGES.en).sort()
  for (const [language, table] of Object.entries(MESSAGES)) {
    assert.deepEqual(Object.keys(table).sort(), english, language)
    for (const [key, text] of Object.entries(table)) {
      const wanted = [...MESSAGES.en[key].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
      const found = [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
      assert.deepEqual(found, wanted, `${language}.${key} placeholders`)
    }
  }
  assert.deepEqual(Object.keys(MESSAGES).sort(), ['de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt'])
})

// Run from the repository root (check:extensions) or from the extension's own folder (test:extensions).
const ROOT = fs.existsSync(path.join(process.cwd(), 'renderer.ts')) ? process.cwd() : path.join(process.cwd(), 'extensions', 'minecraft')
const sources = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const full = path.join(dir, entry.name)
  if (entry.isDirectory()) return sources(full)
  return entry.name.endsWith('.ts') ? [full] : []
})
const CODE = [path.join(ROOT, 'renderer.ts'), ...sources(path.join(ROOT, 'src'))]

await test('messages: every key the code uses exists', () => {
  const keys = new Set(Object.keys(MESSAGES.en))
  const dynamic = [
    ...['latest', 'recommended', 'beta', 'alpha', 'snapshot', 'experimental', 'range', 'pinned'].map((b) => `badge.${b}`),
    ...['fabric', 'quilt', 'neoforge', 'forge', 'architectury', 'spigot', 'paper', 'folia', 'purpur', 'leaf'].map((p) => `hint.mc.${p}`),
    ...TEMPLATES.flatMap((tpl) => [`template.${tpl.id.replace('minecraft-', '')}.name`, `template.${tpl.id.replace('minecraft-', '')}.description`]),
  ]
  const used = new Set(dynamic)
  for (const file of CODE) {
    const text = fs.readFileSync(file, 'utf8')
    for (const match of text.matchAll(/\bt\(\s*'([a-zA-Z.]+)'/g)) used.add(match[1])
    for (const match of text.matchAll(/'((?:next|option)\.[a-zA-Z]+)'/g)) used.add(match[1])
  }
  const missing = [...used].filter((key) => !keys.has(key))
  assert.deepEqual(missing, [])
})

await test('code style: no else, no import of the app at runtime', () => {
  for (const file of CODE) {
    const text = fs.readFileSync(file, 'utf8')
    const code = text.replace(/`(?:\\.|[^`\\])*`/g, '``').replace(/'(?:\\.|[^'\\])*'/g, "''").replace(/\/\/.*$/gm, '')
    assert.ok(!/\belse\b/.test(code), `else in ${path.relative(ROOT, file)}`)
    for (const match of text.matchAll(/^import (?!type)[^\n]*from '([^']+)'/gm)) {
      const target = path.resolve(path.dirname(file), match[1])
      assert.ok(!match[1].startsWith('@/') && target.startsWith(ROOT), `${path.relative(ROOT, file)} imports the app: ${match[1]}`)
    }
  }
})

/* ------------------------------------------------------------------ *
 * Templates, offline from the defaults
 * ------------------------------------------------------------------ */

await test('templates: category, keywords, a kind each', () => {
  assert.equal(TEMPLATES.length, 12)
  for (const tpl of TEMPLATES) {
    assert.equal(tpl.category, 'Minecraft')
    assert.ok(tpl.keywords?.includes('minecraft'))
    assert.ok(tpl.name && !tpl.name.startsWith('template.'), tpl.id)
    assert.ok(tpl.fields?.some((f) => f.id === 'mc' || f.id === 'apiVersion'), tpl.id)
  }
})

await test('Fabric 1.21.1 (Kotlin DSL): remapping Loom, Mojang mappings, Fabric API', async () => {
  const { files, values } = await generate(template('minecraft-fabric'), 'Test Mod', { mc: '1.21.1', build: 'gradle-kts', accessWidener: 'true', datagen: 'true' })
  const build = files['build.gradle.kts']
  assert.match(build, /id\("net\.fabricmc\.fabric-loom-remap"\) version "\d/)
  assert.match(build, /mappings\(loom\.officialMojangMappings\(\)\)/)
  assert.match(build, /modImplementation\("net\.fabricmc\.fabric-api:fabric-api:/)
  assert.match(build, /options\.release = 21/)
  assert.equal(values.java, '21')
  assert.equal(values.gradleVersion, '9.7.1')
  assert.ok(values.fabricApiVersion.endsWith('+1.21.1'), values.fabricApiVersion)
  const json = JSON.parse(files['src/main/resources/fabric.mod.json'])
  assert.equal(json.depends['fabric-api'], '*')
  assert.equal(json.depends.minecraft, '~1.21.1')
  assert.equal(json.accessWidener, 'test_mod.accesswidener')
  assert.ok(files['src/client/java/com/example/testmod/client/TestModClient.java'])
  assert.ok(files['src/client/java/com/example/testmod/datagen/ModDataGenerator.java'])
  assert.match(files['src/main/java/com/example/testmod/TestMod.java'], /LoggerFactory/)
  assert.match(files['gradle/wrapper/gradle-wrapper.properties'], /gradle-9\.7\.1-bin\.zip/)
  assert.match(files['settings.gradle.kts'], /foojay-resolver-convention"\) version "1\.0\.0"/)
})

await test('Fabric 26.2: no remapping, no mappings, class tweaker', async () => {
  const { files } = await generate(template('minecraft-fabric'), 'Test Mod', { mc: '26.2', build: 'gradle-groovy', accessWidener: 'true' })
  const build = files['build.gradle']
  assert.match(build, /id 'net\.fabricmc\.fabric-loom' version/)
  assert.ok(!/mappings /.test(build))
  assert.match(build, /implementation "net\.fabricmc:fabric-loader/)
  assert.ok(!/modImplementation/.test(build))
  assert.match(build, /JavaLanguageVersion\.of\(25\)/)
  assert.match(files['src/main/resources/test_mod.classtweaker'], /^classTweaker v1 official/)
})

await test('Fabric 1.16.5: log4j, no split sources, the old API mod id', async () => {
  const { files, values } = await generate(template('minecraft-fabric'), 'Old Mod', { mc: '1.16.5' })
  assert.equal(values.java, '8')
  assert.match(files['src/main/java/com/example/oldmod/OldMod.java'], /LogManager\.getLogger/)
  assert.ok(!Object.keys(files).some((f) => f.startsWith('src/client/')))
  assert.equal(JSON.parse(files['src/main/resources/fabric.mod.json']).depends.fabric, '*')
  assert.ok(!files['src/main/java/com/example/oldmod/command/HelloCommand.java'], 'the /hello example needs 1.20')
  assert.match(files['build.gradle.kts'], /JavaLanguageVersion\.of\(21\)/)
  assert.match(files['build.gradle.kts'], /options\.release = 8/)
})

await test('NeoForge 1.21.1: MDG, neoforge.mods.toml, ModContainer, client class', async () => {
  const { files, values } = await generate(template('minecraft-neoforge'), 'Neo Mod', { mc: '1.21.1', datagen: 'true' })
  assert.ok(values.neoVersion.startsWith('21.1.'), values.neoVersion)
  assert.match(files['build.gradle.kts'], /id\("net\.neoforged\.moddev"\) version "2\./)
  assert.match(files['build.gradle.kts'], /\n {12}data\(\)/)
  assert.ok(files['src/main/resources/META-INF/neoforge.mods.toml'])
  assert.match(files['src/main/java/com/example/neomod/NeoMod.java'], /IEventBus modEventBus, ModContainer modContainer/)
  assert.ok(files['src/main/java/com/example/neomod/client/NeoModClient.java'])
  assert.match(files['src/main/java/com/example/neomod/datagen/ModDataGenerator.java'], /GatherDataEvent event/)
})

await test('NeoForge 26.2 with Parchment off and data generation: clientData, GatherDataEvent.Client', async () => {
  const { files } = await generate(template('minecraft-neoforge'), 'Neo Mod', { mc: '26.2', datagen: 'true', build: 'gradle-groovy' })
  assert.match(files['build.gradle'], /clientData\(\)/)
  assert.match(files['src/main/java/com/example/neomod/datagen/ModDataGenerator.java'], /GatherDataEvent\.Client/)
})

await test('NeoForge 1.20.1: ModDevGradle Legacy with net.neoforged:forge', async () => {
  const { files, values } = await generate(template('minecraft-neoforge'), 'Legacy Mod', { mc: '1.20.1', build: 'gradle-groovy' })
  assert.ok(values.neoVersion.startsWith('1.20.1-47.1.'), values.neoVersion)
  assert.match(files['build.gradle'], /id 'net\.neoforged\.moddev\.legacyforge'/)
  assert.match(files['build.gradle'], /legacyForge \{\n {4}enable \{\n {8}neoForgeVersion = project\.neo_version/)
  const toml = files['src/main/resources/META-INF/mods.toml']
  assert.match(toml, /modId = "forge"\nmandatory = true/)
  assert.match(files['src/main/java/com/example/legacymod/LegacyMod.java'], /net\.minecraftforge\.fml\.common\.Mod/)
  assert.equal(values.java, '17')
})

await test('NeoForge 1.20.4: mods.toml and the IEventBus constructor', async () => {
  const { files } = await generate(template('minecraft-neoforge'), 'Mod', { mc: '1.20.4' })
  assert.ok(files['src/main/resources/META-INF/mods.toml'])
  assert.match(files['src/main/java/com/example/mod/Mod.java'], /public Mod\(IEventBus modEventBus\)/)
})

await test('Forge 1.20.1: ForgeGradle 6 with reobfuscation, Gradle 8', async () => {
  const { files, values } = await generate(template('minecraft-forge'), 'Forge Mod', { mc: '1.20.1' })
  assert.equal(values.forgeVersion, '47.4.10', 'the recommended build')
  assert.equal(values.gradleVersion, '8.14.5')
  assert.equal(files['gradle/gradle-daemon-jvm.properties'], 'toolchainVersion=21\n')
  assert.match(files['gradle/wrapper-setup/build.gradle'], /gradleVersion = '8\.14\.5'/)
  assert.match(files['build.gradle'], /net\.minecraftforge\.gradle' version '\[6\.0,6\.2\)'/)
  assert.match(files['build.gradle'], /finalizedBy 'reobfJar'/)
  assert.match(files['settings.gradle'], /foojay-resolver-convention' version '0\.10\.0'/)
  assert.match(files['settings.gradle'], /maven\.minecraftforge\.net/)
  assert.deepEqual(JSON.parse(files['src/main/resources/pack.mcmeta']).pack.pack_format, 15)
  const main = files['src/main/java/com/example/forgemod/ForgeMod.java']
  assert.match(main, /FMLJavaModLoadingContext\.get\(\)\.getModEventBus\(\)/)
  assert.match(main, /net\.minecraftforge\.event\.server\.ServerStartingEvent/)
  assert.match(files['src/main/resources/META-INF/mods.toml'], /loaderVersion = "\[47,\)"/)
})

await test('Forge 1.7.10 and 1.12.2: RetroFuturaGradle with the pinned build', async () => {
  const old = await generate(template('minecraft-forge'), 'Old Forge', { mc: '1.7.10' })
  assert.equal(old.values.forgeVersion, '10.13.4.1614')
  assert.match(old.files['build.gradle'], /com\.gtnewhorizons\.retrofuturagradle/)
  assert.match(old.files['build.gradle'], /mcVersion = '1\.7\.10'/)
  assert.match(old.files['src/main/java/com/example/oldforge/OldForge.java'], /cpw\.mods\.fml\.common\.Mod/)
  assert.ok(old.files['src/main/resources/mcmod.info'])
  assert.ok(!('item' in old.values) || old.values.item === 'true', 'hidden, harmless')
  const twelve = await generate(template('minecraft-forge'), 'Twelve', { mc: '1.12.2' })
  assert.match(twelve.files['src/main/java/com/example/twelve/Twelve.java'], /net\.minecraftforge\.fml\.common\.Mod/)
  assert.equal(twelve.values.forgeVersion, '14.23.5.2847')
})

await test('Forge 1.18.1 and 1.17.1: ModDevGradle Legacy', async () => {
  const { files, values } = await generate(template('minecraft-forge'), 'Mid Forge', { mc: '1.18.1' })
  assert.match(files['build.gradle'], /id 'net\.neoforged\.moddev\.legacyforge' version '2\./)
  assert.match(files['build.gradle'], /version = project\.minecraft_version \+ '-' \+ project\.forge_version/)
  assert.equal(JSON.parse(files['src/main/resources/pack.mcmeta']).pack.pack_format, 8)
  assert.match(files['src/main/java/com/example/midforge/MidForge.java'], /LogManager/)
  assert.ok(values.forgeVersion.startsWith('39.'), values.forgeVersion)
  const seventeen = await generate(template('minecraft-forge'), 'Seventeen', { mc: '1.17.1' })
  assert.equal(seventeen.values.java, '16')
  assert.match(seventeen.files['src/main/java/com/example/seventeen/Seventeen.java'], /net\.minecraftforge\.event\.server\.ServerStartingEvent/)
})

await test('Gradle setup: the wrapper and the daemon JDK from a build of their own', async () => {
  const { files, ctx } = await generate(template('minecraft-fabric'), 'Setup', { mc: '1.21.1' })
  assert.equal(files['gradle/gradle-daemon-jvm.properties'], 'toolchainVersion=25\n', 'Fabric Loom 1.18 runs on 25')
  assert.match(files['gradle/wrapper-setup/settings.gradle'], /foojay-resolver-convention/)
  assert.match(files['gradle/wrapper-setup/build.gradle'], /scriptFile = file\('\.\.\/\.\.\/gradlew'\)/)
  const [setup] = template('minecraft-fabric').setup!(ctx)
  assert.deepEqual(setup.args, ['--console=plain', '-p', 'gradle/wrapper-setup', 'wrapper', 'updateDaemonJvm'])
  const maven = await generate(template('minecraft-spigot'), 'Maven', { mc: '1.21.1', build: 'maven' })
  assert.ok(!maven.files['gradle/wrapper-setup/build.gradle'])
  assert.equal(template('minecraft-spigot').setup!(maven.ctx)[0].command, 'mvn')
})

await test('Forge 1.21.6 and 26.3: EventBus 7 with the validator', async () => {
  const six = await generate(template('minecraft-forge'), 'Six', { mc: '1.21.6' })
  assert.match(six.files['build.gradle'], /reobf = false/)
  assert.match(six.files['build.gradle'], /eventbus-validator/)
  assert.ok(!six.files['src/main/java/com/example/six/command/HelloCommand.java'], 'no game-bus examples before 1.21.9')
  assert.match(six.files['src/main/java/com/example/six/Six.java'], /getModBusGroup/)
  const late = await generate(template('minecraft-forge'), 'Late', { mc: '26.3' })
  assert.match(late.files['build.gradle'], /\[7\.0\.17,8\)/)
  assert.ok(!/mappings channel/.test(late.files['build.gradle']))
  assert.match(late.files['src/main/java/com/example/late/Late.java'], /ServerStartingEvent\.BUS/)
})

await test('Forge: versions without a working toolchain are not offered', async () => {
  const { choices } = await fill(template('minecraft-forge'), 'X')
  const offered = choices.mc.map((c) => c.value)
  for (const mc of ['1.7.10', '1.12.2', '1.16.5', '1.20.1', '1.21.1', '26.3']) assert.ok(offered.includes(mc), mc)
  for (const mc of ['1.8.9', '1.16.4']) assert.ok(!offered.includes(mc), mc)
  for (const mc of ['1.17.1', '1.18.1', '1.19.3']) assert.ok(offered.includes(mc), mc)
})

await test('Paper 26.2: the latest-build range first, Gradle and Maven forms', async () => {
  const gradle = await generate(template('minecraft-paper'), 'Paper Plugin', { mc: '26.2', build: 'gradle-kts' })
  assert.equal(gradle.values.apiVersion, '[26.2.build,26.2.1)')
  assert.equal(gradle.choices.apiVersion[0].value, '[26.2.build,26.2.1)')
  assert.ok(gradle.choices.apiVersion.slice(1).every((c) => /^26\.2\.build\.\d+-/.test(c.value)))
  assert.match(gradle.files['build.gradle.kts'], /compileOnly\("io\.papermc\.paper:paper-api:26\.2\.build\.\+"\)/)
  assert.ok(gradle.files['src/main/resources/paper-plugin.yml'])
  assert.match(gradle.files['README.md'], /26\.2\.build,26\.2\.1/)
  const maven = await generate(template('minecraft-paper'), 'Paper Plugin', { mc: '26.2', build: 'maven' })
  assert.match(maven.files['pom.xml'], /<version>\[26\.2\.build,26\.2\.1\)<\/version>/)
})

await test('Paper 1.16.5 and 1.21.11: old group, classic commands, api-version', async () => {
  const old = await generate(template('minecraft-paper'), 'Old', { mc: '1.16.5' })
  assert.match(old.files['build.gradle.kts'], /com\.destroystokyo\.paper:paper-api:1\.16\.5-R0\.1-SNAPSHOT/)
  const yml = old.files['src/main/resources/plugin.yml']
  assert.match(yml, /api-version: '1\.16'/)
  assert.match(yml, /commands:/)
  const modern = await generate(template('minecraft-paper'), 'New', { mc: '1.21.11' })
  assert.match(modern.files['build.gradle.kts'], /paper-api:1\.21\.11-R0\.1-SNAPSHOT/)
  assert.match(modern.files['src/main/java/com/example/newplugin/command/HelloCommand.java'] ?? modern.files['src/main/java/com/example/new/command/HelloCommand.java'] ?? '', /LiteralCommandNode/)
})

await test('Spigot 1.8.8: no api-version, Java 8', async () => {
  const { files, values } = await generate(template('minecraft-spigot'), 'Legacy', { mc: '1.8.8' })
  assert.equal(values.java, '8')
  assert.ok(!/api-version/.test(files['src/main/resources/plugin.yml']))
  assert.match(files['build.gradle.kts'], /org\.spigotmc:spigot-api:1\.8\.8-R0\.1-SNAPSHOT/)
})

await test('Folia: folia-supported, no test server', async () => {
  const { files } = await generate(template('minecraft-folia'), 'Region', { mc: '1.21.11', manifest: 'bukkit' })
  assert.match(files['src/main/resources/plugin.yml'], /folia-supported: true/)
  assert.ok(!/run-paper/.test(files['build.gradle.kts']))
})

await test('Velocity and BungeeCord from the defaults', async () => {
  const velocity = await generate(template('minecraft-velocity'), 'Proxy', { apiVersion: '4.2.0' })
  assert.equal(velocity.values.java, '25')
  assert.match(velocity.files['build.gradle.kts'], /annotationProcessor\("com\.velocitypowered:velocity-api:4\.2\.0"\)/)
  const bungee = await generate(template('minecraft-bungeecord'), 'Bungee', { build: 'maven' })
  assert.match(bungee.files['pom.xml'], /bungeecord-api/)
})

await test('Architectury: loaders per version from the generator table', async () => {
  const modern = await generate(template('minecraft-architectury'), 'Multi', { mc: '1.21.1' })
  assert.ok(modern.files['neoforge/build.gradle'] && !modern.files['forge/build.gradle'])
  assert.match(modern.files['gradle.properties'], /enabled_platforms=fabric,neoforge/)
  assert.ok(modern.values.architecturyApiVersion.startsWith('13.'), modern.values.architecturyApiVersion)
  const forge = await generate(template('minecraft-architectury'), 'Multi', { mc: '1.20.1' })
  assert.ok(forge.files['forge/build.gradle'] && !forge.files['neoforge/build.gradle'])
  assert.match(forge.files['forge/src/main/resources/META-INF/mods.toml'], /loaderVersion = "\[47,\)"/)
  const old = await generate(template('minecraft-architectury'), 'Multi', { mc: '1.16.5' })
  assert.match(old.files['common/build.gradle'], /me\.shedaniel:architectury:/)
  assert.match(old.files['common/src/main/java/com/example/multi/Multi.java'], /LogManager/)
  const unobf = await generate(template('minecraft-architectury'), 'Multi', { mc: '26.2' })
  assert.match(unobf.files['build.gradle'], /dev\.architectury\.loom-no-remap/)
})

await test('Quilt 1.20.1: offline without QFAPI falls back to the Fabric API', async () => {
  const { files, values } = await generate(template('minecraft-quilt'), 'Quilted', { mc: '1.20.1' })
  assert.equal(splitQuiltApi(values.apiVersion).kind, 'fabric')
  assert.match(files['build.gradle.kts'], /org\.quiltmc\.loom/)
  assert.match(files['build.gradle.kts'], /fabric-api:/)
  const { choices } = await fill(template('minecraft-quilt'), 'Q')
  assert.ok(!choices.mc.some((c) => c.value.startsWith('26.')))
})

await test('translations: German template names and badges', async () => {
  setLumen(fakeLumen({ net: offlineNet, language: 'de' }))
  assert.equal(template('minecraft-fabric').name, 'Fabric-Mod')
  const { choices } = await fill(template('minecraft-forge'), 'X', { mc: '1.20.1' })
  assert.ok(choices.forgeVersion.some((c) => c.badge === 'empfohlen'))
  setLumen(fakeLumen({ net: offlineNet }))
})

process.stdout.write(`\n${passed} passed, ${failures.length} failed\n`)
if (failures.length) process.exit(1)
