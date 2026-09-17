/**
 * The plugin templates: Spigot, Paper, Leaf (the Bukkit family), Velocity and
 * BungeeCord — with Gradle (Kotlin or Groovy) or Maven.
 */

import type { FormField, FormValues, ProjectTemplate, TemplateContext } from '@/core/types'
import { t } from '@/i18n'
import {
  authorsOf, buildToolField, defineTemplate, escapeXml, foojay, gitignore, gradleSetup, identityFields, isKts,
  isMaven, isOn, javaField, javaHeader, javaText, mcVersionField, packagePath, quoted, readme, section,
  settingsFile, gstr, toggle, wrapperProperties,
} from './common'
import { templateKind } from './kinds'
import { currentCatalog, sortVersions } from './versions'

/* ------------------------------------------------------------------ *
 * The shared build files
 * ------------------------------------------------------------------ */

interface Repository { id: string; url: string }

interface PluginBuild {
  repositories: Repository[]
  dependency: { group: string; artifact: string; version: string }
  annotationProcessor?: boolean
  /** The Gradle plugin for a test server (run-paper and its like). */
  run?: { plugin: string; task: string; call: string; version: string }
  /** The file in which `${version}` is replaced. */
  manifest?: string
}

function gradleBuild(values: FormValues, build: PluginBuild): string {
  const kts = isKts(values)
  const { group, artifact, version } = build.dependency
  const coordinate = `${group}:${artifact}:${version}`
  const java = values.java

  const plugins = [kts ? '    java' : "    id 'java'"]
  if (build.run) plugins.push(kts ? `    id("${build.run.plugin}") version "${build.run.version}"` : `    id '${build.run.plugin}' version '${build.run.version}'`)

  const repos = ['    mavenCentral()', ...build.repositories.map((r) => (kts
    ? `    maven("${r.url}") {\n        name = "${r.id}"\n    }`
    : `    maven {\n        name = '${r.id}'\n        url = '${r.url}'\n    }`))]

  const deps = [kts ? `    compileOnly("${coordinate}")` : `    compileOnly '${coordinate}'`]
  if (build.annotationProcessor) deps.push(kts ? `    annotationProcessor("${coordinate}")` : `    annotationProcessor '${coordinate}'`)

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
  ]
  if (build.manifest && kts) {
    blocks.push(`tasks.processResources {\n    val props = mapOf("version" to version)\n    inputs.properties(props)\n    filteringCharset = "UTF-8"\n    filesMatching("${build.manifest}") {\n        expand(props)\n    }\n}`)
  }
  if (build.manifest && !kts) {
    blocks.push(`processResources {\n    def props = [version: version]\n    inputs.properties props\n    filteringCharset = 'UTF-8'\n    filesMatching('${build.manifest}') {\n        expand props\n    }\n}`)
  }
  if (build.run && kts) blocks.push(`tasks.${build.run.task} {\n    ${build.run.call}\n}`)
  if (build.run && !kts) blocks.push(`tasks.named('${build.run.task}') {\n    ${build.run.call}\n}`)
  return `${blocks.join('\n\n')}\n`
}

function pom(values: FormValues, build: PluginBuild): string {
  const { group, artifact, version } = build.dependency
  const entries = build.repositories.map((r) => `    <repository>\n      <id>${r.id}</id>\n      <url>${r.url}</url>\n    </repository>`)
  const repos = entries.length ? `\n  <repositories>\n${entries.join('\n')}\n  </repositories>\n` : ''
  const processor = build.annotationProcessor ? '\n          <proc>full</proc>' : ''
  const description = values.description ? `\n  <description>${escapeXml(values.description)}</description>` : ''
  const url = values.website ? `\n  <url>${escapeXml(values.website)}</url>` : ''
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
    : ''

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
      <version>${version}</version>
      <scope>provided</scope>
    </dependency>
  </dependencies>

  <build>
    <defaultGoal>clean package</defaultGoal>${filtering}
    <plugins>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <version>3.16.0</version>
        <configuration>
          <release>${values.java}</release>${processor}
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>
`
}

/** The build files, depending on the tool. */
function buildFiles(ctx: TemplateContext, build: PluginBuild): Record<string, string> {
  const { values } = ctx
  if (isMaven(values)) return { 'pom.xml': pom(values, build) }
  return {
    ...settingsFile(values, values.artifactId, [], foojay(values)),
    [isKts(values) ? 'build.gradle.kts' : 'build.gradle']: gradleBuild(values, build),
    'gradle.properties': 'org.gradle.caching=true\norg.gradle.parallel=true\n',
    'gradle/wrapper/gradle-wrapper.properties': wrapperProperties(currentCatalog().gradle.plugin),
  }
}

/** The placeholder for the version in the manifest — Gradle's `expand` or a Maven filter. */
const versionToken = (values: FormValues) => (isMaven(values) ? '${project.version}' : '${version}')

/** Text for YAML, with `$` escaped for Gradle's template engine. */
function yaml(values: FormValues, text: string): string {
  if (isMaven(values)) return quoted(text)
  return quoted(text).replace(/\$/g, '\\$')
}

function buildCommands(values: FormValues, runTask?: string): string[] {
  if (isMaven(values)) return ['mvn package          # target/*.jar']
  return [
    './gradlew build      # build/libs/*.jar',
    ...(runTask && isOn(values, 'runServer') ? [`./gradlew ${runTask}  # ${t('minecraft.readme.testServer')}`] : []),
  ]
}

/** The test-server plugin (run-paper and its like), only where the option is on. */
function runPlugin(values: FormValues, plugin: string, task: string, fn: string, version: string): PluginBuild['run'] {
  if (!isOn(values, 'runServer')) return undefined
  return { plugin, task, call: `${fn}(${gstr(values, version)})`, version: currentCatalog().runTask }
}

const runToggle = (): FormField => toggle('runServer', t('minecraft.option.runServer'), true, (v) => !isMaven(v), t('minecraft.hint.runServer'))

/* ------------------------------------------------------------------ *
 * The Bukkit family: Spigot, Paper, Leaf
 * ------------------------------------------------------------------ */

type BukkitPlatform = 'spigot' | 'paper' | 'leaf'

interface BukkitInfo {
  label: string
  color: string
  icon: string
  repositories: Repository[]
  group: string
  artifact: string
  versions: () => Record<string, string>
  /** The Paper API is present: Brigadier commands, Adventure, paper-plugin.yml. */
  paper: boolean
}

const PAPER_REPO: Repository = { id: 'papermc', url: 'https://repo.papermc.io/repository/maven-public/' }

const BUKKIT: Record<BukkitPlatform, BukkitInfo> = {
  spigot: {
    label: 'Spigot',
    color: '#ed8106',
    icon: 'Sp',
    repositories: [{ id: 'spigotmc-repo', url: 'https://hub.spigotmc.org/nexus/content/repositories/snapshots/' }],
    group: 'org.spigotmc',
    artifact: 'spigot-api',
    versions: () => currentCatalog().spigot,
    paper: false,
  },
  paper: {
    label: 'Paper',
    color: '#f4f4f4',
    icon: 'Pa',
    repositories: [PAPER_REPO],
    group: 'io.papermc.paper',
    artifact: 'paper-api',
    versions: () => currentCatalog().paper,
    paper: true,
  },
  leaf: {
    label: 'Leaf',
    color: '#6fbf3e',
    icon: 'Lf',
    repositories: [{ id: 'leafmc', url: 'https://maven.leafmc.one/snapshots/' }, PAPER_REPO],
    group: 'cn.dreeam.leaf',
    artifact: 'leaf-api',
    versions: () => currentCatalog().leaf,
    paper: true,
  },
}

const manifestName = (info: BukkitInfo, values: FormValues) => (info.paper && values.manifest === 'paper' ? 'paper-plugin.yml' : 'plugin.yml')

function bukkitFields(platform: BukkitPlatform): FormField[] {
  const info = BUKKIT[platform]
  const versions = () => sortVersions(Object.keys(info.versions()))
  const fields: FormField[] = [
    ...identityFields('plugin'),
    mcVersionField(versions),
    javaField(),
    {
      id: 'apiVersion',
      label: t('minecraft.field.apiDependency', { api: info.artifact }),
      default: (v) => info.versions()[v.mc] ?? Object.values(info.versions())[0] ?? '',
      pattern: String.raw`[0-9A-Za-z][0-9A-Za-z.+_-]*`,
      patternHint: t('minecraft.hint.versionValue'),
      mono: true,
      section: section.minecraft(),
    },
    buildToolField(['gradle-kts', 'gradle-groovy', 'maven']),
  ]
  if (info.paper) {
    fields.push({
      id: 'manifest',
      label: t('minecraft.field.manifest'),
      type: 'select',
      choices: [
        { value: 'paper', label: 'paper-plugin.yml', hint: t('minecraft.hint.paperPlugin') },
        { value: 'bukkit', label: 'plugin.yml', hint: t('minecraft.hint.bukkitPlugin') },
      ],
      section: section.build(),
    })
  }
  fields.push(
    toggle('command', t(info.paper ? 'minecraft.option.brigadierCommand' : 'minecraft.option.command'), true),
    toggle('listener', t('minecraft.option.listener'), true),
    toggle('config', t('minecraft.option.config'), false),
    runToggle(),
  )
  return fields
}

function bukkitManifest(info: BukkitInfo, values: FormValues): string {
  const permission = `${values.pluginName.toLowerCase()}.hello`
  const authors = authorsOf(values)
  const lines = [
    `name: ${values.pluginName}`,
    `version: '${versionToken(values)}'`,
    `main: ${values.package}.${values.mainClass}`,
    `api-version: '${values.mc}'`,
  ]
  if (values.description) lines.push(`description: ${yaml(values, values.description)}`)
  if (authors.length) lines.push(`authors: [${authors.map((a) => yaml(values, a)).join(', ')}]`)
  if (values.website) lines.push(`website: ${yaml(values, values.website)}`)
  const command = isOn(values, 'command')
  if (command && !info.paper) {
    lines.push(
      'commands:',
      '  hello:',
      `    description: ${quoted(t('minecraft.code.helloDescription'))}`,
      '    usage: /hello [name]',
      `    permission: ${permission}`,
    )
  }
  if (command) {
    lines.push(
      'permissions:',
      `  ${permission}:`,
      `    description: ${quoted(t('minecraft.code.helloPermission'))}`,
      '    default: true',
    )
  }
  return `${lines.join('\n')}\n`
}

function bukkitMain(info: BukkitInfo, values: FormValues): string {
  const pkg = values.package
  const imports = ['org.bukkit.plugin.java.JavaPlugin']
  const body: string[] = []
  const config = isOn(values, 'config')
  const listener = isOn(values, 'listener')
  const command = isOn(values, 'command')

  if (config) body.push('        saveDefaultConfig();')
  if (listener) {
    imports.push(`${pkg}.listener.PlayerJoinListener`)
    const message = config
      ? 'getConfig().getString("welcome-message", PlayerJoinListener.DEFAULT_MESSAGE)'
      : 'PlayerJoinListener.DEFAULT_MESSAGE'
    body.push(`        getServer().getPluginManager().registerEvents(new PlayerJoinListener(${message}), this);`)
  }
  if (command && info.paper) {
    imports.push(`${pkg}.command.HelloCommand`, 'io.papermc.paper.plugin.lifecycle.event.types.LifecycleEvents')
    body.push(
      '        getLifecycleManager().registerEventHandler(LifecycleEvents.COMMANDS, event ->',
      `            event.registrar().register(HelloCommand.create(), "${javaText(t('minecraft.code.helloDescription'))}"));`,
    )
  }
  if (command && !info.paper) {
    imports.push(`${pkg}.command.HelloCommand`, 'java.util.Objects', 'org.bukkit.command.PluginCommand')
    body.push(
      '        HelloCommand hello = new HelloCommand();',
      '        PluginCommand command = Objects.requireNonNull(getCommand("hello"), "hello fehlt in plugin.yml");',
      '        command.setExecutor(hello);',
      '        command.setTabCompleter(hello);',
    )
  }
  body.push(`        getLogger().info("${javaText(values.pluginName)} ${javaText(t('minecraft.code.enabled'))}");`)

  return `${javaHeader(pkg, imports)}public final class ${values.mainClass} extends JavaPlugin {
    @Override
    public void onEnable() {
${body.join('\n')}
    }

    @Override
    public void onDisable() {
        getLogger().info("${javaText(values.pluginName)} ${javaText(t('minecraft.code.disabled'))}");
    }
}
`
}

function bukkitListener(info: BukkitInfo, values: FormValues): string {
  const pkg = `${values.package}.listener`
  const imports = ['org.bukkit.event.EventHandler', 'org.bukkit.event.Listener', 'org.bukkit.event.player.PlayerJoinEvent']
  if (info.paper) imports.push('net.kyori.adventure.text.Component')
  const send = info.paper
    ? 'event.getPlayer().sendMessage(Component.text(text));'
    : 'event.getPlayer().sendMessage(text);'
  return `${javaHeader(pkg, imports)}public final class PlayerJoinListener implements Listener {
    public static final String DEFAULT_MESSAGE = "${javaText(t('minecraft.code.welcome'))}";

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
`
}

function paperCommand(values: FormValues): string {
  const pkg = `${values.package}.command`
  const permission = `${values.pluginName.toLowerCase()}.hello`
  return `${javaHeader(pkg, [
    'com.mojang.brigadier.Command',
    'com.mojang.brigadier.arguments.StringArgumentType',
    'com.mojang.brigadier.tree.LiteralCommandNode',
    'io.papermc.paper.command.brigadier.CommandSourceStack',
    'io.papermc.paper.command.brigadier.Commands',
    'net.kyori.adventure.text.Component',
  ])}/** /hello [name] als Brigadier-Befehl. */
public final class HelloCommand {
    private HelloCommand() {
    }

    public static LiteralCommandNode<CommandSourceStack> create() {
        return Commands.literal("hello")
            .requires(source -> source.getSender().hasPermission("${permission}"))
            .executes(ctx -> {
                ctx.getSource().getSender().sendMessage(Component.text("${javaText(t('minecraft.code.hello'))}"));
                return Command.SINGLE_SUCCESS;
            })
            .then(Commands.argument("name", StringArgumentType.word())
                .executes(ctx -> {
                    String name = StringArgumentType.getString(ctx, "name");
                    ctx.getSource().getSender().sendMessage(Component.text("${javaText(t('minecraft.code.helloName'))}".replace("%name%", name)));
                    return Command.SINGLE_SUCCESS;
                }))
            .build();
    }
}
`
}

function spigotCommand(values: FormValues): string {
  const pkg = `${values.package}.command`
  return `${javaHeader(pkg, [
    'java.util.List',
    'java.util.Locale',
    'org.bukkit.Bukkit',
    'org.bukkit.command.Command',
    'org.bukkit.command.CommandExecutor',
    'org.bukkit.command.CommandSender',
    'org.bukkit.command.TabCompleter',
    'org.bukkit.entity.Player',
  ])}/** /hello [name] mit Tab-Vervollständigung der Spielernamen. */
public final class HelloCommand implements CommandExecutor, TabCompleter {
    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        String name = args.length > 0 ? args[0] : sender.getName();
        sender.sendMessage("${javaText(t('minecraft.code.helloName'))}".replace("%name%", name));
        return true;
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length != 1) {
            return List.of();
        }
        String prefix = args[0].toLowerCase(Locale.ROOT);
        return Bukkit.getOnlinePlayers().stream()
            .map(Player::getName)
            .filter(name -> name.toLowerCase(Locale.ROOT).startsWith(prefix))
            .toList();
    }
}
`
}

function bukkitTemplate(platform: BukkitPlatform): ProjectTemplate {
  const info = BUKKIT[platform]
  const build = (values: FormValues): PluginBuild => ({
    repositories: info.repositories,
    dependency: { group: info.group, artifact: info.artifact, version: values.apiVersion },
    run: runPlugin(values, 'xyz.jpenilla.run-paper', 'runServer', 'minecraftVersion', values.mc),
    manifest: manifestName(info, values),
  })

  return defineTemplate({
    id: `minecraft-${platform}`,
    nameKey: `minecraft.template.${platform}.name`,
    descriptionKey: `minecraft.template.${platform}.description`,
    languageId: 'java',
    kindId: (values) => templateKind('minecraft-bukkit', values),
    icon: info.icon,
    color: info.color,
    buildFields: () => bukkitFields(platform),
    open: ({ values }) => `src/main/java/${packagePath(values.package)}/${values.mainClass}.java`,
    setup: (ctx) => gradleSetup(ctx, currentCatalog().gradle.plugin),
    next: ({ values }) => t(isMaven(values) ? 'minecraft.next.maven' : 'minecraft.next.gradle'),
    files(ctx) {
      const { values } = ctx
      const main = `src/main/java/${packagePath(values.package)}`
      const files: Record<string, string> = {
        ...buildFiles(ctx, build(values)),
        [`src/main/resources/${manifestName(info, values)}`]: bukkitManifest(info, values),
        [`${main}/${values.mainClass}.java`]: bukkitMain(info, values),
        '.gitignore': gitignore(),
        'README.md': readme(ctx, info.label, buildCommands(values, 'runServer')),
      }
      if (isOn(values, 'listener')) files[`${main}/listener/PlayerJoinListener.java`] = bukkitListener(info, values)
      if (isOn(values, 'command') && info.paper) files[`${main}/command/HelloCommand.java`] = paperCommand(values)
      if (isOn(values, 'command') && !info.paper) files[`${main}/command/HelloCommand.java`] = spigotCommand(values)
      if (isOn(values, 'config')) {
        files['src/main/resources/config.yml'] = `# ${t('minecraft.code.configComment')}\nwelcome-message: ${quoted(t('minecraft.code.welcome'))}\n`
      }
      return files
    },
  })
}

export const spigotTemplate = bukkitTemplate('spigot')
export const paperTemplate = bukkitTemplate('paper')
export const leafTemplate = bukkitTemplate('leaf')

/* ------------------------------------------------------------------ *
 * Velocity
 * ------------------------------------------------------------------ */

const velocityJava = (api: string) => (api.startsWith('3.') ? '21' : '25')

function velocityFields(): FormField[] {
  return [
    ...identityFields('velocity'),
    {
      id: 'apiVersion',
      label: t('minecraft.field.apiDependency', { api: 'velocity-api' }),
      type: 'select',
      choices: currentCatalog().velocity.map((v) => ({ value: v, label: `Velocity ${v}`, hint: `Java ${velocityJava(v)}` })),
      section: section.minecraft(),
      mono: true,
    },
    { ...javaField(), default: (v) => velocityJava(v.apiVersion ?? '') },
    buildToolField(['gradle-kts', 'gradle-groovy', 'maven']),
    toggle('command', t('minecraft.option.brigadierCommand'), true),
    toggle('listener', t('minecraft.option.listener'), true),
    runToggle(),
  ]
}

function velocityMain(values: FormValues): string {
  const pkg = values.package
  const authors = authorsOf(values)
  const imports = [
    'com.google.inject.Inject',
    'com.velocitypowered.api.event.Subscribe',
    'com.velocitypowered.api.event.proxy.ProxyInitializeEvent',
    'com.velocitypowered.api.plugin.Plugin',
    'com.velocitypowered.api.plugin.annotation.DataDirectory',
    'com.velocitypowered.api.proxy.ProxyServer',
    'java.nio.file.Path',
    'org.slf4j.Logger',
  ]
  const body: string[] = []
  if (isOn(values, 'listener')) {
    imports.push(`${pkg}.listener.JoinListener`)
    body.push('        server.getEventManager().register(this, new JoinListener());')
  }
  if (isOn(values, 'command')) {
    imports.push(`${pkg}.command.HelloCommand`, 'com.velocitypowered.api.command.BrigadierCommand', 'com.velocitypowered.api.command.CommandManager')
    body.push(
      '        CommandManager commands = server.getCommandManager();',
      '        BrigadierCommand hello = HelloCommand.create();',
      '        commands.register(commands.metaBuilder(hello).plugin(this).build(), hello);',
    )
  }
  body.push(`        logger.info("${javaText(values.name ?? values.pluginId)} ${javaText(t('minecraft.code.enabled'))}");`)

  const annotation = [
    `    id = "${values.pluginId}"`,
    `    name = "${javaText(values.name ?? values.pluginId)}"`,
    `    version = "${javaText(values.version)}"`,
    ...(values.description ? [`    description = "${javaText(values.description)}"`] : []),
    ...(values.website ? [`    url = "${javaText(values.website)}"`] : []),
    ...(authors.length ? [`    authors = {${authors.map((a) => `"${javaText(a)}"`).join(', ')}}`] : []),
  ]

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
`
}

function velocityListener(values: FormValues): string {
  return `${javaHeader(`${values.package}.listener`, [
    'com.velocitypowered.api.event.Subscribe',
    'com.velocitypowered.api.event.connection.PostLoginEvent',
    'net.kyori.adventure.text.Component',
  ])}public final class JoinListener {
    @Subscribe
    public void onPostLogin(PostLoginEvent event) {
        String text = "${javaText(t('minecraft.code.welcome'))}".replace("%player%", event.getPlayer().getUsername());
        event.getPlayer().sendMessage(Component.text(text));
    }
}
`
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
  ])}/** /hello [name] als Brigadier-Befehl. */
public final class HelloCommand {
    private HelloCommand() {
    }

    public static BrigadierCommand create() {
        LiteralArgumentBuilder<CommandSource> root = LiteralArgumentBuilder.<CommandSource>literal("hello")
            .requires(source -> source.hasPermission("${values.pluginId}.hello"))
            .executes(ctx -> {
                ctx.getSource().sendMessage(Component.text("${javaText(t('minecraft.code.hello'))}"));
                return Command.SINGLE_SUCCESS;
            })
            .then(RequiredArgumentBuilder.<CommandSource, String>argument("name", StringArgumentType.word())
                .executes(ctx -> {
                    String name = StringArgumentType.getString(ctx, "name");
                    ctx.getSource().sendMessage(Component.text("${javaText(t('minecraft.code.helloName'))}".replace("%name%", name)));
                    return Command.SINGLE_SUCCESS;
                }));
        return new BrigadierCommand(root);
    }
}
`
}

export const velocityTemplate: ProjectTemplate = defineTemplate({
  id: 'minecraft-velocity',
  nameKey: 'minecraft.template.velocity.name',
  descriptionKey: 'minecraft.template.velocity.description',
  languageId: 'java',
  kindId: (values) => templateKind('minecraft-velocity', values),
  icon: 'Ve',
  color: '#1f8bd6',
  buildFields: velocityFields,
  open: ({ values }) => `src/main/java/${packagePath(values.package)}/${values.mainClass}.java`,
  setup: (ctx) => gradleSetup(ctx, currentCatalog().gradle.plugin),
  next: ({ values }) => t(isMaven(values) ? 'minecraft.next.maven' : 'minecraft.next.gradle'),
  files(ctx) {
    const { values } = ctx
    const main = `src/main/java/${packagePath(values.package)}`
    const build: PluginBuild = {
      repositories: [PAPER_REPO],
      dependency: { group: 'com.velocitypowered', artifact: 'velocity-api', version: values.apiVersion },
      annotationProcessor: true,
      run: runPlugin(values, 'xyz.jpenilla.run-velocity', 'runVelocity', 'velocityVersion', values.apiVersion),
    }
    const files: Record<string, string> = {
      ...buildFiles(ctx, build),
      [`${main}/${values.mainClass}.java`]: velocityMain(values),
      '.gitignore': gitignore(),
      'README.md': readme(ctx, `Velocity ${values.apiVersion}`, buildCommands(values, 'runVelocity')),
    }
    if (isOn(values, 'listener')) files[`${main}/listener/JoinListener.java`] = velocityListener(values)
    if (isOn(values, 'command')) files[`${main}/command/HelloCommand.java`] = velocityCommand(values)
    return files
  },
})

/* ------------------------------------------------------------------ *
 * BungeeCord
 * ------------------------------------------------------------------ */

const SONATYPE_SNAPSHOTS: Repository = { id: 'sonatype-snapshots', url: 'https://central.sonatype.com/repository/maven-snapshots/' }
/** bungeecord-protocol needs com.mojang:brigadier from Mojang's libraries. */
const MINECRAFT_LIBRARIES: Repository = { id: 'minecraft-libraries', url: 'https://libraries.minecraft.net/' }

function bungeeFields(): FormField[] {
  return [
    ...identityFields('plugin'),
    {
      id: 'apiVersion',
      label: t('minecraft.field.apiDependency', { api: 'bungeecord-api' }),
      type: 'select',
      choices: currentCatalog().bungee.map((v) => ({ value: v, label: `BungeeCord ${v}` })),
      section: section.minecraft(),
      mono: true,
    },
    { ...javaField(), default: '21' },
    buildToolField(['gradle-kts', 'gradle-groovy', 'maven']),
    toggle('command', t('minecraft.option.command'), true),
    toggle('listener', t('minecraft.option.listener'), true),
    toggle('runServer', t('minecraft.option.runWaterfall'), false, (v) => !isMaven(v), t('minecraft.hint.runWaterfall')),
  ]
}

function bungeeManifest(values: FormValues): string {
  const authors = authorsOf(values)
  const lines = [
    `name: ${values.pluginName}`,
    `main: ${values.package}.${values.mainClass}`,
    `version: '${versionToken(values)}'`,
  ]
  if (authors.length) lines.push(`author: ${yaml(values, authors.join(', '))}`)
  if (values.description) lines.push(`description: ${yaml(values, values.description)}`)
  return `${lines.join('\n')}\n`
}

function bungeeMain(values: FormValues): string {
  const pkg = values.package
  const imports = ['net.md_5.bungee.api.plugin.Plugin']
  const body: string[] = []
  if (isOn(values, 'listener')) {
    imports.push(`${pkg}.listener.JoinListener`)
    body.push('        getProxy().getPluginManager().registerListener(this, new JoinListener());')
  }
  if (isOn(values, 'command')) {
    imports.push(`${pkg}.command.HelloCommand`)
    body.push(`        getProxy().getPluginManager().registerCommand(this, new HelloCommand("${values.pluginName.toLowerCase()}.hello"));`)
  }
  body.push(`        getLogger().info("${javaText(values.pluginName)} ${javaText(t('minecraft.code.enabled'))}");`)
  return `${javaHeader(pkg, imports)}public final class ${values.mainClass} extends Plugin {
    @Override
    public void onEnable() {
${body.join('\n')}
    }
}
`
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
        String text = "${javaText(t('minecraft.code.welcome'))}".replace("%player%", event.getPlayer().getName());
        event.getPlayer().sendMessage(new TextComponent(text));
    }
}
`
}

function bungeeCommand(values: FormValues): string {
  return `${javaHeader(`${values.package}.command`, [
    'java.util.List',
    'java.util.Locale',
    'net.md_5.bungee.api.CommandSender',
    'net.md_5.bungee.api.ProxyServer',
    'net.md_5.bungee.api.chat.TextComponent',
    'net.md_5.bungee.api.connection.ProxiedPlayer',
    'net.md_5.bungee.api.plugin.Command',
    'net.md_5.bungee.api.plugin.TabExecutor',
  ])}/** /hello [name] mit Tab-Vervollständigung der Spielernamen. */
public final class HelloCommand extends Command implements TabExecutor {
    public HelloCommand(String permission) {
        super("hello", permission);
    }

    @Override
    public void execute(CommandSender sender, String[] args) {
        String name = args.length > 0 ? args[0] : sender.getName();
        sender.sendMessage(new TextComponent("${javaText(t('minecraft.code.helloName'))}".replace("%name%", name)));
    }

    @Override
    public Iterable<String> onTabComplete(CommandSender sender, String[] args) {
        if (args.length != 1) {
            return List.of();
        }
        String prefix = args[0].toLowerCase(Locale.ROOT);
        return ProxyServer.getInstance().getPlayers().stream()
            .map(ProxiedPlayer::getName)
            .filter(name -> name.toLowerCase(Locale.ROOT).startsWith(prefix))
            .toList();
    }
}
`
}

export const bungeeTemplate: ProjectTemplate = defineTemplate({
  id: 'minecraft-bungeecord',
  nameKey: 'minecraft.template.bungeecord.name',
  descriptionKey: 'minecraft.template.bungeecord.description',
  languageId: 'java',
  kindId: (values) => templateKind('minecraft-bungeecord', values),
  icon: 'Bc',
  color: '#e0a526',
  buildFields: bungeeFields,
  open: ({ values }) => `src/main/java/${packagePath(values.package)}/${values.mainClass}.java`,
  setup: (ctx) => gradleSetup(ctx, currentCatalog().gradle.plugin),
  next: ({ values }) => t(isMaven(values) ? 'minecraft.next.maven' : 'minecraft.next.gradle'),
  files(ctx) {
    const { values } = ctx
    const main = `src/main/java/${packagePath(values.package)}`
    const snapshot = values.apiVersion.endsWith('-SNAPSHOT')
    const build: PluginBuild = {
      repositories: [MINECRAFT_LIBRARIES, ...(snapshot ? [SONATYPE_SNAPSHOTS] : [])],
      dependency: { group: 'net.md-5', artifact: 'bungeecord-api', version: values.apiVersion },
      run: runPlugin(values, 'xyz.jpenilla.run-waterfall', 'runWaterfall', 'waterfallVersion', '1.21'),
      manifest: 'bungee.yml',
    }
    const files: Record<string, string> = {
      ...buildFiles(ctx, build),
      'src/main/resources/bungee.yml': bungeeManifest(values),
      [`${main}/${values.mainClass}.java`]: bungeeMain(values),
      '.gitignore': gitignore(),
      'README.md': readme(ctx, `BungeeCord ${values.apiVersion}`, buildCommands(values, 'runWaterfall')),
    }
    if (isOn(values, 'listener')) files[`${main}/listener/JoinListener.java`] = bungeeListener(values)
    if (isOn(values, 'command')) files[`${main}/command/HelloCommand.java`] = bungeeCommand(values)
    return files
  },
})

export const PLUGIN_TEMPLATES = [paperTemplate, spigotTemplate, leafTemplate, velocityTemplate, bungeeTemplate]
