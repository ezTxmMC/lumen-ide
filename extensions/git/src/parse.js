/**
 * Parsers for git's machine-readable output. Pure functions — `test.mjs`
 * runs them against recorded output.
 */

/** Status letters of `--porcelain=v2` → the kind a row is coloured by. */
const KIND = {
  M: 'modified',
  T: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'added',
  U: 'conflict',
}

/** The two letters of an unmerged entry → what happened on either side. */
const CONFLICT = {
  DD: 'bothDeleted',
  AU: 'addedByUs',
  UD: 'deletedByThem',
  UA: 'addedByThem',
  DU: 'deletedByUs',
  AA: 'bothAdded',
  UU: 'bothModified',
}

export function emptyStatus() {
  return {
    branch: { oid: null, head: null, detached: false, initial: false, upstream: null, ahead: 0, behind: 0 },
    stashes: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicts: [],
  }
}

function readHeader(status, line) {
  const space = line.indexOf(' ')
  const key = line.slice(0, space)
  const value = line.slice(space + 1)
  const branch = status.branch
  if (key === 'branch.oid') {
    branch.initial = value === '(initial)'
    branch.oid = branch.initial ? null : value
    return
  }
  if (key === 'branch.head') {
    branch.detached = value === '(detached)'
    branch.head = branch.detached ? null : value
    return
  }
  if (key === 'branch.upstream') {
    branch.upstream = value
    return
  }
  if (key === 'branch.ab') {
    const match = /^\+(\d+) -(\d+)$/.exec(value)
    if (!match) return
    branch.ahead = Number(match[1])
    branch.behind = Number(match[2])
    return
  }
  if (key === 'stash') status.stashes = Number(value) || 0
}

/** One tracked entry: a letter for the index and one for the working tree. */
function addTracked(status, xy, path, orig) {
  const [x, y] = xy
  if (x !== '.') status.staged.push({ path, orig, status: x, kind: KIND[x] ?? 'modified' })
  if (y !== '.') status.unstaged.push({ path, orig, status: y, kind: KIND[y] ?? 'modified' })
}

/**
 * Parse `git status --porcelain=v2 --branch --show-stash -z`.
 *
 * With `-z` entries end in NUL and paths are never quoted; a rename (`2`) is
 * followed by a second entry holding the original path.
 */
export function parseStatus(output) {
  const status = emptyStatus()
  const records = String(output ?? '').split('\0')
  for (let index = 0; index < records.length; index++) {
    const record = records[index]
    if (!record) continue
    if (record.startsWith('# ')) {
      readHeader(status, record.slice(2))
      continue
    }
    const type = record[0]
    if (type === '?') {
      status.untracked.push({ path: record.slice(2), status: '?', kind: 'untracked' })
      continue
    }
    const parts = record.split(' ')
    if (type === '1') {
      addTracked(status, parts[1], parts.slice(8).join(' '))
      continue
    }
    if (type === '2') {
      const orig = records[index + 1] ?? ''
      index++
      addTracked(status, parts[1], parts.slice(9).join(' '), orig)
      continue
    }
    if (type === 'u') {
      status.conflicts.push({ path: parts.slice(10).join(' '), status: 'U', kind: 'conflict', conflict: CONFLICT[parts[1]] ?? 'bothModified' })
    }
  }
  return status
}

/** Fields of `git log`, separated by the unit separator, records by the record separator. */
export const LOG_FORMAT = '%H%x1f%h%x1f%an%x1f%ae%x1f%at%x1f%D%x1f%P%x1f%s%x1e'

function parseRefs(decoration) {
  if (!decoration.trim()) return []
  return decoration.split(', ').map((raw) => {
    const text = raw.trim()
    if (text.startsWith('HEAD -> ')) return { name: text.slice(8), kind: 'head' }
    if (text === 'HEAD') return { name: 'HEAD', kind: 'head' }
    if (text.startsWith('tag: ')) return { name: text.slice(5), kind: 'tag' }
    if (text.includes('/')) return { name: text, kind: 'remote' }
    return { name: text, kind: 'branch' }
  })
}

export function parseLog(output) {
  return String(output ?? '')
    .split('\x1e')
    .map((record) => record.replace(/^\n/, ''))
    .filter(Boolean)
    .map((record) => {
      const [hash, short, author, email, time, decoration, parents, ...subject] = record.split('\x1f')
      return {
        hash,
        short,
        author,
        email,
        time: Number(time) * 1000,
        refs: parseRefs(decoration ?? ''),
        parents: (parents ?? '').split(' ').filter(Boolean),
        subject: subject.join('\x1f'),
      }
    })
}

export const REF_FORMAT = '%(refname)%1f%(refname:short)%1f%(objectname:short)%1f%(upstream:short)%1f%(upstream:track,nobracket)%1f%(HEAD)%1f%(committerdate:unix)%1f%(contents:subject)'

function parseTrack(track) {
  const ahead = /ahead (\d+)/.exec(track)
  const behind = /behind (\d+)/.exec(track)
  return {
    ahead: ahead ? Number(ahead[1]) : 0,
    behind: behind ? Number(behind[1]) : 0,
    gone: track.includes('gone'),
  }
}

/** Parse `git for-each-ref --format=REF_FORMAT refs/heads refs/remotes refs/tags`. */
export function parseRefList(output) {
  const result = { local: [], remote: [], tags: [] }
  for (const line of String(output ?? '').split('\n')) {
    if (!line.trim()) continue
    const [ref, name, oid, upstream, track, head, time, ...subject] = line.split('\x1f')
    const entry = { ref, name, oid, time: Number(time) * 1000, subject: subject.join('\x1f') }
    if (ref.startsWith('refs/heads/')) {
      result.local.push({ ...entry, upstream: upstream || null, current: head === '*', ...parseTrack(track ?? '') })
      continue
    }
    if (ref.startsWith('refs/remotes/')) {
      // `origin/HEAD` points at the default branch; it is not a branch of its own.
      if (ref.endsWith('/HEAD')) continue
      const slash = name.indexOf('/')
      result.remote.push({ ...entry, remote: name.slice(0, slash), branch: name.slice(slash + 1) })
      continue
    }
    if (ref.startsWith('refs/tags/')) result.tags.push(entry)
  }
  return result
}

export const STASH_FORMAT = '%gd%x1f%ct%x1f%s'

export function parseStashes(output) {
  return String(output ?? '')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const [ref, time, ...message] = line.split('\x1f')
      return { ref, time: Number(time) * 1000, message: message.join('\x1f') }
    })
}

/** Parse `git remote -v` into one entry per remote with its fetch and push URL. */
export function parseRemotes(output) {
  const remotes = new Map()
  for (const line of String(output ?? '').split('\n')) {
    const match = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(line.trim())
    if (!match) continue
    const [, name, url, kind] = match
    const entry = remotes.get(name) ?? { name, fetch: '', push: '' }
    entry[kind] = url
    remotes.set(name, entry)
  }
  return [...remotes.values()]
}

/**
 * How many conflict blocks a file still holds: lines opening with exactly
 * seven `<` and then a space or the line end, as git writes them.
 */
export function countConflictBlocks(text) {
  let count = 0
  for (const line of String(text ?? '').split('\n')) {
    if (/^<{7}(?:[ \r]|$)/.test(line)) count++
  }
  return count
}

/** Split a relative path into its file name and the folder it lies in. */
export function splitPath(path) {
  const cut = path.lastIndexOf('/')
  if (cut === -1) return { name: path, dir: '' }
  return { name: path.slice(cut + 1), dir: path.slice(0, cut) }
}
