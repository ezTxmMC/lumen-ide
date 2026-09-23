import type { Addon, LanguageSpec } from '@/core/types'
import { gradleKind, javaPlainTemplate, javaProjectTemplate, mavenKind } from '../lib/jvm-project'
import { bazelKind } from '../lib/native-project'
import { javaDebug } from '@/core/debug/adapters'
import { LSP_PACKAGES, SYSTEM_PACKAGES } from '../lib/lsp-packages'

/** The settings for jdtls — sent at `initialize` and as configuration. */
const JAVA_SETTINGS = {
  autobuild: { enabled: true },
  configuration: { updateBuildConfiguration: 'automatic', runtimes: [] },
  maven: { downloadSources: true, updateSnapshots: false },
  eclipse: { downloadSources: true },
  import: {
    gradle: { enabled: true, wrapper: { enabled: true }, annotationProcessing: { enabled: true } },
    maven: { enabled: true },
  },
  format: { enabled: true, comments: { enabled: true } },
  // Completion without a cap: jdtls otherwise delivers 50 entries only and
  // hides classes from dependencies whose first letter is written differently.
  completion: {
    enabled: true,
    maxResults: 0,
    matchCase: 'off',
    chain: { enabled: true },
    postfix: { enabled: true },
    lazyResolveTextEdit: { enabled: true },
    collapseCompletionItems: false,
    guessMethodArguments: true,
    importOrder: ['java', 'javax', 'jakarta', 'org', 'com', ''],
    favoriteStaticMembers: [
      'org.junit.jupiter.api.Assertions.*',
      'org.assertj.core.api.Assertions.*',
      'java.util.Objects.requireNonNull',
    ],
    // Hide the internal JDK packages alone — everything public from the JDK and the dependencies stays visible.
    filteredTypes: ['sun.*', 'com.sun.*.internal.*', 'jdk.internal.*'],
  },
  signatureHelp: { enabled: true, description: { enabled: true } },
  contentProvider: { preferred: 'fernflower' },
  implementationsCodeLens: { enabled: false },
  referencesCodeLens: { enabled: false },
  inlayHints: { parameterNames: { enabled: 'all' } },
  saveActions: { organizeImports: false },
  sources: { organizeImports: { starThreshold: 99, staticStarThreshold: 99 } },
  codeGeneration: { useBlocks: true },
  errors: { incompleteClasspath: { severity: 'warning' } },
  trace: { server: 'off' },
}

/** JVM options for jdtls — memory, the collector, and no metadata files in the project. */
const JDTLS_JVM_OPTIONS = [
  '-Xmx2G',
  '-XX:+UseParallelGC',
  '-XX:GCTimeRatio=4',
  '-XX:AdaptiveSizePolicyWeight=90',
  '-Dsun.zip.disableMemoryMapping=true',
  '-Djava.import.generatesMetadataFilesAtProjectRoot=false',
]

export const javaSpec: LanguageSpec = {
  id: 'java',
  name: 'Java',
  extensions: ['.java', '.jsh'],
  icon: 'J',
  color: '#e76f00',
  capitalizedAsType: true,
  comments: { line: '//', block: ['/*', '*/'] },
  meta: /^@[A-Za-z]\w*/,
  controls: [
    'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break',
    'continue', 'return', 'throw', 'try', 'catch', 'finally', 'yield', 'assert',
  ],
  keywords: [
    'class', 'interface', 'enum', 'record', 'extends', 'implements', 'new',
    'package', 'import', 'public', 'private', 'protected', 'static', 'final',
    'abstract', 'synchronized', 'volatile', 'transient', 'native', 'strictfp',
    'this', 'super', 'instanceof', 'throws', 'sealed', 'permits', 'non-sealed',
    'var', 'module', 'requires', 'exports',
  ],
  types: [
    'int', 'long', 'short', 'byte', 'char', 'float', 'double', 'boolean', 'void',
    'String', 'Object', 'Integer', 'Long', 'Double', 'Boolean', 'Character', 'Short',
    'Byte', 'Float', 'Number', 'CharSequence', 'StringBuilder', 'BigDecimal', 'BigInteger',
    'List', 'ArrayList', 'LinkedList', 'Map', 'HashMap', 'LinkedHashMap', 'TreeMap',
    'Set', 'HashSet', 'LinkedHashSet', 'TreeSet', 'Queue', 'Deque', 'ArrayDeque',
    'Optional', 'Stream', 'IntStream', 'Collectors', 'Iterable', 'Iterator',
    'Exception', 'RuntimeException', 'IllegalArgumentException', 'IllegalStateException',
    'IOException', 'Throwable', 'Error', 'Thread', 'Runnable', 'Callable', 'Comparable',
    'Comparator', 'Function', 'Supplier', 'Consumer', 'Predicate', 'BiFunction',
    'CompletableFuture', 'Executor', 'ExecutorService', 'Path', 'File', 'LocalDate',
    'LocalDateTime', 'Instant', 'Duration', 'UUID', 'Record', 'Enum', 'Class',
  ],
  constants: ['true', 'false', 'null'],
  builtins: [
    'System', 'Math', 'Arrays', 'Collections', 'Objects', 'Files', 'Paths', 'List',
    'Map', 'Set', 'Optional', 'Stream', 'String', 'Integer', 'Long', 'Thread',
    'Executors', 'Collectors', 'Comparator', 'Pattern', 'Scanner',
  ],
  snippets: [
    {
      label: 'main',
      detail: 'main-Methode',
      body: 'public static void main(String[] args) {\n  $0\n}',
    },
    {
      label: 'class',
      detail: 'Klasse',
      body: 'public class ${Name} {\n  $0\n}',
    },
    { label: 'sout', detail: 'println', body: 'System.out.println($0);' },
    { label: 'fori', detail: 'for-Schleife', body: 'for (int i = 0; i < ${n}; i++) {\n  $0\n}' },
    { label: 'foreach', detail: 'for-each', body: 'for (${String} ${element} : ${liste}) {\n  $0\n}' },
    { label: 'record', detail: 'Record', body: 'public record ${Name}(${String} ${feld}) {}' },
    { label: 'iface', detail: 'Interface', body: 'public interface ${Name} {\n  $0\n}' },
    { label: 'enum', detail: 'Enum', body: 'public enum ${Name} {\n  ${EINS}, ${ZWEI};$0\n}' },
    { label: 'ctor', detail: 'Konstruktor', body: 'public ${Name}(${String} ${feld}) {\n  this.${feld} = ${feld};\n}$0' },
    { label: 'try', detail: 'try/catch', body: 'try {\n  $0\n} catch (${Exception} e) {\n  e.printStackTrace();\n}' },
    { label: 'trywr', detail: 'try-with-resources', body: 'try (${var} ${res} = ${quelle}) {\n  $0\n} catch (${Exception} e) {\n  throw new RuntimeException(e);\n}' },
    { label: 'switch', detail: 'switch-Ausdruck', body: 'return switch (${wert}) {\n  case ${A} -> $0;\n  default -> throw new IllegalStateException();\n};' },
    { label: 'stream', detail: 'Stream', body: '${liste}.stream()\n  .filter(${e} -> $0)\n  .toList();' },
    { label: 'test', detail: 'JUnit-Test', body: '@Test\nvoid ${sollteEtwasTun}() {\n  $0\n}' },
    { label: 'sealed', detail: 'Sealed Interface', body: 'public sealed interface ${Name} permits ${A}, ${B} {}$0' },
  ],
  run: [
    // Java 11+ runs a single source file directly.
    { label: 'Java (Einzeldatei)', command: 'java', args: ['${file}'] },
    {
      label: 'javac + java',
      command: 'javac',
      args: ['-d', '.', '${file}'],
      then: { command: 'java', args: ['-cp', '.', '${fileStem}'] },
    },
    { label: 'Maven', command: 'mvn', args: ['-q', 'compile', 'exec:java'] },
    { label: 'Gradle', command: './gradlew', args: ['run'] },
  ],
  debug: [javaDebug],
  lsp: [
    {
      label: 'jdtls',
      command: 'jdtls',
      // The data folder lies per project root under userData/lsp/jdtls. JVM
      // options go through the launcher's `--jvm-arg` — it ignores
      // JDTLS_JVM_ARGS. `generatesMetadataFilesAtProjectRoot` is read only as
      // a system property: without it jdtls writes .project, .classpath and
      // .settings into every module.
      args: ['-data', '${dataDir}', ...JDTLS_JVM_OPTIONS.map((option) => `--jvm-arg=${option}`)],
      candidates: [
        '~/.local/share/nvim/mason/bin/jdtls',
        '~/.local/share/jdtls/bin/jdtls',
        '~/.lumen/lsp/jdtls/bin/jdtls',
        '/usr/share/java/jdtls/bin/jdtls',
        '/usr/lib/jdtls/bin/jdtls',
        '/opt/jdtls/bin/jdtls',
        '/opt/homebrew/bin/jdtls',
        '/usr/local/bin/jdtls',
      ],
      // Older wrapper scripts read the options from here instead.
      env: { JDTLS_JVM_ARGS: JDTLS_JVM_OPTIONS.join(' ') },
      languageId: 'java',
      rootMarkers: ['pom.xml', 'build.gradle.kts', 'build.gradle', 'settings.gradle.kts', 'settings.gradle', 'mvnw', 'gradlew', '.git'],
      // The whole build, not the module of the open file — otherwise classes of
      // sibling modules (`project(':common')`, a reactor module) stay unknown.
      rootSearch: 'outermost',
      initializationOptions: {
        bundles: [],
        extendedClientCapabilities: {
          classFileContentsSupport: true,
          progressReportProvider: true,
          skipProjectConfiguration: false,
          skipTextEventPropagation: false,
          generateToStringPromptSupport: false,
          hashCodeEqualsPromptSupport: false,
          advancedOrganizeImportsSupport: true,
          overrideMethodsPromptSupport: false,
          advancedGenerateAccessorsSupport: false,
          resolveAdditionalTextEditsSupport: true,
          inferSelectionSupport: [],
          onCompletionItemSelectedCommand: 'editor.action.triggerParameterHints',
        },
        settings: { java: JAVA_SETTINGS },
      },
      settings: { java: JAVA_SETTINGS },
      install: 'Arch: pacman -S jdtls · macOS: brew install jdtls · sonst https://github.com/eclipse-jdtls/eclipse.jdt.ls (Skript „jdtls“ in den PATH)',
      package: LSP_PACKAGES.jdtls,
      systemPackages: SYSTEM_PACKAGES.jdtls,
      docs: 'https://github.com/eclipse-jdtls/eclipse.jdt.ls',
    },
    {
      // Apache NetBeans' Java server: real javac (nb-javac) and Gradle/Maven
      // through their own tooling models — the same verdicts as the build, and
      // module dependencies Gradle's Eclipse model drops resolve anyway.
      label: 'NetBeans (nb-javac)',
      command: 'nbcode',
      args: ['--start-java-language-server=stdio', '--userdir', '${dataDir}', '-J-Xmx2G'],
      languageId: 'java',
      rootMarkers: ['pom.xml', 'build.gradle.kts', 'build.gradle', 'settings.gradle.kts', 'settings.gradle', 'mvnw', 'gradlew', '.git'],
      rootSearch: 'outermost',
      initializationOptions: {
        nbcodeCapabilities: {
          wantsJavaSupport: true,
          wantsGroovySupport: false,
          commandPrefix: 'jdk',
          configurationPrefix: 'jdk.',
          altConfigurationPrefix: 'jdk.',
          statusBarMessageSupport: false,
          testResultsSupport: false,
          showHtmlPageSupport: false,
          wantsTelemetryEnabled: false,
          wantsNotebookSupport: false,
        },
      },
      install: 'https://open-vsx.org/extension/Oracle/oracle-java (nbcode)',
      package: LSP_PACKAGES.netbeansJava,
      docs: 'https://github.com/apache/netbeans/tree/master/java/java.lsp.server',
    },
    {
      label: 'java-language-server',
      command: 'java-language-server',
      args: [],
      candidates: ['~/.local/share/java-language-server/dist/lang_server_linux.sh'],
      languageId: 'java',
      rootMarkers: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts', '.git'],
      rootSearch: 'outermost',
      install: 'https://github.com/georgewfraser/java-language-server',
      docs: 'https://github.com/georgewfraser/java-language-server',
    },
  ],
}

export const javaAddon: Addon = {
  id: 'lang.java',
  name: 'Java',
  version: '1.0.0',
  description:
    'Java inkl. Records, sealed Klassen und Annotationen. Maven- und Gradle-Projekte ' +
    'mit Aufgaben, Vorlagen für neue Projekte, jdtls als Language-Server.',
  icon: 'J',
  builtin: true,
  category: 'language',
  languages: [javaSpec],
  projectKinds: [mavenKind, gradleKind, bazelKind],
  projectTemplates: [javaProjectTemplate, javaPlainTemplate],
}
