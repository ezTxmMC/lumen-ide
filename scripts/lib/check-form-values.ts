/**
 * Tests for the pure side of forms and the project page, run by
 * check-project: resolving values with computed and fetched choices, the order
 * in which dependent fields settle, aborting overtaken loads, the template
 * catalogue (categories, search, recent) and a template with fetched choices
 * and asynchronous files, created for real.
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { ChoiceLoader, fieldChoices, filterChoices, groupChoices, type LoadedChoices } from '@/core/project/choices'
import { resolveValues, scaffoldProject, validateValues } from '@/core/project/scaffold'
import {
  ALL_CATEGORY, RECENT_CATEGORY, fileTree, filterTemplates, gridStep, knownRecent, rememberRecent, templateCategories,
} from '@/core/project/catalog'
import type { FieldChoice, FormField, FormValues, LanguageSpec, ProjectTemplate } from '@/core/types'

type Ok = (cond: boolean, label: string, quiet?: boolean) => void

const BASE = { name: 'Probe', slug: 'probe' }

/** Resolve, load, resolve again — until nothing loads any more. What the page does over several renders. */
export async function settle(fields: FormField[], touched: FormValues, loader = new ChoiceLoader()) {
  let values = resolveValues(fields, BASE, touched, loader.snapshot())
  for (let round = 0; round < 12; round++) {
    loader.sync(fields, values)
    await loader.idle()
    const next = resolveValues(fields, BASE, touched, loader.snapshot())
    const busy = Object.values(loader.snapshot()).some((state) => state.status === 'loading')
    const same = JSON.stringify(next) === JSON.stringify(values)
    values = next
    if (same && !busy) break
  }
  return { values, loaded: loader.snapshot(), loader }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Minecraft-like versions: 120 releases and snapshots, newest first, the newest release marked. */
function gameVersions(): FieldChoice[] {
  const releases = Array.from({ length: 60 }, (_, i) => `1.${21 - Math.floor(i / 10)}.${9 - (i % 10)}`)
  const snapshots = Array.from({ length: 60 }, (_, i) => `25w${String(40 - i).padStart(2, '0')}a`)
  return [
    ...releases.map((value, i) => ({ value, label: value, group: 'Releases', ...(i === 0 ? { badge: 'latest' } : {}) })),
    ...snapshots.map((value) => ({ value, label: value, group: 'Snapshots' })),
  ]
}

export async function checkFormValues(ok: Ok, base: string) {
  console.log('\nForm values and fetched choices:')

  // Plain selects keep their behaviour; a value off the list falls back.
  const select: FormField = { id: 'build', label: 'Build', type: 'select', choices: [{ value: 'maven', label: 'Maven' }, { value: 'gradle', label: 'Gradle' }] }
  ok(resolveValues([select], {}).build === 'maven', 'select: first choice without a default')
  ok(resolveValues([select], {}, { build: 'gradle' }).build === 'gradle', 'select: typed value wins')
  ok(resolveValues([select], {}, { build: 'ant' }).build === 'maven', 'select: a value off the list falls back to the first choice')
  ok(resolveValues([{ ...select, default: 'gradle' }], {}, { build: 'ant' }).build === 'gradle', 'select: … or to the default when that is on the list')
  const text: FormField = { id: 'group', label: 'Group', default: (v) => `com.${v.slug}` }
  ok(resolveValues([text], BASE).group === 'com.probe', 'text: derived default')

  // choicesFor
  const flavour: FormField = {
    id: 'flavour', label: 'Flavour', type: 'combobox', dependsOn: ['build'],
    choicesFor: (v) => (v.build === 'gradle' ? [{ value: 'kts', label: 'Kotlin DSL' }, { value: 'groovy', label: 'Groovy' }] : [{ value: 'pom', label: 'POM' }]),
  }
  ok(resolveValues([select, flavour], {}).flavour === 'pom', 'choicesFor: computed from the other fields')
  ok(resolveValues([select, flavour], {}, { build: 'gradle', flavour: 'pom' }).flavour === 'kts', 'choicesFor: a stale value moves to the new list')
  ok(validateValues([{ ...flavour, choicesFor: () => [] }], {}).flavour !== undefined, 'combobox: empty and required is an error')

  // Groups, search
  const versions = gameVersions()
  const grouped = groupChoices(versions)
  ok(grouped.length === 2 && grouped[0].group === 'Releases' && grouped[1].choices.length === 60, 'groupChoices: headings in order of appearance')
  ok(filterChoices(versions, '1.20').every((c) => c.value.includes('1.20')) && filterChoices(versions, '1.20').length === 10, 'filterChoices: by value')
  ok(filterChoices(versions, 'snap 25w3').length === 10, 'filterChoices: every word, group included')
  ok(filterChoices(versions, 'latest').length === 1, 'filterChoices: by badge')

  // Three fetched fields in a chain: game version → loader version → API version.
  const calls: string[] = []
  const chain = (delays: { game?: number; loader?: number; api?: number } = {}): FormField[] => [
    {
      id: 'game', label: 'Game', type: 'combobox',
      default: (_v) => 'latest-release-not-in-list',
      loadChoices: async (_v, signal) => {
        calls.push('game')
        await sleep(delays.game ?? 5)
        if (signal.aborted) throw new Error('aborted')
        return versions
      },
    },
    {
      id: 'loader', label: 'Loader', type: 'combobox', dependsOn: ['game'],
      loadChoices: async (v, signal) => {
        calls.push(`loader(${v.game})`)
        await sleep(delays.loader ?? 5)
        if (signal.aborted) throw new Error('aborted')
        return [{ value: `${v.game}-loader-2`, label: 'v2', badge: 'recommended' }, { value: `${v.game}-loader-1`, label: 'v1' }]
      },
    },
    {
      id: 'api', label: 'API', type: 'select', dependsOn: ['loader'],
      default: (v) => `${v.loader}-api-b`,
      loadChoices: async (v) => {
        calls.push(`api(${v.loader})`)
        await sleep(delays.api ?? 5)
        return [{ value: `${v.loader}-api-a`, label: 'a' }, { value: `${v.loader}-api-b`, label: 'b' }]
      },
    },
  ]

  const fields = chain()
  const first = await settle(fields, {})
  ok(first.values.game === '1.21.9', `loadChoices: default not on the list → first choice (${first.values.game})`)
  ok(first.values.loader === '1.21.9-loader-2', `dependent field loads for the settled value (${first.values.loader})`)
  ok(first.values.api === '1.21.9-loader-2-api-b', `a function default on the list wins over the first choice (${first.values.api})`)
  ok(calls.join(' ') === 'game loader(1.21.9) api(1.21.9-loader-2)', `fields settle in order, one fetch each (${calls.join(' ')})`)
  ok(Object.keys(validateValues(fields, first.values, first.loaded)).length === 0, 'settled form validates')

  // The user picks another game version: loader and API reload, the old loader value is replaced.
  calls.length = 0
  const second = await settle(fields, { game: '1.20.5', loader: '1.21.9-loader-2' }, first.loader)
  ok(second.values.loader === '1.20.5-loader-2', `changed dependency: stale value replaced (${second.values.loader})`)
  ok(second.values.api === '1.20.5-loader-2-api-b', `…and the chain follows (${second.values.api})`)
  ok(calls.join(' ') === 'loader(1.20.5) api(1.20.5-loader-2)', `only the dependents reload (${calls.join(' ')})`)
  ok(fieldChoices(fields[1], second.values, second.loaded)[0].badge === 'recommended', 'badges pass through')

  // While a dependency loads, dependents wait and count as not ready.
  const waiting = new ChoiceLoader()
  const slow = chain({ game: 60 })
  const early = resolveValues(slow, BASE, {}, waiting.snapshot())
  waiting.sync(slow, early)
  const during: LoadedChoices = waiting.snapshot()
  ok(during.game?.status === 'loading' && during.loader?.status === 'loading' && during.loader.key === '', 'dependents wait (spinner) while their dependency loads')
  const blocked = validateValues(slow, resolveValues(slow, BASE, {}, during), during)
  ok(Boolean(blocked.game && blocked.loader), 'validate: fields still loading block submitting')
  ok(resolveValues(slow, BASE, { game: 'custom' }, during).game === 'custom', 'a list still loading leaves the value alone')
  await waiting.idle()
  waiting.dispose()

  // Overtaken loads are aborted and their answer dropped.
  let aborted = 0
  const racing: FormField[] = [
    { id: 'pkg', label: 'Package' },
    {
      id: 'version', label: 'Version', type: 'combobox', dependsOn: ['pkg'],
      loadChoices: async (v, signal) => {
        signal.addEventListener('abort', () => aborted++)
        await sleep(v.pkg === 'a' ? 80 : 5)
        return [{ value: `${v.pkg}@1`, label: '1' }]
      },
    },
  ]
  const race = new ChoiceLoader()
  race.sync(racing, resolveValues(racing, {}, { pkg: 'a' }, race.snapshot()))
  await sleep(10)
  race.sync(racing, resolveValues(racing, {}, { pkg: 'b' }, race.snapshot()))
  await race.idle()
  const raced = resolveValues(racing, {}, { pkg: 'b' }, race.snapshot())
  ok(aborted === 1 && raced.version === 'b@1', `overtaken load aborted, the newest answer wins (${raced.version}, ${aborted} aborted)`)

  // Errors and retry.
  let fail = true
  const flaky: FormField[] = [{
    id: 'repo', label: 'Repo', type: 'select', choices: [{ value: 'offline', label: 'offline' }],
    loadChoices: async () => {
      if (fail) throw new Error('503')
      return [{ value: 'online', label: 'online' }]
    },
  }]
  const retrying = await settle(flaky, {})
  ok(retrying.loaded.repo?.status === 'error' && retrying.loaded.repo.error === '503', 'a failed load reports its error')
  ok(validateValues(flaky, retrying.values, retrying.loaded).repo !== undefined, 'a failed load blocks submitting')
  ok(retrying.values.repo === 'offline', 'after a failure the fixed choices stand in')
  fail = false
  retrying.loader.retry('repo')
  const recovered = await settle(flaky, {}, retrying.loader)
  ok(recovered.values.repo === 'online' && recovered.loaded.repo?.status === 'ready', 'retry loads again')

  // A hidden field does not load.
  let hiddenCalls = 0
  await settle([{ id: 'x', label: 'X', type: 'combobox', when: () => false, loadChoices: async () => { hiddenCalls++; return [] } }], {})
  ok(hiddenCalls === 0, 'hidden fields do not fetch')

  /* The catalogue */
  console.log('\nTemplate catalogue:')
  const languages = [
    { id: 'java', name: 'Java', extensions: ['.java'], icon: 'J', color: '#f89820' },
    { id: 'go', name: 'Go', extensions: ['.go'], icon: 'Go', color: '#00add8' },
  ] as LanguageSpec[]
  const tpl = (id: string, extra: Partial<ProjectTemplate>): ProjectTemplate => ({ id, name: id, files: () => ({}), ...extra })
  const catalogue = [
    tpl('paper', { name: 'Paper Plugin', category: 'Minecraft', keywords: ['spigot', 'bukkit'], languageId: 'java' }),
    tpl('fabric', { name: 'Fabric Mod', category: 'Minecraft', languageId: 'java' }),
    tpl('maven', { name: 'Maven App', description: 'A plain application', languageId: 'java' }),
    tpl('go-cli', { name: 'Go CLI', languageId: 'go' }),
    tpl('loose', { name: 'Loose' }),
  ]
  const options = { otherLabel: 'Other' }
  const categories = templateCategories(catalogue, languages, options)
  ok(categories.map((c) => `${c.label}:${c.count}`).join(',') === 'Go:1,Java:1,Minecraft:2,Other:1', `categories with counts, “Other” last (${categories.map((c) => `${c.label}:${c.count}`).join(',')})`)
  ok(categories.find((c) => c.label === 'Minecraft')?.color === '#f89820', 'a category takes its first template’s language colour')
  const find = (text: string, category = ALL_CATEGORY, recent: string[] = []) =>
    filterTemplates(catalogue, languages, { text, category, recent }, options).map((t) => t.id).join(',')
  ok(find('bukkit') === 'paper', 'search: keywords')
  ok(find('minecraft') === 'fabric,paper', 'search: category')
  ok(find('plain app') === 'maven', 'search: description, every word')
  ok(find('java') === 'fabric,maven,paper', 'search: language name')
  ok(find('go') === 'go-cli,paper', `search: name hits rank first, keyword hits after (${find('go')})`)
  ok(find('', 'cat:Minecraft') === 'fabric,paper', 'category filter')
  ok(find('', 'lang:java') === 'maven', 'language category excludes templates with a category of their own')
  ok(find('', RECENT_CATEGORY, ['maven', 'paper']) === 'maven,paper', 'recent: in order of use')
  let recent = rememberRecent([], 'a')
  recent = rememberRecent(recent, 'b')
  recent = rememberRecent(recent, 'a')
  ok(recent.join(',') === 'a,b', 'rememberRecent: moves to the front without duplicates')
  ok(rememberRecent(Array.from({ length: 20 }, (_, i) => `t${i}`), 'x').length === 8, 'rememberRecent: stays short')
  ok(knownRecent(['gone', 'paper'], catalogue).join(',') === 'paper', 'knownRecent: drops removed templates')
  ok(gridStep('ArrowDown', 1, 7, 3) === 4 && gridStep('ArrowDown', 4, 7, 3) === 6 && gridStep('ArrowDown', 6, 7, 3) === 6, 'gridStep: down, into a short last row, and stay')
  ok(gridStep('ArrowRight', 6, 7, 3) === 6 && gridStep('ArrowLeft', 0, 7, 3) === 0 && gridStep('ArrowUp', 4, 7, 3) === 1, 'gridStep: edges')
  ok(gridStep('x', 0, 7, 3) === null && gridStep('End', 0, 7, 3) === 6, 'gridStep: other keys')
  const tree = fileTree(['src/main/java/App.java', 'pom.xml', 'src/test/AppTest.java', '.gitignore', 'README.md'])
  ok(tree.map((n) => n.name).join(',') === 'src,.gitignore,pom.xml,README.md', `fileTree: folders first (${tree.map((n) => n.name).join(',')})`)
  ok(tree[0].children?.map((n) => n.name).join(',') === 'main,test' && tree[0].children?.[0].children?.[0].children?.[0].name === 'App.java', 'fileTree: nesting')

  /* A template with fetched choices and asynchronous files, created for real. */
  console.log('\nTemplate with fetched choices:')
  const remote: ProjectTemplate = {
    id: 'test.remote', name: 'Remote', category: 'Test',
    fields: [
      ...chain(),
      { id: 'pkg', label: 'Package', default: (v) => `org.${v.slug}`, section: 'Code' },
    ],
    files: async (ctx) => {
      await sleep(5)
      return {
        'build.properties': `game=${ctx.values.game}\nloader=${ctx.values.loader}\napi=${ctx.values.api}\n`,
        [`src/${ctx.values.pkg.replace(/\./g, '/')}/Main.txt`]: 'hello',
      }
    },
    open: 'build.properties',
  }
  const settled = await settle(remote.fields ?? [], { game: '1.19.2' })
  ok(Object.keys(validateValues(remote.fields ?? [], settled.values, settled.loaded)).length === 0, 'fetched template: values valid once settled')
  // The page passes the settled values on as typed.
  const result = await scaffoldProject(remote, base, 'Remote Probe', settled.values)
  const written = await fs.readFile(path.join(result.dir, 'build.properties'), 'utf8')
  ok(written.includes('loader=1.19.2-loader-2') && written.includes('api=1.19.2-loader-2-api-b'), 'fetched template: settled values reach the files')
  ok(await fs.access(path.join(result.dir, 'src/org/probe/Main.txt')).then(() => true, () => false), 'fetched template: asynchronous files written')
}
