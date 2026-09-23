#!/usr/bin/env node
/**
 * Tests for the parsers of the Git extension, against recorded git output.
 *
 *   node extensions/git/test.mjs
 */

import assert from 'node:assert/strict'
import { countConflictBlocks, parseLog, parseRefList, parseRemotes, parseStashes, parseStatus, splitPath } from './src/parse.js'
import { createT, keysOf } from './src/i18n.js'

let passed = 0
function test(name, fn) {
  fn()
  passed++
  process.stdout.write(`✓ ${name}\n`)
}

const NUL = '\0'

test('status: branch header with upstream and ahead/behind', () => {
  const status = parseStatus([
    '# branch.oid 1234567890abcdef',
    '# branch.head main',
    '# branch.upstream origin/main',
    '# branch.ab +2 -3',
    '# stash 4',
    '',
  ].join(NUL))
  assert.equal(status.branch.head, 'main')
  assert.equal(status.branch.upstream, 'origin/main')
  assert.equal(status.branch.ahead, 2)
  assert.equal(status.branch.behind, 3)
  assert.equal(status.stashes, 4)
  assert.equal(status.branch.detached, false)
})

test('status: detached head and initial commit', () => {
  const detached = parseStatus(`# branch.oid abc${NUL}# branch.head (detached)${NUL}`)
  assert.equal(detached.branch.detached, true)
  assert.equal(detached.branch.head, null)
  const initial = parseStatus(`# branch.oid (initial)${NUL}# branch.head main${NUL}`)
  assert.equal(initial.branch.initial, true)
  assert.equal(initial.branch.oid, null)
})

test('status: staged, unstaged, both, untracked, paths with spaces', () => {
  const status = parseStatus([
    '1 M. N... 100644 100644 100644 aaa bbb src/staged.ts',
    '1 .M N... 100644 100644 100644 aaa bbb src/changed file.ts',
    '1 MD N... 100644 100644 000000 aaa bbb both.txt',
    '1 A. N... 000000 100644 100644 000 bbb new.ts',
    '? notes/todo list.md',
    '',
  ].join(NUL))
  assert.deepEqual(status.staged.map((e) => [e.path, e.kind]), [['src/staged.ts', 'modified'], ['both.txt', 'modified'], ['new.ts', 'added']])
  assert.deepEqual(status.unstaged.map((e) => [e.path, e.kind]), [['src/changed file.ts', 'modified'], ['both.txt', 'deleted']])
  assert.deepEqual(status.untracked.map((e) => e.path), ['notes/todo list.md'])
})

test('status: renames carry their original path', () => {
  const status = parseStatus([
    '2 R. N... 100644 100644 100644 aaa bbb R100 new name.ts',
    'old name.ts',
    '1 .M N... 100644 100644 100644 aaa bbb after.ts',
    '',
  ].join(NUL))
  assert.equal(status.staged[0].path, 'new name.ts')
  assert.equal(status.staged[0].orig, 'old name.ts')
  assert.equal(status.staged[0].kind, 'renamed')
  assert.equal(status.unstaged[0].path, 'after.ts')
})

test('status: conflicts', () => {
  const status = parseStatus([
    'u UU N... 100644 100644 100644 100644 a b c conflict.ts',
    'u AA N... 000000 100644 100644 100644 a b c added both.ts',
    '',
  ].join(NUL))
  assert.deepEqual(status.conflicts.map((e) => [e.path, e.conflict]), [['conflict.ts', 'bothModified'], ['added both.ts', 'bothAdded']])
  assert.equal(status.staged.length, 0)
})

test('log: fields, refs and merges', () => {
  const record = (fields) => `${fields.join('\x1f')}\x1e`
  const log = parseLog([
    record(['h1', 'h1s', 'Ada', 'ada@x', '1700000000', 'HEAD -> main, origin/main, tag: v1.0', 'p1 p2', 'Merge branch x']),
    `\n${record(['h2', 'h2s', 'Bob', 'bob@x', '1690000000', '', 'p3', 'Subject with \x1f separator'])}`,
  ].join(''))
  assert.equal(log.length, 2)
  assert.deepEqual(log[0].refs, [
    { name: 'main', kind: 'head' }, { name: 'origin/main', kind: 'remote' }, { name: 'v1.0', kind: 'tag' },
  ])
  assert.equal(log[0].parents.length, 2)
  assert.equal(log[0].time, 1700000000000)
  assert.equal(log[1].subject, 'Subject with \x1f separator')
})

test('refs: local with tracking, remote without HEAD, tags', () => {
  const line = (fields) => fields.join('\x1f')
  const refs = parseRefList([
    line(['refs/heads/main', 'main', 'abc', 'origin/main', 'ahead 1, behind 2', '*', '1700000000', 'msg']),
    line(['refs/heads/old', 'old', 'def', 'origin/old', 'gone', ' ', '1600000000', 'old msg']),
    line(['refs/remotes/origin/HEAD', 'origin/HEAD', 'abc', '', '', ' ', '1700000000', '']),
    line(['refs/remotes/origin/feature/x', 'origin/feature/x', 'ghi', '', '', ' ', '1700000000', 'x']),
    line(['refs/tags/v1', 'v1', 'jkl', '', '', ' ', '1700000000', 'release']),
  ].join('\n'))
  assert.equal(refs.local[0].current, true)
  assert.equal(refs.local[0].ahead, 1)
  assert.equal(refs.local[0].behind, 2)
  assert.equal(refs.local[1].gone, true)
  assert.deepEqual(refs.remote.map((r) => [r.remote, r.branch]), [['origin', 'feature/x']])
  assert.equal(refs.tags[0].name, 'v1')
})

test('stashes and remotes', () => {
  const stashes = parseStashes('stash@{0}\x1f1700000000\x1fWIP on main: abc\nstash@{1}\x1f1690000000\x1fsaved')
  assert.deepEqual(stashes.map((s) => s.ref), ['stash@{0}', 'stash@{1}'])
  const remotes = parseRemotes('origin\tgit@github.com:a/b.git (fetch)\norigin\tgit@github.com:a/b.git (push)\nup\thttps://x/y (fetch)\n')
  assert.deepEqual(remotes.map((r) => r.name), ['origin', 'up'])
  assert.equal(remotes[0].push, 'git@github.com:a/b.git')
})

test('splitPath', () => {
  assert.deepEqual(splitPath('a/b/c.ts'), { name: 'c.ts', dir: 'a/b' })
  assert.deepEqual(splitPath('c.ts'), { name: 'c.ts', dir: '' })
})

test('i18n: German and English carry the same keys, fallback works', () => {
  assert.deepEqual(keysOf('de').sort(), keysOf('en').sort())
  const t = createT({ locale: () => 'fr' })
  assert.equal(t('push.done', { branch: 'main' }), 'Pushed main.')
  const de = createT({ locale: () => 'de' })
  assert.equal(de('push.done', { branch: 'main' }), 'main gepusht.')
})

test('conflict blocks: counted by their opening marker', () => {
  const text = 'a\n<<<<<<< HEAD\nb\n=======\nc\n>>>>>>> x\n<<<<<<<\r\nd\n=======\n>>>>>>> y\n'
  assert.equal(countConflictBlocks(text), 2)
  assert.equal(countConflictBlocks('<<<<<<<< eight\n<<<<<<<glued\nplain\n'), 0)
  assert.equal(countConflictBlocks(''), 0)
})

process.stdout.write(`\n${passed} passed\n`)
