/**
 * The Architectury template: a multiloader project with `common`, `fabric` and
 * `neoforge` (up to 1.20.1 optionally `forge` instead), built with
 * architectury-plugin, Architectury Loom and Shadow — as in the official
 * generator, only with the Groovy DSL.
 */

import type { FormField, FormValues, ProjectTemplate, TemplateContext } from '@/core/types'
import { t } from '@/i18n'
import {
  authorsOf, buildToolField, defineTemplate, gitignore, gradleSetup, identityFields, isOn, javaField,
  javaHeader, javaText, json, mcVersionField, packagePath, quoted, readme, toggle, versionField, wrapperProperties,
} from './common'
import { templateKind } from './kinds'
import { exampleMixin, mixinConfig } from './mods'
import { FORGE_PACK_FORMAT, currentCatalog, isUnobfuscated, mcRange, sortVersions } from './versions'

/** NeoForge exists for Architectury from 1.21 onwards, Forge for 1.20.1 alone. */
const hasNeoForge = (mc: string) => mc !== '1.20.1'
const hasForge = (mc: string) => Boolean(currentCatalog().architectury.forge[mc])

const neoforgeOn = (v: FormValues) => hasNeoForge(v.mc) && isOn(v, 'neoforge')
const forgeOn = (v: FormValues) => hasForge(v.mc) && isOn(v, 'forge')
const apiOn = (v: FormValues) => isOn(v, 'architecturyApi')

function fields(): FormField[] {
  const catalog = () => currentCatalog()
  return [
    ...identityFields('mod'),
    mcVersionField(() => sortVersions(Object.keys(catalog().architectury.api))),
    javaField(),
    versionField('loaderVersion', t('minecraft.field.loaderVersion', { loader: 'Fabric Loader' }), () => catalog().fabric.loader),
    versionField('fabricApiVersion', t('minecraft.field.apiVersion', { api: 'Fabric API' }), (v) => catalog().fabric.api[v.mc] ?? ''),
    versionField('neoVersion', t('minecraft.field.loaderVersion', { loader: 'NeoForge' }), (v) => catalog().neoforge.versions[v.mc] ?? '', neoforgeOn),
    versionField('forgeVersion', t('minecraft.field.loaderVersion', { loader: 'Forge' }), (v) => catalog().architectury.forge[v.mc] ?? '', forgeOn),
    versionField('architecturyApiVersion', t('minecraft.field.apiVersion', { api: 'Architectury API' }), (v) => catalog().architectury.api[v.mc] ?? '', apiOn),
    { ...buildToolField(['gradle-groovy']), hint: t('minecraft.hint.groovyOnly') },
    toggle('neoforge', t('minecraft.option.platformNeoForge'), true, (v) => hasNeoForge(v.mc)),
    { ...toggle('forge', t('minecraft.option.platformForge'), false, (v) => hasForge(v.mc)), default: (v) => String(hasForge(v.mc)) },
    toggle('architecturyApi', t('minecraft.option.architecturyApi'), true),
    toggle('mixins', t('minecraft.option.mixins'), true),
  ]
}

function platforms(values: FormValues): string[] {
  return ['fabric', ...(neoforgeOn(values) ? ['neoforge'] : []), ...(forgeOn(values) ? ['forge'] : [])]
}

/* ------------------------------------------------------------------ *
 * The Gradle files
 * ------------------------------------------------------------------ */

function rootBuild(values: FormValues): string {
  const unobf = isUnobfuscated(values.mc)
  const catalog = currentCatalog().architectury
  const loom = unobf ? 'dev.architectury.loom-no-remap' : 'dev.architectury.loom'
  const mappings = unobf
    ? ''
    : '\n    loom {\n        silentMojangMappingsLicense()\n    }\n'
  const mappingDependency = unobf ? '' : '\n        mappings loom.officialMojangMappings()'
  return `plugins {
    id '${loom}' version '${catalog.loom}' apply false
    id 'architectury-plugin' version '${catalog.plugin}'
    id 'com.gradleup.shadow' version '${catalog.shadow}' apply false
}

architectury {
    minecraft = project.minecraft_version
}

allprojects {
    group = rootProject.maven_group
    version = rootProject.mod_version
}

subprojects {
    apply plugin: '${loom}'
    apply plugin: 'architectury-plugin'
    apply plugin: 'maven-publish'

    base {
        archivesName = "$rootProject.archives_name-$project.name"
    }

    repositories {
    }
${mappings}
    dependencies {
        minecraft "net.minecraft:minecraft:$rootProject.minecraft_version"${mappingDependency}
    }

    java {
        withSourcesJar()
        toolchain {
            languageVersion = JavaLanguageVersion.of(${values.java})
        }
    }

    tasks.withType(JavaCompile).configureEach {
        it.options.encoding = 'UTF-8'
        it.options.release = ${values.java}
    }

    publishing {
        publications {
            mavenJava(MavenPublication) {
                artifactId = base.archivesName.get()
                from components.java
            }
        }
    }
}
`
}

function commonBuild(values: FormValues): string {
  const configuration = isUnobfuscated(values.mc) ? 'implementation' : 'modImplementation'
  const api = apiOn(values)
    ? `\n    ${configuration} "dev.architectury:architectury:$rootProject.architectury_api_version"`
    : ''
  return `architectury {
    common rootProject.enabled_platforms.split(',')
}

dependencies {
    // For the @Environment annotations alone — use no further Fabric loader classes.
    ${configuration} "net.fabricmc:fabric-loader:$rootProject.fabric_loader_version"${api}
}
`
}

/** Building a platform: Shadow bundles `common` into the mod jar. */
function platformBuild(values: FormValues, platform: 'fabric' | 'neoforge' | 'forge'): string {
  const unobf = isUnobfuscated(values.mc)
  const configuration = unobf ? 'implementation' : 'modImplementation'
  const setup: Record<typeof platform, string> = { fabric: 'fabric()', neoforge: 'neoForge()', forge: 'forge()' }
  const development: Record<typeof platform, string> = { fabric: 'developmentFabric', neoforge: 'developmentNeoForge', forge: 'developmentForge' }
  const transform: Record<typeof platform, string> = { fabric: 'transformProductionFabric', neoforge: 'transformProductionNeoForge', forge: 'transformProductionForge' }
  const metadata: Record<typeof platform, string> = { fabric: 'fabric.mod.json', neoforge: 'META-INF/neoforge.mods.toml', forge: 'META-INF/mods.toml' }

  const deps: Record<typeof platform, string[]> = {
    fabric: [
      `${configuration} "net.fabricmc:fabric-loader:$rootProject.fabric_loader_version"`,
      `${configuration} "net.fabricmc.fabric-api:fabric-api:$rootProject.fabric_api_version"`,
    ],
    neoforge: ['neoForge "net.neoforged:neoforge:$rootProject.neoforge_version"'],
    forge: ['forge "net.minecraftforge:forge:$rootProject.minecraft_version-$rootProject.forge_version"'],
  }
  const lines = [...deps[platform]]
  if (apiOn(values)) lines.push(`${configuration} "dev.architectury:architectury-${platform}:$rootProject.architectury_api_version"`)
  lines.push(
    unobf
      ? "common(project(path: ':common')) { transitive = false }"
      : "common(project(path: ':common', configuration: 'namedElements')) { transitive = false }",
    `shadowBundle project(path: ':common', configuration: '${transform[platform]}')`,
  )

  const repositories = platform === 'neoforge'
    ? "\nrepositories {\n    maven {\n        name = 'NeoForged'\n        url = 'https://maven.neoforged.net/releases'\n    }\n}\n"
    : ''
  const forgeLoom = platform === 'forge' && isOn(values, 'mixins')
    ? `\nloom {\n    forge {\n        mixinConfig "${values.modId}.mixins.json"\n    }\n}\n`
    : ''
  const jar = unobf
    ? `jar {
    archiveClassifier = 'dev'
}

shadowJar {
    configurations = [project.configurations.shadowBundle]
    archiveClassifier = null
}

assemble.dependsOn shadowJar`
    : `shadowJar {
    configurations = [project.configurations.shadowBundle]
    archiveClassifier = 'dev-shadow'
}

remapJar {
    inputFile.set shadowJar.archiveFile
}`

  return `plugins {
    id 'com.gradleup.shadow'
}
${forgeLoom}
architectury {
    platformSetupLoomIde()
    ${setup[platform]}
}

configurations {
    common {
        canBeResolved = true
        canBeConsumed = false
    }
    compileClasspath.extendsFrom common
    runtimeClasspath.extendsFrom common
    ${development[platform]}.extendsFrom common

    // Bundled into the mod jar by Shadow.
    shadowBundle {
        canBeResolved = true
        canBeConsumed = false
    }
}
${repositories}
dependencies {
${lines.map((l) => `    ${l}`).join('\n')}
}

processResources {
    inputs.property 'version', project.version

    filesMatching('${metadata[platform]}') {
        expand version: inputs.properties.version
    }
}

${jar}
`
}

function settings(values: FormValues): string {
  const includes = ['common', ...platforms(values)].map((p) => `include '${p}'`)
  return `pluginManagement {
    repositories {
        maven { url = 'https://maven.fabricmc.net/' }
        maven { url = 'https://maven.architectury.dev/' }
        maven { url = 'https://files.minecraftforge.net/maven/' }
        maven { url = 'https://maven.neoforged.net/releases' }
        gradlePluginPortal()
    }
}

plugins {
    id 'org.gradle.toolchains.foojay-resolver-convention' version '1.0.0'
}

rootProject.name = '${values.modId}'

${includes.join('\n')}
`
}

function properties(values: FormValues): string {
  const lines = [
    'org.gradle.jvmargs=-Xmx2G',
    'org.gradle.parallel=true',
    '',
    `mod_version=${values.version}`,
    `maven_group=${values.groupId}`,
    `archives_name=${values.modId}`,
    `enabled_platforms=${platforms(values).join(',')}`,
    '',
    `minecraft_version=${values.mc}`,
    ...(apiOn(values) ? [`architectury_api_version=${values.architecturyApiVersion}`] : []),
    `fabric_loader_version=${values.loaderVersion}`,
    `fabric_api_version=${values.fabricApiVersion}`,
    ...(neoforgeOn(values) ? [`neoforge_version=${values.neoVersion}`] : []),
    ...(forgeOn(values) ? [`forge_version=${values.forgeVersion}`] : []),
    '',
  ]
  return lines.join('\n')
}

/* ------------------------------------------------------------------ *
 * The metadata and the sources
 * ------------------------------------------------------------------ */

function fabricModJson(values: FormValues): string {
  const depends: Record<string, string> = {
    fabricloader: `>=${values.loaderVersion}`,
    minecraft: `~${values.mc}`,
    java: `>=${values.java}`,
    'fabric-api': '*',
  }
  if (apiOn(values)) depends.architectury = `>=${values.architecturyApiVersion}`
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
    entrypoints: {
      main: [`${values.package}.fabric.${values.mainClass}Fabric`],
      client: [`${values.package}.fabric.client.${values.mainClass}FabricClient`],
    },
    ...(isOn(values, 'mixins') ? { mixins: [`${values.modId}.mixins.json`] } : {}),
    depends,
  })
}

/** The major version of FML: Forge = Forge's major version, NeoForge 21.1 = 4, otherwise 1. */
function loaderMajorOf(values: FormValues, platform: 'neoforge' | 'forge'): string {
  if (platform === 'forge') return values.forgeVersion.split('.')[0]
  return values.mc === '1.21.1' ? '4' : '1'
}

function modsToml(values: FormValues, platform: 'neoforge' | 'forge'): string {
  const authors = authorsOf(values)
  const neo = platform === 'neoforge'
  const loaderMajor = loaderMajorOf(values, platform)
  const required = neo ? 'type = "required"' : 'mandatory = true'
  const dependency = (modId: string, range: string, ordering = 'NONE') => [
    '',
    `[[dependencies.${values.modId}]]`,
    `modId = "${modId}"`,
    required,
    `versionRange = "${range}"`,
    `ordering = "${ordering}"`,
    'side = "BOTH"',
  ]
  const lines = [
    'modLoader = "javafml"',
    `loaderVersion = "[${loaderMajor},)"`,
    `license = ${quoted(values.license)}`,
    '',
    '[[mods]]',
    `modId = "${values.modId}"`,
    'version = "${version}"',
    `displayName = ${quoted(values.name ?? values.modId)}`,
    ...(authors.length ? [`authors = ${quoted(authors.join(', '))}`] : []),
    `description = ${quoted(values.description || values.name || values.modId)}`,
    ...dependency(neo ? 'neoforge' : 'forge', neo ? `[${values.neoVersion},)` : `[${loaderMajor},)`),
    ...dependency('minecraft', mcRange(values.mc)),
    ...(apiOn(values) ? dependency('architectury', `[${values.architecturyApiVersion},)`, 'AFTER') : []),
  ]
  if (neo && isOn(values, 'mixins')) lines.push('', '[[mixins]]', `config = "${values.modId}.mixins.json"`)
  return `${lines.join('\n')}\n`
}

function commonMain(values: FormValues): string {
  return `${javaHeader(values.package, ['org.slf4j.Logger', 'org.slf4j.LoggerFactory'])}public final class ${values.mainClass} {
    public static final String MOD_ID = "${values.modId}";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    private ${values.mainClass}() {
    }

    /** ${t('minecraft.code.commonInit')} */
    public static void init() {
        LOGGER.info("${javaText(t('minecraft.code.modLoaded', { name: values.name ?? values.modId }))}");
    }
}
`
}

function fabricEntry(values: FormValues): string {
  return `${javaHeader(`${values.package}.fabric`, [`${values.package}.${values.mainClass}`, 'net.fabricmc.api.ModInitializer'])}public final class ${values.mainClass}Fabric implements ModInitializer {
    @Override
    public void onInitialize() {
        ${values.mainClass}.init();
    }
}
`
}

function fabricClientEntry(values: FormValues): string {
  return `${javaHeader(`${values.package}.fabric.client`, ['net.fabricmc.api.ClientModInitializer'])}public final class ${values.mainClass}FabricClient implements ClientModInitializer {
    @Override
    public void onInitializeClient() {
        // ${t('minecraft.code.clientComment')}
    }
}
`
}

function neoforgeEntry(values: FormValues): string {
  return `${javaHeader(`${values.package}.neoforge`, [`${values.package}.${values.mainClass}`, 'net.neoforged.fml.common.Mod'])}@Mod(${values.mainClass}.MOD_ID)
public final class ${values.mainClass}NeoForge {
    public ${values.mainClass}NeoForge() {
        ${values.mainClass}.init();
    }
}
`
}

function forgeEntry(values: FormValues): string {
  const api = apiOn(values)
  const imports = [`${values.package}.${values.mainClass}`, 'net.minecraftforge.fml.common.Mod']
  if (api) imports.push('dev.architectury.platform.forge.EventBuses', 'net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext')
  const register = api
    ? `        EventBuses.registerModEventBus(${values.mainClass}.MOD_ID, FMLJavaModLoadingContext.get().getModEventBus());\n`
    : ''
  return `${javaHeader(`${values.package}.forge`, imports)}@Mod(${values.mainClass}.MOD_ID)
public final class ${values.mainClass}Forge {
    public ${values.mainClass}Forge() {
${register}        ${values.mainClass}.init();
    }
}
`
}

function forgePackMeta(values: FormValues): string {
  const format = FORGE_PACK_FORMAT[values.mc] ?? 15
  return json({ pack: { description: `${values.modId} resources`, pack_format: format } })
}

export const architecturyTemplate: ProjectTemplate = defineTemplate({
  id: 'minecraft-architectury',
  nameKey: 'minecraft.template.architectury.name',
  descriptionKey: 'minecraft.template.architectury.description',
  languageId: 'java',
  kindId: (values) => templateKind('minecraft-architectury', values),
  icon: 'Ar',
  color: '#b86ef0',
  buildFields: fields,
  open: ({ values }: TemplateContext) => `common/src/main/java/${packagePath(values.package)}/${values.mainClass}.java`,
  setup: (ctx) => gradleSetup(ctx, currentCatalog().gradle.architectury),
  next: () => t('minecraft.next.architectury'),
  files(ctx) {
    const { values } = ctx
    const pkg = packagePath(values.package)
    const runs = platforms(values).flatMap((p) => [`:${p}:runClient`, `:${p}:runServer`])
    const files: Record<string, string> = {
      'settings.gradle': settings(values),
      'build.gradle': rootBuild(values),
      'gradle.properties': properties(values),
      'gradle/wrapper/gradle-wrapper.properties': wrapperProperties(currentCatalog().gradle.architectury),
      'common/build.gradle': commonBuild(values),
      [`common/src/main/java/${pkg}/${values.mainClass}.java`]: commonMain(values),
      'fabric/build.gradle': platformBuild(values, 'fabric'),
      'fabric/src/main/resources/fabric.mod.json': fabricModJson(values),
      [`fabric/src/main/java/${pkg}/fabric/${values.mainClass}Fabric.java`]: fabricEntry(values),
      [`fabric/src/main/java/${pkg}/fabric/client/${values.mainClass}FabricClient.java`]: fabricClientEntry(values),
      '.gitignore': gitignore(),
      'README.md': readme(ctx, `Architectury (${platforms(values).join(', ')})`, ['./gradlew build        # */build/libs/*.jar', ...runs.map((r) => `./gradlew ${r}`)]),
    }
    if (isOn(values, 'mixins')) {
      files[`common/src/main/java/${pkg}/mixin/ExampleMixin.java`] = exampleMixin(values.package)
      files[`common/src/main/resources/${values.modId}.mixins.json`] = mixinConfig(values.package, values.mc)
    }
    if (neoforgeOn(values)) {
      files['neoforge/build.gradle'] = platformBuild(values, 'neoforge')
      files['neoforge/gradle.properties'] = 'loom.platform=neoforge\n'
      files['neoforge/src/main/resources/META-INF/neoforge.mods.toml'] = modsToml(values, 'neoforge')
      files[`neoforge/src/main/java/${pkg}/neoforge/${values.mainClass}NeoForge.java`] = neoforgeEntry(values)
    }
    if (forgeOn(values)) {
      files['forge/build.gradle'] = platformBuild(values, 'forge')
      files['forge/gradle.properties'] = 'loom.platform=forge\n'
      files['forge/src/main/resources/META-INF/mods.toml'] = modsToml(values, 'forge')
      files['forge/src/main/resources/pack.mcmeta'] = forgePackMeta(values)
      files[`forge/src/main/java/${pkg}/forge/${values.mainClass}Forge.java`] = forgeEntry(values)
    }
    return files
  },
})
