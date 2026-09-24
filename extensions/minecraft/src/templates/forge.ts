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
 * The Forge template, built the way Forge's own MDK for the chosen version
 * builds:
 *
 *  - 1.7.10 and 1.12.2: RetroFuturaGradle (GTNewHorizons) — the original
 *    ForgeGradle 1/2/3 needs Gradle 2–5, which no current JDK runs. RFG pins
 *    the Forge build (10.13.4.1614, 14.23.5.2847).
 *  - 1.17.1, 1.18, 1.18.1, 1.19, 1.19.1, 1.19.3: Forge left these on
 *    ForgeGradle 5 and Gradle 7; ModDevGradle Legacy (NeoForged) builds them
 *    on Gradle 9 and remaps the jar to SRG names.
 *  - ForgeGradle 6 (Gradle 8) for the branches whose MDK uses it — 1.16.5,
 *    1.18.2, 1.19.2, 1.19.4, 1.20.x, 1.21, 1.21.6/7/9; the jar is remapped to
 *    SRG names up to 1.20.4.
 *  - ForgeGradle 7 (Gradle 9) for 1.20.6, 1.21.1, 1.21.3–5, 1.21.8, 1.21.10+
 *    and 26.x; from 26.1 without mappings.
 *
 * The versions whose MDK needs ForgeGradle 1–4 are not offered at all.
 */

import type { FormField, FormValues, ProjectTemplate, TemplateContext } from '../../../../src/core/types';
import {
  DAEMON_JAVA, RFG_DAEMON_JAVA, RFG_FORGE, forgeFeatures, forgeLoaderRange, forgeToolchain, isUnobfuscated, javaFor, mcRange, packMeta,
  type ForgeToolchain,
} from '../eras';
import { t, versions } from '../lumen';
import { mcAtLeast } from '../semver';
import { forgeFor } from '../sources';
import {
  authorsOf, buildToolField, defineTemplate, gitignore, gradleCommands, gradleProperties, gradleSetup, identityFields,
  isOn, javaField, javaHeader, javaText, json, packagePath, quoted, readme, settingsFile, toggle, wrapperFiles,
} from './common';
import { langFile, vanillaCommand } from './java';
import { gradleField, mcField, versionField } from './versions';

const toolchain = (v: FormValues): ForgeToolchain | null => forgeToolchain(v.mc ?? '');
const features = (v: FormValues) => forgeFeatures(v.mc ?? '');
const isRfg = (v: FormValues) => toolchain(v)?.plugin === 'rfg';
const isMdgLegacy = (v: FormValues) => toolchain(v)?.plugin === 'mdg-legacy';
const modern = (v: FormValues) => Boolean(toolchain(v)) && !isRfg(v);

/** EventBus 7 from 1.21.6; its static `BUS` fields on game events are used from 1.21.9, as in the MDKs. */
const eventBus7 = (v: FormValues) => toolchain(v)?.code === 'eventbus7';
const gameBusExamples = (v: FormValues) => !eventBus7(v) || mcAtLeast(v.mc, '1.21.9');

/* ------------------------------------------------------------------ *
 * Fields
 * ------------------------------------------------------------------ */

function fields(): FormField[] {
  const scope = 'forge';
  return [
    ...identityFields('mod'),
    mcField('forge'),
    javaField((v) => javaFor(v.mc ?? '')),
    versionField({
      scope,
      id: 'forgeVersion',
      label: t('field.loaderVersion', { loader: 'Forge' }),
      dependsOn: ['mc'],
      hint: t('hint.forgeVersion'),
      async load(v) {
        const pinned = RFG_FORGE[v.mc];
        if (pinned) { return [{ version: pinned, badge: 'pinned' }]; }
        const { all, promos } = await versions().forgeLists();
        return forgeFor(all, promos, v.mc);
      },
    }),
    versionField({
      scope,
      id: 'validatorVersion',
      label: t('field.pluginVersion', { plugin: 'eventbus-validator' }),
      when: eventBus7,
      load: () => versions().eventbusValidator(),
    }),
    versionField({
      scope,
      id: 'moddevVersion',
      label: t('field.pluginVersion', { plugin: 'ModDevGradle Legacy' }),
      hint: t('hint.mdgLegacy'),
      when: isMdgLegacy,
      load: () => versions().moddev(),
    }),
    versionField({
      scope,
      id: 'rfgVersion',
      label: t('field.pluginVersion', { plugin: 'RetroFuturaGradle' }),
      when: isRfg,
      load: () => versions().rfg(),
    }),
    gradleField(scope, (v) => toolchain(v)?.gradle ?? null),
    buildToolField(['gradle-groovy'], t('hint.groovyOnly')),
    toggle('item', t('option.deferredRegister'), true, (v) => modern(v) && features(v).item),
    toggle('command', t('option.command'), true, (v) => modern(v) && features(v).command && gameBusExamples(v), t('hint.commandSince', { mc: '1.20' })),
    toggle('listener', t('option.listener'), true, (v) => !modern(v) || gameBusExamples(v)),
    toggle('datagen', t('option.datagen'), false, modern),
  ];
}

/* ------------------------------------------------------------------ *
 * RetroFuturaGradle (1.7.10, 1.12.2)
 * ------------------------------------------------------------------ */

function rfgBuild(values: FormValues): string {
  return `plugins {
    id 'java-library'
    id 'maven-publish'
    id 'com.gtnewhorizons.retrofuturagradle' version '${values.rfgVersion}'
}

group = '${values.groupId}'
version = '${values.version}'

base {
    archivesName = '${values.modId}'
}

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(8)
        // Azul builds Java 8 for every platform, macOS on ARM included.
        vendor = JvmVendorSpec.AZUL
    }
    withSourcesJar()
}

minecraft {
    mcVersion = '${values.mc}'
    username = 'Developer'
    // Generates ${values.package}.Tags with the version of this build.
    injectedTags.put('VERSION', project.version)
}

tasks.injectTags.configure {
    outputClassName.set('${values.package}.Tags')
}

processResources {
    def version = project.version
    inputs.property 'version', version
    filesMatching('mcmod.info') {
        expand 'modVersion': version
    }
}

tasks.withType(JavaCompile).configureEach {
    options.encoding = 'UTF-8'
}

publishing {
    publications {
        mavenJava(MavenPublication) {
            from components.java
        }
    }
}
`;
}

function rfgMain(values: FormValues): string {
  const fml = values.mc === '1.7.10' ? 'cpw.mods.fml.common' : 'net.minecraftforge.fml.common';
  const imports = [
    `${fml}.Mod`,
    `${fml}.event.FMLInitializationEvent`,
    'org.apache.logging.log4j.LogManager',
    'org.apache.logging.log4j.Logger',
  ];
  const methods = [`    @Mod.EventHandler
    public void init(FMLInitializationEvent event) {
        LOGGER.info("${javaText(t('code.modLoaded', { name: values.name ?? values.modId }))}");
    }`];
  if (isOn(values, 'listener')) {
    imports.push(`${fml}.event.FMLServerStartingEvent`);
    methods.push(`    @Mod.EventHandler
    public void serverStarting(FMLServerStartingEvent event) {
        LOGGER.info("${javaText(t('code.serverStarted'))}");
    }`);
  }
  return `${javaHeader(values.package, imports)}@Mod(modid = ${values.mainClass}.MOD_ID, name = ${quoted(values.name ?? values.modId)}, version = Tags.VERSION, acceptedMinecraftVersions = "[${values.mc}]")
public class ${values.mainClass} {
    public static final String MOD_ID = "${values.modId}";
    public static final Logger LOGGER = LogManager.getLogger(MOD_ID);

${methods.join('\n\n')}
}
`;
}

function mcmodInfo(values: FormValues): string {
  return json([{
    modid: values.modId,
    name: values.name ?? values.modId,
    description: values.description ?? '',
    version: '${modVersion}',
    mcversion: values.mc,
    url: values.website ?? '',
    authorList: authorsOf(values),
    credits: '',
    dependencies: [],
  }]);
}

/* ------------------------------------------------------------------ *
 * ForgeGradle 6 and 7
 * ------------------------------------------------------------------ */

function dataRun(fg7: boolean, datagen: boolean): string {
  if (!datagen) { return ''; }
  if (fg7) {
    return `

        register('data') {
            workingDir = layout.projectDirectory.dir('run-data')
            args '--mod', mod_id, '--all', '--output', layout.projectDirectory.dir('src/generated/resources'), '--existing', layout.projectDirectory.dir('src/main/resources')
        }`;
  }
  return `
        data {
            workingDirectory project.file('run-data')
            args '--mod', mod_id, '--all', '--output', file('src/generated/resources/'), '--existing', file('src/main/resources/')
        }`;
}

/** ModDevGradle Legacy for Forge 1.17.1 to 1.19.3 — as NeoForged's Forge MDK sets it up. */
function mdgLegacyBuild(values: FormValues): string {
  const datagen = isOn(values, 'datagen');
  return `plugins {
    id 'java-library'
    id 'maven-publish'
    id 'idea'
    id 'net.neoforged.moddev.legacyforge' version '${values.moddevVersion}'
}

version = mod_version
group = mod_group_id

base {
    archivesName = mod_id
}

java.toolchain.languageVersion = JavaLanguageVersion.of(${values.java})
${datagen ? "\nsourceSets.main.resources { srcDir 'src/generated/resources' }\n" : ''}
legacyForge {
    version = project.minecraft_version + '-' + project.forge_version

    runs {
        client {
            client()
        }
        server {
            server()
            programArgument '--nogui'
        }${datagen ? `
        data {
            data()
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
`;
}

function fg6Build(values: FormValues, chain: ForgeToolchain): string {
  const datagen = isOn(values, 'datagen');
  const eb7 = eventBus7(values);
  const validator = eb7 ? `\n    annotationProcessor 'net.minecraftforge:eventbus-validator:${values.validatorVersion}'` : '';
  return `plugins {
    id 'idea'
    id 'maven-publish'
    id 'net.minecraftforge.gradle' version '[6.0,6.2)'
}

version = mod_version
group = mod_group_id

base {
    archivesName = mod_id
}

java.toolchain.languageVersion = JavaLanguageVersion.of(${values.java})
${datagen ? "\nsourceSets.main.resources { srcDir 'src/generated/resources' }\n" : ''}
minecraft {
    mappings channel: 'official', version: minecraft_version
${chain.reobf ? '' : '    reobf = false\n'}    copyIdeResources = true

    runs {
        configureEach {
            workingDirectory project.file('run')
            property 'forge.logging.markers', 'REGISTRIES'
            property 'forge.logging.console.level', 'debug'${eb7 ? "\n            property 'eventbus.api.strictRuntimeChecks', 'true'" : ''}

            mods {
                "\${mod_id}" {
                    source sourceSets.main
                }
            }
        }

        client {
        }

        server {
            args '--nogui'
        }${dataRun(false, datagen)}
    }
}

repositories {
}

dependencies {
    minecraft "net.minecraftforge:forge:\${minecraft_version}-\${forge_version}"${validator}
}
${chain.reobf ? "\ntasks.named('jar', Jar).configure {\n    finalizedBy 'reobfJar'\n}\n" : ''}
tasks.withType(JavaCompile).configureEach {
    options.encoding = 'UTF-8'
}
`;
}

function fg7Build(values: FormValues): string {
  const datagen = isOn(values, 'datagen');
  const eb7 = eventBus7(values);
  const mappings = isUnobfuscated(values.mc) ? '' : "    mappings channel: 'official', version: minecraft_version\n\n";
  const validator = eb7 ? `\n    annotationProcessor 'net.minecraftforge:eventbus-validator:${values.validatorVersion}'` : '';
  return `plugins {
    id 'java'
    id 'idea'
    id 'net.minecraftforge.gradle' version '[7.0.17,8)'
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
            workingDir = layout.projectDirectory.dir('run')${eb7 ? "\n            systemProperty 'eventbus.api.strictRuntimeChecks', 'true'" : ''}
        }

        register('client')

        register('server') {
            args '--nogui'
        }${dataRun(true, datagen)}
    }
}

repositories {
    minecraft.mavenizer(it)
    maven fg.forgeMaven
    maven fg.minecraftLibsMaven
    mavenCentral()
}

dependencies {
    implementation minecraft.dependency("net.minecraftforge:forge:\${minecraft_version}-\${forge_version}")${validator}
}

tasks.withType(JavaCompile).configureEach {
    options.encoding = 'UTF-8'
}
`;
}

export function modsToml(values: FormValues, options: { loaderVersion: string; forgeRange: string; }): string {
  const authors = authorsOf(values);
  const lines = [
    'modLoader = "javafml"',
    `loaderVersion = "${options.loaderVersion}"`,
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
    `versionRange = "${options.forgeRange}"`,
    'ordering = "NONE"',
    'side = "BOTH"',
    '',
    `[[dependencies.${values.modId}]]`,
    'modId = "minecraft"',
    'mandatory = true',
    `versionRange = "${mcRange(values.mc)}"`,
    'ordering = "NONE"',
    'side = "BOTH"',
  ];
  return `${lines.join('\n')}\n`;
}

export interface ClassicOptions {
  /** `net.minecraftforge` — Forge, and NeoForge's 1.20.1 fork. */
  logUtils: boolean;
  modernServerEvent: boolean;
  contextConstructor: boolean;
  itemId: boolean;
  item: boolean;
  command: boolean;
  listener: boolean;
}

/** A Forge main class before EventBus 7 (1.16.5–1.21.5; NeoForge 1.20.1). */
export function classicMain(values: FormValues, o: ClassicOptions): string {
  const pkg = values.package;
  const imports = [
    'net.minecraftforge.eventbus.api.IEventBus',
    'net.minecraftforge.fml.common.Mod',
    'net.minecraftforge.fml.event.lifecycle.FMLCommonSetupEvent',
    'net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext',
    ...(o.logUtils ? ['com.mojang.logging.LogUtils', 'org.slf4j.Logger'] : ['org.apache.logging.log4j.LogManager', 'org.apache.logging.log4j.Logger']),
  ];
  const fields: string[] = [];
  const constructor = [
    o.contextConstructor ? '        IEventBus modEventBus = context.getModEventBus();' : '        IEventBus modEventBus = FMLJavaModLoadingContext.get().getModEventBus();',
    '        modEventBus.addListener(this::commonSetup);',
  ];
  const methods = [`    private void commonSetup(FMLCommonSetupEvent event) {\n        LOGGER.info("${javaText(t('code.modLoaded', { name: values.name ?? values.modId }))}");\n    }`];

  if (o.item) {
    imports.push('net.minecraft.world.item.Item', 'net.minecraftforge.registries.DeferredRegister', 'net.minecraftforge.registries.ForgeRegistries', 'net.minecraftforge.registries.RegistryObject');
    const properties = o.itemId ? 'new Item.Properties().setId(ITEMS.key("example_item"))' : 'new Item.Properties()';
    fields.push(
      '    public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, MOD_ID);',
      `    public static final RegistryObject<Item> EXAMPLE_ITEM = ITEMS.register("example_item", () -> new Item(${properties}));`,
    );
    constructor.push('        ITEMS.register(modEventBus);');
  }
  if (o.listener) {
    const event = o.modernServerEvent ? 'ServerStartingEvent' : 'FMLServerStartingEvent';
    imports.push('net.minecraftforge.common.MinecraftForge', o.modernServerEvent ? 'net.minecraftforge.event.server.ServerStartingEvent' : 'net.minecraftforge.fml.event.server.FMLServerStartingEvent');
    constructor.push('        MinecraftForge.EVENT_BUS.addListener(this::onServerStarting);');
    methods.push(`    private void onServerStarting(${event} event) {\n        LOGGER.info("${javaText(t('code.serverStarted'))}");\n    }`);
  }
  if (o.command) {
    imports.push('net.minecraftforge.common.MinecraftForge', 'net.minecraftforge.event.RegisterCommandsEvent', `${pkg}.command.HelloCommand`);
    constructor.push('        MinecraftForge.EVENT_BUS.addListener(this::onRegisterCommands);');
    methods.push('    private void onRegisterCommands(RegisterCommandsEvent event) {\n        HelloCommand.register(event.getDispatcher());\n    }');
  }
  const logger = o.logUtils ? 'LogUtils.getLogger()' : 'LogManager.getLogger()';
  const parameter = o.contextConstructor ? 'FMLJavaModLoadingContext context' : '';

  return `${javaHeader(pkg, imports)}@Mod(${values.mainClass}.MOD_ID)
public final class ${values.mainClass} {
    public static final String MOD_ID = "${values.modId}";
    private static final Logger LOGGER = ${logger};
${fields.length ? `\n${fields.join('\n')}\n` : ''}
    public ${values.mainClass}(${parameter}) {
${constructor.join('\n')}
    }

${methods.join('\n\n')}
}
`;
}

/** A Forge main class with EventBus 7 (1.21.6+): bus groups and static `BUS` fields. */
function eventBus7Main(values: FormValues, o: { item: boolean; command: boolean; listener: boolean; }): string {
  const pkg = values.package;
  const imports = [
    'com.mojang.logging.LogUtils',
    'net.minecraftforge.fml.common.Mod',
    'net.minecraftforge.fml.event.lifecycle.FMLCommonSetupEvent',
    'net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext',
    'org.slf4j.Logger',
  ];
  const fields: string[] = [];
  const constructor = [
    '        var modBusGroup = context.getModBusGroup();',
    '        FMLCommonSetupEvent.getBus(modBusGroup).addListener(this::commonSetup);',
  ];
  const methods = [`    private void commonSetup(FMLCommonSetupEvent event) {\n        LOGGER.info("${javaText(t('code.modLoaded', { name: values.name ?? values.modId }))}");\n    }`];

  if (o.item) {
    imports.push('net.minecraft.world.item.Item', 'net.minecraftforge.registries.DeferredRegister', 'net.minecraftforge.registries.ForgeRegistries', 'net.minecraftforge.registries.RegistryObject');
    fields.push(
      '    public static final DeferredRegister<Item> ITEMS = DeferredRegister.create(ForgeRegistries.ITEMS, MOD_ID);',
      '    public static final RegistryObject<Item> EXAMPLE_ITEM = ITEMS.register("example_item",',
      '        () -> new Item(new Item.Properties().setId(ITEMS.key("example_item"))));',
    );
    constructor.push('        ITEMS.register(modBusGroup);');
  }
  if (o.listener) {
    imports.push('net.minecraftforge.event.server.ServerStartingEvent');
    constructor.push(`        ServerStartingEvent.BUS.addListener(${values.mainClass}::onServerStarting);`);
    methods.push(`    private static void onServerStarting(ServerStartingEvent event) {\n        LOGGER.info("${javaText(t('code.serverStarted'))}");\n    }`);
  }
  if (o.command) {
    imports.push('net.minecraftforge.event.RegisterCommandsEvent', `${pkg}.command.HelloCommand`);
    constructor.push(`        RegisterCommandsEvent.BUS.addListener(${values.mainClass}::onRegisterCommands);`);
    methods.push('    private static void onRegisterCommands(RegisterCommandsEvent event) {\n        HelloCommand.register(event.getDispatcher());\n    }');
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
`;
}

/* ------------------------------------------------------------------ *
 * The template
 * ------------------------------------------------------------------ */

const FORGE_MAVEN = { name: 'MinecraftForge', url: 'https://maven.minecraftforge.net/' };

const TOOLCHAIN_NAME: Record<ForgeToolchain['plugin'], string> = {
  'rfg': 'RetroFuturaGradle',
  'mdg-legacy': 'ModDevGradle Legacy',
  'fg6': 'ForgeGradle 6',
  'fg7': 'ForgeGradle 7',
};

function forgeBuild(values: FormValues, chain: ForgeToolchain): string {
  if (chain.plugin === 'mdg-legacy') { return mdgLegacyBuild(values); }
  if (chain.plugin === 'fg7') { return fg7Build(values); }
  return fg6Build(values, chain);
}
const GTNH_MAVEN = { name: 'GTNH', url: 'https://nexus.gtnewhorizons.com/repository/public/' };

const chainDaemon = (v: FormValues) => (isRfg(v) ? RFG_DAEMON_JAVA : DAEMON_JAVA);

function rfgFiles(ctx: TemplateContext): Record<string, string> {
  const { values } = ctx;
  const pkg = packagePath(values.package);
  return {
    ...settingsFile({ ...values, build: 'gradle-groovy' }, values.modId, values.gradleVersion, [GTNH_MAVEN]),
    'build.gradle': rfgBuild(values),
    'gradle.properties': 'org.gradle.jvmargs=-Xmx3G\norg.gradle.caching=true\norg.gradle.welcome=never\n',
    ...wrapperFiles(values.gradleVersion, chainDaemon(values)),
    'src/main/resources/mcmod.info': mcmodInfo(values),
    [`src/main/java/${pkg}/${values.mainClass}.java`]: rfgMain(values),
    '.gitignore': gitignore(),
    'README.md': readme(ctx, `Forge ${values.forgeVersion} · RetroFuturaGradle`, gradleCommands(['runClient', 'runServer']), [t('readme.rfg')]),
  };
}

function forgeGradleFiles(ctx: TemplateContext, chain: ForgeToolchain): Record<string, string> {
  const { values } = ctx;
  const pkg = packagePath(values.package);
  const f = features(values);
  const item = f.item && isOn(values, 'item');
  const command = f.command && gameBusExamples(values) && isOn(values, 'command');
  const listener = gameBusExamples(values) && isOn(values, 'listener');
  const fg7 = chain.plugin === 'fg7';
  const mdg = chain.plugin === 'mdg-legacy';
  const main = eventBus7(values)
    ? eventBus7Main(values, { item, command, listener })
    : classicMain(values, { ...f, item, command, listener });
  const properties = gradleProperties({
    minecraft_version: values.mc,
    forge_version: values.forgeVersion,
    mod_id: values.modId,
    mod_version: values.version,
    mod_group_id: values.groupId,
  }, fg7 ? ['org.gradle.configureondemand=true', 'net.minecraftforge.gradle.merge-source-sets=true'] : []);
  const files: Record<string, string> = {
    ...settingsFile({ ...values, build: 'gradle-groovy' }, values.modId, values.gradleVersion, mdg ? [] : [FORGE_MAVEN]),
    'build.gradle': forgeBuild(values, chain),
    'gradle.properties': properties,
    ...wrapperFiles(values.gradleVersion, chainDaemon(values)),
    'src/main/resources/META-INF/mods.toml': modsToml(values, {
      loaderVersion: forgeLoaderRange(values.mc, values.forgeVersion),
      forgeRange: `[${values.forgeVersion.split('.')[0]},)`,
    }),
    'src/main/resources/pack.mcmeta': json(packMeta(values.mc, `${values.modId} resources`)),
    [`src/main/java/${pkg}/${values.mainClass}.java`]: main,
    '.gitignore': gitignore(),
    'README.md': readme(ctx, `Forge ${values.forgeVersion} · ${TOOLCHAIN_NAME[chain.plugin]}`, gradleCommands(['runClient', 'runServer', ...(isOn(values, 'datagen') ? ['runData'] : [])])),
  };
  if (item) { files[`src/main/resources/assets/${values.modId}/lang/en_us.json`] = langFile(values); }
  if (command) { files[`src/main/java/${pkg}/command/HelloCommand.java`] = vanillaCommand(values.package); }
  return files;
}

export const forgeTemplate: ProjectTemplate = defineTemplate({
  id: 'minecraft-forge',
  nameKey: 'template.forge.name',
  descriptionKey: 'template.forge.description',
  keywords: ['forge', 'mod', 'forgegradle', 'mdk', 'retrofuturagradle', '1.7.10', '1.12.2'],
  languageId: 'java',
  kindId: 'minecraft-forge',
  icon: 'Fo',
  color: '#1e2d44',
  buildFields: fields,
  open: ({ values }) => `src/main/java/${packagePath(values.package)}/${values.mainClass}.java`,
  setup: gradleSetup,
  next: () => t('next.mod'),
  files(ctx) {
    const chain = toolchain(ctx.values);
    if (!chain) { throw new Error(t('error.unsupported', { platform: 'Forge', mc: ctx.values.mc })); }
    if (chain.plugin === 'rfg') { return rfgFiles(ctx); }
    return forgeGradleFiles(ctx, chain);
  },
});

