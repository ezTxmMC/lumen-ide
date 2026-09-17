/**
 * The mod templates: Fabric, Quilt, NeoForge and Forge.
 *
 * From Minecraft 26.1 the game is no longer obfuscated: Fabric then uses
 * `net.fabricmc.fabric-loom` without mappings and `implementation`, before that
 * `net.fabricmc.fabric-loom-remap` with Mojang mappings and `modImplementation`.
 */

import type { FormField, FormValues, ProjectTemplate, TemplateContext } from '@/core/types'
import { t } from '@/i18n'
import {
  authorsOf, buildToolField, defineTemplate, foojay, gitignore, gradleSetup, identityFields, isKts, isOn, javaField,
  javaHeader, javaText, json, mcVersionField, packagePath, quoted, readme, settingsFile, toggle, versionField,
  wrapperProperties,
} from './common'
import { templateKind } from './kinds'
import {
  FORGE_PACK_FORMAT, currentCatalog, isUnobfuscated, mcRange, mixinLevel, sortVersions,
} from './versions'

/* ------------------------------------------------------------------ *
 * The shared Java code
 * ------------------------------------------------------------------ */

/** A Brigadier command with the Mojang names — the same for every loader. */
export function vanillaCommand(pkg: string): string {
  return `${javaHeader(`${pkg}.command`, [
    'com.mojang.brigadier.CommandDispatcher',
    'com.mojang.brigadier.arguments.StringArgumentType',
    'net.minecraft.commands.CommandSourceStack',
    'net.minecraft.commands.Commands',
    'net.minecraft.network.chat.Component',
  ])}/** /hello [name] */
public final class HelloCommand {
    private HelloCommand() {
    }

    public static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
        dispatcher.register(Commands.literal("hello")
            .executes(ctx -> {
                ctx.getSource().sendSuccess(() -> Component.literal("${javaText(t('minecraft.code.hello'))}"), false);
                return 1;
            })
            .then(Commands.argument("name", StringArgumentType.word())
                .executes(ctx -> {
                    String name = StringArgumentType.getString(ctx, "name");
                    ctx.getSource().sendSuccess(() -> Component.literal("${javaText(t('minecraft.code.helloName'))}".replace("%name%", name)), false);
                    return 1;
                })));
    }
}
`
}

/** An example mixin: runs before the world is loaded. */
export function exampleMixin(pkg: string): string {
  return `${javaHeader(`${pkg}.mixin`, [
    'net.minecraft.server.MinecraftServer',
    'org.spongepowered.asm.mixin.Mixin',
    'org.spongepowered.asm.mixin.injection.At',
    'org.spongepowered.asm.mixin.injection.Inject',
    'org.spongepowered.asm.mixin.injection.callback.CallbackInfo',
  ])}@Mixin(MinecraftServer.class)
public abstract class ExampleMixin {
    @Inject(method = "loadLevel", at = @At("HEAD"))
    private void beforeLoadLevel(CallbackInfo info) {
        // ${t('minecraft.code.mixinComment')}
    }
}
`
}

export function mixinConfig(pkg: string, mc: string): string {
  return json({
    required: true,
    package: `${pkg}.mixin`,
    compatibilityLevel: mixinLevel(mc),
    mixins: ['ExampleMixin'],
    client: [],
    injectors: { defaultRequire: 1 },
    overwrites: { requireAnnotations: true },
  })
}

function langFile(values: FormValues): string {
  return json({ [`item.${values.modId}.example_item`]: 'Example Item' })
}

function gradleProperties(entries: Record<string, string>, extra: string[] = []): string {
  const lines = [
    'org.gradle.jvmargs=-Xmx2G',
    'org.gradle.daemon=true',
    'org.gradle.parallel=true',
    'org.gradle.caching=true',
    ...extra,
    '',
    ...Object.entries(entries).map(([k, v]) => `${k}=${v}`),
    '',
  ]
  return lines.join('\n')
}

const openMain = ({ values }: TemplateContext) => `src/main/java/${packagePath(values.package)}/${values.mainClass}.java`

const gradleCommands = (runs: string[]) => [
  './gradlew build        # build/libs/*.jar',
  ...runs.map((r) => `./gradlew ${r}`),
]

/* ------------------------------------------------------------------ *
 * Fabric
 * ------------------------------------------------------------------ */

function fabricFields(): FormField[] {
  const catalog = () => currentCatalog().fabric
  const api = (v: FormValues) => isOn(v, 'fabricApi')
  return [
    ...identityFields('mod'),
    mcVersionField(() => sortVersions(Object.keys(catalog().api))),
    javaField(),
    versionField('loaderVersion', t('minecraft.field.loaderVersion', { loader: 'Fabric Loader' }), () => catalog().loader),
    versionField('fabricApiVersion', t('minecraft.field.apiVersion', { api: 'Fabric API' }), (v) => catalog().api[v.mc] ?? '', api),
    versionField('loomVersion', t('minecraft.field.pluginVersion', { plugin: 'Fabric Loom' }), () => catalog().loom),
    buildToolField(['gradle-kts', 'gradle-groovy']),
    toggle('fabricApi', t('minecraft.option.fabricApi'), true),
    toggle('splitSources', t('minecraft.option.splitSources'), true),
    toggle('mixins', t('minecraft.option.mixins'), true),
    toggle('accessWidener', t('minecraft.option.accessWidener'), false),
    toggle('datagen', t('minecraft.option.datagen'), false, api),
    toggle('command', t('minecraft.option.command'), true, api),
    toggle('listener', t('minecraft.option.listener'), true, api),
  ]
}

interface LoomOptions {
  loader: 'fabric' | 'quilt'
  split: boolean
  api: boolean
  mixins: boolean
  widener: string | null
  datagen: boolean
}

/** The Fabric Maven for the Fabric API — Fabric Loom brings it along itself, Quilt Loom does not. */
function loomRepositories(loader: LoomOptions['loader'], kts: boolean): string {
  if (loader === 'fabric') return 'repositories {\n}'
  if (kts) return 'repositories {\n    maven("https://maven.fabricmc.net/") {\n        name = "Fabric"\n    }\n}'
  return "repositories {\n    maven {\n        name = 'Fabric'\n        url = 'https://maven.fabricmc.net/'\n    }\n}"
}

function loomSourceSets(kts: boolean, split: boolean): string[] {
  const indent = '            '
  const main = kts ? `${indent}sourceSet(sourceSets.main.get())` : `${indent}sourceSet sourceSets.main`
  if (!split) return [main]
  return [main, kts ? `${indent}sourceSet(sourceSets.getByName("client"))` : `${indent}sourceSet sourceSets.client`]
}

function loomBuild(values: FormValues, o: LoomOptions): string {
  const kts = isKts(values)
  const unobf = isUnobfuscated(values.mc)
  const q = (s: string) => (kts ? `"${s}"` : `'${s}'`)
  const prop = (name: string) => (kts ? `\${property("${name}")}` : `\${project.${name}}`)
  const call = (fn: string, arg: string) => (kts ? `${fn}(${arg})` : `${fn} ${arg}`)
  // Quilt exists for obfuscated versions alone, Fabric depending on the version.
  const configuration = unobf && o.loader === 'fabric' ? 'implementation' : 'modImplementation'
  const pluginId: Record<LoomOptions['loader'], string> = {
    fabric: unobf ? 'net.fabricmc.fabric-loom' : 'net.fabricmc.fabric-loom-remap',
    quilt: 'org.quiltmc.loom',
  }
  const pluginVersion = o.loader === 'fabric' ? values.loomVersion : currentCatalog().quilt.loom

  const deps = [
    `    ${call('minecraft', `"com.mojang:minecraft:${prop('minecraft_version')}"`)}`,
    ...(unobf ? [] : [`    ${call('mappings', 'loom.officialMojangMappings()')}`]),
  ]
  const loaderArtifact = o.loader === 'fabric' ? 'net.fabricmc:fabric-loader' : 'org.quiltmc:quilt-loader'
  deps.push(`    ${call(configuration, `"${loaderArtifact}:${prop('loader_version')}"`)}`)
  if (o.api) deps.push(`    ${call(configuration, `"net.fabricmc.fabric-api:fabric-api:${prop('fabric_api_version')}"`)}`)

  const loomLines: string[] = []
  if (o.split) loomLines.push('    splitEnvironmentSourceSets()', '')
  const sourceSets = loomSourceSets(kts, o.split)
  loomLines.push(
    '    mods {',
    kts ? `        register("${values.modId}") {` : `        "${values.modId}" {`,
    ...sourceSets,
    '        }',
    '    }',
  )
  if (o.widener) loomLines.push('', `    accessWidenerPath = file(${q(`src/main/resources/${o.widener}`)})`)

  const metadata = o.loader === 'fabric' ? 'fabric.mod.json' : 'quilt.mod.json'
  const repositories = loomRepositories(o.loader, kts)

  const blocks = [
    kts
      ? `plugins {\n    id("${pluginId[o.loader]}") version "${pluginVersion}"\n    \`maven-publish\`\n}`
      : `plugins {\n    id '${pluginId[o.loader]}' version '${pluginVersion}'\n    id 'maven-publish'\n}`,
    kts
      ? 'version = providers.gradleProperty("mod_version").get()\ngroup = providers.gradleProperty("maven_group").get()\n\nbase {\n    archivesName = providers.gradleProperty("archives_base_name").get()\n}'
      : 'version = project.mod_version\ngroup = project.maven_group\n\nbase {\n    archivesName = project.archives_base_name\n}',
    repositories,
    `loom {\n${loomLines.join('\n')}\n}`,
  ]
  if (o.datagen) {
    blocks.push(o.split
      ? 'fabricApi {\n    configureDataGeneration {\n        client = true\n    }\n}'
      : 'fabricApi {\n    configureDataGeneration()\n}')
  }
  blocks.push(
    `dependencies {\n${deps.join('\n')}\n}`,
    kts
      ? `tasks.processResources {\n    val version = project.version\n    inputs.property("version", version)\n    filesMatching("${metadata}") {\n        expand("version" to version)\n    }\n}`
      : `processResources {\n    def version = project.version\n    inputs.property 'version', version\n    filesMatching('${metadata}') {\n        expand 'version': version\n    }\n}`,
    kts
      ? `java {\n    withSourcesJar()\n    toolchain.languageVersion = JavaLanguageVersion.of(${values.java})\n}`
      : `java {\n    withSourcesJar()\n    toolchain {\n        languageVersion = JavaLanguageVersion.of(${values.java})\n    }\n}`,
    kts
      ? `tasks.withType<JavaCompile>().configureEach {\n    options.encoding = "UTF-8"\n    options.release = ${values.java}\n}`
      : `tasks.withType(JavaCompile).configureEach {\n    options.encoding = 'UTF-8'\n    options.release = ${values.java}\n}`,
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

function fabricMain(values: FormValues): string {
  const pkg = values.package
  const imports = ['net.fabricmc.api.ModInitializer', 'org.slf4j.Logger', 'org.slf4j.LoggerFactory']
  const body = [`        LOGGER.info("${javaText(t('minecraft.code.modLoaded', { name: values.name ?? values.modId }))}");`]
  const api = isOn(values, 'fabricApi')
  if (api && isOn(values, 'listener')) {
    imports.push('net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents')
    body.push(`        ServerLifecycleEvents.SERVER_STARTED.register(server -> LOGGER.info("${javaText(t('minecraft.code.serverStarted'))}"));`)
  }
  if (api && isOn(values, 'command')) {
    imports.push('net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback', `${pkg}.command.HelloCommand`)
    body.push('        CommandRegistrationCallback.EVENT.register((dispatcher, registryAccess, environment) -> HelloCommand.register(dispatcher));')
  }
  return `${javaHeader(pkg, imports)}public class ${values.mainClass} implements ModInitializer {
    public static final String MOD_ID = "${values.modId}";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);

    @Override
    public void onInitialize() {
${body.join('\n')}
    }
}
`
}

function fabricClient(values: FormValues): string {
  return `${javaHeader(`${values.package}.client`, ['net.fabricmc.api.ClientModInitializer'])}public class ${values.mainClass}Client implements ClientModInitializer {
    @Override
    public void onInitializeClient() {
        // ${t('minecraft.code.clientComment')}
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
        FabricDataGenerator.Pack pack = generator.createPack();
        // pack.addProvider(...);
    }
}
`
}

function fabricModJson(values: FormValues): string {
  const api = isOn(values, 'fabricApi')
  const entrypoints: Record<string, string[]> = {
    main: [`${values.package}.${values.mainClass}`],
    client: [`${values.package}.client.${values.mainClass}Client`],
  }
  if (api && isOn(values, 'datagen')) entrypoints['fabric-datagen'] = [`${values.package}.datagen.ModDataGenerator`]
  const depends: Record<string, string> = {
    fabricloader: `>=${values.loaderVersion}`,
    minecraft: `~${values.mc}`,
    java: `>=${values.java}`,
  }
  if (api) depends['fabric-api'] = '*'
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
  nameKey: 'minecraft.template.fabric.name',
  descriptionKey: 'minecraft.template.fabric.description',
  languageId: 'java',
  kindId: (values) => templateKind('minecraft-fabric', values),
  icon: 'Fa',
  color: '#dbd0b4',
  buildFields: fabricFields,
  open: openMain,
  setup: (ctx) => gradleSetup(ctx, currentCatalog().gradle.fabric),
  next: () => t('minecraft.next.mod'),
  files(ctx) {
    const { values } = ctx
    const kts = isKts(values)
    const api = isOn(values, 'fabricApi')
    const split = isOn(values, 'splitSources')
    const unobf = isUnobfuscated(values.mc)
    const widener = widenerFile(values, unobf ? 'classtweaker' : 'accesswidener')
    const datagen = api && isOn(values, 'datagen')
    const pkg = packagePath(values.package)
    const clientRoot = split ? 'src/client/java' : 'src/main/java'
    const properties: Record<string, string> = {
      minecraft_version: values.mc,
      loader_version: values.loaderVersion,
      mod_version: values.version,
      maven_group: values.groupId,
      archives_base_name: values.modId,
    }
    if (api) properties.fabric_api_version = values.fabricApiVersion

    const files: Record<string, string> = {
      ...settingsFile(values, values.modId, ['https://maven.fabricmc.net/'], foojay(values)),
      [kts ? 'build.gradle.kts' : 'build.gradle']: loomBuild(values, { loader: 'fabric', split, api, mixins: isOn(values, 'mixins'), widener, datagen }),
      'gradle.properties': gradleProperties(properties, ['org.gradle.configuration-cache=false']),
      'gradle/wrapper/gradle-wrapper.properties': wrapperProperties(currentCatalog().gradle.fabric),
      'src/main/resources/fabric.mod.json': fabricModJson(values),
      [`src/main/java/${pkg}/${values.mainClass}.java`]: fabricMain(values),
      [`${clientRoot}/${pkg}/client/${values.mainClass}Client.java`]: fabricClient(values),
      '.gitignore': gitignore(),
      'README.md': readme(ctx, 'Fabric', gradleCommands(['runClient', 'runServer', ...(datagen ? ['runDatagen'] : []), ...(unobf ? [] : ['genSources'])])),
    }
    if (api && isOn(values, 'command')) files[`src/main/java/${pkg}/command/HelloCommand.java`] = vanillaCommand(values.package)
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

function quiltFields(): FormField[] {
  const catalog = () => currentCatalog()
  const api = (v: FormValues) => isOn(v, 'fabricApi')
  return [
    ...identityFields('mod'),
    { ...mcVersionField(() => sortVersions(catalog().quilt.minecraft)), hint: t('minecraft.hint.quiltVersions') },
    javaField(),
    versionField('loaderVersion', t('minecraft.field.loaderVersion', { loader: 'Quilt Loader' }), () => catalog().quilt.loader),
    versionField('fabricApiVersion', t('minecraft.field.apiVersion', { api: 'Fabric API' }), (v) => catalog().fabric.api[v.mc] ?? '', api),
    buildToolField(['gradle-kts', 'gradle-groovy']),
    toggle('fabricApi', t('minecraft.option.fabricApi'), true),
    toggle('mixins', t('minecraft.option.mixins'), true),
    toggle('accessWidener', t('minecraft.option.accessWidener'), false),
    toggle('command', t('minecraft.option.command'), true, api),
    toggle('listener', t('minecraft.option.listener'), true, api),
  ]
}

function quiltModJson(values: FormValues): string {
  const api = isOn(values, 'fabricApi')
  const contributors = Object.fromEntries(authorsOf(values).map((a) => [a, 'Owner']))
  const depends = [
    { id: 'quilt_loader', versions: `>=${values.loaderVersion}` },
    { id: 'minecraft', versions: `~${values.mc}` },
    ...(api ? [{ id: 'fabric-api', versions: '*' }] : []),
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
  nameKey: 'minecraft.template.quilt.name',
  descriptionKey: 'minecraft.template.quilt.description',
  languageId: 'java',
  kindId: (values) => templateKind('minecraft-quilt', values),
  icon: 'Qu',
  color: '#8b5fc6',
  buildFields: quiltFields,
  open: openMain,
  setup: (ctx) => gradleSetup(ctx, currentCatalog().gradle.quilt),
  next: () => t('minecraft.next.mod'),
  files(ctx) {
    const { values } = ctx
    const kts = isKts(values)
    const api = isOn(values, 'fabricApi')
    const widener = widenerFile(values, 'accesswidener')
    const pkg = packagePath(values.package)
    const properties: Record<string, string> = {
      minecraft_version: values.mc,
      loader_version: values.loaderVersion,
      mod_version: values.version,
      maven_group: values.groupId,
      archives_base_name: values.modId,
    }
    if (api) properties.fabric_api_version = values.fabricApiVersion

    const files: Record<string, string> = {
      ...settingsFile(values, values.modId, ['https://maven.quiltmc.org/repository/release/', 'https://maven.fabricmc.net/'], foojay(values)),
      [kts ? 'build.gradle.kts' : 'build.gradle']: loomBuild(values, { loader: 'quilt', split: false, api, mixins: isOn(values, 'mixins'), widener, datagen: false }),
      'gradle.properties': gradleProperties(properties),
      'gradle/wrapper/gradle-wrapper.properties': wrapperProperties(currentCatalog().gradle.quilt),
      'src/main/resources/quilt.mod.json': quiltModJson(values),
      [`src/main/java/${pkg}/${values.mainClass}.java`]: fabricMain(values),
      [`src/main/java/${pkg}/client/${values.mainClass}Client.java`]: fabricClient(values),
      '.gitignore': gitignore(),
      'README.md': readme(ctx, 'Quilt', gradleCommands(['runClient', 'runServer', 'genSources'])),
    }
    if (api && isOn(values, 'command')) files[`src/main/java/${pkg}/command/HelloCommand.java`] = vanillaCommand(values.package)
    if (isOn(values, 'mixins')) {
      files[`src/main/java/${pkg}/mixin/ExampleMixin.java`] = exampleMixin(values.package)
      files[`src/main/resources/${values.modId}.mixins.json`] = mixinConfig(values.package, values.mc)
    }
    if (widener) files[`src/main/resources/${widener}`] = widenerContent(values.mc)
    return files
  },
})

/* ------------------------------------------------------------------ *
 * NeoForge (ModDevGradle)
 * ------------------------------------------------------------------ */

function neoforgeFields(): FormField[] {
  const catalog = () => currentCatalog().neoforge
  return [
    ...identityFields('mod'),
    mcVersionField(() => sortVersions(Object.keys(catalog().versions))),
    javaField(),
    versionField('neoVersion', t('minecraft.field.loaderVersion', { loader: 'NeoForge' }), (v) => catalog().versions[v.mc] ?? ''),
    versionField('moddevVersion', t('minecraft.field.pluginVersion', { plugin: 'ModDevGradle' }), () => catalog().moddev),
    buildToolField(['gradle-kts', 'gradle-groovy']),
    toggle('item', t('minecraft.option.deferredRegister'), true),
    toggle('command', t('minecraft.option.command'), true),
    toggle('listener', t('minecraft.option.listener'), true),
    toggle('mixins', t('minecraft.option.mixins'), false),
    toggle('datagen', t('minecraft.option.datagen'), false),
  ]
}

/** Before 1.21.4 the data generation was called `data()` rather than `clientData()`. */
const legacyData = (mc: string) => mc === '1.21.1'

function neoforgeBuild(values: FormValues): string {
  const kts = isKts(values)
  const data = legacyData(values.mc) ? 'data()' : 'clientData()'
  const datagen = isOn(values, 'datagen')
  if (kts) {
    return `plugins {
    \`java-library\`
    \`maven-publish\`
    id("net.neoforged.moddev") version "${values.moddevVersion}"
    idea
}

val modId = providers.gradleProperty("mod_id").get()
version = providers.gradleProperty("mod_version").get()
group = providers.gradleProperty("mod_group_id").get()

base {
    archivesName = modId
}

java.toolchain.languageVersion = JavaLanguageVersion.of(${values.java})
${datagen ? '\nsourceSets.main {\n    resources.srcDir("src/generated/resources")\n}\n' : ''}
neoForge {
    version = providers.gradleProperty("neo_version").get()

    runs {
        register("client") {
            client()
        }
        register("server") {
            server()
            programArgument("--nogui")
        }${datagen ? `
        register("data") {
            ${data}
            programArguments.addAll(
                "--mod", modId, "--all",
                "--output", file("src/generated/resources/").absolutePath,
                "--existing", file("src/main/resources/").absolutePath,
            )
        }` : ''}
        configureEach {
            systemProperty("forge.logging.markers", "REGISTRIES")
            logLevel = org.slf4j.event.Level.DEBUG
        }
    }

    mods {
        register(modId) {
            sourceSet(sourceSets.main.get())
        }
    }
}

tasks.withType<JavaCompile>().configureEach {
    options.encoding = "UTF-8"
}
`
  }
  return `plugins {
    id 'java-library'
    id 'maven-publish'
    id 'net.neoforged.moddev' version '${values.moddevVersion}'
    id 'idea'
}

version = mod_version
group = mod_group_id

base {
    archivesName = mod_id
}

java.toolchain.languageVersion = JavaLanguageVersion.of(${values.java})
${datagen ? "\nsourceSets.main.resources { srcDir 'src/generated/resources' }\n" : ''}
neoForge {
    version = project.neo_version

    runs {
        client {
            client()
        }
        server {
            server()
            programArgument '--nogui'
        }${datagen ? `
        data {
            ${data}
            programArguments.addAll '--mod', project.mod_id, '--all', '--output', file('src/generated/resources/').getAbsolutePath(), '--existing', file('src/main/resources/').getAbsolutePath()
        }` : ''}
        configureEach {
            systemProperty 'forge.logging.markers', 'REGISTRIES'
            logLevel = org.slf4j.event.Level.DEBUG
        }
    }

    mods {
        "\${mod_id}" {
            sourceSet(sourceSets.main)
        }
    }
}

tasks.withType(JavaCompile).configureEach {
    options.encoding = 'UTF-8'
}
`
}

function neoforgeToml(values: FormValues): string {
  const authors = authorsOf(values)
  const lines = [
    'modLoader = "javafml"',
    `loaderVersion = "${legacyData(values.mc) ? '[4,)' : '[1,)'}"`,
    `license = ${quoted(values.license)}`,
    '',
    '[[mods]]',
    `modId = "${values.modId}"`,
    `version = "${values.version}"`,
    `displayName = ${quoted(values.name ?? values.modId)}`,
    ...(authors.length ? [`authors = ${quoted(authors.join(', '))}`] : []),
    ...(values.website ? [`displayURL = ${quoted(values.website)}`] : []),
    `description = ${quoted(values.description || values.name || values.modId)}`,
  ]
  if (isOn(values, 'mixins')) lines.push('', '[[mixins]]', `config = "${values.modId}.mixins.json"`)
  lines.push(
    '',
    `[[dependencies.${values.modId}]]`,
    'modId = "neoforge"',
    'type = "required"',
    `versionRange = "[${values.neoVersion},)"`,
    'ordering = "NONE"',
    'side = "BOTH"',
    '',
    `[[dependencies.${values.modId}]]`,
    'modId = "minecraft"',
    'type = "required"',
    `versionRange = "${mcRange(values.mc)}"`,
    'ordering = "NONE"',
    'side = "BOTH"',
  )
  return `${lines.join('\n')}\n`
}

function neoforgeMain(values: FormValues): string {
  const pkg = values.package
  const imports = [
    'com.mojang.logging.LogUtils',
    'net.neoforged.bus.api.IEventBus',
    'net.neoforged.fml.ModContainer',
    'net.neoforged.fml.common.Mod',
    'net.neoforged.fml.event.lifecycle.FMLCommonSetupEvent',
    'org.slf4j.Logger',
  ]
  const fields: string[] = []
  const constructor = ['        modEventBus.addListener(this::commonSetup);']
  const methods = [`    private void commonSetup(FMLCommonSetupEvent event) {\n        LOGGER.info("${javaText(t('minecraft.code.modLoaded', { name: values.name ?? values.modId }))}");\n    }`]

  if (isOn(values, 'item')) {
    imports.push('net.minecraft.world.item.Item', 'net.neoforged.neoforge.registries.DeferredItem', 'net.neoforged.neoforge.registries.DeferredRegister')
    fields.push(
      '    public static final DeferredRegister.Items ITEMS = DeferredRegister.createItems(MOD_ID);',
      '    public static final DeferredItem<Item> EXAMPLE_ITEM = ITEMS.registerSimpleItem("example_item");',
    )
    constructor.push('        ITEMS.register(modEventBus);')
  }
  if (isOn(values, 'listener')) {
    imports.push('net.neoforged.neoforge.common.NeoForge', 'net.neoforged.neoforge.event.server.ServerStartingEvent')
    constructor.push('        NeoForge.EVENT_BUS.addListener(this::onServerStarting);')
    methods.push(`    private void onServerStarting(ServerStartingEvent event) {\n        LOGGER.info("${javaText(t('minecraft.code.serverStarted'))}");\n    }`)
  }
  if (isOn(values, 'command')) {
    imports.push('net.neoforged.neoforge.common.NeoForge', 'net.neoforged.neoforge.event.RegisterCommandsEvent', `${pkg}.command.HelloCommand`)
    constructor.push('        NeoForge.EVENT_BUS.addListener(this::onRegisterCommands);')
    methods.push('    private void onRegisterCommands(RegisterCommandsEvent event) {\n        HelloCommand.register(event.getDispatcher());\n    }')
  }
  if (isOn(values, 'datagen')) {
    imports.push(`${pkg}.datagen.ModDataGenerator`)
    constructor.push('        modEventBus.addListener(ModDataGenerator::gatherData);')
  }

  return `${javaHeader(pkg, imports)}@Mod(${values.mainClass}.MOD_ID)
public final class ${values.mainClass} {
    public static final String MOD_ID = "${values.modId}";
    public static final Logger LOGGER = LogUtils.getLogger();
${fields.length ? `\n${fields.join('\n')}\n` : ''}
    public ${values.mainClass}(IEventBus modEventBus, ModContainer modContainer) {
${constructor.join('\n')}
    }

${methods.join('\n\n')}
}
`
}

function neoforgeClient(values: FormValues): string {
  return `${javaHeader(`${values.package}.client`, [
    `${values.package}.${values.mainClass}`,
    'net.neoforged.api.distmarker.Dist',
    'net.neoforged.bus.api.IEventBus',
    'net.neoforged.fml.common.Mod',
    'net.neoforged.fml.event.lifecycle.FMLClientSetupEvent',
  ])}/** ${t('minecraft.code.clientComment')} */
@Mod(value = ${values.mainClass}.MOD_ID, dist = Dist.CLIENT)
public final class ${values.mainClass}Client {
    public ${values.mainClass}Client(IEventBus modEventBus) {
        modEventBus.addListener(this::clientSetup);
    }

    private void clientSetup(FMLClientSetupEvent event) {
        ${values.mainClass}.LOGGER.info("Client setup");
    }
}
`
}

function neoforgeDatagen(values: FormValues): string {
  const event = legacyData(values.mc) ? 'GatherDataEvent' : 'GatherDataEvent.Client'
  return `${javaHeader(`${values.package}.datagen`, ['net.neoforged.neoforge.data.event.GatherDataEvent'])}public final class ModDataGenerator {
    private ModDataGenerator() {
    }

    public static void gatherData(${event} event) {
        // event.getGenerator().addProvider(...);
    }
}
`
}

export const neoforgeTemplate: ProjectTemplate = defineTemplate({
  id: 'minecraft-neoforge',
  nameKey: 'minecraft.template.neoforge.name',
  descriptionKey: 'minecraft.template.neoforge.description',
  languageId: 'java',
  kindId: (values) => templateKind('minecraft-neoforge', values),
  icon: 'NF',
  color: '#e68c37',
  buildFields: neoforgeFields,
  open: openMain,
  setup: (ctx) => gradleSetup(ctx, currentCatalog().gradle.neoforge),
  next: () => t('minecraft.next.mod'),
  files(ctx) {
    const { values } = ctx
    const kts = isKts(values)
    const pkg = packagePath(values.package)
    const files: Record<string, string> = {
      ...settingsFile(values, values.modId, [], foojay(values)),
      [kts ? 'build.gradle.kts' : 'build.gradle']: neoforgeBuild(values),
      'gradle.properties': gradleProperties({
        minecraft_version: values.mc,
        neo_version: values.neoVersion,
        mod_id: values.modId,
        mod_version: values.version,
        mod_group_id: values.groupId,
      }, ['org.gradle.configuration-cache=true']),
      'gradle/wrapper/gradle-wrapper.properties': wrapperProperties(currentCatalog().gradle.neoforge),
      'src/main/resources/META-INF/neoforge.mods.toml': neoforgeToml(values),
      [`src/main/java/${pkg}/${values.mainClass}.java`]: neoforgeMain(values),
      [`src/main/java/${pkg}/client/${values.mainClass}Client.java`]: neoforgeClient(values),
      '.gitignore': gitignore(),
      'README.md': readme(ctx, `NeoForge ${values.neoVersion}`, gradleCommands(['runClient', 'runServer', ...(isOn(values, 'datagen') ? ['runData'] : [])])),
    }
    if (isOn(values, 'item')) files[`src/main/resources/assets/${values.modId}/lang/en_us.json`] = langFile(values)
    if (isOn(values, 'command')) files[`src/main/java/${pkg}/command/HelloCommand.java`] = vanillaCommand(values.package)
    if (isOn(values, 'mixins')) {
      files[`src/main/java/${pkg}/mixin/ExampleMixin.java`] = exampleMixin(values.package)
      files[`src/main/resources/${values.modId}.mixins.json`] = mixinConfig(values.package, values.mc)
    }
    if (isOn(values, 'datagen')) files[`src/main/java/${pkg}/datagen/ModDataGenerator.java`] = neoforgeDatagen(values)
    return files
  },
})

/* ------------------------------------------------------------------ *
 * Forge (ForgeGradle 7, EventBus 7)
 * ------------------------------------------------------------------ */

function forgeFields(): FormField[] {
  const catalog = () => currentCatalog().forge
  return [
    ...identityFields('mod'),
    mcVersionField(() => sortVersions(Object.keys(catalog().versions))),
    javaField(),
    versionField('forgeVersion', t('minecraft.field.loaderVersion', { loader: 'Forge' }), (v) => catalog().versions[v.mc] ?? ''),
    versionField('forgeGradleVersion', t('minecraft.field.pluginVersion', { plugin: 'ForgeGradle' }), () => catalog().gradle),
    { ...buildToolField(['gradle-groovy']), hint: t('minecraft.hint.groovyOnly') },
    toggle('item', t('minecraft.option.deferredRegister'), true),
    toggle('command', t('minecraft.option.command'), true),
    toggle('listener', t('minecraft.option.listener'), true),
    toggle('datagen', t('minecraft.option.datagen'), false),
  ]
}

function forgeBuild(values: FormValues): string {
  const mappings = isUnobfuscated(values.mc) ? '' : `    mappings channel: 'official', version: '${values.mc}'\n\n`
  const datagen = isOn(values, 'datagen')
  return `plugins {
    id 'java'
    id 'idea'
    id 'net.minecraftforge.gradle' version '${values.forgeGradleVersion}'
}

version = mod_version
group = mod_group_id

base {
    archivesName = mod_id
}

java.toolchain.languageVersion = JavaLanguageVersion.of(${values.java})
${datagen ? "\nsourceSets.main.resources { srcDir 'src/generated/resources' }\n" : ''}
minecraft {
${mappings}    runs {
        configureEach {
            workingDir = layout.projectDirectory.dir('run')
            systemProperty 'eventbus.api.strictRuntimeChecks', 'true'
        }

        register('client')

        register('server') {
            args '--nogui'
        }${datagen ? `

        register('data') {
            workingDir = layout.projectDirectory.dir('run-data')
            args '--mod', mod_id, '--all', '--output', layout.projectDirectory.dir('src/generated/resources'), '--existing', layout.projectDirectory.dir('src/main/resources')
        }` : ''}
    }
}

repositories {
    minecraft.mavenizer(it)
    maven fg.forgeMaven
    maven fg.minecraftLibsMaven
    mavenCentral()
}

dependencies {
    implementation minecraft.dependency("net.minecraftforge:forge:\${minecraft_version}-\${forge_version}")
    annotationProcessor 'net.minecraftforge:eventbus-validator:${currentCatalog().forge.eventbusValidator}'
}

tasks.withType(JavaCompile).configureEach {
    options.encoding = 'UTF-8'
}
`
}

function forgeToml(values: FormValues): string {
  const major = values.forgeVersion.split('.')[0]
  const authors = authorsOf(values)
  const lines = [
    'modLoader = "javafml"',
    `loaderVersion = "[${major},)"`,
    `license = ${quoted(values.license)}`,
    '',
    '[[mods]]',
    `modId = "${values.modId}"`,
    `version = "${values.version}"`,
    `displayName = ${quoted(values.name ?? values.modId)}`,
    ...(authors.length ? [`authors = ${quoted(authors.join(', '))}`] : []),
    ...(values.website ? [`displayURL = ${quoted(values.website)}`] : []),
    `description = ${quoted(values.description || values.name || values.modId)}`,
    '',
    `[[dependencies.${values.modId}]]`,
    'modId = "forge"',
    'mandatory = true',
    `versionRange = "[${major},)"`,
    'ordering = "NONE"',
    'side = "BOTH"',
    '',
    `[[dependencies.${values.modId}]]`,
    'modId = "minecraft"',
    'mandatory = true',
    `versionRange = "${mcRange(values.mc)}"`,
    'ordering = "NONE"',
    'side = "BOTH"',
  ]
  return `${lines.join('\n')}\n`
}

function forgeMain(values: FormValues): string {
  const pkg = values.package
  const imports = [
    'com.mojang.logging.LogUtils',
    'net.minecraftforge.fml.common.Mod',
    'net.minecraftforge.fml.event.lifecycle.FMLCommonSetupEvent',
    'net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext',
    'org.slf4j.Logger',
  ]
  const fields: string[] = []
  const constructor = [
    '        var modBusGroup = context.getModBusGroup();',
    '        FMLCommonSetupEvent.getBus(modBusGroup).addListener(this::commonSetup);',
  ]
  const methods = [`    private void commonSetup(FMLCommonSetupEvent event) {\n        LOGGER.info("${javaText(t('minecraft.code.modLoaded', { name: values.name ?? values.modId }))}");\n    }`]

  if (isOn(values, 'item')) {
    imports.push('net.minecraft.world.item.Item', 'net.minecraftforge.registries.DeferredRegister', 'net.minecraftforge.registries.ForgeRegistries', 'net.minecraftforge.registries.RegistryObject')
    fields.push(
      '    public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, MOD_ID);',
      '    public static final RegistryObject<Item> EXAMPLE_ITEM = ITEMS.register("example_item",',
      '        () -> new Item(new Item.Properties().setId(ITEMS.key("example_item"))));',
    )
    constructor.push('        ITEMS.register(modBusGroup);')
  }
  if (isOn(values, 'listener')) {
    imports.push('net.minecraftforge.event.server.ServerStartingEvent')
    constructor.push(`        ServerStartingEvent.BUS.addListener(${values.mainClass}::onServerStarting);`)
    methods.push(`    private static void onServerStarting(ServerStartingEvent event) {\n        LOGGER.info("${javaText(t('minecraft.code.serverStarted'))}");\n    }`)
  }
  if (isOn(values, 'command')) {
    imports.push('net.minecraftforge.event.RegisterCommandsEvent', `${pkg}.command.HelloCommand`)
    constructor.push(`        RegisterCommandsEvent.BUS.addListener(${values.mainClass}::onRegisterCommands);`)
    methods.push('    private static void onRegisterCommands(RegisterCommandsEvent event) {\n        HelloCommand.register(event.getDispatcher());\n    }')
  }

  return `${javaHeader(pkg, imports)}@Mod(${values.mainClass}.MOD_ID)
public final class ${values.mainClass} {
    public static final String MOD_ID = "${values.modId}";
    private static final Logger LOGGER = LogUtils.getLogger();
${fields.length ? `\n${fields.join('\n')}\n` : ''}
    public ${values.mainClass}(FMLJavaModLoadingContext context) {
${constructor.join('\n')}
    }

${methods.join('\n\n')}
}
`
}

function forgePackMeta(values: FormValues): string {
  const format = FORGE_PACK_FORMAT[values.mc] ?? FORGE_PACK_FORMAT['26.2']
  return json({ pack: { description: `${values.modId} resources`, max_format: format, min_format: [format, 1] } })
}

export const forgeTemplate: ProjectTemplate = defineTemplate({
  id: 'minecraft-forge',
  nameKey: 'minecraft.template.forge.name',
  descriptionKey: 'minecraft.template.forge.description',
  languageId: 'java',
  kindId: (values) => templateKind('minecraft-forge', values),
  icon: 'Fo',
  color: '#1e2d44',
  buildFields: forgeFields,
  open: openMain,
  setup: (ctx) => gradleSetup(ctx, currentCatalog().gradle.forge),
  next: () => t('minecraft.next.mod'),
  files(ctx) {
    const { values } = ctx
    const pkg = packagePath(values.package)
    const groovy = { ...values, build: 'gradle-groovy' }
    const files: Record<string, string> = {
      ...settingsFile(groovy, values.modId, [], foojay(groovy)),
      'build.gradle': forgeBuild(values),
      'gradle.properties': gradleProperties({
        minecraft_version: values.mc,
        forge_version: values.forgeVersion,
        mod_id: values.modId,
        mod_version: values.version,
        mod_group_id: values.groupId,
      }, ['org.gradle.configureondemand=true', 'net.minecraftforge.gradle.merge-source-sets=true']),
      'gradle/wrapper/gradle-wrapper.properties': wrapperProperties(currentCatalog().gradle.forge),
      'src/main/resources/META-INF/mods.toml': forgeToml(values),
      'src/main/resources/pack.mcmeta': forgePackMeta(values),
      [`src/main/java/${pkg}/${values.mainClass}.java`]: forgeMain(values),
      '.gitignore': gitignore(),
      'README.md': readme(ctx, `Forge ${values.forgeVersion}`, gradleCommands(['runClient', 'runServer', ...(isOn(values, 'datagen') ? ['runData'] : [])])),
    }
    if (isOn(values, 'item')) files[`src/main/resources/assets/${values.modId}/lang/en_us.json`] = langFile(values)
    if (isOn(values, 'command')) files[`src/main/java/${pkg}/command/HelloCommand.java`] = vanillaCommand(values.package)
    return files
  },
})

export const MOD_TEMPLATES = [fabricTemplate, neoforgeTemplate, forgeTemplate, quiltTemplate]

