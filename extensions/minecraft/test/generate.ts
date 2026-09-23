/**
 * Generates real projects from the templates with live versions, for building
 * them with Gradle or Maven:
 *
 *   node extensions/minecraft/tools/run.mjs test/generate.ts <out-dir> [spec …]
 *
 * Without specs every one below is written. Each lands in `<out-dir>/<spec>`.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import type { FormValues } from '../../../src/core/types'
import { setLumen, useStore } from '../src/lumen'
import { TEMPLATES } from '../src/templates'
import { fakeLumen, offlineNet } from './fake-lumen'
import { generate } from './form'

export const SPECS: Record<string, { template: string; name: string; values: FormValues }> = {
  'fabric-1.21.1': { template: 'minecraft-fabric', name: 'Fabric Test', values: { mc: '1.21.1', build: 'gradle-kts', accessWidener: 'true', datagen: 'true' } },
  'fabric-26.2': { template: 'minecraft-fabric', name: 'Fabric New', values: { mc: '26.2', build: 'gradle-groovy' } },
  'fabric-1.16.5': { template: 'minecraft-fabric', name: 'Fabric Old', values: { mc: '1.16.5' } },
  'neoforge-1.21.1': { template: 'minecraft-neoforge', name: 'Neo Test', values: { mc: '1.21.1', build: 'gradle-kts', mixins: 'true', datagen: 'true' } },
  'neoforge-1.20.1': { template: 'minecraft-neoforge', name: 'Neo Legacy', values: { mc: '1.20.1', build: 'gradle-groovy' } },
  'neoforge-26.2': { template: 'minecraft-neoforge', name: 'Neo New', values: { mc: '26.2', build: 'gradle-groovy', datagen: 'true' } },
  'forge-1.20.1': { template: 'minecraft-forge', name: 'Forge Test', values: { mc: '1.20.1' } },
  'forge-1.21.11': { template: 'minecraft-forge', name: 'Forge New', values: { mc: '1.21.11' } },
  'forge-1.18.1': { template: 'minecraft-forge', name: 'Forge Mid', values: { mc: '1.18.1' } },
  'forge-1.7.10': { template: 'minecraft-forge', name: 'Forge Old', values: { mc: '1.7.10' } },
  'paper-26.2-gradle': { template: 'minecraft-paper', name: 'Paper Test', values: { mc: '26.2', build: 'gradle-kts' } },
  'paper-26.2-maven': { template: 'minecraft-paper', name: 'Paper Maven', values: { mc: '26.2', build: 'maven' } },
  'paper-1.20.4': { template: 'minecraft-paper', name: 'Paper Old', values: { mc: '1.20.4', build: 'gradle-groovy' } },
  'spigot-1.8.8': { template: 'minecraft-spigot', name: 'Spigot Old', values: { mc: '1.8.8', build: 'maven' } },
  'velocity': { template: 'minecraft-velocity', name: 'Velocity Test', values: { build: 'gradle-kts' } },
  'bungeecord': { template: 'minecraft-bungeecord', name: 'Bungee Test', values: { build: 'gradle-groovy' } },
  'architectury-1.21.1': { template: 'minecraft-architectury', name: 'Arch Test', values: { mc: '1.21.1' } },
  'quilt-1.20.1': { template: 'minecraft-quilt', name: 'Quilt Test', values: { mc: '1.20.1' } },
}

const [out, ...wanted] = process.argv.slice(2)
if (!out) {
  process.stderr.write('usage: generate.ts <out-dir> [spec …]\n')
  process.exit(2)
}
setLumen(fakeLumen({ net: process.env.MC_OFFLINE ? offlineNet : undefined }))
useStore(null)

for (const key of wanted.length ? wanted : Object.keys(SPECS)) {
  const spec = SPECS[key]
  if (!spec) throw new Error(`unknown spec ${key}`)
  const template = TEMPLATES.find((tpl) => tpl.id === spec.template)!
  const dir = path.resolve(out, key)
  const { files, values } = await generate(template, spec.name, spec.values, dir)
  await fs.rm(dir, { recursive: true, force: true })
  for (const [file, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true })
    await fs.writeFile(path.join(dir, file), content)
  }
  const shown = Object.entries(values)
    .filter(([id]) => /version|mc|java|build|Version/.test(id) && !['version'].includes(id))
    .map(([id, value]) => `${id}=${value}`)
    .join(' ')
  process.stdout.write(`${key}: ${Object.keys(files).length} files — ${shown}\n`)
}
