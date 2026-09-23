/**
 * Running git: never through a shell, always with an argument list, never
 * waiting for a prompt that nobody can answer.
 */

/** Raised when git exits with an error; `message` is what git printed. */
export class GitError extends Error {
  constructor(message, result) {
    super(message)
    this.name = 'GitError'
    this.result = result
  }
}

export function createGit(ctx, t) {
  const binary = () => (ctx.settings.get('gitPath') ?? '').trim() || 'git'

  /** An environment that makes git fail instead of asking in a terminal nobody sees. */
  function environment(readOnly) {
    const env = { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }
    if (process.platform !== 'win32') env.GIT_EDITOR = 'true'
    // Polling must not take the index lock while the user runs git in a terminal.
    if (readOnly) env.GIT_OPTIONAL_LOCKS = '0'
    return env
  }

  async function run(args, options = {}) {
    const cwd = options.cwd ?? ctx.workspace.root()
    if (!cwd) throw new GitError(t('error.noFolder'))
    let result
    try {
      result = await ctx.exec(binary(), args, {
        cwd,
        input: options.input,
        timeoutMs: options.timeoutMs ?? 60_000,
        env: environment(options.readOnly),
      })
    } catch (err) {
      if (err?.code === 'ENOENT') throw new GitError(t('error.noGit', { path: binary() }))
      throw err
    }
    if (result.timedOut) throw new GitError(t('error.timeout', { command: `git ${args[0]}` }), result)
    if (result.code === 0 || options.allowFail) return result
    const message = (result.stderr || result.stdout).trim() || t('error.failed', { command: `git ${args[0]}`, code: String(result.code) })
    throw new GitError(message, result)
  }

  return { run, binary }
}
