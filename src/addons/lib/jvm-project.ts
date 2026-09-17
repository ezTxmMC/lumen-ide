/**
 * The project kinds and templates for the JVM: Maven and Gradle (the Kotlin and
 * the Groovy DSL).
 *
 * The Kotlin templates used to stand here as well; Kotlin is an extension now
 * (`extensions/kotlin`). What stays is what Java needs — the two kinds are
 * shared, and the build files they write carry the Kotlin plugin either way.
 */

import type {
  DependencySupport, FormValues, ProjectKind, ProjectMeta, ProjectTask, ProjectTemplate,
} from '@/core/types'
import {
  grepValue, indentUnitOf, insertIntoBlock, parseXml, wrapperOr, xmlChild, xmlText,
} from '@/core/project/detect'
import { GITIGNORE } from '@/core/project/scaffold'
import {
  isOn, javaVersionField, jvmCoordinateFields, packagePath, toggle,
} from './fields'
import { t } from '@/i18n'

/* ------------------------------------------------------------------ *
 * Maven
 * ------------------------------------------------------------------ */

const MAVEN_COORDINATE = /^[\w.-]+:[\w.-]+$/

const mavenDependencies: DependencySupport = {
  manager: 'Maven',
  placeholder: 'org.slf4j:slf4j-api',
  hint: 'templates.jvm.mavenHint',
  versionRequired: true,
  scopes: [
    { value: 'compile', label: 'compile' },
    { value: 'test', label: 'test' },
    { value: 'provided', label: 'provided' },
    { value: 'runtime', label: 'runtime' },
  ],
  async add(ctx, dep) {
    if (!MAVEN_COORDINATE.test(dep.name)) throw new Error('Erwartet groupId:artifactId')
    const pom = await ctx.readFile('pom.xml')
    if (pom === null) throw new Error('pom.xml fehlt')
    const [groupId, artifactId] = dep.name.split(':')
    const unit = indentUnitOf(pom, '  ')
    const lines = [
      '<dependency>',
      `${unit}<groupId>${groupId}</groupId>`,
      `${unit}<artifactId>${artifactId}</artifactId>`,
      `${unit}<version>${dep.version ?? 'LATEST'}</version>`,
      ...(dep.scope && dep.scope !== 'compile' ? [`${unit}<scope>${dep.scope}</scope>`] : []),
      '</dependency>',
    ].join('\n')

    const at = topLevelDependencies(pom)
    if (at !== -1) {
      const head = pom.slice(0, at)
      const inserted = insertIntoBlock(pom.slice(at), /<dependencies>/, '</dependencies>', lines, unit)
      if (inserted) return { type: 'edit', file: 'pom.xml', content: head + inserted }
    }

    const block = `<dependencies>\n${lines.split('\n').map((l) => `${unit}${l}`).join('\n')}\n</dependencies>`
    const anchor = /<build>/.exec(pom) ?? /<\/project>/.exec(pom)
    if (!anchor) throw new Error('pom.xml hat kein <project>-Element')
    const indented = block.split('\n').map((l) => `${unit}${l}`).join('\n')
    const content = `${pom.slice(0, anchor.index)}${indented.trimStart()}\n\n${unit}${pom.slice(anchor.index)}`
    return { type: 'edit', file: 'pom.xml', content }
  },
}

/**
 * The position of the `<dependencies>` block directly under `<project>` — not
 * the one in `<dependencyManagement>`, `<plugin>` or `<profile>`. -1 where
 * there is none.
 */
function topLevelDependencies(pom: string): number {
  const nested = ['dependencyManagement', 'plugin', 'profile']
  for (const m of pom.matchAll(/<dependencies>/g)) {
    const before = pom.slice(0, m.index)
    const open = nested.some((tag) =>
      (before.match(new RegExp(`<${tag}>`, 'g'))?.length ?? 0) > (before.match(new RegExp(`</${tag}>`, 'g'))?.length ?? 0))
    if (!open) return m.index ?? -1
  }
  return -1
}

export const mavenKind: ProjectKind = {
  id: 'maven',
  name: 'Maven',
  icon: 'M',
  color: '#c71a36',
  markers: ['pom.xml'],
  priority: 10,
  languageIds: ['java', 'kotlin'],
  dependencies: mavenDependencies,
  async tasks(ctx) {
    const mvn = await wrapperOr(ctx, 'mvnw', 'mvn')
    const q = ['-q']
    return [
      { id: 'maven:compile', label: 'templates.tasks.compile', command: mvn, args: [...q, 'compile'], group: 'build', detail: 'mvn compile' },
      { id: 'maven:package', label: 'templates.tasks.buildPackage', command: mvn, args: [...q, 'package', '-DskipTests'], group: 'build', detail: 'mvn package -DskipTests' },
      { id: 'maven:install', label: 'templates.jvm.installLocal', command: mvn, args: [...q, 'install', '-DskipTests'], group: 'build', detail: 'mvn install' },
      { id: 'maven:run', label: 'templates.tasks.run', command: mvn, args: [...q, 'compile', 'exec:java'], group: 'run', detail: 'mvn exec:java (exec-maven-plugin)' },
      { id: 'maven:test', label: 'templates.tasks.tests', command: mvn, args: ['test'], group: 'test', detail: 'mvn test' },
      { id: 'maven:verify', label: 'templates.tasks.verify', command: mvn, args: [...q, 'verify'], group: 'test', detail: 'mvn verify' },
      { id: 'maven:clean', label: 'templates.tasks.clean', command: mvn, args: [...q, 'clean'], group: 'clean', detail: 'mvn clean' },
      { id: 'maven:resolve', label: 'templates.tasks.fetchDeps', command: mvn, args: ['dependency:resolve'], group: 'other' },
      { id: 'maven:tree', label: 'templates.jvm.dependencyTree', command: mvn, args: ['dependency:tree'], group: 'other' },
      { id: 'maven:updates', label: 'templates.jvm.newerVersions', command: mvn, args: ['versions:display-dependency-updates'], group: 'other' },
      { id: 'maven:wrapper', label: 'templates.jvm.mavenWrapper', command: 'mvn', args: ['wrapper:wrapper'], group: 'other' },
    ]
  },
  async inspect(ctx) {
    const text = await ctx.readFile('pom.xml')
    const root = text ? parseXml(text) : null
    if (!root) return { buildFile: 'pom.xml', sourceRoots: ['src/main/java', 'src/test/java'] }

    const parent = xmlChild(root, 'parent')
    const props = xmlChild(root, 'properties')
    const facts: Record<string, string> = {}
    const javaVersion =
      xmlText(props, 'maven.compiler.release') ??
      xmlText(props, 'maven.compiler.source') ??
      xmlText(props, 'java.version')
    if (javaVersion) facts.Java = javaVersion
    const kotlinVersion = xmlText(props, 'kotlin.version')
    if (kotlinVersion) facts.Kotlin = kotlinVersion
    const groupId = xmlText(root, 'groupId') ?? xmlText(parent, 'groupId')
    if (groupId) facts['templates.facts.group'] = groupId
    const packaging = xmlText(root, 'packaging')
    if (packaging) facts.Packaging = packaging
    const modules = Array.from(xmlChild(root, 'modules')?.children ?? []).map((m) => m.textContent?.trim()).filter(Boolean)
    if (modules.length) facts['templates.facts.modules'] = modules.join(', ')

    const dependencies = Array.from(xmlChild(root, 'dependencies')?.children ?? [])
      .filter((d) => d.localName === 'dependency')
      .map((d) => ({
        name: `${xmlText(d, 'groupId') ?? ''}:${xmlText(d, 'artifactId') ?? ''}`,
        version: xmlText(d, 'version'),
        scope: xmlText(d, 'scope') ?? 'compile',
      }))

    const meta: ProjectMeta = {
      name: xmlText(root, 'name') ?? xmlText(root, 'artifactId'),
      version: xmlText(root, 'version') ?? xmlText(parent, 'version'),
      description: xmlText(root, 'description'),
      facts,
      dependencies,
      sourceRoots: ['src/main/java', 'src/main/kotlin', 'src/main/resources', 'src/test/java'],
      buildFile: 'pom.xml',
    }
    return meta
  },
}

/* ------------------------------------------------------------------ *
 * Gradle
 * ------------------------------------------------------------------ */

const GRADLE_SCOPES = [
  { value: 'implementation', label: 'implementation' },
  { value: 'api', label: 'api' },
  { value: 'compileOnly', label: 'compileOnly' },
  { value: 'runtimeOnly', label: 'runtimeOnly' },
  { value: 'testImplementation', label: 'testImplementation' },
  { value: 'testRuntimeOnly', label: 'testRuntimeOnly' },
]

const gradleDependencies: DependencySupport = {
  manager: 'Gradle',
  placeholder: 'com.squareup.okhttp3:okhttp',
  hint: 'templates.jvm.gradleHint',
  scopes: GRADLE_SCOPES,
  async add(ctx, dep) {
    if (!MAVEN_COORDINATE.test(dep.name)) throw new Error('Erwartet groupId:artifactId')
    const kts = await ctx.readFile('build.gradle.kts')
    const file = kts !== null ? 'build.gradle.kts' : 'build.gradle'
    const text = kts ?? (await ctx.readFile('build.gradle'))
    if (text === null) throw new Error('build.gradle(.kts) fehlt')

    const coordinate = dep.version ? `${dep.name}:${dep.version}` : dep.name
    const scope = dep.scope ?? 'implementation'
    const line = kts !== null ? `${scope}("${coordinate}")` : `${scope} '${coordinate}'`
    const unit = indentUnitOf(text, '    ')

    const inserted = insertIntoBlock(text, /^dependencies\s*\{/m, '}', line, unit)
    if (inserted) return { type: 'edit', file, content: inserted }
    return { type: 'edit', file, content: `${text.replace(/\s*$/, '')}\n\ndependencies {\n${unit}${line}\n}\n` }
  },
}

export const gradleKind: ProjectKind = {
  id: 'gradle',
  name: 'Gradle',
  icon: 'G',
  color: '#209bc4',
  markers: ['build.gradle.kts', 'build.gradle', 'settings.gradle.kts', 'settings.gradle'],
  priority: 12,
  languageIds: ['java', 'kotlin'],
  dependencies: gradleDependencies,
  async tasks(ctx) {
    const gradle = await wrapperOr(ctx, 'gradlew', 'gradle')
    const quiet = ['-q', '--console=plain']
    const tasks: ProjectTask[] = [
      { id: 'gradle:build', label: 'templates.tasks.build', command: gradle, args: [...quiet, 'build', '-x', 'test'], group: 'build', detail: 'gradle build -x test' },
      { id: 'gradle:assemble', label: 'templates.jvm.assemble', command: gradle, args: [...quiet, 'assemble'], group: 'build', detail: 'gradle assemble' },
      { id: 'gradle:run', label: 'templates.tasks.run', command: gradle, args: [...quiet, 'run'], group: 'run', detail: 'templates.jvm.gradleRunDetail' },
      { id: 'gradle:test', label: 'templates.tasks.tests', command: gradle, args: ['--console=plain', 'test'], group: 'test', detail: 'gradle test' },
      { id: 'gradle:check', label: 'templates.tasks.check', command: gradle, args: [...quiet, 'check'], group: 'test', detail: 'gradle check' },
      { id: 'gradle:clean', label: 'templates.tasks.clean', command: gradle, args: [...quiet, 'clean'], group: 'clean', detail: 'gradle clean' },
      { id: 'gradle:refresh', label: 'templates.jvm.refreshDeps', command: gradle, args: ['--console=plain', '--refresh-dependencies', 'dependencies'], group: 'other' },
      { id: 'gradle:deps', label: 'templates.tasks.dependencies', command: gradle, args: ['--console=plain', 'dependencies'], group: 'other' },
      { id: 'gradle:tasks', label: 'templates.jvm.listTasks', command: gradle, args: ['--console=plain', 'tasks', '--all'], group: 'other' },
    ]
    if (gradle === 'gradle') {
      tasks.push({ id: 'gradle:wrapper', label: 'templates.jvm.gradleWrapper', command: 'gradle', args: ['wrapper'], group: 'other', detail: 'templates.jvm.gradleWrapperDetail' })
    }
    return tasks
  },
  async inspect(ctx) {
    const kts = await ctx.readFile('build.gradle.kts')
    const groovy = kts === null ? await ctx.readFile('build.gradle') : null
    const build = kts ?? groovy ?? ''
    const settings = (await ctx.readFile('settings.gradle.kts')) ?? (await ctx.readFile('settings.gradle')) ?? ''

    const facts: Record<string, string> = { DSL: kts !== null ? 'Kotlin' : 'Groovy' }
    const kotlinPlugin = /kotlin\s*\(\s*["']jvm["']\s*\)\s*(?:version\s*["']([^"']+)["'])?/.exec(build)
      ?? /id\s*\(?\s*["']org\.jetbrains\.kotlin\.jvm["']\s*\)?\s*version\s*["']([^"']+)["']/.exec(build)
    if (kotlinPlugin) facts.Kotlin = kotlinPlugin[1] ?? t('templates.facts.yes')
    const toolchain = /(?:languageVersion\s*(?:=|\.set\()\s*JavaLanguageVersion\.of\((\d+)\)|jvmToolchain\((\d+)\))/.exec(build)
      ?? /sourceCompatibility\s*=\s*(?:JavaVersion\.VERSION_|["'])?(\d+)/.exec(build)
    if (toolchain) facts.Java = toolchain[1] ?? toolchain[2]
    const mainClass = /mainClass\s*(?:=|\.set\()\s*["']([^"']+)["']/.exec(build)
    if (mainClass) facts['templates.fields.mainClass'] = mainClass[1]
    if (await ctx.exists('gradle/libs.versions.toml')) facts['templates.facts.versionCatalog'] = 'gradle/libs.versions.toml'
    const includes = Array.from(settings.matchAll(/include\s*\(?\s*["']([^"']+)["']/g)).map((m) => m[1])
    if (includes.length) facts['templates.facts.modules'] = includes.join(', ')

    const dependencies = Array.from(
      build.matchAll(/^\s*(implementation|api|compileOnly|runtimeOnly|testImplementation|testRuntimeOnly)\s*\(?\s*["']([^"']+)["']/gm),
    ).map((m) => {
      const [group, artifact, version] = m[2].split(':')
      return { name: `${group}:${artifact ?? ''}`, version, scope: m[1] }
    })

    return {
      name: grepValue(settings, 'rootProject\\.name'),
      version: grepValue(build, 'version'),
      description: grepValue(build, 'description'),
      facts,
      dependencies,
      sourceRoots: [
        'src/main/java', 'src/main/kotlin', 'src/main/resources', 'src/test/java', 'src/test/kotlin',
      ],
      buildFile: kts !== null ? 'build.gradle.kts' : 'build.gradle',
    }
  },
}

/* ------------------------------------------------------------------ *
 * Building blocks for the templates
 * ------------------------------------------------------------------ */

const JUNIT = '5.11.4'
const KOTLIN = '2.1.20'

type BuildTool = 'maven' | 'gradle-kts' | 'gradle-groovy'

const buildToolField = (fallback: BuildTool) => ({
  id: 'build',
  label: 'templates.fields.buildSystem',
  type: 'select' as const,
  default: fallback,
  choices: [
    { value: 'gradle-kts', label: 'templates.jvm.gradleKts' },
    { value: 'gradle-groovy', label: 'templates.jvm.gradleGroovy' },
    { value: 'maven', label: 'Maven' },
  ],
  section: 'templates.sections.build',
})

const projectTypeField = {
  id: 'type',
  label: 'templates.fields.type',
  type: 'select' as const,
  choices: [
    { value: 'application', label: 'templates.fields.application' },
    { value: 'library', label: 'templates.fields.library' },
  ],
  section: 'templates.sections.build',
}

const kindOf = (values: FormValues) => (values.build === 'maven' ? 'maven' : 'gradle')

function pom(values: FormValues, opts: { kotlin: boolean }): string {
  const { groupId, artifactId, version, description, java } = values
  const app = values.type !== 'library'
  const tests = isOn(values, 'tests')
  const mainClass = opts.kotlin ? `${values.package}.MainKt` : `${values.package}.Main`

  const dependencies: string[] = []
  if (opts.kotlin) {
    dependencies.push(dependency('org.jetbrains.kotlin', 'kotlin-stdlib', '${kotlin.version}'))
  }
  if (tests && opts.kotlin) {
    dependencies.push(dependency('org.jetbrains.kotlin', 'kotlin-test-junit5', '${kotlin.version}', 'test'))
  }
  if (tests && !opts.kotlin) {
    dependencies.push(dependency('org.junit.jupiter', 'junit-jupiter', '${junit.version}', 'test'))
  }

  const plugins: string[] = []
  if (opts.kotlin) {
    plugins.push(`      <plugin>
        <groupId>org.jetbrains.kotlin</groupId>
        <artifactId>kotlin-maven-plugin</artifactId>
        <version>\${kotlin.version}</version>
        <executions>
          <execution><id>compile</id><goals><goal>compile</goal></goals></execution>
          <execution><id>test-compile</id><goals><goal>test-compile</goal></goals></execution>
        </executions>
        <configuration><jvmTarget>${java}</jvmTarget></configuration>
      </plugin>`)
  }
  if (!opts.kotlin) {
    plugins.push(`      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-compiler-plugin</artifactId>
        <version>3.13.0</version>
      </plugin>`)
  }
  plugins.push(`      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-surefire-plugin</artifactId>
        <version>3.5.2</version>
      </plugin>`)
  if (app) {
    plugins.push(`      <plugin>
        <groupId>org.codehaus.mojo</groupId>
        <artifactId>exec-maven-plugin</artifactId>
        <version>3.5.0</version>
      </plugin>
      <plugin>
        <groupId>org.apache.maven.plugins</groupId>
        <artifactId>maven-jar-plugin</artifactId>
        <version>3.4.2</version>
        <configuration>
          <archive>
            <manifest>
              <mainClass>${mainClass}</mainClass>
            </manifest>
          </archive>
        </configuration>
      </plugin>`)
  }

  const properties = [
    `    <maven.compiler.release>${java}</maven.compiler.release>`,
    '    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>',
    ...(opts.kotlin ? [`    <kotlin.version>${values.kotlin || KOTLIN}</kotlin.version>`] : []),
    ...(tests && !opts.kotlin ? [`    <junit.version>${JUNIT}</junit.version>`] : []),
    ...(app ? [`    <exec.mainClass>${mainClass}</exec.mainClass>`] : []),
  ]

  const sourceDirs = opts.kotlin
    ? '\n    <sourceDirectory>src/main/kotlin</sourceDirectory>\n    <testSourceDirectory>src/test/kotlin</testSourceDirectory>'
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>

  <groupId>${groupId}</groupId>
  <artifactId>${artifactId}</artifactId>
  <version>${version}</version>
  <packaging>jar</packaging>
  <name>${values.name}</name>${description ? `\n  <description>${escapeXml(description)}</description>` : ''}

  <properties>
${properties.join('\n')}
  </properties>

  <dependencies>
${dependencies.join('\n')}
  </dependencies>

  <build>${sourceDirs}
    <plugins>
${plugins.join('\n')}
    </plugins>
  </build>
</project>
`
}

function dependency(groupId: string, artifactId: string, version: string, scope?: string) {
  return `    <dependency>
      <groupId>${groupId}</groupId>
      <artifactId>${artifactId}</artifactId>
      <version>${version}</version>${scope ? `\n      <scope>${scope}</scope>` : ''}
    </dependency>`
}

function escapeXml(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function gradleBuild(values: FormValues, opts: { kotlin: boolean }): string {
  const kts = values.build !== 'gradle-groovy'
  const app = values.type !== 'library'
  const tests = isOn(values, 'tests')
  const q = (s: string) => (kts ? `"${s}"` : `'${s}'`)
  const call = (fn: string, arg: string) => (kts ? `${fn}(${arg})` : `${fn} ${arg}`)

  const plugins: string[] = []
  if (opts.kotlin) plugins.push(kts ? `kotlin("jvm") version "${values.kotlin || KOTLIN}"` : `id 'org.jetbrains.kotlin.jvm' version '${values.kotlin || KOTLIN}'`)
  const library = kts ? '`java-library`' : "id 'java-library'"
  plugins.push(app ? 'application' : library)

  const deps: string[] = []
  if (tests && opts.kotlin) deps.push(kts ? 'testImplementation(kotlin("test"))' : "testImplementation 'org.jetbrains.kotlin:kotlin-test'")
  if (tests && !opts.kotlin) {
    deps.push(
      kts ? `testImplementation(platform("org.junit:junit-bom:${JUNIT}"))` : `testImplementation platform('org.junit:junit-bom:${JUNIT}')`,
      call('testImplementation', q('org.junit.jupiter:junit-jupiter')),
      call('testRuntimeOnly', q('org.junit.platform:junit-platform-launcher')),
    )
  }

  const toolchain = opts.kotlin
    ? `kotlin {\n    jvmToolchain(${values.java})\n}`
    : `java {\n    toolchain {\n        languageVersion = JavaLanguageVersion.of(${values.java})\n    }\n}`
  const mainClass = opts.kotlin ? `${values.package}.MainKt` : `${values.package}.Main`

  return [
    `plugins {\n${plugins.map((p) => `    ${p}`).join('\n')}\n}`,
    `group = ${q(values.groupId)}\nversion = ${q(values.version)}${values.description ? `\ndescription = ${q(values.description.replace(/["']/g, ''))}` : ''}`,
    'repositories {\n    mavenCentral()\n}',
    `dependencies {\n${deps.map((d) => `    ${d}`).join('\n')}\n}`,
    toolchain,
    ...(app ? [`application {\n    mainClass = ${q(mainClass)}\n}`] : []),
    ...(tests ? [kts ? 'tasks.test {\n    useJUnitPlatform()\n}' : 'tasks.named(\'test\') {\n    useJUnitPlatform()\n}'] : []),
  ].join('\n\n') + '\n'
}

function gradleFiles(values: FormValues, opts: { kotlin: boolean }): Record<string, string> {
  const kts = values.build !== 'gradle-groovy'
  const settings = kts ? `rootProject.name = "${values.artifactId}"\n` : `rootProject.name = '${values.artifactId}'\n`
  return {
    [kts ? 'settings.gradle.kts' : 'settings.gradle']: settings,
    [kts ? 'build.gradle.kts' : 'build.gradle']: gradleBuild(values, opts),
    'gradle.properties': `org.gradle.caching=true\norg.gradle.parallel=true${opts.kotlin ? '\nkotlin.code.style=official' : ''}\n`,
  }
}

function readme(values: FormValues, commands: string[]) {
  return `# ${values.name}\n\n${values.description ? `${values.description}\n\n` : ''}\`\`\`bash\n${commands.join('\n')}\n\`\`\`\n`
}

function buildCommands(values: FormValues) {
  const app = values.type !== 'library'
  if (values.build === 'maven') {
    return [...(app ? ['mvn compile exec:java   # ausführen'] : []), 'mvn test                # testen', 'mvn package             # Jar bauen']
  }
  return [...(app ? ['gradle run     # ausführen'] : []), 'gradle test    # testen', 'gradle build   # bauen']
}

const testsField = toggle('tests', 'templates.jvm.testsJunit', true, 'templates.sections.build')

/* ------------------------------------------------------------------ *
 * Java templates
 * ------------------------------------------------------------------ */

export const javaProjectTemplate: ProjectTemplate = {
  id: 'java-project',
  name: 'templates.jvm.javaName',
  description: 'templates.jvm.javaDescription',
  languageId: 'java',
  kindId: kindOf,
  icon: 'J',
  color: '#e76f00',
  fields: [...jvmCoordinateFields, buildToolField('maven'), projectTypeField, javaVersionField, testsField],
  open: ({ values }) => `src/main/java/${packagePath(values.package)}/${values.type === 'library' ? 'Library' : 'Main'}.java`,
  next: ({ values }) => (values.build === 'maven'
    ? 'templates.jvm.javaNextMaven'
    : 'templates.jvm.javaNextGradle'),
  setup: ({ values }) => [values.build === 'maven'
    ? { id: 'setup:mvn', label: 'templates.tasks.fetchDeps', command: 'mvn', args: ['-q', 'dependency:resolve'] }
    : { id: 'setup:gradle', label: 'Gradle-Wrapper', command: 'gradle', args: ['wrapper'] }],
  files({ values }) {
    const pkg = packagePath(values.package)
    const library = values.type === 'library'
    const files: Record<string, string> = values.build === 'maven'
      ? { 'pom.xml': pom(values, { kotlin: false }) }
      : gradleFiles(values, { kotlin: false })

    files[`src/main/java/${pkg}/${library ? 'Library' : 'Main'}.java`] = library
      ? `package ${values.package};\n\npublic final class Library {\n    private Library() {}\n\n    public static String greet(String name) {\n        return "Hallo, " + name + "!";\n    }\n}\n`
      : `package ${values.package};\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hallo aus ${values.name}!");\n    }\n}\n`
    if (isOn(values, 'tests')) {
      files[`src/test/java/${pkg}/${library ? 'LibraryTest' : 'MainTest'}.java`] = library
        ? `package ${values.package};\n\nimport org.junit.jupiter.api.Test;\n\nimport static org.junit.jupiter.api.Assertions.assertEquals;\n\nclass LibraryTest {\n    @Test\n    void begruesst() {\n        assertEquals("Hallo, Welt!", Library.greet("Welt"));\n    }\n}\n`
        : `package ${values.package};\n\nimport org.junit.jupiter.api.Test;\n\nimport static org.junit.jupiter.api.Assertions.assertEquals;\n\nclass MainTest {\n    @Test\n    void rechnet() {\n        assertEquals(4, 2 + 2);\n    }\n}\n`
    }
    files['src/main/resources/.gitkeep'] = ''
    files['.gitignore'] = GITIGNORE.java
    files['README.md'] = readme(values, buildCommands(values))
    return files
  },
}

export const javaPlainTemplate: ProjectTemplate = {
  id: 'java-plain',
  name: 'templates.jvm.javaPlainName',
  description: 'templates.jvm.javaPlainDescription',
  languageId: 'java',
  icon: 'J',
  color: '#e76f00',
  fields: [{
    id: 'mainClass', label: 'templates.fields.mainClass', default: 'Main', pattern: '[A-Z][A-Za-z0-9_]*',
    patternHint: 'templates.fields.mainClassHint', mono: true, section: 'templates.sections.project',
  }],
  open: ({ values }) => `${values.mainClass}.java`,
  files({ name, values }) {
    return {
      [`${values.mainClass}.java`]: `public class ${values.mainClass} {\n    public static void main(String[] args) {\n        System.out.println("Hallo aus ${name}!");\n    }\n}\n`,
      '.gitignore': '*.class\n.lumen/\n',
    }
  },
}
