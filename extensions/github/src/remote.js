/**
 * Which GitHub repository the open folder belongs to, read from its git
 * remote. Pure parsing lives here so `test.mjs` can check it.
 */

/**
 * Owner and name out of a remote URL — `https://github.com/o/r.git`,
 * `git@github.com:o/r.git`, `ssh://git@github.com:22/o/r` — when its host is
 * `host`. `null` for any other host.
 */
export function parseRemoteUrl(url, host = 'github.com') {
  const text = String(url ?? '').trim()
  const patterns = [
    /^[a-z+]+:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i,
    /^(?:[^@]+@)?([^:/]+):([^/]+)\/([^/]+?)(?:\.git)?\/?$/,
  ]
  for (const pattern of patterns) {
    const match = pattern.exec(text)
    if (!match) continue
    if (match[1].toLowerCase() !== host.toLowerCase()) return null
    return { owner: match[2], name: match[3] }
  }
  return null
}

/** The web address and host belonging to an API address (`https://api.github.com`, `https://ghe.example/api/v3`). */
export function hostsOf(apiUrl) {
  const api = String(apiUrl || 'https://api.github.com').replace(/\/+$/, '')
  const url = new URL(api)
  if (url.hostname === 'api.github.com') return { api, web: 'https://github.com', host: 'github.com' }
  return { api, web: `${url.protocol}//${url.host}`, host: url.hostname }
}

export function createRemote(ctx) {
  const git = (args, cwd) => ctx.exec('git', args, { cwd, timeoutMs: 20_000, env: { GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } })

  /** The repository around the open folder, its remote and the branch checked out. */
  async function detect(host) {
    const folder = ctx.workspace.root()
    if (!folder) return { reason: 'noFolder' }
    const top = await git(['rev-parse', '--show-toplevel'], folder).catch(() => null)
    if (!top || top.code !== 0) return { reason: 'noRepo' }
    const root = top.stdout.trim()
    const remotes = await git(['remote', '-v'], root)
    const urls = new Map()
    for (const line of remotes.stdout.split('\n')) {
      const match = /^(\S+)\s+(\S+)\s+\(fetch\)$/.exec(line.trim())
      if (match) urls.set(match[1], match[2])
    }
    const preferred = ['upstream', 'origin', ...urls.keys()]
    // `origin` is where one pushes; a fork's `upstream` is where pull requests go.
    const remoteName = ['origin', ...urls.keys()].find((name) => urls.has(name) && parseRemoteUrl(urls.get(name), host))
    if (!remoteName) return { reason: 'noGitHub', root }
    const target = preferred.find((name) => urls.has(name) && parseRemoteUrl(urls.get(name), host)) ?? remoteName
    const head = await git(['rev-parse', '--abbrev-ref', 'HEAD'], root)
    const sha = await git(['rev-parse', 'HEAD'], root)
    const upstream = await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], root)
    const branch = head.stdout.trim()
    return {
      root,
      remote: remoteName,
      repo: parseRemoteUrl(urls.get(target), host),
      fork: parseRemoteUrl(urls.get(remoteName), host),
      branch: branch === 'HEAD' ? null : branch,
      sha: sha.code === 0 ? sha.stdout.trim() : null,
      hasUpstream: upstream.code === 0,
    }
  }

  return { detect, git }
}
