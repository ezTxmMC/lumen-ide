/**
 * Comparing versions of extensions.
 *
 * Semantic versions with an optional prerelease tag; a prerelease ranks below
 * the finished version of the same number (`1.2.0-beta.1` < `1.2.0`).
 */

function parse(version: string): { core: number[]; pre: string } {
  const [core, pre = ''] = String(version).split('-', 2)
  return { core: core.split('.').map((part) => Number(part) || 0), pre }
}

/** Negative when `a` is older than `b`, positive when newer, zero when equal. */
export function compareVersions(a: string, b: string): number {
  const left = parse(a)
  const right = parse(b)
  for (let i = 0; i < 3; i++) {
    const diff = (left.core[i] ?? 0) - (right.core[i] ?? 0)
    if (diff !== 0) return diff
  }
  if (left.pre === right.pre) return 0
  if (!left.pre) return 1
  if (!right.pre) return -1
  return left.pre < right.pre ? -1 : 1
}

export const isNewer = (candidate: string, current: string) => compareVersions(candidate, current) > 0
