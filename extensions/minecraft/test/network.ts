/**
 * Live tests against the real version sources — run with `--network`:
 *
 *   node extensions/minecraft/test.mjs --network
 *
 * They check that the sources still answer in the shape the parsers expect
 * and that the lists agree with what is known to exist.
 */

import assert from 'node:assert/strict'
import process from 'node:process'
import { FABRIC_GRADLE, NEOFORGE_GRADLE, PLUGIN_GRADLE, forgeToolchain, isBuildVersion } from '../src/eras'
import { setLumen, useStore, versions } from '../src/lumen'
import { apiVersionsFor, forgeFor, neoforgeFor } from '../src/sources'
import { TEMPLATES } from '../src/templates'
import { minecraftVersions } from '../src/templates/versions'
import { fakeLumen } from './fake-lumen'
import { fill } from './form'

let passed = 0
const failures: string[] = []

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    passed++
    process.stdout.write(`✓ [network] ${name}\n`)
  } catch (err) {
    failures.push(name)
    process.stdout.write(`✗ [network] ${name}\n  ${(err as Error).stack ?? err}\n`)
  }
}

setLumen(fakeLumen())
useStore(null)
const catalog = versions()

await test('Mojang: every release from 1.7.10 to the newest', async () => {
  const { releases } = await catalog.games(true)
  assert.equal(releases.at(-1), '1.7.10')
  for (const mc of ['1.8.9', '1.12.2', '1.16.5', '1.20.1', '1.21.1', '1.21.11', '26.1', '26.2']) assert.ok(releases.includes(mc), mc)
  assert.ok(!releases.includes('1.7.2'))
})

await test('Fabric: games from 1.14.4, loaders, Fabric API via Modrinth, Loom', async () => {
  const { releases } = await minecraftVersions('fabric')
  assert.equal(releases.at(-1), '1.14.4')
  assert.ok(releases.includes('26.2') && releases.includes('1.21.1'))
  const loaders = await catalog.fabricLoaders(true)
  assert.ok(loaders.some((l) => l.badge === 'latest'))
  const api = await catalog.fabricApi('1.21.1')
  assert.ok(api.length > 5 && api.every((e) => e.version.endsWith('+1.21.1')), api.slice(0, 3).map((e) => e.version).join())
  const old = await catalog.fabricApi('1.16.5')
  assert.ok(old.some((e) => e.version === '0.42.0+1.16'))
  const loom = await catalog.loom('net.fabricmc.fabric-loom-remap')
  assert.ok(loom.length && /^1\.\d+\.\d+$/.test(loom[0].version), loom[0]?.version)
  assert.ok((await catalog.loom('net.fabricmc.fabric-loom')).length)
  const yarn = await catalog.yarn('1.21.1')
  assert.ok(yarn[0].version.startsWith('1.21.1+build.'))
})

await test('NeoForge: 1.20.1 is net.neoforged:forge 47.1.x, 1.21.1 is 21.1.x, 26.2 is 26.2.0.x', async () => {
  const { all, legacy } = await catalog.neoforgeLists(true)
  const fork = neoforgeFor(all, legacy, '1.20.1')
  assert.ok(fork.length && fork.every((e) => e.version.startsWith('1.20.1-47.1.')), fork[0]?.version)
  const one = neoforgeFor(all, legacy, '1.21.1')
  assert.ok(one.length > 100 && one.every((e) => e.version.startsWith('21.1.')), one[0]?.version)
  assert.equal(one.find((e) => e.badge === 'latest')?.version.split('.').length, 3)
  const twentySix = neoforgeFor(all, legacy, '26.2')
  assert.ok(twentySix.length && twentySix.every((e) => e.version.startsWith('26.2.0.')))
  const { releases } = await minecraftVersions('neoforge')
  assert.ok(releases.includes('1.20.1') && releases.includes('1.20.4') && !releases.includes('1.20.2') && !releases.includes('1.20.3'))
  assert.ok((await catalog.moddev()).length)
  assert.ok((await catalog.parchment('1.21.1')).length)
})

await test('Forge: 1.7.10 exists, promotions badge the builds, unsupported eras are left out', async () => {
  const { all, promos } = await catalog.forgeLists(true)
  const old = forgeFor(all, promos, '1.7.10')
  assert.ok(old.some((e) => e.version === '10.13.4.1614'))
  const twenty = forgeFor(all, promos, '1.20.1')
  assert.ok(twenty.some((e) => e.badge === 'recommended') && twenty.some((e) => e.badge === 'latest'))
  const { releases } = await minecraftVersions('forge')
  assert.ok(releases.includes('1.7.10') && releases.includes('1.12.2') && releases.includes('1.20.1'))
  assert.ok(releases.every((mc) => forgeToolchain(mc)))
  assert.ok(!releases.includes('1.8.9') && releases.includes('1.17.1'))
  assert.ok((await catalog.eventbusValidator()).length)
  assert.ok((await catalog.rfg()).length)
})

await test('Paper: 26.x builds follow the new scheme, older versions -R0.1-SNAPSHOT', async () => {
  const all = await catalog.serverApiList('paper', true)
  const twentySix = apiVersionsFor(all, '26.2')
  assert.ok(twentySix.length && twentySix.every((e) => isBuildVersion(e.version) && e.version.startsWith('26.2.build.')))
  assert.deepEqual(apiVersionsFor(all, '1.21.11').map((e) => e.version), ['1.21.11-R0.1-SNAPSHOT'])
  const { releases } = await minecraftVersions('paper')
  assert.equal(releases.at(-1), '1.16.5')
  const form = await fill(TEMPLATES.find((tpl) => tpl.id === 'minecraft-paper')!, 'P', { mc: '26.2' })
  assert.equal(form.values.apiVersion, '[26.2.build,26.2.1)')
})

await test('Spigot, Folia, Purpur, Leaf, Velocity, BungeeCord', async () => {
  const spigot = await minecraftVersions('spigot')
  assert.ok(spigot.releases.includes('1.8.8') && spigot.releases.includes('26.2'))
  assert.ok((await minecraftVersions('folia')).releases.includes('1.21.11'))
  const purpur = await minecraftVersions('purpur')
  assert.ok(purpur.releases.includes('1.21.1') && purpur.releases.includes('26.2'))
  assert.ok((await minecraftVersions('leaf')).releases.includes('1.21.8'))
  const velocity = await catalog.velocity(true)
  assert.ok(velocity.some((e) => e.version === '3.4.0') && velocity.some((e) => e.badge === 'latest'))
  const bungee = await catalog.bungee(true)
  assert.ok(bungee.some((e) => e.version === '1.21-R0.4'))
})

await test('Architectury: the generator table and API majors', async () => {
  const table = await catalog.architecturyGames(true)
  assert.ok(table.versions.some((g) => g.version === '1.21.1' && g.neoforge))
  const api = await catalog.architecturyApi(false)
  assert.ok(api.some((v) => v.startsWith('13.')))
  assert.ok((await catalog.architecturyApi(true)).some((v) => v.startsWith('1.')))
  assert.ok((await catalog.architecturyLoom(false)).length && (await catalog.architecturyLoom(true)).length)
  assert.ok((await catalog.architecturyPlugin()).length)
})

await test('Quilt: games, loaders, QFAPI for 1.20.1', async () => {
  const { releases } = await minecraftVersions('quilt')
  assert.ok(releases.includes('1.20.1') && !releases.some((mc) => mc.startsWith('26.')))
  assert.ok((await catalog.quiltLoaders()).some((l) => l.badge === 'latest'))
  assert.ok((await catalog.qfapi('1.20.1')).length)
  assert.ok((await catalog.quiltLoom()).length)
})

await test('Gradle: every recommended toolchain version is a real release', async () => {
  const releases = await catalog.gradleReleases(true)
  const wanted = new Set([FABRIC_GRADLE, NEOFORGE_GRADLE, PLUGIN_GRADLE, '9.5.1', '9.5.0', '9.3.1', '9.2.1', '8.12.1', '8.8', '8.7', '8.4'])
  for (const version of wanted) assert.ok(releases.includes(version), version)
})

process.stdout.write(`\n${passed} passed, ${failures.length} failed (network)\n`)
if (failures.length) process.exit(1)
