/**
 * Ready-made debug adapters for the language add-ons. Deliberately without the
 * store — everything needed at runtime arrives through `DebugContext`.
 */

import { t } from '@/i18n'
import type { DebugAdapterConfig, DebugContext, DebugLaunchArguments } from '@/core/types'

const MASON = '~/.local/share/nvim/mason'

/** Split arguments as a shell would, honouring quotes. */
export function splitArgs(value: string): string[] {
  const out: string[] = []
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g
  for (const match of value.matchAll(pattern)) out.push(match[1] ?? match[2] ?? match[3])
  return out
}

const exe = (ctx: DebugContext, name: string) => (ctx.platform === 'win32' ? `${name}.exe` : name)

/** Likely build outputs per project kind. */
async function guessProgram(ctx: DebugContext): Promise<string> {
  const root = ctx.projectRoot
  const name = exe(ctx, ctx.projectName)
  const byKind: Record<string, string[]> = {
    cargo: [`${root}/target/debug/${name}`],
    cmake: [`${root}/build/${name}`, `${root}/build/Debug/${name}`, `${root}/build/debug/${name}`, `${root}/cmake-build-debug/${name}`],
    meson: [`${root}/builddir/${name}`, `${root}/build/${name}`],
    xmake: [`${root}/build/*/*/debug/${name}`, `${root}/build/*/*/release/${name}`],
    make: [`${root}/${name}`, `${root}/build/${name}`, `${root}/bin/${name}`],
    shards: [`${root}/bin/${name}`],
    crystal: [`${root}/bin/${name}`],
  }
  const candidates = [
    ...ctx.projectKinds.flatMap((kind) => byKind[kind] ?? []),
    ...(ctx.file ? [`${ctx.fileDir}/${exe(ctx, ctx.fileStem)}`] : []),
  ]
  for (const candidate of candidates) {
    const [hit] = await ctx.glob(candidate)
    if (hit) return hit
  }
  return candidates[0] ?? ''
}

/** Ask for the program, arguments and working folder of a native adapter. */
async function askProgram(ctx: DebugContext, key: string): Promise<{ program: string; args: string[]; cwd: string; stopOnEntry: boolean } | null> {
  const remembered = ctx.memory.get(`${key}:program`)
  const program = remembered && await ctx.exists(remembered) ? remembered : await guessProgram(ctx)
  const values = await ctx.ask(t('debug.launch.nativeTitle'), [
    { id: 'program', label: t('debug.launch.program'), hint: t('debug.launch.programHint'), mono: true },
    { id: 'args', label: t('debug.launch.args'), required: false, mono: true },
    { id: 'cwd', label: t('debug.launch.cwd'), mono: true },
    { id: 'stopOnEntry', label: t('debug.launch.stopOnEntry'), type: 'toggle' },
  ], {
    program,
    args: ctx.memory.get(`${key}:args`) ?? '',
    cwd: ctx.memory.get(`${key}:cwd`) ?? ctx.projectRoot,
    stopOnEntry: 'false',
  })
  if (!values) return null
  ctx.memory.set(`${key}:program`, values.program)
  ctx.memory.set(`${key}:args`, values.args ?? '')
  ctx.memory.set(`${key}:cwd`, values.cwd)
  return { program: values.program, args: splitArgs(values.args ?? ''), cwd: values.cwd, stopOnEntry: values.stopOnEntry === 'true' }
}

/* ------------------------------------------------------------------ *
 * C · C++ · Rust · Crystal
 * ------------------------------------------------------------------ */

export const lldbDap: DebugAdapterConfig = {
  label: 'lldb-dap',
  type: 'lldb-dap',
  command: 'lldb-dap',
  candidates: [
    'lldb-vscode',
    '/usr/lib/llvm-*/bin/lldb-dap',
    '/usr/lib/llvm-*/bin/lldb-vscode',
    '/opt/homebrew/opt/llvm/bin/lldb-dap',
    '/usr/local/opt/llvm/bin/lldb-dap',
    '/Library/Developer/CommandLineTools/usr/bin/lldb-dap',
    'C:/Program Files/LLVM/bin/lldb-dap.exe',
  ],
  launch: async (ctx) => {
    const target = await askProgram(ctx, 'native')
    if (!target) return null
    return { program: target.program, args: target.args, cwd: target.cwd, stopOnEntry: target.stopOnEntry }
  },
  install: 'Arch: pacman -S lldb · Debian/Ubuntu: apt install lldb (lldb-dap bzw. lldb-vscode) · macOS: brew install llvm',
  docs: 'https://github.com/llvm/llvm-project/tree/main/lldb/tools/lldb-dap',
}

export const gdbDap: DebugAdapterConfig = {
  label: 'GDB (DAP)',
  type: 'gdb',
  command: 'gdb',
  args: ['--interpreter=dap', '--quiet'],
  // GDB before version 14 does not know the DAP interpreter.
  probe: ['--interpreter=dap', '--batch'],
  launch: async (ctx) => {
    const target = await askProgram(ctx, 'native')
    if (!target) return null
    return { program: target.program, args: target.args, cwd: target.cwd, stopAtBeginningOfMainSubprogram: target.stopOnEntry }
  },
  install: 'GDB ≥ 14 — Arch: pacman -S gdb · Debian/Ubuntu: apt install gdb · macOS: brew install gdb',
  installCommands: { linux: 'sudo apt install gdb', darwin: 'brew install gdb' },
  docs: 'https://sourceware.org/gdb/current/onlinedocs/gdb.html/Debugger-Adapter-Protocol.html',
}

export const codelldb: DebugAdapterConfig = {
  label: 'CodeLLDB',
  type: 'lldb',
  transport: 'tcp',
  command: 'codelldb',
  args: ['--port', '${port}'],
  candidates: [
    { command: `${MASON}/packages/codelldb/extension/adapter/codelldb`, args: ['--port', '${port}'] },
    { command: '~/.vscode/extensions/vadimcn.vscode-lldb-*/adapter/codelldb', args: ['--port', '${port}'] },
  ],
  kinds: ['cargo'],
  launch: async (ctx) => {
    const target = await askProgram(ctx, 'native')
    if (!target) return null
    return { program: target.program, args: target.args, cwd: target.cwd, stopOnEntry: target.stopOnEntry }
  },
  install: 'Mason: :MasonInstall codelldb · oder VS-Code-Erweiterung vadimcn.vscode-lldb',
  docs: 'https://github.com/vadimcn/codelldb',
}

export const NATIVE_DEBUGGERS: DebugAdapterConfig[] = [lldbDap, gdbDap, codelldb]

/* ------------------------------------------------------------------ *
 * Python
 * ------------------------------------------------------------------ */

export const debugpy: DebugAdapterConfig = {
  label: 'debugpy',
  type: 'debugpy',
  command: 'python3',
  args: ['-m', 'debugpy.adapter'],
  probe: ['-c', 'import debugpy'],
  candidates: [
    { command: 'python', args: ['-m', 'debugpy.adapter'], probe: ['-c', 'import debugpy'] },
    { command: `${MASON}/packages/debugpy/venv/bin/python`, args: ['-m', 'debugpy.adapter'] },
    '~/.vscode/extensions/ms-python.debugpy-*/bundled/libs/debugpy/adapter',
  ],
  launch: async (ctx) => {
    if (!ctx.file) throw new Error(t('debug.error.noFile'))
    const venv = ctx.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python'
    const python = await ctx.exists(`${ctx.projectRoot}/${venv}`) ? { python: `${ctx.projectRoot}/${venv}` } : {}
    return { program: ctx.file, cwd: ctx.projectRoot, console: 'internalConsole', justMyCode: true, ...python }
  },
  install: 'pip install debugpy (bzw. uv add --dev debugpy) · Mason: :MasonInstall debugpy',
  installCommands: { linux: 'python3 -m pip install --user debugpy', darwin: 'python3 -m pip install --user debugpy', win32: 'python -m pip install debugpy' },
  docs: 'https://github.com/microsoft/debugpy',
}

/* ------------------------------------------------------------------ *
 * JavaScript · TypeScript (vscode-js-debug)
 * ------------------------------------------------------------------ */

function jsDebug(typescript: boolean): DebugAdapterConfig {
  return {
    label: 'js-debug (Node.js)',
    type: 'pwa-node',
    transport: 'tcp',
    command: 'js-debug-adapter',
    args: ['${port}', '127.0.0.1'],
    candidates: [
      { command: `${MASON}/bin/js-debug-adapter`, args: ['${port}', '127.0.0.1'] },
      { command: `${MASON}/packages/js-debug-adapter/js-debug/src/dapDebugServer.js`, args: ['${port}', '127.0.0.1'] },
      { command: '~/.local/share/js-debug/src/dapDebugServer.js', args: ['${port}', '127.0.0.1'] },
      { command: '~/.lumen/debug/js-debug/src/dapDebugServer.js', args: ['${port}', '127.0.0.1'] },
    ],
    launch: async (ctx) => {
      if (!ctx.file) throw new Error(t('debug.error.noFile'))
      const base: DebugLaunchArguments = {
        program: ctx.file,
        cwd: ctx.projectRoot,
        console: 'internalConsole',
        outputCapture: 'std',
        skipFiles: ['<node_internals>/**'],
        sourceMaps: true,
      }
      if (!typescript) return base
      const tsx = `${ctx.projectRoot}/node_modules/.bin/${ctx.platform === 'win32' ? 'tsx.cmd' : 'tsx'}`
      if (await ctx.exists(tsx)) return { ...base, runtimeExecutable: tsx }
      // Node ≥ 22.18 strips types by itself.
      return base
    },
    install: 'Mason: :MasonInstall js-debug-adapter · oder js-debug-dap-*.tar.gz von github.com/microsoft/vscode-js-debug/releases nach ~/.local/share/js-debug entpacken',
    docs: 'https://github.com/microsoft/vscode-js-debug',
  }
}

export const jsDebugNode = jsDebug(false)
export const jsDebugTypeScript = jsDebug(true)

/* ------------------------------------------------------------------ *
 * Go
 * ------------------------------------------------------------------ */

export const delve: DebugAdapterConfig = {
  label: 'Delve',
  type: 'go',
  transport: 'tcp',
  command: 'dlv',
  args: ['dap', '-l', '127.0.0.1:${port}'],
  candidates: [
    { command: '~/go/bin/dlv', args: ['dap', '-l', '127.0.0.1:${port}'] },
    { command: `${MASON}/bin/dlv`, args: ['dap', '-l', '127.0.0.1:${port}'] },
  ],
  launch: (ctx) => ({ mode: 'debug', program: ctx.file ? ctx.fileDir : ctx.projectRoot, cwd: ctx.projectRoot }),
  install: 'go install github.com/go-delve/delve/cmd/dlv@latest',
  installCommands: { linux: 'go install github.com/go-delve/delve/cmd/dlv@latest', darwin: 'go install github.com/go-delve/delve/cmd/dlv@latest', win32: 'go install github.com/go-delve/delve/cmd/dlv@latest' },
  docs: 'https://github.com/go-delve/delve/tree/master/Documentation/api/dap',
}

/* ------------------------------------------------------------------ *
 * Java (java-debug through jdtls)
 * ------------------------------------------------------------------ */

interface MainClassOption {
  mainClass: string
  projectName?: string
  filePath?: string
}

const sameFile = (a?: string, b?: string | null) =>
  Boolean(a && b) && a!.replace(/\\/g, '/').toLowerCase() === b!.replace(/\\/g, '/').toLowerCase()

export const javaDebug: DebugAdapterConfig = {
  label: 'java-debug (jdtls)',
  type: 'java',
  transport: 'tcp',
  lspBundles: [
    `${MASON}/packages/java-debug-adapter/extension/server/com.microsoft.java.debug.plugin-*.jar`,
    '~/.vscode/extensions/vscjava.vscode-java-debug-*/server/com.microsoft.java.debug.plugin-*.jar',
    '~/.lumen/debug/java-debug/com.microsoft.java.debug.plugin-*.jar',
    '/usr/share/java-debug/com.microsoft.java.debug.plugin-*.jar',
  ],
  connect: async (ctx) => {
    const port = await ctx.lspCommand('vscode.java.startDebugSession')
    if (typeof port !== 'number') throw new Error(t('debug.java.noPort'))
    return { port }
  },
  launch: async (ctx) => {
    const uri = `file://${ctx.projectRoot.startsWith('/') ? '' : '/'}${ctx.projectRoot.replace(/\\/g, '/')}`
    const found = await ctx.lspCommand('vscode.java.resolveMainClass', [uri]) as MainClassOption[] | null
    const options = Array.isArray(found) ? found : []
    if (!options.length) throw new Error(t('debug.java.noMainClass'))
    const own = options.find((option) => sameFile(option.filePath, ctx.file))
    const chosenName = own?.mainClass ?? (options.length === 1 ? options[0].mainClass : await ctx.pick(
      t('debug.java.pickMainClass'),
      options.map((option) => ({ value: option.mainClass, label: option.mainClass, detail: option.projectName })),
    ))
    const chosen = options.find((option) => option.mainClass === chosenName)
    if (!chosen) return null
    // A single file has no project (the invisible project), so send `null` then.
    const projectName = chosen.projectName ?? null
    await ctx.lspCommand('vscode.java.buildWorkspace', [JSON.stringify({ mainClass: chosen.mainClass, projectName, isFullBuild: false })]).catch(() => null)
    const classpath = await ctx.lspCommand('vscode.java.resolveClasspath', [chosen.mainClass, projectName]) as [string[], string[]] | null
    const javaExec = await ctx.lspCommand('vscode.java.resolveJavaExecutable', [chosen.mainClass, projectName]).catch(() => null)
    return {
      mainClass: chosen.mainClass,
      ...(projectName ? { projectName } : {}),
      modulePaths: classpath?.[0] ?? [],
      classPaths: classpath?.[1] ?? [],
      cwd: ctx.projectRoot,
      console: 'internalConsole',
      stopOnEntry: false,
      args: '',
      vmArgs: '',
      ...(typeof javaExec === 'string' && javaExec ? { javaExec } : {}),
    }
  },
  install: 'java-debug-Plugin für jdtls: Mason :MasonInstall java-debug-adapter · oder VS-Code-Erweiterung vscjava.vscode-java-debug · oder com.microsoft.java.debug.plugin-*.jar nach ~/.lumen/debug/java-debug',
  docs: 'https://github.com/microsoft/java-debug',
}

/* ------------------------------------------------------------------ *
 * PHP · C# · Kotlin
 * ------------------------------------------------------------------ */

export const phpDebug: DebugAdapterConfig = {
  label: 'vscode-php-debug (Xdebug)',
  type: 'php',
  command: 'php-debug-adapter',
  candidates: [
    `${MASON}/packages/php-debug-adapter/extension/out/phpDebug.js`,
    '~/.vscode/extensions/xdebug.php-debug-*/out/phpDebug.js',
    '~/.local/share/vscode-php-debug/out/phpDebug.js',
  ],
  launch: (ctx) => {
    if (!ctx.file) return { port: 9003 }
    return { program: ctx.file, cwd: ctx.fileDir, port: 0, runtimeArgs: ['-dxdebug.start_with_request=yes'] }
  },
  install: 'Xdebug für PHP installieren · Mason: :MasonInstall php-debug-adapter · oder VS-Code-Erweiterung xdebug.php-debug',
  docs: 'https://github.com/xdebug/vscode-php-debug',
}

export const netcoredbg: DebugAdapterConfig = {
  label: 'netcoredbg',
  type: 'coreclr',
  command: 'netcoredbg',
  args: ['--interpreter=vscode'],
  candidates: [
    { command: `${MASON}/packages/netcoredbg/netcoredbg/netcoredbg`, args: ['--interpreter=vscode'] },
    { command: '/usr/local/netcoredbg/netcoredbg', args: ['--interpreter=vscode'] },
  ],
  launch: async (ctx) => {
    const remembered = ctx.memory.get('coreclr:program')
    const [guess] = await ctx.glob(`${ctx.projectRoot}/bin/Debug/net*/${ctx.projectName}.dll`)
    const values = await ctx.ask(t('debug.launch.dotnetTitle'), [
      { id: 'program', label: t('debug.launch.dll'), hint: t('debug.launch.dllHint'), mono: true },
      { id: 'args', label: t('debug.launch.args'), required: false, mono: true },
    ], { program: remembered ?? guess ?? '', args: '' })
    if (!values) return null
    ctx.memory.set('coreclr:program', values.program)
    return { program: values.program, args: splitArgs(values.args ?? ''), cwd: ctx.projectRoot, stopAtEntry: false, console: 'internalConsole' }
  },
  install: 'https://github.com/Samsung/netcoredbg/releases · Mason: :MasonInstall netcoredbg',
  docs: 'https://github.com/Samsung/netcoredbg',
}

export const kotlinDebug: DebugAdapterConfig = {
  label: 'kotlin-debug-adapter',
  type: 'kotlin',
  command: 'kotlin-debug-adapter',
  candidates: [`${MASON}/bin/kotlin-debug-adapter`, '~/.local/share/kotlin-debug-adapter/adapter/build/install/adapter/bin/kotlin-debug-adapter'],
  launch: async (ctx) => {
    const guess = ctx.fileStem ? `${ctx.fileStem}Kt` : ''
    const values = await ctx.ask(t('debug.launch.kotlinTitle'), [
      { id: 'mainClass', label: t('debug.launch.mainClass'), hint: t('debug.launch.mainClassHint'), mono: true },
    ], { mainClass: ctx.memory.get('kotlin:mainClass') ?? guess })
    if (!values) return null
    ctx.memory.set('kotlin:mainClass', values.mainClass)
    return { projectRoot: ctx.projectRoot, mainClass: values.mainClass }
  },
  install: 'Mason: :MasonInstall kotlin-debug-adapter · https://github.com/fwcd/kotlin-debug-adapter (vorher gradle build)',
  docs: 'https://github.com/fwcd/kotlin-debug-adapter',
}
