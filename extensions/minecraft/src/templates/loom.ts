/**
 * Fabric and Quilt — both build with a Loom.
 *
 * Fabric follows fabricmc.net's generator: one Loom and one Gradle for every
 * version from 1.14.4; `net.fabricmc.fabric-loom-remap` with mappings (Mojang
 * or Yarn) for obfuscated versions, `net.fabricmc.fabric-loom` without any
 * from 26.1 (`implementation` instead of `modImplementation`). Quilt uses
 * Quilt Loom with Mojang's mappings and either Quilted Fabric API or the
 * Fabric API.
 */

import type { FieldChoice, FormField, FormValues, ProjectTemplate, TemplateContext } from '../../../../src/core/types'
import {
  DAEMON_JAVA, FABRIC_GRADLE, QUILT_GRADLE, fabricApiModId, fabricFeatures, isUnobfuscated, javaFor, loomDaemonJava, loomPluginId,
} from '../eras'
import { settingOn, t, versions } from '../lumen'
import type { VersionEntry } from '../sources'
import {
  authorsOf, buildToolField, defineTemplate, gitignore, gradleCommands, gradleProperties, gradleSetup, identityFields,
  isKts, isOn, javaField, javaHeader, javaText, json, packagePath, readme, section, settingsFile, toggle,
  wrapperFiles,
} from './common'
import { exampleMixin, loggerField, mixinConfig, vanillaCommand } from './java'
import { entryChoices, gradleField, mcField, snapshotsField, versionField } from './versions'

/* ------------------------------------------------------------------ *
 * Shared
 * ------------------------------------------------------------------ */

type LoomLoader = 'fabric' | 'quilt'

const api = (v: FormValues) => isOn(v, 'fabricApi')
const obfuscated = (v: FormValues) => Boolean(v.mc) && !isUnobfuscated(v.mc)
const features = (v: FormValues) => fabricFeatures(v.mc ?? '')

/** Compile with a JDK of at least 21 (what Loom needs) and target the game's Java release. */
const toolchainFor = (java: string) => String(Math.max(Number(java) || 21, 21))

/** `~1.21.1`; a snapshot matches its whole pre-release line (`~26.4-`). */
function minecraftDependency(mc: string): string {
  const dash = mc.indexOf('-')
  return `~${dash === -1 ? mc : mc.slice(0, dash + 1)}`
}

interface LoomBuild {
  loader: LoomLoader
  plugin: string
  pluginVersion: string
  split: boolean
  /** Dependencies as `configuration coordinate` pairs, besides Minecraft and the mappings. */
  dependencies: [string, string][]
  widener: string | null
  datagen: boolean
  repositories: { name: string; url: string }[]
  metadata: string
}

function loomBuild(values: FormValues, build: LoomBuild): string {
  const kts = isKts(values)
  const unobf = isUnobfuscated(values.mc)
  const q = (s: string) => (kts ? `"${s}"` : `'${s}'`)
  const prop = (name: string) => (kts ? `\${property("${name}")}` : `\${project.${name}}`)
  const call = (fn: string, arg: string) => (kts ? `${fn}(${arg})` : `${fn} ${arg}`)
  const java = values.java
  const toolchain = toolchainFor(java)

  const deps = [`    ${call('minecraft', `"com.mojang:minecraft:${prop('minecraft_version')}"`)}`]
  if (!unobf && values.mappings === 'yarn') deps.push(`    ${call('mappings', `"net.fabricmc:yarn:${prop('yarn_mappings')}:v2"`)}`)
  if (!unobf && values.mappings !== 'yarn') deps.push(`    ${call('mappings', 'loom.officialMojangMappings()')}`)
  for (const [configuration, coordinate] of build.dependencies) deps.push(`    ${call(configuration, `"${coordinate}"`)}`)

  const sourceSets = build.split
    ? [kts ? '            sourceSet(sourceSets.main.get())' : '            sourceSet sourceSets.main', kts ? '            sourceSet(sourceSets.getByName("client"))' : '            sourceSet sourceSets.client']
    : [kts ? '            sourceSet(sourceSets.main.get())' : '            sourceSet sourceSets.main']
  const loomLines = [
    ...(build.split ? ['    splitEnvironmentSourceSets()', ''] : []),
    '    mods {',
    kts ? `        register("${values.modId}") {` : `        "${values.modId}" {`,
    ...sourceSets,
    '        }',
    '    }',
    ...(build.widener ? ['', `    accessWidenerPath = file(${q(`src/main/resources/${build.widener}`)})`] : []),
  ]

  const repositories = build.repositories.map((r) => (kts
    ? `    maven("${r.url}") {\n        name = "${r.name}"\n    }`
    : `    maven {\n        name = '${r.name}'\n        url = '${r.url}'\n    }`))

  const blocks = [
    kts
      ? `plugins {\n    id("${build.plugin}") version "${build.pluginVersion}"\n    \`maven-publish\`\n}`
      : `plugins {\n    id '${build.plugin}' version '${build.pluginVersion}'\n    id 'maven-publish'\n}`,
    kts
      ? 'version = providers.gradleProperty("mod_version").get()\ngroup = providers.gradleProperty("maven_group").get()\n\nbase {\n    archivesName = providers.gradleProperty("archives_base_name").get()\n}'
      : 'version = project.mod_version\ngroup = project.maven_group\n\nbase {\n    archivesName = project.archives_base_name\n}',
    `repositories {\n${repositories.join('\n')}\n}`,
    `loom {\n${loomLines.join('\n')}\n}`,
  ]
  if (build.datagen) {
    blocks.push(build.split
      ? 'fabricApi {\n    configureDataGeneration {\n        client = true\n    }\n}'
      : 'fabricApi {\n    configureDataGeneration()\n}')
  }
  blocks.push(
    `dependencies {\n${deps.join('\n')}\n}`,
    kts
      ? `tasks.processResources {\n    val version = project.version\n    inputs.property("version", version)\n    filesMatching("${build.metadata}") {\n        expand("version" to version)\n    }\n}`
      : `processResources {\n    def version = project.version\n    inputs.property 'version', version\n    filesMatching('${build.metadata}') {\n        expand 'version': version\n    }\n}`,
    kts
      ? `java {\n    withSourcesJar()\n    toolchain.languageVersion = JavaLanguageVersion.of(${toolchain})\n}`
      : `java {\n    withSourcesJar()\n    toolchain {\n        languageVersion = JavaLanguageVersion.of(${toolchain})\n    }\n}`,
    kts
      ? `tasks.withType<JavaCompile>().configureEach {\n    options.encoding = "UTF-8"\n    options.release = ${java}\n}`
      : `tasks.withType(JavaCompile).configureEach {\n    options.encoding = 'UTF-8'\n    options.release = ${java}\n}`,
    kts
      ? 'publishing {\n    publications {\n        register<MavenPublication>("mavenJava") {\n            from(components["java"])\n        }\n    }\n}'
      : "publishing {\n    publications {\n        create('mavenJava', MavenPublication) {\n            from components.java\n        }\n    }\n}",
  )
  return `${blocks.join('\n\n')}\n`
}

const widenerFile = (values: FormValues, extension: string) => (isOn(values, 'accessWidener') ? `${values.modId}.${extension}` : null)

function widenerContent(mc: string): string {
  if (isUnobfuscated(mc)) return 'classTweaker v1 official\n# accessible class net/minecraft/server/MinecraftServer\n'
  return 'accessWidener v2 named\n# accessible class net/minecraft/server/MinecraftServer\n'
}

function loomMain(values: FormValues): string {
  const pkg = values.package
  const f = features(values)
  const logger = loggerField(f.slf4j)
  const imports = ['net.fabricmc.api.ModInitializer', ...logger.imports]
  const body = [`        LOGGER.info("${javaText(t('code.modLoaded', { name: values.name ?? values.modId }))}");`]
  if (api(values) && f.listener && isOn(values, 'listener')) {
    imports.push('net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents')
    body.push(`        ServerLifecycleEvents.SERVER_STARTED.register(server -> LOGGER.info("${javaText(t('code.serverStarted'))}"));`)
  }
  if (api(values) && f.command && isOn(values, 'command')) {
    imports.push('net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback', `${pkg}.command.HelloCommand`)
    body.push('        CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> HelloCommand.register(dispatcher));')
  }
  return `${javaHeader(pkg, imports)}public class ${values.mainClass} implements ModInitializer {
    public static final String MOD_ID = "${values.modId}";
${logger.line}

    @Override
    public void onInitialize() {
${body.join('\n')}
    }
}
`
}

function loomClient(values: FormValues): string {
  return `${javaHeader(`${values.package}.client`, ['net.fabricmc.api.ClientModInitializer'])}public class ${values.mainClass}Client implements ClientModInitializer {
    @Override
    public void onInitializeClient() {
        // ${t('code.clientComment')}
    }
}
`
}

function fabricDatagen(pkg: string): string {
  return `${javaHeader(`${pkg}.datagen`, [
    'net.fabricmc.fabric.api.datagen.v1.DataGeneratorEntrypoint',
    'net.fabricmc.fabric.api.datagen.v1.FabricDataGenerator',
  ])}public class ModDataGenerator implements DataGeneratorEntrypoint {
    @Override
    public void onInitializeDataGenerator(FabricDataGenerator generator) {
        // ${t('code.datagenComment')}
    }
}
`
}

const openMain = ({ values }: TemplateContext) => `src/main/java/${packagePath(values.package)}/${values.mainClass}.java`

function commonToggles(extra: FormField[] = []): FormField[] {
  const f = (v: FormValues) => features(v)
  return [
    toggle('mixins', t('option.mixins'), true),
    toggle('accessWidener', t('option.accessWidener'), false),
    ...extra,
    toggle('command', t('option.command'), true, (v) => api(v) && f(v).command, t('hint.commandSince', { mc: '1.20' })),
    toggle('listener', t('option.listener'), true, (v) => api(v) && f(v).listener),
  ]
}

/* ------------------------------------------------------------------ *
 * Fabric
 * ------------------------------------------------------------------ */

function fabricFields(): FormField[] {
  const scope = 'fabric'
  return [
    ...identityFields('mod'),
    mcField('fabric', { snapshots: true }),
    snapshotsField(settingOn('snapshots', false)),
    javaField((v) => javaFor(v.mc ?? '')),
    versionField({
      scope,
      id: 'loaderVersion',
      label: t('field.loaderVersion', { loader: 'Fabric Loader' }),
      load: () => versions().fabricLoaders(),
    }),
    toggle('fabricApi', t('option.fabricApi'), true),
    versionField({
      scope,
      id: 'fabricApiVersion',
      label: t('field.apiVersion', { api: 'Fabric API' }),
      dependsOn: ['mc'],
      when: api,
      load: (v) => versions().fabricApi(v.mc),
    }),
    {
      id: 'mappings',
      label: t('field.mappings'),
      type: 'select',
      default: 'mojang',
      choices: [
        { value: 'mojang', label: t('mappings.mojang') },
        { value: 'yarn', label: t('mappings.yarn') },
      ],
      hint: t('hint.mappings'),
      when: obfuscated,
      section: section.minecraft(),
    },
    versionField({
      scope,
      id: 'yarnVersion',
      label: t('field.yarnVersion'),
      dependsOn: ['mc'],
      when: (v) => obfuscated(v) && v.mappings === 'yarn',
      load: (v) => versions().yarn(v.mc),
    }),
    versionField({
      scope,
      id: 'loomVersion',
      label: t('field.pluginVersion', { plugin: 'Fabric Loom' }),
      dependsOn: ['mc'],
      hint: t('hint.loom'),
      load: (v) => versions().loom(loomPluginId(v.mc)),
    }),
    gradleField(scope, () => FABRIC_GRADLE, []),
    buildToolField(['gradle-kts', 'gradle-groovy']),
    toggle('splitSources', t('option.splitSources'), true, (v) => features(v).splitSources),
    ...commonToggles([
      toggle('datagen', t('option.datagen'), false, (v) => api(v) && features(v).datagen),
    ]),
  ]
}

function fabricModJson(values: FormValues, clientEntry: string | null, datagenEntry: string | null): string {
  const entrypoints: Record<string, string[]> = { main: [`${values.package}.${values.mainClass}`] }
  if (clientEntry) entrypoints.client = [clientEntry]
  if (datagenEntry) entrypoints['fabric-datagen'] = [datagenEntry]
  const depends: Record<string, string> = {
    fabricloader: `>=${values.loaderVersion}`,
    minecraft: minecraftDependency(values.mc),
    java: `>=${values.java}`,
  }
  if (api(values)) depends[fabricApiModId(values.fabricApiVersion ?? '')] = '*'
  const widener = widenerFile(values, isUnobfuscated(values.mc) ? 'classtweaker' : 'accesswidener')
  return json({
    schemaVersion: 1,
    id: values.modId,
    version: '${version}',
    name: values.name ?? values.modId,
    description: values.description ?? '',
    authors: authorsOf(values),
    ...(values.website ? { contact: { homepage: values.website } } : {}),
    license: values.license,
    environment: '*',
    entrypoints,
    ...(isOn(values, 'mixins') ? { mixins: [`${values.modId}.mixins.json`] } : {}),
    ...(widener ? { accessWidener: widener } : {}),
    depends,
  })
}

export const fabricTemplate: ProjectTemplate = defineTemplate({
  id: 'minecraft-fabric',
  nameKey: 'template.fabric.name',
  descriptionKey: 'template.fabric.description',
  keywords: ['fabric', 'mod', 'loom', 'fabric api', 'yarn'],
  languageId: 'java',
  kindId: 'minecraft-fabric',
  icon: 'Fa',
  color: '#dbd0b4',
  buildFields: fabricFields,
  open: openMain,
  setup: gradleSetup,
  next: () => t('next.mod'),
  files(ctx) {
    const { values } = ctx
    const kts = isKts(values)
    const f = features(values)
    const withApi = api(values)
    const split = f.splitSources && isOn(values, 'splitSources')
    const unobf = isUnobfuscated(values.mc)
    const widener = widenerFile(values, unobf ? 'classtweaker' : 'accesswidener')
    const datagen = withApi && f.datagen && isOn(values, 'datagen')
    const pkg = packagePath(values.package)
    const clientRoot = split ? 'src/client/java' : 'src/main/java'
    const configuration = unobf ? 'implementation' : 'modImplementation'
    const properties: Record<string, string> = {
      minecraft_version: values.mc,
      ...(obfuscated(values) && values.mappings === 'yarn' ? { yarn_mappings: values.yarnVersion } : {}),
      loader_version: values.loaderVersion,
      mod_version: values.version,
      maven_group: values.groupId,
      archives_base_name: values.modId,
      ...(withApi ? { fabric_api_version: values.fabricApiVersion } : {}),
    }
    const kprop = (name: string) => (kts ? `\${property("${name}")}` : `\${project.${name}}`)
    const dependencies: [string, string][] = [[configuration, `net.fabricmc:fabric-loader:${kprop('loader_version')}`]]
    if (withApi) dependencies.push([configuration, `net.fabricmc.fabric-api:fabric-api:${kprop('fabric_api_version')}`])

    const files: Record<string, string> = {
      ...settingsFile(values, values.modId, values.gradleVersion, [{ name: 'Fabric', url: 'https://maven.fabricmc.net/' }]),
      [kts ? 'build.gradle.kts' : 'build.gradle']: loomBuild(values, {
        loader: 'fabric',
        plugin: loomPluginId(values.mc),
        pluginVersion: values.loomVersion,
        split,
        dependencies,
        widener,
        datagen,
        repositories: [],
        metadata: 'fabric.mod.json',
      }),
      'gradle.properties': gradleProperties(properties, ['org.gradle.configuration-cache=true']),
      ...wrapperFiles(values.gradleVersion, loomDaemonJava(values.loomVersion)),
      'src/main/resources/fabric.mod.json': fabricModJson(
        values,
        `${values.package}.client.${values.mainClass}Client`,
        datagen ? `${values.package}.datagen.ModDataGenerator` : null,
      ),
      [`src/main/java/${pkg}/${values.mainClass}.java`]: loomMain(values),
      [`${clientRoot}/${pkg}/client/${values.mainClass}Client.java`]: loomClient(values),
      '.gitignore': gitignore(),
      'README.md': readme(ctx, 'Fabric', gradleCommands(['runClient', 'runServer', ...(datagen ? ['runDatagen'] : []), ...(unobf ? [] : ['genSources'])])),
    }
    if (withApi && f.command && isOn(values, 'command')) files[`src/main/java/${pkg}/command/HelloCommand.java`] = vanillaCommand(values.package)
    if (isOn(values, 'mixins')) {
      files[`src/main/java/${pkg}/mixin/ExampleMixin.java`] = exampleMixin(values.package)
      files[`src/main/resources/${values.modId}.mixins.json`] = mixinConfig(values.package, values.mc)
    }
    if (widener) files[`src/main/resources/${widener}`] = widenerContent(values.mc)
    if (datagen) files[`${clientRoot}/${pkg}/datagen/ModDataGenerator.java`] = fabricDatagen(values.package)
    return files
  },
})

/* ------------------------------------------------------------------ *
 * Quilt
 * ------------------------------------------------------------------ */

/** `qfapi:7.7.0+0.92.2-1.20.1` or `fabric:0.116.17+1.21.1` — which API, and its version. */
export function splitQuiltApi(value: string | undefined): { kind: 'qfapi' | 'fabric'; version: string } {
  const [kind, ...rest] = (value ?? '').split(':')
  const version = rest.join(':')
  if (kind === 'qfapi') return { kind, version }
  return { kind: 'fabric', version: version || value || '' }
}

async function quiltApiEntries(mc: string): Promise<{ qfapi: VersionEntry[]; fabric: VersionEntry[] }> {
  const [qfapi, fabric] = await Promise.all([
    versions().qfapi(mc).catch(() => []),
    versions().fabricApi(mc).catch(() => []),
  ])
  return { qfapi, fabric }
}

function quiltFields(): FormField[] {
  const scope = 'quilt'
  return [
    ...identityFields('mod'),
    mcField('quilt'),
    javaField((v) => javaFor(v.mc ?? '')),
    versionField({
      scope,
      id: 'loaderVersion',
      label: t('field.loaderVersion', { loader: 'Quilt Loader' }),
      load: () => versions().quiltLoaders(),
    }),
    toggle('fabricApi', t('option.quiltApi'), true),
    versionField({
      scope,
      id: 'apiVersion',
      label: t('field.apiVersion', { api: 'QFAPI / Fabric API' }),
      hint: t('hint.quiltApi'),
      dependsOn: ['mc'],
      when: api,
      async load(v) {
        const { qfapi, fabric } = await quiltApiEntries(v.mc)
        // Listed first, a stable Quilted Fabric API becomes the default; the Fabric API otherwise.
        return [
          ...qfapi.map((e) => ({ ...e, version: `qfapi:${e.version}` })),
          ...fabric.map((e) => ({ ...e, version: `fabric:${e.version}` })),
        ]
      },
      toChoices(entries): FieldChoice[] {
        return entries.map((entry) => {
          const { kind, version } = splitQuiltApi(entry.version)
          return {
            ...entryChoices([{ ...entry, version }], kind === 'qfapi' ? 'Quilted Fabric API' : 'Fabric API')[0],
            value: entry.version,
          }
        })
      },
    }),
    versionField({
      scope,
      id: 'loomVersion',
      label: t('field.pluginVersion', { plugin: 'Quilt Loom' }),
      load: () => versions().quiltLoom(),
    }),
    gradleField(scope, () => QUILT_GRADLE, []),
    buildToolField(['gradle-kts', 'gradle-groovy']),
    ...commonToggles(),
  ]
}

function quiltModJson(values: FormValues): string {
  const withApi = api(values)
  const chosen = splitQuiltApi(values.apiVersion)
  const contributors = Object.fromEntries(authorsOf(values).map((a) => [a, 'Owner']))
  const depends = [
    { id: 'quilt_loader', versions: `>=${values.loaderVersion}` },
    { id: 'minecraft', versions: minecraftDependency(values.mc) },
    ...(withApi && chosen.kind === 'qfapi' ? [{ id: 'quilted_fabric_api', versions: '*' }] : []),
    ...(withApi && chosen.kind === 'fabric' ? [{ id: fabricApiModId(chosen.version), versions: '*' }] : []),
  ]
  const widener = widenerFile(values, 'accesswidener')
  return json({
    schema_version: 1,
    quilt_loader: {
      group: values.groupId,
      id: values.modId,
      version: '${version}',
      metadata: {
        name: values.name ?? values.modId,
        description: values.description ?? '',
        contributors,
        ...(values.website ? { contact: { homepage: values.website } } : {}),
        license: values.license,
      },
      intermediate_mappings: 'net.fabricmc:intermediary',
      entrypoints: {
        // Fabric's initializer interfaces, which Quilt Loader runs as `main` and `client`.
        main: `${values.package}.${values.mainClass}`,
        client: `${values.package}.client.${values.mainClass}Client`,
      },
      depends,
    },
    ...(isOn(values, 'mixins') ? { mixin: `${values.modId}.mixins.json` } : {}),
    ...(widener ? { access_widener: widener } : {}),
  })
}

export const quiltTemplate: ProjectTemplate = defineTemplate({
  id: 'minecraft-quilt',
  nameKey: 'template.quilt.name',
  descriptionKey: 'template.quilt.description',
  keywords: ['quilt', 'mod', 'qfapi', 'quilted fabric api'],
  languageId: 'java',
  kindId: 'minecraft-quilt',
  icon: 'Qu',
  color: '#8b5fc6',
  buildFields: quiltFields,
  open: openMain,
  setup: gradleSetup,
  next: () => t('next.mod'),
  files(ctx) {
    const { values } = ctx
    const kts = isKts(values)
    const withApi = api(values)
    const chosen = splitQuiltApi(values.apiVersion)
    const widener = widenerFile(values, 'accesswidener')
    const pkg = packagePath(values.package)
    const kprop = (name: string) => (kts ? `\${property("${name}")}` : `\${project.${name}}`)
    const properties: Record<string, string> = {
      minecraft_version: values.mc,
      loader_version: values.loaderVersion,
      mod_version: values.version,
      maven_group: values.groupId,
      archives_base_name: values.modId,
      ...(withApi && chosen.kind === 'qfapi' ? { qfapi_version: chosen.version } : {}),
      ...(withApi && chosen.kind === 'fabric' ? { fabric_api_version: chosen.version } : {}),
    }
    const dependencies: [string, string][] = [['modImplementation', `org.quiltmc:quilt-loader:${kprop('loader_version')}`]]
    if (withApi && chosen.kind === 'qfapi') dependencies.push(['modImplementation', `org.quiltmc.quilted-fabric-api:quilted-fabric-api:${kprop('qfapi_version')}`])
    if (withApi && chosen.kind === 'fabric') dependencies.push(['modImplementation', `net.fabricmc.fabric-api:fabric-api:${kprop('fabric_api_version')}`])

    const files: Record<string, string> = {
      ...settingsFile(values, values.modId, values.gradleVersion, [
        { name: 'Quilt', url: 'https://maven.quiltmc.org/repository/release/' },
        { name: 'Fabric', url: 'https://maven.fabricmc.net/' },
      ]),
      [kts ? 'build.gradle.kts' : 'build.gradle']: loomBuild(values, {
        loader: 'quilt',
        plugin: 'org.quiltmc.loom',
        pluginVersion: values.loomVersion,
        split: false,
        dependencies,
        widener,
        datagen: false,
        repositories: [
          { name: 'Quilt', url: 'https://maven.quiltmc.org/repository/release/' },
          { name: 'Fabric', url: 'https://maven.fabricmc.net/' },
        ],
        metadata: 'quilt.mod.json',
      }),
      'gradle.properties': gradleProperties(properties),
      ...wrapperFiles(values.gradleVersion, DAEMON_JAVA),
      'src/main/resources/quilt.mod.json': quiltModJson(values),
      [`src/main/java/${pkg}/${values.mainClass}.java`]: loomMain(values),
      [`src/main/java/${pkg}/client/${values.mainClass}Client.java`]: loomClient(values),
      '.gitignore': gitignore(),
      'README.md': readme(ctx, 'Quilt', gradleCommands(['runClient', 'runServer', 'genSources'])),
    }
    if (withApi && features(values).command && isOn(values, 'command')) files[`src/main/java/${pkg}/command/HelloCommand.java`] = vanillaCommand(values.package)
    if (isOn(values, 'mixins')) {
      files[`src/main/java/${pkg}/mixin/ExampleMixin.java`] = exampleMixin(values.package)
      files[`src/main/resources/${values.modId}.mixins.json`] = mixinConfig(values.package, values.mc)
    }
    if (widener) files[`src/main/resources/${widener}`] = widenerContent(values.mc)
    return files
  },
})
