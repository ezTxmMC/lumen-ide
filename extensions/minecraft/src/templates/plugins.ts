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
 * The plugin templates: the Bukkit family (Spigot, Paper, Folia, Purpur,
 * Leaf), Velocity and BungeeCord — with Gradle (Kotlin or Groovy) or Maven.
 *
 * The API version is chosen per Minecraft version from the server's own Maven
 * repository. Paper and its forks name builds `26.2.build.128-stable` from
 * 26.1; for those the first choice is “the newest build of this version” — a
 * range in Maven, `26.2.build.+` in Gradle (see `eras.ts`). The example code
 * sticks to what the chosen version has: Paper's Brigadier commands and
 * paper-plugin.yml from 1.20.6, `api-version` from 1.13, Java 8 syntax
 * throughout so the oldest APIs compile too.
 */

import type { FieldChoice, FormField, FormValues, ProjectTemplate, TemplateContext } from '../../../../src/core/types';
import type { ServerApi } from '../catalog';
import {
  DAEMON_JAVA, PLUGIN_GRADLE, bukkitApiVersion, bukkitFeatures, gradleDependencyVersion, isBuildVersion, javaFor, latestBuildRange,
  rangeMinecraft, velocityHasBrigadier, velocityJava,
} from '../eras';
import { t, versions } from '../lumen';
import { apiVersionsFor } from '../sources';
import {
  authorsOf, buildToolField, defineTemplate, escapeXml, gitignore, gradleSetup, gstr, identityFields, isKts, isMaven,
  isOn, javaField, javaHeader, javaText, packagePath, quoted, readme, section, settingsFile, toggle, wrapperFiles,
} from './common';
import { gradleField, mcField, versionField } from './versions';

/* ------------------------------------------------------------------ *
 * The shared build files
 * ------------------------------------------------------------------ */

interface Repository { id: string; url: string; }

interface PluginBuild {
  repositories: Repository[];
  dependency: { group: string; artifact: string; version: string; };
  annotationProcessor?: boolean;
  /** The Gradle plugin for a test server (run-paper and its like). */
  run?: { plugin: string; task: string; call: string; };
  /** The file in which `${version}` is replaced. */
  manifest?: string;
}

function gradleBuild(values: FormValues, build: PluginBuild): string {
  const kts = isKts(values);
  const { group, artifact } = build.dependency;
  const coordinate = `${group}:${artifact}:${gradleDependencyVersion(build.dependency.version)}`;
  const java = values.java;

  const plugins = [kts ? '    java' : "    id 'java'"];
  if (build.run) { plugins.push(kts ? `    id("${build.run.plugin}") version "${values.runVersion}"` : `    id '${build.run.plugin}' version '${values.runVersion}'`); }

  const repos = ['    mavenCentral()', ...build.repositories.map((r) => (kts
    ? `    maven("${r.url}") {\n        name = "${r.id}"\n    }`
    : `    maven {\n        name = '${r.id}'\n        url = '${r.url}'\n    }`))];

  const deps = [kts ? `    compileOnly("${coordinate}")` : `    compileOnly '${coordinate}'`];
  if (build.annotationProcessor) { deps.push(kts ? `    annotationProcessor("${coordinate}")` : `    annotationProcessor '${coordinate}'`); }

  const blocks = [
    `plugins {\n${plugins.join('\n')}\n}`,
    kts ? `group = "${values.groupId}"\nversion = "${values.version}"` : `group = '${values.groupId}'\nversion = '${values.version}'`,
    `repositories {\n${repos.join('\n')}\n}`,
    `dependencies {\n${deps.join('\n')}\n}`,
    kts
      ? `java {\n    toolchain.languageVersion = JavaLanguageVersion.of(${java})\n}`
      : `java {\n    toolchain {\n        languageVersion = JavaLanguageVersion.of(${java})\n    }\n}`,
    kts
      ? `tasks.withType<JavaCompile>().configureEach {\n    options.encoding = "UTF-8"\n    options.release = ${java}\n}`
      : `tasks.withType(JavaCompile).configureEach {\n    options.encoding = 'UTF-8'\n    options.release = ${java}\n}`,
  ];
  if (build.manifest && kts) {
    blocks.push(`tasks.processResources {\n    val props = mapOf("version" to version)\n    inputs.properties(props)\n    filteringCharset = "UTF-8"\n    filesMatching("${build.manifest}") {\n        expand(props)\n    }\n}`);
  }
  if (build.manifest && !kts) {
    blocks.push(`processResources {\n    def props = [version: version]\n    inputs.properties props\n    filteringCharset = 'UTF-8'\n    filesMatching('${build.manifest}') {\n        expand props\n    }\n}`);
  }
  if (build.run && kts) { blocks.push(`tasks.${build.run.task} {\n    ${build.run.call}\n}`); }
  if (build.run && !kts) { blocks.push(`tasks.named('${build.run.task}') {\n    ${build.run.call}\n}`); }
  return `${blocks.join('\n\n')}\n`;
}

function pom(values: FormValues, build: PluginBuild): string {
  const { group, artifact, version } = build.dependency;
  const entries = build.repositories.map((r) => `    <repository>\n      <id>${r.id}</id>\n      <url>${r.url}</url>\n    </repository>`);
  const repos = entries.length ? `\n  <repositories>\n${entries.join('\n')}\n  </repositories>\n` : '';
  const processor = build.annotationProcessor ? '\n          <proc>full</proc>' : '';
  const description = values.description ? `\n  <description>${escapeXml(values.description)}</description>` : '';
  const url = values.website ? `\n  <url>${escapeXml(values.website)}</url>` : '';
  const filtering = build.manifest
    ? `
    <resources>
      <resource>
        <directory>src/main/resources</directory>
        <filtering>true</filtering>
        <includes>
          <include>${build.manifest}</include>
        </includes>
      </resource>
      <resource>
        <directory>src/main/resources</directory>
        <filtering>false</filtering>
        <excludes>
          <exclude>${build.manifest}</exclude>
        </excludes>
      </resource>
    </resources>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <groupId>${values.groupId}</groupId>
  <artifactId>${values.artifactId}</artifactId>
  <version>${values.version}</version>
  <packaging>jar</packaging>
  <name>${escapeXml(values.name ?? values.artifactId)}</name>${description}${url}

  <properties>
    <maven.compiler.release>${values.java}</maven.compiler.release>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
  </properties>
${repos}
  <dependencies>
    <dependency>
      <groupId>${group}</groupId>
      <artifactId>${artifact}</artifactId>
      <version>${escapeXml(version)}</version>
      <scope>provided</scope>
    </dependency>
  </dependencies>

  <build>
    <defaultGoal>clean package</defaultGoal>${filtering}
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <version>3.14.1</version>
        <configuration>
          <release>${values.java}</release>${processor}
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>
`;
}

/** The build files, depending on the tool. */
function buildFiles(ctx: TemplateContext, build: PluginBuild): Record<string, string> {
  const { values } = ctx;
  if (isMaven(values)) { return { 'pom.xml': pom(values, build) }; }
  return {
    ...settingsFile(values, values.artifactId, values.gradleVersion),
    [isKts(values) ? 'build.gradle.kts' : 'build.gradle']: gradleBuild(values, build),
    'gradle.properties': 'org.gradle.caching=true\norg.gradle.parallel=true\n',
    ...wrapperFiles(values.gradleVersion, DAEMON_JAVA),
  };
}

/** The placeholder for the version in the manifest — Gradle's `expand` or a Maven filter. */
const versionToken = (values: FormValues) => (isMaven(values) ? '${project.version}' : '${version}');

/** Text for YAML, with `$` escaped for Gradle's template engine. */
function yaml(values: FormValues, text: string): string {
  if (isMaven(values)) { return quoted(text); }
  return quoted(text).replace(/\$/g, '\\$');
}

function buildCommands(values: FormValues, runTask?: string): string[] {
  if (isMaven(values)) { return ['mvn package          # target/*.jar']; }
  return [
    './gradlew build      # build/libs/*.jar',
    ...(runTask && isOn(values, 'runServer') ? [`./gradlew ${runTask}  # ${t('readme.testServer')}`] : []),
  ];
}

const runOn = (values: FormValues) => !isMaven(values) && isOn(values, 'runServer');

/** The test-server plugin (run-paper and its like), only where the option is on. */
function runPlugin(values: FormValues, plugin: string, task: string, fn: string, version: string): PluginBuild['run'] {
  if (!runOn(values)) { return undefined; }
  return { plugin, task, call: `${fn}(${gstr(values, version)})` };
}

function runFields(scope: string, label: string, hint: string, fallback: boolean, when: (v: FormValues) => boolean = () => true): FormField[] {
  return [
    toggle('runServer', label, fallback, (v) => !isMaven(v) && when(v), hint),
    versionField({
      scope,
      id: 'runVersion',
      label: t('field.pluginVersion', { plugin: 'run-task' }),
      when: (v) => runOn(v) && when(v),
      load: () => versions().runPaper(),
    }),
  ];
}

const gradleOnly = (v: FormValues) => !isMaven(v);

/* ------------------------------------------------------------------ *
 * The Bukkit family
 * ------------------------------------------------------------------ */

type BukkitPlatform = ServerApi;

interface BukkitInfo {
  label: string;
  color: string;
  icon: string;
  repositories: Repository[];
  group(mc: string): string;
  artifact: string;
  /** The Paper API is present: Brigadier commands, Adventure, paper-plugin.yml. */
  paper: boolean;
  keywords: string[];
}

const PAPER_REPO: Repository = { id: 'papermc', url: 'https://repo.papermc.io/repository/maven-public/' };

const BUKKIT: Record<BukkitPlatform, BukkitInfo> = {
  spigot: {
    label: 'Spigot',
    color: '#ed8106',
    icon: 'Sp',
    repositories: [{ id: 'spigotmc-repo', url: 'https://hub.spigotmc.org/nexus/content/repositories/public/' }],
    group: () => 'org.spigotmc',
    artifact: 'spigot-api',
    paper: false,
    keywords: ['spigot', 'bukkit', 'plugin'],
  },
  paper: {
    label: 'Paper',
    color: '#f4f4f4',
    icon: 'Pa',
    repositories: [PAPER_REPO],
    // Paper's API moved to `io.papermc.paper` with 1.17; 1.16.5 is the last one under the old group.
    group: (mc) => (mc === '1.16.5' ? 'com.destroystokyo.paper' : 'io.papermc.paper'),
    artifact: 'paper-api',
    paper: true,
    keywords: ['paper', 'papermc', 'bukkit', 'plugin', 'adventure', 'brigadier'],
  },
  folia: {
    label: 'Folia',
    color: '#5ab9b0',
    icon: 'Fl',
    repositories: [PAPER_REPO],
    group: () => 'dev.folia',
    artifact: 'folia-api',
    paper: true,
    keywords: ['folia', 'paper', 'regionized', 'plugin'],
  },
  purpur: {
    label: 'Purpur',
    color: '#b36ad8',
    icon: 'Pu',
    repositories: [{ id: 'purpurmc', url: 'https://repo.purpurmc.org/snapshots' }, PAPER_REPO],
    group: () => 'org.purpurmc.purpur',
    artifact: 'purpur-api',
    paper: true,
    keywords: ['purpur', 'paper', 'plugin'],
  },
  leaf: {
    label: 'Leaf',
    color: '#6fbf3e',
    icon: 'Lf',
    repositories: [{ id: 'leafmc', url: 'https://maven.leafmc.one/snapshots/' }, PAPER_REPO],
    group: () => 'cn.dreeam.leaf',
    artifact: 'leaf-api',
    paper: true,
    keywords: ['leaf', 'paper', 'plugin'],
  },
};

const paperCommands = (info: BukkitInfo, v: FormValues) => info.paper && bukkitFeatures(v.mc ?? '').paperCommands;
const paperManifest = (info: BukkitInfo, v: FormValues) => info.paper && bukkitFeatures(v.mc ?? '').paperManifest && v.manifest === 'paper';
const manifestName = (info: BukkitInfo, values: FormValues) => (paperManifest(info, values) ? 'paper-plugin.yml' : 'plugin.yml');

/** The API versions for a server and Minecraft version; Paper's 1.16.5 lives under the old group. */
async function serverApiEntries(platform: BukkitPlatform, mc: string) {
  if (platform === 'paper' && mc === '1.16.5') { return [{ version: '1.16.5-R0.1-SNAPSHOT', badge: 'latest' }]; }
  const all = await versions().serverApiList(platform);
  const found = apiVersionsFor(all, mc);
  // Purpur's metadata lists only the new builds; older versions follow the classic scheme.
  if (!found.length && platform === 'purpur') { return [{ version: `${mc}-R0.1-SNAPSHOT`, badge: 'latest' }]; }
  return found;
}

function bukkitFields(platform: BukkitPlatform): FormField[] {
  const info = BUKKIT[platform];
  const scope = `bukkit-${platform}`;
  const fields: FormField[] = [
    ...identityFields('plugin'),
    mcField(platform),
    javaField((v) => javaFor(v.mc ?? '')),
    versionField({
      scope,
      id: 'apiVersion',
      label: t('field.apiDependency', { api: info.artifact }),
      hint: t('hint.apiVersion'),
      dependsOn: ['mc'],
      load: (v) => serverApiEntries(platform, v.mc),
      lead(v, entries): FieldChoice[] {
        if (!entries.some((e) => isBuildVersion(e.version))) { return []; }
        const range = latestBuildRange(v.mc);
        return [{ value: range, label: t('choice.latestBuild', { mc: v.mc }), hint: `${range} · Gradle: ${gradleDependencyVersion(range)}`, badge: t('badge.range') }];
      },
      preferLead: () => true,
    }),
    gradleField(scope, () => PLUGIN_GRADLE, [], gradleOnly),
    buildToolField(['gradle-kts', 'gradle-groovy', 'maven']),
  ];
  if (info.paper) {
    fields.push({
      id: 'manifest',
      label: t('field.manifest'),
      type: 'select',
      default: 'paper',
      choices: [
        { value: 'paper', label: 'paper-plugin.yml', hint: t('hint.paperPlugin') },
        { value: 'bukkit', label: 'plugin.yml', hint: t('hint.bukkitPlugin') },
      ],
      when: (v) => bukkitFeatures(v.mc ?? '').paperManifest,
      section: section.build(),
    });
  }
  fields.push(
    toggle('command', t(info.paper ? 'option.brigadierCommand' : 'option.command'), true),
    toggle('listener', t('option.listener'), true),
    toggle('config', t('option.config'), false),
    ...(platform === 'folia' ? [] : runFields(scope, t('option.runServer'), t('hint.runServer'), true)),
  );
  return fields;
}

function bukkitManifest(info: BukkitInfo, platform: BukkitPlatform, values: FormValues): string {
  const permission = `${values.pluginName.toLowerCase()}.hello`;
  const authors = authorsOf(values);
  const api = bukkitApiVersion(values.mc);
  const lines = [
    `name: ${values.pluginName}`,
    `version: '${versionToken(values)}'`,
    `main: ${values.package}.${values.mainClass}`,
    ...(api ? [`api-version: '${api}'`] : []),
    ...(platform === 'folia' ? ['folia-supported: true'] : []),
  ];
  if (values.description) { lines.push(`description: ${yaml(values, values.description)}`); }
  if (authors.length) { lines.push(`authors: [${authors.map((a) => yaml(values, a)).join(', ')}]`); }
  if (values.website) { lines.push(`website: ${yaml(values, values.website)}`); }
  const command = isOn(values, 'command');
  if (command && !paperCommands(info, values)) {
    lines.push(
      'commands:',
      '  hello:',
      `    description: ${quoted(t('code.helloDescription'))}`,
      '    usage: /hello [name]',
      `    permission: ${permission}`,
    );
  }
  if (command) {
    lines.push(
      'permissions:',
      `  ${permission}:`,
      `    description: ${quoted(t('code.helloPermission'))}`,
      '    default: true',
    );
  }
  return `${lines.join('\n')}\n`;
}

function bukkitMain(info: BukkitInfo, values: FormValues): string {
  const pkg = values.package;
  const imports = ['org.bukkit.plugin.java.JavaPlugin'];
  const body: string[] = [];
  const config = isOn(values, 'config');
  const listener = isOn(values, 'listener');
  const command = isOn(values, 'command');
  const brigadier = paperCommands(info, values);

  if (config) { body.push('        saveDefaultConfig();'); }
  if (listener) {
    imports.push(`${pkg}.listener.PlayerJoinListener`);
    const message = config
      ? 'getConfig().getString("welcome-message", PlayerJoinListener.DEFAULT_MESSAGE)'
      : 'PlayerJoinListener.DEFAULT_MESSAGE';
    body.push(`        getServer().getPluginManager().registerEvents(new PlayerJoinListener(${message}), this);`);
  }
  if (command && brigadier) {
    imports.push(`${pkg}.command.HelloCommand`, 'io.papermc.paper.plugin.lifecycle.event.types.LifecycleEvents');
    body.push(
      '        getLifecycleManager().registerEventHandler(LifecycleEvents.COMMANDS, event ->',
      `            event.registrar().register(HelloCommand.create(), "${javaText(t('code.helloDescription'))}"));`,
    );
  }
  if (command && !brigadier) {
    imports.push(`${pkg}.command.HelloCommand`, 'org.bukkit.command.PluginCommand');
    body.push(
      '        HelloCommand hello = new HelloCommand();',
      '        PluginCommand command = getCommand("hello");',
      '        if (command == null) {',
      `            throw new IllegalStateException("${javaText(t('code.missingCommand'))}");`,
      '        }',
      '        command.setExecutor(hello);',
      '        command.setTabCompleter(hello);',
    );
  }
  body.push(`        getLogger().info("${javaText(values.pluginName)} ${javaText(t('code.enabled'))}");`);

  return `${javaHeader(pkg, imports)}public final class ${values.mainClass} extends JavaPlugin {
    @Override
    public void onEnable() {
${body.join('\n')}
    }

    @Override
    public void onDisable() {
        getLogger().info("${javaText(values.pluginName)} ${javaText(t('code.disabled'))}");
    }
}
`;
}

function bukkitListener(info: BukkitInfo, values: FormValues): string {
  const pkg = `${values.package}.listener`;
  const imports = ['org.bukkit.event.EventHandler', 'org.bukkit.event.Listener', 'org.bukkit.event.player.PlayerJoinEvent'];
  if (info.paper) { imports.push('net.kyori.adventure.text.Component'); }
  const send = info.paper
    ? 'event.getPlayer().sendMessage(Component.text(text));'
    : 'event.getPlayer().sendMessage(text);';
  return `${javaHeader(pkg, imports)}public final class PlayerJoinListener implements Listener {
    public static final String DEFAULT_MESSAGE = "${javaText(t('code.welcome'))}";

    private final String message;

    public PlayerJoinListener(String message) {
        this.message = message;
    }

    @EventHandler
    public void onJoin(PlayerJoinEvent event) {
        String text = message.replace("%player%", event.getPlayer().getName());
        ${send}
    }
}
`;
}

function paperCommand(values: FormValues): string {
  const pkg = `${values.package}.command`;
  const permission = `${values.pluginName.toLowerCase()}.hello`;
  return `${javaHeader(pkg, [
    'com.mojang.brigadier.Command',
    'com.mojang.brigadier.arguments.StringArgumentType',
    'com.mojang.brigadier.tree.LiteralCommandNode',
    'io.papermc.paper.command.brigadier.CommandSourceStack',
    'io.papermc.paper.command.brigadier.Commands',
    'net.kyori.adventure.text.Component',
  ])}/** /hello [name] */
public final class HelloCommand {
    private HelloCommand() {
    }

    public static LiteralCommandNode<CommandSourceStack> create() {
        return Commands.literal("hello")
            .requires(source -> source.getSender().hasPermission("${permission}"))
            .executes(ctx -> {
                ctx.getSource().getSender().sendMessage(Component.text("${javaText(t('code.hello'))}"));
                return Command.SINGLE_SUCCESS;
            })
            .then(Commands.argument("name", StringArgumentType.word())
                .executes(ctx -> {
                    String name = StringArgumentType.getString(ctx, "name");
                    ctx.getSource().getSender().sendMessage(Component.text("${javaText(t('code.helloName'))}".replace("%name%", name)));
                    return Command.SINGLE_SUCCESS;
                }))
            .build();
    }
}
`;
}

/** A classic Bukkit command — Java 8 syntax, so it compiles against every API down to 1.8. */
function bukkitCommand(values: FormValues): string {
  const pkg = `${values.package}.command`;
  return `${javaHeader(pkg, [
    'java.util.ArrayList',
    'java.util.Collections',
    'java.util.List',
    'java.util.Locale',
    'org.bukkit.Bukkit',
    'org.bukkit.command.Command',
    'org.bukkit.command.CommandExecutor',
    'org.bukkit.command.CommandSender',
    'org.bukkit.command.TabCompleter',
    'org.bukkit.entity.Player',
  ])}/** /hello [name] */
public final class HelloCommand implements CommandExecutor, TabCompleter {
    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        String name = args.length > 0 ? args[0] : sender.getName();
        sender.sendMessage("${javaText(t('code.helloName'))}".replace("%name%", name));
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length != 1) {
            return Collections.emptyList();
        }
        String prefix = args[0].toLowerCase(Locale.ROOT);
        List<String> names = new ArrayList<>();
        for (Player player : Bukkit.getOnlinePlayers()) {
            if (player.getName().toLowerCase(Locale.ROOT).startsWith(prefix)) {
                names.add(player.getName());
            }
        }
        return names;
    }
}
`;
}

function bukkitTemplate(platform: BukkitPlatform): ProjectTemplate {
  const info = BUKKIT[platform];
  const build = (values: FormValues): PluginBuild => ({
    repositories: info.repositories,
    dependency: { group: info.group(values.mc), artifact: info.artifact, version: values.apiVersion },
    run: platform === 'folia' ? undefined : runPlugin(values, 'xyz.jpenilla.run-paper', 'runServer', 'minecraftVersion', values.mc),
    manifest: manifestName(info, values),
  });

  return defineTemplate({
    id: `minecraft-${platform}`,
    nameKey: `template.${platform}.name`,
    descriptionKey: `template.${platform}.description`,
    keywords: info.keywords,
    languageId: 'java',
    kindId: 'minecraft-bukkit',
    icon: info.icon,
    color: info.color,
    buildFields: () => bukkitFields(platform),
    open: ({ values }) => `src/main/java/${packagePath(values.package)}/${values.mainClass}.java`,
    setup: gradleSetup,
    next: ({ values }) => t(isMaven(values) ? 'next.maven' : 'next.gradle'),
    files(ctx) {
      const { values } = ctx;
      const main = `src/main/java/${packagePath(values.package)}`;
      const files: Record<string, string> = {
        ...buildFiles(ctx, build(values)),
        [`src/main/resources/${manifestName(info, values)}`]: bukkitManifest(info, platform, values),
        [`${main}/${values.mainClass}.java`]: bukkitMain(info, values),
        '.gitignore': gitignore(),
        'README.md': readme(ctx, info.label, buildCommands(values, 'runServer'), rangeMinecraft(values.apiVersion) ? [t('readme.latestBuild', { range: values.apiVersion, gradle: gradleDependencyVersion(values.apiVersion) })] : []),
      };
      if (isOn(values, 'listener')) { files[`${main}/listener/PlayerJoinListener.java`] = bukkitListener(info, values); }
      if (isOn(values, 'command') && paperCommands(info, values)) { files[`${main}/command/HelloCommand.java`] = paperCommand(values); }
      if (isOn(values, 'command') && !paperCommands(info, values)) { files[`${main}/command/HelloCommand.java`] = bukkitCommand(values); }
      if (isOn(values, 'config')) {
        files['src/main/resources/config.yml'] = `# ${t('code.configComment')}\nwelcome-message: ${quoted(t('code.welcome'))}\n`;
      }
      return files;
    },
  });
}

export const spigotTemplate = bukkitTemplate('spigot');
export const paperTemplate = bukkitTemplate('paper');
export const foliaTemplate = bukkitTemplate('folia');
export const purpurTemplate = bukkitTemplate('purpur');
export const leafTemplate = bukkitTemplate('leaf');

/* ------------------------------------------------------------------ *
 * Velocity
 * ------------------------------------------------------------------ */

const velocityCommandOn = (v: FormValues) => velocityHasBrigadier(v.apiVersion ?? '') && isOn(v, 'command');

function velocityFields(): FormField[] {
  const scope = 'velocity';
  return [
    ...identityFields('velocity'),
    versionField({
      scope,
      id: 'apiVersion',
      label: t('field.apiDependency', { api: 'velocity-api' }),
      hint: t('hint.velocity'),
      load: () => versions().velocity(),
      toChoices: (entries) => entries.map((e) => ({ value: e.version, label: e.version, hint: `Java ${velocityJava(e.version)}`, badge: e.badge ? t(`badge.${e.badge}`) : undefined })),
    }),
    javaField((v) => velocityJava(v.apiVersion ?? '')),
    gradleField(scope, () => PLUGIN_GRADLE, [], gradleOnly),
    buildToolField(['gradle-kts', 'gradle-groovy', 'maven']),
    toggle('command', t('option.brigadierCommand'), true, (v) => velocityHasBrigadier(v.apiVersion ?? '')),
    toggle('listener', t('option.listener'), true),
    ...runFields(scope, t('option.runServer'), t('hint.runServer'), true),
  ];
}

function velocityMain(values: FormValues): string {
  const pkg = values.package;
  const authors = authorsOf(values);
  const imports = [
    'com.google.inject.Inject',
    'com.velocitypowered.api.event.Subscribe',
    'com.velocitypowered.api.event.proxy.ProxyInitializeEvent',
    'com.velocitypowered.api.plugin.Plugin',
    'com.velocitypowered.api.plugin.annotation.DataDirectory',
    'com.velocitypowered.api.proxy.ProxyServer',
    'java.nio.file.Path',
    'org.slf4j.Logger',
  ];
  const body: string[] = [];
  if (isOn(values, 'listener')) {
    imports.push(`${pkg}.listener.JoinListener`);
    body.push('        server.getEventManager().register(this, new JoinListener());');
  }
  if (velocityCommandOn(values)) {
    imports.push(`${pkg}.command.HelloCommand`, 'com.velocitypowered.api.command.BrigadierCommand', 'com.velocitypowered.api.command.CommandManager');
    body.push(
      '        CommandManager commands = server.getCommandManager();',
      '        BrigadierCommand hello = HelloCommand.create();',
      '        commands.register(commands.metaBuilder(hello).plugin(this).build(), hello);',
    );
  }
  body.push(`        logger.info("${javaText(values.name ?? values.pluginId)} ${javaText(t('code.enabled'))}");`);

  const annotation = [
    `    id = "${values.pluginId}"`,
    `    name = "${javaText(values.name ?? values.pluginId)}"`,
    `    version = "${javaText(values.version)}"`,
    ...(values.description ? [`    description = "${javaText(values.description)}"`] : []),
    ...(values.website ? [`    url = "${javaText(values.website)}"`] : []),
    ...(authors.length ? [`    authors = {${authors.map((a) => `"${javaText(a)}"`).join(', ')}}`] : []),
  ];

  return `${javaHeader(pkg, imports)}@Plugin(
${annotation.join(',\n')}
)
public final class ${values.mainClass} {
    private final ProxyServer server;
    private final Logger logger;
    private final Path dataDirectory;

    @Inject
    public ${values.mainClass}(ProxyServer server, Logger logger, @DataDirectory Path dataDirectory) {
        this.server = server;
        this.logger = logger;
        this.dataDirectory = dataDirectory;
    }

    @Subscribe
    public void onProxyInitialization(ProxyInitializeEvent event) {
${body.join('\n')}
    }

    public Path dataDirectory() {
        return dataDirectory;
    }
}
`;
}

function velocityListener(values: FormValues): string {
  return `${javaHeader(`${values.package}.listener`, [
    'com.velocitypowered.api.event.Subscribe',
    'com.velocitypowered.api.event.connection.PostLoginEvent',
    'net.kyori.adventure.text.Component',
  ])}public final class JoinListener {
    @Subscribe
    public void onPostLogin(PostLoginEvent event) {
        String text = "${javaText(t('code.welcome'))}".replace("%player%", event.getPlayer().getUsername());
        event.getPlayer().sendMessage(Component.text(text));
    }
}
`;
}

function velocityCommand(values: FormValues): string {
  return `${javaHeader(`${values.package}.command`, [
    'com.mojang.brigadier.Command',
    'com.mojang.brigadier.arguments.StringArgumentType',
    'com.mojang.brigadier.builder.LiteralArgumentBuilder',
    'com.mojang.brigadier.builder.RequiredArgumentBuilder',
    'com.velocitypowered.api.command.BrigadierCommand',
    'com.velocitypowered.api.command.CommandSource',
    'net.kyori.adventure.text.Component',
  ])}/** /hello [name] */
public final class HelloCommand {
    private HelloCommand() {
    }

    public static BrigadierCommand create() {
        LiteralArgumentBuilder<CommandSource> root = LiteralArgumentBuilder.<CommandSource>literal("hello")
            .requires(source -> source.hasPermission("${values.pluginId}.hello"))
            .executes(ctx -> {
                ctx.getSource().sendMessage(Component.text("${javaText(t('code.hello'))}"));
                return Command.SINGLE_SUCCESS;
            })
            .then(RequiredArgumentBuilder.<CommandSource, String>argument("name", StringArgumentType.word())
                .executes(ctx -> {
                    String name = StringArgumentType.getString(ctx, "name");
                    ctx.getSource().sendMessage(Component.text("${javaText(t('code.helloName'))}".replace("%name%", name)));
                    return Command.SINGLE_SUCCESS;
                }));
        return new BrigadierCommand(root);
    }
}
`;
}

export const velocityTemplate: ProjectTemplate = defineTemplate({
  id: 'minecraft-velocity',
  nameKey: 'template.velocity.name',
  descriptionKey: 'template.velocity.description',
  keywords: ['velocity', 'proxy', 'plugin', 'brigadier'],
  languageId: 'java',
  kindId: 'minecraft-velocity',
  icon: 'Ve',
  color: '#1f8bd6',
  buildFields: velocityFields,
  open: ({ values }) => `src/main/java/${packagePath(values.package)}/${values.mainClass}.java`,
  setup: gradleSetup,
  next: ({ values }) => t(isMaven(values) ? 'next.maven' : 'next.gradle'),
  files(ctx) {
    const { values } = ctx;
    const main = `src/main/java/${packagePath(values.package)}`;
    const build: PluginBuild = {
      repositories: [PAPER_REPO],
      dependency: { group: 'com.velocitypowered', artifact: 'velocity-api', version: values.apiVersion },
      annotationProcessor: true,
      run: runPlugin(values, 'xyz.jpenilla.run-velocity', 'runVelocity', 'velocityVersion', values.apiVersion),
    };
    const files: Record<string, string> = {
      ...buildFiles(ctx, build),
      [`${main}/${values.mainClass}.java`]: velocityMain(values),
      '.gitignore': gitignore(),
      'README.md': readme(ctx, `Velocity ${values.apiVersion}`, buildCommands(values, 'runVelocity')),
    };
    if (isOn(values, 'listener')) { files[`${main}/listener/JoinListener.java`] = velocityListener(values); }
    if (velocityCommandOn(values)) { files[`${main}/command/HelloCommand.java`] = velocityCommand(values); }
    return files;
  },
});

/* ------------------------------------------------------------------ *
 * BungeeCord
 * ------------------------------------------------------------------ */

const SONATYPE_SNAPSHOTS: Repository = { id: 'sonatype-snapshots', url: 'https://central.sonatype.com/repository/maven-snapshots/' };
/** bungeecord-protocol needs com.mojang:brigadier from Mojang's libraries. */
const MINECRAFT_LIBRARIES: Repository = { id: 'minecraft-libraries', url: 'https://libraries.minecraft.net/' };

function bungeeFields(): FormField[] {
  const scope = 'bungeecord';
  return [
    ...identityFields('plugin'),
    versionField({
      scope,
      id: 'apiVersion',
      label: t('field.apiDependency', { api: 'bungeecord-api' }),
      load: () => versions().bungee(),
    }),
    javaField(() => 17),
    gradleField(scope, () => PLUGIN_GRADLE, [], gradleOnly),
    buildToolField(['gradle-kts', 'gradle-groovy', 'maven']),
    toggle('command', t('option.command'), true),
    toggle('listener', t('option.listener'), true),
    ...runFields(scope, t('option.runWaterfall'), t('hint.runWaterfall'), false),
  ];
}

function bungeeManifest(values: FormValues): string {
  const authors = authorsOf(values);
  const lines = [
    `name: ${values.pluginName}`,
    `main: ${values.package}.${values.mainClass}`,
    `version: '${versionToken(values)}'`,
  ];
  if (authors.length) { lines.push(`author: ${yaml(values, authors.join(', '))}`); }
  if (values.description) { lines.push(`description: ${yaml(values, values.description)}`); }
  return `${lines.join('\n')}\n`;
}

function bungeeMain(values: FormValues): string {
  const pkg = values.package;
  const imports = ['net.md_5.bungee.api.plugin.Plugin'];
  const body: string[] = [];
  if (isOn(values, 'listener')) {
    imports.push(`${pkg}.listener.JoinListener`);
    body.push('        getProxy().getPluginManager().registerListener(this, new JoinListener());');
  }
  if (isOn(values, 'command')) {
    imports.push(`${pkg}.command.HelloCommand`);
    body.push(`        getProxy().getPluginManager().registerCommand(this, new HelloCommand("${values.pluginName.toLowerCase()}.hello"));`);
  }
  body.push(`        getLogger().info("${javaText(values.pluginName)} ${javaText(t('code.enabled'))}");`);
  return `${javaHeader(pkg, imports)}public final class ${values.mainClass} extends Plugin {
    @Override
    public void onEnable() {
${body.join('\n')}
    }
}
`;
}

function bungeeListener(values: FormValues): string {
  return `${javaHeader(`${values.package}.listener`, [
    'net.md_5.bungee.api.chat.TextComponent',
    'net.md_5.bungee.api.event.PostLoginEvent',
    'net.md_5.bungee.api.plugin.Listener',
    'net.md_5.bungee.event.EventHandler',
  ])}public final class JoinListener implements Listener {
    @EventHandler
    public void onPostLogin(PostLoginEvent event) {
        String text = "${javaText(t('code.welcome'))}".replace("%player%", event.getPlayer().getName());
        event.getPlayer().sendMessage(new TextComponent(text));
    }
}
`;
}

function bungeeCommand(values: FormValues): string {
  return `${javaHeader(`${values.package}.command`, [
    'java.util.ArrayList',
    'java.util.Collections',
    'java.util.List',
    'java.util.Locale',
    'net.md_5.bungee.api.CommandSender',
    'net.md_5.bungee.api.ProxyServer',
    'net.md_5.bungee.api.chat.TextComponent',
    'net.md_5.bungee.api.connection.ProxiedPlayer',
    'net.md_5.bungee.api.plugin.Command',
    'net.md_5.bungee.api.plugin.TabExecutor',
  ])}/** /hello [name] */
public final class HelloCommand extends Command implements TabExecutor {
    public HelloCommand(String permission) {
        super("hello", permission);
    }

    @Override
    public void execute(CommandSender sender, String[] args) {
        String name = args.length > 0 ? args[0] : sender.getName();
        sender.sendMessage(new TextComponent("${javaText(t('code.helloName'))}".replace("%name%", name)));
    }

    @Override
    public Iterable<String> onTabComplete(CommandSender sender, String[] args) {
        if (args.length != 1) {
            return Collections.emptyList();
        }
        String prefix = args[0].toLowerCase(Locale.ROOT);
        List<String> names = new ArrayList<>();
        for (ProxiedPlayer player : ProxyServer.getInstance().getPlayers()) {
            if (player.getName().toLowerCase(Locale.ROOT).startsWith(prefix)) {
                names.add(player.getName());
            }
        }
        return names;
    }
}
`;
}

export const bungeeTemplate: ProjectTemplate = defineTemplate({
  id: 'minecraft-bungeecord',
  nameKey: 'template.bungeecord.name',
  descriptionKey: 'template.bungeecord.description',
  keywords: ['bungeecord', 'bungee', 'waterfall', 'proxy', 'plugin'],
  languageId: 'java',
  kindId: 'minecraft-bungeecord',
  icon: 'Bc',
  color: '#e0a526',
  buildFields: bungeeFields,
  open: ({ values }) => `src/main/java/${packagePath(values.package)}/${values.mainClass}.java`,
  setup: gradleSetup,
  next: ({ values }) => t(isMaven(values) ? 'next.maven' : 'next.gradle'),
  files(ctx) {
    const { values } = ctx;
    const main = `src/main/java/${packagePath(values.package)}`;
    const snapshot = values.apiVersion.endsWith('-SNAPSHOT');
    const build: PluginBuild = {
      repositories: [MINECRAFT_LIBRARIES, ...(snapshot ? [SONATYPE_SNAPSHOTS] : [])],
      dependency: { group: 'net.md-5', artifact: 'bungeecord-api', version: values.apiVersion },
      run: runPlugin(values, 'xyz.jpenilla.run-waterfall', 'runWaterfall', 'waterfallVersion', '1.21'),
      manifest: 'bungee.yml',
    };
    const files: Record<string, string> = {
      ...buildFiles(ctx, build),
      'src/main/resources/bungee.yml': bungeeManifest(values),
      [`${main}/${values.mainClass}.java`]: bungeeMain(values),
      '.gitignore': gitignore(),
      'README.md': readme(ctx, `BungeeCord ${values.apiVersion}`, buildCommands(values, 'runWaterfall')),
    };
    if (isOn(values, 'listener')) { files[`${main}/listener/JoinListener.java`] = bungeeListener(values); }
    if (isOn(values, 'command')) { files[`${main}/command/HelloCommand.java`] = bungeeCommand(values); }
    return files;
  },
});

export const PLUGIN_TEMPLATES = [paperTemplate, spigotTemplate, foliaTemplate, purpurTemplate, leafTemplate, velocityTemplate, bungeeTemplate];
