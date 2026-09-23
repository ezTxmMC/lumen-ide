/**
 * The NeoForge template, built with ModDevGradle as the NeoForge MDKs are:
 *
 *  - 1.20.1: ModDevGradle Legacy with `net.neoforged:forge` — NeoForge's first
 *    release, still Forge's packages (`net.minecraftforge`) and mods.toml.
 *  - 1.20.4: MDG, `mods.toml`, the mod constructor takes the IEventBus.
 *  - 1.20.5 on: `neoforge.mods.toml`, IEventBus plus ModContainer; from 1.21.1
 *    a client class with `@Mod(dist = Dist.CLIENT)`, from 1.21.4 the data
 *    generation is `clientData()`; 26.x without mappings.
 *
 * 1.20.2 and 1.20.3 are not offered: they only ever had NeoGradle MDKs.
 */

import type { FormField, FormValues, ProjectTemplate } from '../../../../src/core/types'
import { DAEMON_JAVA, NEOFORGE_GRADLE, forgeFeatures, isUnobfuscated, javaFor, mcRange, neoFeatures, neoToolchain, packMeta } from '../eras'
import { t, versions } from '../lumen'
import { neoforgeFor } from '../sources'
import {
  authorsOf, buildToolField, defineTemplate, gitignore, gradleCommands, gradleProperties, gradleSetup, identityFields,
  isKts, isOn, javaField, javaHeader, javaText, json, packagePath, quoted, readme, settingsFile, toggle, wrapperFiles,
} from './common'
import { classicMain, modsToml } from './forge'
import { exampleMixin, langFile, mixinConfig, vanillaCommand } from './java'
import { gradleField, mcField, versionField } from './versions'

const legacy = (v: FormValues) => neoToolchain(v.mc ?? '')?.plugin === 'mdg-legacy'
const features = (v: FormValues) => neoFeatures(v.mc ?? '')
const parchmentOn = (v: FormValues) => isOn(v, 'parchment') && Boolean(v.mc) && !isUnobfuscated(v.mc)

function fields(): FormField[] {
  const scope = 'neoforge'
  return [
    ...identityFields('mod'),
    mcField('neoforge'),
    javaField((v) => javaFor(v.mc ?? '')),
    versionField({
      scope,
      id: 'neoVersion',
      label: t('field.loaderVersion', { loader: 'NeoForge' }),
      dependsOn: ['mc'],
      hint: t('hint.neoVersion'),
      async load(v) {
        const { all, legacy: forks } = await versions().neoforgeLists()
        return neoforgeFor(all, forks, v.mc)
      },
    }),
    versionField({
      scope,
      id: 'moddevVersion',
      label: t('field.pluginVersion', { plugin: 'ModDevGradle' }),
      load: () => versions().moddev(),
    }),
    toggle('parchment', t('option.parchment'), false, (v) => Boolean(v.mc) && !isUnobfuscated(v.mc), t('hint.parchment')),
    versionField({
      scope,
      id: 'parchmentVersion',
      label: t('field.parchmentVersion'),
      dependsOn: ['mc'],
      when: parchmentOn,
      load: (v) => versions().parchment(v.mc),
    }),
    gradleField(scope, () => NEOFORGE_GRADLE, []),
    buildToolField(['gradle-kts', 'gradle-groovy']),
    toggle('item', t('option.deferredRegister'), true),
    toggle('command', t('option.command'), true),
    toggle('listener', t('option.listener'), true),
    toggle('mixins', t('option.mixins'), false, (v) => !legacy(v), t('hint.mixinsLegacy')),
    toggle('datagen', t('option.datagen'), false),
  ]
}

/* ------------------------------------------------------------------ *
 * Build files
 * ------------------------------------------------------------------ */

/** How the build names the NeoForge version: `enable { neoForgeVersion … }` for the 1.20.1 fork. */
function versionLine(fork: boolean, kts: boolean): string {
  const property = kts ? 'providers.gradleProperty("neo_version").get()' : 'project.neo_version'
  if (fork) return `    enable {\n        neoForgeVersion = ${property}\n    }`
  return `    version = ${property}`
}

function parchmentLines(kts: boolean): string {
  const property = (name: string) => (kts ? `providers.gradleProperty("${name}").get()` : `project.${name}`)
  return `\n\n    parchment {\n        minecraftVersion = ${property('minecraft_version')}\n        mappingsVersion = ${property('parchment_version')}\n    }`
}

function neoforgeBuild(values: FormValues): string {
  const kts = isKts(values)
  const f = features(values)
  const datagen = isOn(values, 'datagen')
  const data = f.clientData ? 'clientData()' : 'data()'
  const extension = legacy(values) ? 'legacyForge' : 'neoForge'
  const plugin = legacy(values) ? 'net.neoforged.moddev.legacyforge' : 'net.neoforged.moddev'
  const parchment = parchmentOn(values)
  const version = versionLine(legacy(values), kts)
  const parchmentBlock = parchment ? parchmentLines(kts) : ''

  if (kts) {
    return `plugins {
    \`java-library\`
    \`maven-publish\`
    id("${plugin}") version "${values.moddevVersion}"
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
${extension} {
${version}${parchmentBlock}

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
    id '${plugin}' version '${values.moddevVersion}'
    id 'idea'
}

version = mod_version
group = mod_group_id

base {
    archivesName = mod_id
}

java.toolchain.languageVersion = JavaLanguageVersion.of(${values.java})
${datagen ? "\nsourceSets.main.resources { srcDir 'src/generated/resources' }\n" : ''}
${extension} {
${version}${parchmentBlock}

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
    'loaderVersion = "[1,)"',
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

/* ------------------------------------------------------------------ *
 * Java
 * ------------------------------------------------------------------ */

function neoforgeMain(values: FormValues): string {
  const pkg = values.package
  const f = features(values)
  const imports = [
    'com.mojang.logging.LogUtils',
    'net.neoforged.bus.api.IEventBus',
    'net.neoforged.fml.common.Mod',
    'net.neoforged.fml.event.lifecycle.FMLCommonSetupEvent',
    'org.slf4j.Logger',
    ...(f.modContainer ? ['net.neoforged.fml.ModContainer'] : []),
  ]
  const fields: string[] = []
  const constructor = ['        modEventBus.addListener(this::commonSetup);']
  const methods = [`    private void commonSetup(FMLCommonSetupEvent event) {\n        LOGGER.info("${javaText(t('code.modLoaded', { name: values.name ?? values.modId }))}");\n    }`]

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
    methods.push(`    private void onServerStarting(ServerStartingEvent event) {\n        LOGGER.info("${javaText(t('code.serverStarted'))}");\n    }`)
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
  const parameters = f.modContainer ? 'IEventBus modEventBus, ModContainer modContainer' : 'IEventBus modEventBus'

  return `${javaHeader(pkg, imports)}@Mod(${values.mainClass}.MOD_ID)
public final class ${values.mainClass} {
    public static final String MOD_ID = "${values.modId}";
    public static final Logger LOGGER = LogUtils.getLogger();
${fields.length ? `\n${fields.join('\n')}\n` : ''}
    public ${values.mainClass}(${parameters}) {
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
  ])}/** ${t('code.clientComment')} */
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
  const f = features(values)
  const legacyFork = legacy(values)
  const eventImport = legacyFork ? 'net.minecraftforge.data.event.GatherDataEvent' : 'net.neoforged.neoforge.data.event.GatherDataEvent'
  const event = f.clientData ? 'GatherDataEvent.Client' : 'GatherDataEvent'
  return `${javaHeader(`${values.package}.datagen`, [eventImport])}public final class ModDataGenerator {
    private ModDataGenerator() {
    }

    public static void gatherData(${event} event) {
        // event.getGenerator().addProvider(...);
    }
}
`
}

/** NeoForge 1.20.1 is Forge 47 under another name: Forge's classes, its data event on the mod bus. */
function legacyMain(values: FormValues): string {
  const f = forgeFeatures('1.20.1')
  const main = classicMain(values, {
    ...f,
    contextConstructor: false,
    item: isOn(values, 'item'),
    command: isOn(values, 'command'),
    listener: isOn(values, 'listener'),
  })
  if (!isOn(values, 'datagen')) return main
  return main
    .replace('import net.minecraftforge.eventbus.api.IEventBus;', `import ${values.package}.datagen.ModDataGenerator;\nimport net.minecraftforge.eventbus.api.IEventBus;`)
    .replace('        modEventBus.addListener(this::commonSetup);', '        modEventBus.addListener(this::commonSetup);\n        modEventBus.addListener(ModDataGenerator::gatherData);')
}

/* ------------------------------------------------------------------ *
 * The template
 * ------------------------------------------------------------------ */

export const neoforgeTemplate: ProjectTemplate = defineTemplate({
  id: 'minecraft-neoforge',
  nameKey: 'template.neoforge.name',
  descriptionKey: 'template.neoforge.description',
  keywords: ['neoforge', 'neoforged', 'mod', 'moddevgradle', 'mdg', 'parchment'],
  languageId: 'java',
  kindId: 'minecraft-neoforge',
  icon: 'NF',
  color: '#e68c37',
  buildFields: fields,
  open: ({ values }) => `src/main/java/${packagePath(values.package)}/${values.mainClass}.java`,
  setup: gradleSetup,
  next: () => t('next.mod'),
  files(ctx) {
    const { values } = ctx
    if (!neoToolchain(values.mc)) throw new Error(t('error.unsupported', { platform: 'NeoForge', mc: values.mc }))
    const kts = isKts(values)
    const pkg = packagePath(values.package)
    const f = features(values)
    const fork = legacy(values)
    const files: Record<string, string> = {
      ...settingsFile(values, values.modId, values.gradleVersion),
      [kts ? 'build.gradle.kts' : 'build.gradle']: neoforgeBuild(values),
      'gradle.properties': gradleProperties({
        minecraft_version: values.mc,
        neo_version: values.neoVersion,
        ...(parchmentOn(values) ? { parchment_version: values.parchmentVersion } : {}),
        mod_id: values.modId,
        mod_version: values.version,
        mod_group_id: values.groupId,
      }, ['org.gradle.configuration-cache=true']),
      ...wrapperFiles(values.gradleVersion, DAEMON_JAVA),
      [`src/main/resources/META-INF/${f.metadataFile}`]: fork
        ? modsToml(values, { loaderVersion: '[47,)', forgeRange: '[47,)' })
        : neoforgeToml(values),
      [`src/main/java/${pkg}/${values.mainClass}.java`]: fork ? legacyMain(values) : neoforgeMain(values),
      '.gitignore': gitignore(),
      'README.md': readme(ctx, `NeoForge ${values.neoVersion} · ModDevGradle${fork ? ' Legacy' : ''}`, gradleCommands(['runClient', 'runServer', ...(isOn(values, 'datagen') ? ['runData'] : [])])),
    }
    if (fork) files['src/main/resources/pack.mcmeta'] = json(packMeta(values.mc, `${values.modId} resources`))
    if (f.clientClass) files[`src/main/java/${pkg}/client/${values.mainClass}Client.java`] = neoforgeClient(values)
    if (isOn(values, 'item')) files[`src/main/resources/assets/${values.modId}/lang/en_us.json`] = langFile(values)
    if (isOn(values, 'command')) files[`src/main/java/${pkg}/command/HelloCommand.java`] = vanillaCommand(values.package)
    if (isOn(values, 'mixins') && !fork) {
      files[`src/main/java/${pkg}/mixin/ExampleMixin.java`] = exampleMixin(values.package)
      files[`src/main/resources/${values.modId}.mixins.json`] = mixinConfig(values.package, values.mc)
    }
    if (isOn(values, 'datagen')) files[`src/main/java/${pkg}/datagen/ModDataGenerator.java`] = neoforgeDatagen(values)
    return files
  },
})
