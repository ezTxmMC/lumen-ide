/**
 * An example tool add-on in the shape of “Minecraft Development”: a project
 * kind with detection, tasks and facts; a project template with a version list
 * fetched from the network, conditional files and blocks; and snippets for
 * Java. It serves as a starting point in the Add-on Studio.
 */

import { t } from '@/i18n'
import { createUserAddon, type UserAddonModel } from './schema'

const SETTINGS = `rootProject.name = "{{slug}}"
`

const BUILD = `plugins {
    java
    id("xyz.jpenilla.run-paper") version "2.3.1"
}

group = "{{group}}"
version = "1.0.0"

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
}

dependencies {
    compileOnly("io.papermc.paper:paper-api:{{mcVersion}}-R0.1-SNAPSHOT")
}

java {
    toolchain.languageVersion.set(JavaLanguageVersion.of({{java}}))
}

tasks.runServer {
    minecraftVersion("{{mcVersion}}")
}
`

const PLUGIN_YML = `name: {{name|pascal}}
version: '1.0.0'
main: {{group}}.{{name|pascal}}
api-version: '{{mcVersion}}'
{{#if commands}}commands:
  hello:
    description: Grüßt den Spieler
    usage: /hello
{{/if}}`

const MAIN = `package {{group}};

import org.bukkit.plugin.java.JavaPlugin;

public final class {{name|pascal}} extends JavaPlugin {

    @Override
    public void onEnable() {
{{#if commands}}        getCommand("hello").setExecutor(new HelloCommand());
{{/if}}        getLogger().info("{{name}} ist aktiv.");
    }
}
`

const COMMAND = `package {{group}};

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;

public final class HelloCommand implements CommandExecutor {

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        sender.sendMessage("Hallo, " + sender.getName() + "!");
        return true;
    }
}
`

export function createToolkitStarter(existingIds: string[]): UserAddonModel {
  const model = createUserAddon(t('studioProject.starter.name'), existingIds)
  return {
    ...model,
    description: t('studioProject.starter.description'),
    icon: 'PK',
    color: '#4fb4c8',
    category: 'tool',
    projectKinds: [{
      id: 'paper-plugin',
      name: 'Paper Plugin',
      icon: 'PP',
      color: '#4fb4c8',
      markers: ['build.gradle.kts', 'build.gradle'],
      rules: [{ file: 'src/main/resources/plugin.yml', pattern: '^main:' }],
      priority: 20,
      languageIds: ['java'],
      tasks: [
        { id: 'build', label: 'Build', command: 'gradle', args: ['--console=plain', 'build'], group: 'build', wrapper: 'gradlew' },
        { id: 'run', label: 'Run Server', command: 'gradle', args: ['--console=plain', 'runServer'], group: 'run', wrapper: 'gradlew' },
        { id: 'clean', label: 'Clean', command: 'gradle', args: ['--console=plain', 'clean'], group: 'clean', wrapper: 'gradlew' },
      ],
      facts: [
        { label: 'Name', file: 'src/main/resources/plugin.yml', pattern: '^name:\\s*[\'"]?([^\'"\\n]+)', role: 'name' },
        { label: 'Version', file: 'src/main/resources/plugin.yml', pattern: '^version:\\s*[\'"]?([^\'"\\n]+)', role: 'version' },
        { label: 'API', file: 'src/main/resources/plugin.yml', pattern: '^api-version:\\s*[\'"]?([^\'"\\n]+)' },
      ],
    }],
    templates: [{
      id: 'paper-plugin',
      name: 'Paper Plugin',
      description: t('studioProject.starter.templateDescription'),
      languageId: 'java',
      icon: 'PP',
      color: '#4fb4c8',
      kindId: 'paper-plugin',
      fields: [
        { id: 'group', label: 'Group', type: 'text', default: 'de.example', pattern: '[a-z][a-z0-9_]*(\\.[a-z][a-z0-9_]*)*', mono: true, section: 'Projekt' },
        {
          id: 'mcVersion', label: 'Minecraft', type: 'select', mono: true, section: 'Projekt',
          choices: [{ value: '1.21.11', label: '1.21.11' }],
          // Newest first; finished 1.x versions only — from 26.x paper-api is named differently (`26.3.build.N-alpha`).
          choicesUrl: 'https://fill.papermc.io/v3/projects/paper/versions', choicesPath: 'versions',
          choicesValue: 'version.id', choicesMatch: '^1\\.[0-9.]+$', choicesLimit: 25,
        },
        {
          id: 'java', label: 'Java', type: 'select', default: '21', section: 'Projekt',
          choices: [{ value: '21', label: 'Java 21' }, { value: '17', label: 'Java 17' }],
        },
        { id: 'commands', label: t('studioProject.starter.commandsField'), type: 'toggle', default: 'true', section: 'Extras' },
      ],
      files: [
        { path: 'settings.gradle.kts', content: SETTINGS },
        { path: 'build.gradle.kts', content: BUILD },
        { path: 'src/main/resources/plugin.yml', content: PLUGIN_YML },
        { path: 'src/main/java/{{group|path}}/{{name|pascal}}.java', content: MAIN },
        { path: 'src/main/java/{{group|path}}/HelloCommand.java', content: COMMAND, when: { field: 'commands', equals: 'true' } },
      ],
      open: 'src/main/java/{{group|path}}/{{name|pascal}}.java',
      next: t('studioProject.starter.next'),
    }],
    snippets: [
      {
        languageId: 'java',
        label: 'paper-listener',
        detail: 'Paper Listener',
        body: 'public final class ${Name}Listener implements org.bukkit.event.Listener {\n    @org.bukkit.event.EventHandler\n    public void on${Event}(${org.bukkit.event.player.PlayerJoinEvent} event) {\n        $0\n    }\n}',
      },
      {
        languageId: 'java',
        label: 'paper-scheduler',
        detail: 'Paper Scheduler',
        body: 'getServer().getScheduler().runTaskTimer(this, () -> {\n    $0\n}, ${0}L, ${20}L);',
      },
    ],
  }
}
