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
 * The Architectury template: a multi-loader project with `common`, `fabric`
 * and `neoforge` and/or `forge`, built with architectury-plugin, Architectury
 * Loom and Shadow — as architectury/template-generator builds it, whose table
 * decides per Minecraft version which loaders exist, which API major fits and
 * which Java to use (1.16.5 → API 1 under `me.shedaniel`; Forge up to 1.20.4,
 * NeoForge from 1.20.4; 26.x without remapping).
 */

import type { FormField, FormValues, ProjectTemplate, TemplateContext } from '../../../../src/core/types';
import { architecturyApiGroup, architecturyGame } from '../architectury';
import { ARCHITECTURY_GRADLE, DAEMON_JAVA, ARCHITECTURY_SHADOW, fabricFeatures, isUnobfuscated, javaFor, mixinLevel, neoFeatures } from '../eras';
import { t, versions } from '../lumen';
import { architecturyApiFor, forgeFor, neoforgeFor } from '../sources';
import {
  authorsOf, buildToolField, defineTemplate, foojay, gitignore, gradleSetup, identityFields, isOn, javaField, javaHeader,
  javaText, json, packagePath, quoted, readme, toggle, wrapperFiles,
} from './common';
import { exampleMixin, loggerField } from './java';
import { gradleField, mcField, versionField } from './versions';

const game = (v: FormValues) => architecturyGame(v.mc);
const hasNeoForge = (v: FormValues) => Boolean(game(v)?.neoforge);
const hasForge = (v: FormValues) => Boolean(game(v)?.forge);
const neoforgeOn = (v: FormValues) => hasNeoForge(v) && isOn(v, 'neoforge');
const forgeOn = (v: FormValues) => hasForge(v) && isOn(v, 'forge');
const apiOn = (v: FormValues) => isOn(v, 'architecturyApi') && Boolean(game(v)?.architectury.api_version);
const unobfuscated = (v: FormValues) => Boolean(game(v)?.unobfuscated) || isUnobfuscated(v.mc ?? '');
const loomPlugin = (v: FormValues) => (unobfuscated(v) ? 'dev.architectury.loom-no-remap' : 'dev.architectury.loom');
const javaOf = (v: FormValues) => game(v)?.java_version ?? javaFor(v.mc ?? '');

function fields(): FormField[] {
  const scope = 'architectury';
  return [
    ...identityFields('mod'),
    mcField('architectury'),
    javaField(javaOf),
    versionField({
      scope,
      id: 'loaderVersion',
      label: t('field.loaderVersion', { loader: 'Fabric Loader' }),
      load: () => versions().fabricLoaders(),
    }),
    versionField({
      scope,
      id: 'fabricApiVersion',
      label: t('field.apiVersion', { api: 'Fabric API' }),
      dependsOn: ['mc'],
      load: (v) => versions().fabricApi(v.mc),
    }),
    toggle('neoforge', t('option.platformNeoForge'), true, hasNeoForge),
    versionField({
      scope,
      id: 'neoVersion',
      label: t('field.loaderVersion', { loader: 'NeoForge' }),
      dependsOn: ['mc'],
      when: neoforgeOn,
      async load(v) {
        const { all, legacy } = await versions().neoforgeLists();
        return neoforgeFor(all, legacy, v.mc);
      },
    }),
    { ...toggle('forge', t('option.platformForge'), false, hasForge), default: (v) => String(hasForge(v) && !hasNeoForge(v)) },
    versionField({
      scope,
      id: 'forgeVersion',
      label: t('field.loaderVersion', { loader: 'Forge' }),
      dependsOn: ['mc'],
      when: forgeOn,
      async load(v) {
        const { all, promos } = await versions().forgeLists();
        return forgeFor(all, promos, v.mc);
      },
    }),
    toggle('architecturyApi', t('option.architecturyApi'), true, (v) => Boolean(game(v)?.architectury.api_version)),
    versionField({
      scope,
      id: 'architecturyApiVersion',
      label: t('field.apiVersion', { api: 'Architectury API' }),
      dependsOn: ['mc'],
      when: apiOn,
      async load(v) {
        const entry = game(v);
        if (!entry) { return []; }
        const all = await versions().architecturyApi(architecturyApiGroup(entry).group === 'me.shedaniel');
        return architecturyApiFor(all, entry);
      },
    }),
    versionField({
      scope,
      id: 'loomVersion',
      label: t('field.pluginVersion', { plugin: 'Architectury Loom' }),
      dependsOn: ['mc'],
      load: (v) => versions().architecturyLoom(unobfuscated(v)),
    }),
    versionField({
      scope,
      id: 'pluginVersion',
      label: t('field.pluginVersion', { plugin: 'architectury-plugin' }),
      load: () => versions().architecturyPlugin(),
    }),
    gradleField(scope, () => ARCHITECTURY_GRADLE, []),
    buildToolField(['gradle-groovy'], t('hint.groovyOnly')),
    toggle('mixins', t('option.mixins'), true),
  ];
}

function platforms(values: FormValues): string[] {
  return ['fabric', ...(neoforgeOn(values) ? ['neoforge'] : []), ...(forgeOn(values) ? ['forge'] : [])];
}

/* ------------------------------------------------------------------ *
 * Gradle
 * ------------------------------------------------------------------ */

/** Compile with a JDK of at least 21 (what Loom needs) and target the game's Java release. */
const toolchainFor = (java: string) => String(Math.max(Number(java) || 21, 21));

function rootBuild(values: FormValues): string {
  const unobf = unobfuscated(values);
  const plugin = loomPlugin(values);
  const mappings = unobf ? '' : '\n    loom {\n        silentMojangMappingsLicense()\n    }\n';
  const mappingDependency = unobf ? '' : '\n        mappings loom.officialMojangMappings()';
  return `plugins {
    id '${plugin}' version '${values.loomVersion}' apply false
    id 'architectury-plugin' version '${values.pluginVersion}'
    id 'com.gradleup.shadow' version '${ARCHITECTURY_SHADOW}' apply false
}

architectury {
    minecraft = project.minecraft_version
}

allprojects {
    group = rootProject.maven_group
    version = rootProject.mod_version
}

subprojects {
    apply plugin: '${plugin}'
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
            languageVersion = JavaLanguageVersion.of(${toolchainFor(values.java)})
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
`;
}

function commonBuild(values: FormValues): string {
  const configuration = unobfuscated(values) ? 'implementation' : 'modImplementation';
  const { group } = architecturyApiGroup(game(values));
  const api = apiOn(values)
    ? `\n    ${configuration} "${group}:architectury:$rootProject.architectury_api_version"`
    : '';
  return `architectury {
    common rootProject.enabled_platforms.split(',')
}

dependencies {
    // For the @Environment annotations alone — use no further Fabric loader classes.
    ${configuration} "net.fabricmc:fabric-loader:$rootProject.fabric_loader_version"${api}
}
`;
}

type Platform = 'fabric' | 'neoforge' | 'forge';

/** Building a platform: Shadow bundles `common` into the mod jar. */
function platformBuild(values: FormValues, platform: Platform): string {
  const unobf = unobfuscated(values);
  const configuration = unobf ? 'implementation' : 'modImplementation';
  const { group } = architecturyApiGroup(game(values));
  const setup: Record<Platform, string> = { fabric: 'fabric()', neoforge: 'neoForge()', forge: 'forge()' };
  const development: Record<Platform, string> = { fabric: 'developmentFabric', neoforge: 'developmentNeoForge', forge: 'developmentForge' };
  const transform: Record<Platform, string> = { fabric: 'transformProductionFabric', neoforge: 'transformProductionNeoForge', forge: 'transformProductionForge' };
  const metadata: Record<Platform, string> = { fabric: 'fabric.mod.json', neoforge: `META-INF/${neoFeatures(values.mc).metadataFile}`, forge: 'META-INF/mods.toml' };

  const deps: Record<Platform, string[]> = {
    fabric: [
      `${configuration} "net.fabricmc:fabric-loader:$rootProject.fabric_loader_version"`,
      `${configuration} "net.fabricmc.fabric-api:fabric-api:$rootProject.fabric_api_version"`,
    ],
    neoforge: ['neoForge "net.neoforged:neoforge:$rootProject.neoforge_version"'],
    forge: ['forge "net.minecraftforge:forge:$rootProject.minecraft_version-$rootProject.forge_version"'],
  };
  const lines = [...deps[platform]];
  if (apiOn(values)) { lines.push(`${configuration} "${group}:architectury-${platform}:$rootProject.architectury_api_version"`); }
  lines.push(
    unobf
      ? "common(project(path: ':common')) { transitive = false }"
      : "common(project(path: ':common', configuration: 'namedElements')) { transitive = false }",
    `shadowBundle project(path: ':common', configuration: '${transform[platform]}')`,
  );

  const repositories = platform === 'neoforge'
    ? "\nrepositories {\n    maven {\n        name = 'NeoForged'\n        url = 'https://maven.neoforged.net/releases'\n    }\n}\n"
    : '';
  const forgeLoom = platform === 'forge' && isOn(values, 'mixins')
    ? `\nloom {\n    forge {\n        mixinConfig "${values.modId}.mixins.json"\n    }\n}\n`
    : '';
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
}`;

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
`;
}

function settings(values: FormValues): string {
  const includes = ['common', ...platforms(values)].map((p) => `include '${p}'`);
  return `pluginManagement {
    repositories {
        maven { url = 'https://maven.fabricmc.net/' }
        maven { url = 'https://maven.architectury.dev/' }
        maven { url = 'https://maven.minecraftforge.net/' }
        maven { url = 'https://maven.neoforged.net/releases' }
        gradlePluginPortal()
    }
}

${foojay({ ...values, build: 'gradle-groovy' }, values.gradleVersion)}rootProject.name = '${values.modId}'

${includes.join('\n')}
`;
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
  ];
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * Metadata and sources
 * ------------------------------------------------------------------ */

function fabricModJson(values: FormValues): string {
  const apiModId = game(values)?.fabric?.fabric_api_mod_id ?? 'fabric-api';
  const depends: Record<string, string> = {
    fabricloader: `>=${values.loaderVersion}`,
    minecraft: `~${values.mc}`,
    java: `>=${values.java}`,
    [apiModId]: '*',
  };
  if (apiOn(values)) { depends.architectury = `>=${values.architecturyApiVersion}`; }
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
  });
}

function modsToml(values: FormValues, platform: 'neoforge' | 'forge'): string {
  const authors = authorsOf(values);
  const neo = platform === 'neoforge';
  const entry = game(values);
  const loaderMajor = neo ? entry?.neoforge?.loader_major_version ?? '1' : String(entry?.forge?.major_version ?? values.forgeVersion.split('.')[0]);
  const required = neo ? 'type = "required"' : 'mandatory = true';
  const dependency = (modId: string, range: string, ordering = 'NONE') => [
    '',
    `[[dependencies.${values.modId}]]`,
    `modId = "${modId}"`,
    required,
    `versionRange = "${range}"`,
    `ordering = "${ordering}"`,
    'side = "BOTH"',
  ];
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
    ...dependency('minecraft', `[${values.mc},)`),
    ...(apiOn(values) ? dependency('architectury', `[${values.architecturyApiVersion},)`, 'AFTER') : []),
  ];
  if (neo && isOn(values, 'mixins')) { lines.push('', '[[mixins]]', `config = "${values.modId}.mixins.json"`); }
  return `${lines.join('\n')}\n`;
}

function commonMain(values: FormValues): string {
  const logger = loggerField(fabricFeatures(values.mc).slf4j);
  return `${javaHeader(values.package, logger.imports)}public final class ${values.mainClass} {
    public static final String MOD_ID = "${values.modId}";
${logger.line}

    private ${values.mainClass}() {
    }

    /** ${t('code.commonInit')} */
    public static void init() {
        LOGGER.info("${javaText(t('code.modLoaded', { name: values.name ?? values.modId }))}");
    }
}
`;
}

function commonMixinConfig(values: FormValues): string {
  return json({
    required: true,
    package: `${values.package}.mixin`,
    compatibilityLevel: mixinLevel(values.mc),
    minVersion: '0.8',
    client: [],
    mixins: ['ExampleMixin'],
    injectors: { defaultRequire: 1 },
  });
}

function fabricEntry(values: FormValues): string {
  return `${javaHeader(`${values.package}.fabric`, [`${values.package}.${values.mainClass}`, 'net.fabricmc.api.ModInitializer'])}public final class ${values.mainClass}Fabric implements ModInitializer {
    @Override
    public void onInitialize() {
        ${values.mainClass}.init();
    }
}
`;
}

function fabricClientEntry(values: FormValues): string {
  return `${javaHeader(`${values.package}.fabric.client`, ['net.fabricmc.api.ClientModInitializer'])}public final class ${values.mainClass}FabricClient implements ClientModInitializer {
    @Override
    public void onInitializeClient() {
        // ${t('code.clientComment')}
    }
}
`;
}

function neoforgeEntry(values: FormValues): string {
  return `${javaHeader(`${values.package}.neoforge`, [`${values.package}.${values.mainClass}`, 'net.neoforged.fml.common.Mod'])}@Mod(${values.mainClass}.MOD_ID)
public final class ${values.mainClass}NeoForge {
    public ${values.mainClass}NeoForge() {
        ${values.mainClass}.init();
    }
}
`;
}

function forgeEntry(values: FormValues): string {
  const api = apiOn(values);
  const { pkg } = architecturyApiGroup(game(values));
  const imports = [`${values.package}.${values.mainClass}`, 'net.minecraftforge.fml.common.Mod'];
  if (api) { imports.push(`${pkg}.platform.forge.EventBuses`, 'net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext'); }
  const register = api
    ? `        EventBuses.registerModEventBus(${values.mainClass}.MOD_ID, FMLJavaModLoadingContext.get().getModEventBus());\n`
    : '';
  return `${javaHeader(`${values.package}.forge`, imports)}@Mod(${values.mainClass}.MOD_ID)
public final class ${values.mainClass}Forge {
    public ${values.mainClass}Forge() {
${register}        ${values.mainClass}.init();
    }
}
`;
}

function forgePackMeta(values: FormValues): string {
  const entry = game(values)?.forge;
  const pack: Record<string, unknown> = { description: `${values.modId} resources`, pack_format: entry?.pack_version ?? 15 };
  if (entry?.server_pack_version) { pack[entry.server_pack_version[0]] = Number(entry.server_pack_version[1]); }
  return json({ pack });
}

export const architecturyTemplate: ProjectTemplate = defineTemplate({
  id: 'minecraft-architectury',
  nameKey: 'template.architectury.name',
  descriptionKey: 'template.architectury.description',
  keywords: ['architectury', 'multiloader', 'fabric', 'neoforge', 'forge', 'mod'],
  languageId: 'java',
  kindId: 'minecraft-architectury',
  icon: 'Ar',
  color: '#b86ef0',
  buildFields: fields,
  open: ({ values }: TemplateContext) => `common/src/main/java/${packagePath(values.package)}/${values.mainClass}.java`,
  setup: gradleSetup,
  next: () => t('next.architectury'),
  files(ctx) {
    const { values } = ctx;
    if (!game(values)) { throw new Error(t('error.unsupported', { platform: 'Architectury', mc: values.mc })); }
    const pkg = packagePath(values.package);
    const runs = platforms(values).flatMap((p) => [`:${p}:runClient`, `:${p}:runServer`]);
    const files: Record<string, string> = {
      'settings.gradle': settings(values),
      'build.gradle': rootBuild(values),
      'gradle.properties': properties(values),
      ...wrapperFiles(values.gradleVersion, DAEMON_JAVA),
      'common/build.gradle': commonBuild(values),
      [`common/src/main/java/${pkg}/${values.mainClass}.java`]: commonMain(values),
      'fabric/build.gradle': platformBuild(values, 'fabric'),
      'fabric/src/main/resources/fabric.mod.json': fabricModJson(values),
      [`fabric/src/main/java/${pkg}/fabric/${values.mainClass}Fabric.java`]: fabricEntry(values),
      [`fabric/src/main/java/${pkg}/fabric/client/${values.mainClass}FabricClient.java`]: fabricClientEntry(values),
      '.gitignore': gitignore(),
      'README.md': readme(ctx, `Architectury (${platforms(values).join(', ')})`, ['./gradlew build        # */build/libs/*.jar', ...runs.map((r) => `./gradlew ${r}`)]),
    };
    if (isOn(values, 'mixins')) {
      files[`common/src/main/java/${pkg}/mixin/ExampleMixin.java`] = exampleMixin(values.package);
      files[`common/src/main/resources/${values.modId}.mixins.json`] = commonMixinConfig(values);
    }
    if (neoforgeOn(values)) {
      const metadataFile = neoFeatures(values.mc).metadataFile;
      files['neoforge/build.gradle'] = platformBuild(values, 'neoforge');
      files['neoforge/gradle.properties'] = 'loom.platform=neoforge\n';
      files[`neoforge/src/main/resources/META-INF/${metadataFile}`] = modsToml(values, 'neoforge');
      files[`neoforge/src/main/java/${pkg}/neoforge/${values.mainClass}NeoForge.java`] = neoforgeEntry(values);
    }
    if (forgeOn(values)) {
      files['forge/build.gradle'] = platformBuild(values, 'forge');
      files['forge/gradle.properties'] = 'loom.platform=forge\n';
      files['forge/src/main/resources/META-INF/mods.toml'] = modsToml(values, 'forge');
      files['forge/src/main/resources/pack.mcmeta'] = forgePackMeta(values);
      files[`forge/src/main/java/${pkg}/forge/${values.mainClass}Forge.java`] = forgeEntry(values);
    }
    return files;
  },
});
