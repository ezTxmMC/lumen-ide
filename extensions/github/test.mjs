#!/usr/bin/env node
/**
 * Tests for the pure parts of the GitHub extension.
 *
 *   node extensions/github/test.mjs
 */

import assert from 'node:assert/strict'
import { hostsOf, parseRemoteUrl } from './src/remote.js'
import { summarizeChecks } from './src/state.js'
import { runState } from './src/views/runs.js'
import { createT, keysOf } from './src/i18n.js'

let passed = 0
function test(name, fn) {
  fn()
  passed++
  process.stdout.write(`✓ ${name}\n`)
}

test('remote URLs in every form', () => {
  const expected = { owner: 'ezTxmMC', name: 'lumen-ide' }
  assert.deepEqual(parseRemoteUrl('https://github.com/ezTxmMC/lumen-ide.git'), expected)
  assert.deepEqual(parseRemoteUrl('https://github.com/ezTxmMC/lumen-ide'), expected)
  assert.deepEqual(parseRemoteUrl('https://user:token@github.com/ezTxmMC/lumen-ide.git'), expected)
  assert.deepEqual(parseRemoteUrl('git@github.com:ezTxmMC/lumen-ide.git'), expected)
  assert.deepEqual(parseRemoteUrl('ssh://git@github.com:22/ezTxmMC/lumen-ide.git'), expected)
  assert.deepEqual(parseRemoteUrl('ssh://git@github.com/ezTxmMC/lumen-ide'), expected)
  assert.equal(parseRemoteUrl('git@gitlab.com:a/b.git'), null)
  assert.deepEqual(parseRemoteUrl('git@ghe.example.com:team/app.git', 'ghe.example.com'), { owner: 'team', name: 'app' })
})

test('API and web hosts', () => {
  assert.deepEqual(hostsOf(), { api: 'https://api.github.com', web: 'https://github.com', host: 'github.com' })
  assert.deepEqual(hostsOf('https://ghe.example.com/api/v3/'), { api: 'https://ghe.example.com/api/v3', web: 'https://ghe.example.com', host: 'ghe.example.com' })
})

test('check runs summarised', () => {
  assert.equal(summarizeChecks([]), null)
  assert.equal(summarizeChecks([{ status: 'completed', conclusion: 'success' }]), 'success')
  assert.equal(summarizeChecks([{ status: 'completed', conclusion: 'success' }, { status: 'in_progress' }]), 'pending')
  assert.equal(summarizeChecks([{ status: 'in_progress' }, { status: 'completed', conclusion: 'failure' }]), 'failure')
})

test('workflow run states', () => {
  assert.equal(runState({ status: 'queued' }), 'queued')
  assert.equal(runState({ status: 'in_progress' }), 'running')
  assert.equal(runState({ status: 'completed', conclusion: 'success' }), 'success')
  assert.equal(runState({ status: 'completed', conclusion: 'timed_out' }), 'failure')
  assert.equal(runState({ status: 'completed', conclusion: 'something-new' }), 'skipped')
})

test('i18n: German and English carry the same keys', () => {
  assert.deepEqual(keysOf('de').sort(), keysOf('en').sort())
  assert.equal(createT({ locale: () => 'nl' })('pull.created', { number: '7' }), 'Created pull request #7.')
})

process.stdout.write(`\n${passed} passed\n`)
