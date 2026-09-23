#!/usr/bin/env node
/**
 * Tests for the Discord extension: the frames, the activity built from state
 * and settings, the texts — and the IPC client against a fake Discord that
 * listens on a Unix socket and speaks the handshake and frames.
 *
 *   node extensions/discord/test.mjs
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import {
  DiscordIpcClient, OP_CLOSE, OP_FRAME, OP_HANDSHAKE, OP_PING, OP_PONG, decodeFrames, defaultSocketPaths, encodeFrame, sanitizeActivity,
} from './src/ipc.js'
import { DEFAULTS, buildActivity, isInside, readSettings, repoUrlFromGitConfig, toWebUrl } from './src/activity.js'
import { LANGUAGES, createT, keysOf } from './src/i18n.js'

let passed = 0
async function test(name, fn) {
  await fn()
  passed++
  process.stdout.write(`✓ ${name}\n`)
}

const t = createT({ locale: () => 'en' })
const settings = (values = {}) => readSettings({ ...DEFAULTS, ...values })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Wait until `check()` holds, or fail after `ms`. */
async function until(check, ms = 2000) {
  const end = Date.now() + ms
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out waiting')
    await sleep(10)
  }
}

/* ------------------------------------------------------------------ *
 * Frames
 * ------------------------------------------------------------------ */

await test('frames: encode and decode round trip, split over chunks', () => {
  const a = encodeFrame(OP_HANDSHAKE, { v: 1, client_id: '123' })
  const b = encodeFrame(OP_FRAME, { cmd: 'SET_ACTIVITY', text: 'Grüße' })
  assert.equal(a.readInt32LE(0), OP_HANDSHAKE)
  assert.equal(a.readInt32LE(4), a.length - 8)
  const all = Buffer.concat([a, b])
  const first = decodeFrames(all.subarray(0, a.length + 5))
  assert.equal(first.frames.length, 1)
  assert.deepEqual(first.frames[0], { op: OP_HANDSHAKE, data: { v: 1, client_id: '123' } })
  assert.equal(first.rest.length, 5)
  const second = decodeFrames(Buffer.concat([first.rest, all.subarray(a.length + 5)]))
  assert.deepEqual(second.frames, [{ op: OP_FRAME, data: { cmd: 'SET_ACTIVITY', text: 'Grüße' } }])
  assert.equal(second.rest.length, 0)
})

await test('frames: broken JSON decodes as null', () => {
  const header = Buffer.alloc(8)
  header.writeInt32LE(OP_FRAME, 0)
  header.writeInt32LE(3, 4)
  const { frames } = decodeFrames(Buffer.concat([header, Buffer.from('{x}')]))
  assert.deepEqual(frames, [{ op: OP_FRAME, data: null }])
})

await test('socket paths: Linux with XDG, Flatpak and Snap; Windows pipes', () => {
  const linux = defaultSocketPaths('linux', { XDG_RUNTIME_DIR: '/run/user/1000' })
  assert.equal(linux[0], '/run/user/1000/discord-ipc-0')
  assert.ok(linux.includes('/run/user/1000/app/com.discordapp.Discord/discord-ipc-0'))
  assert.ok(linux.includes('/run/user/1000/snap.discord/discord-ipc-9'))
  assert.equal(defaultSocketPaths('darwin', { TMPDIR: '/var/tmp' })[0], '/var/tmp/discord-ipc-0')
  assert.equal(defaultSocketPaths('win32', {})[0], '\\\\?\\pipe\\discord-ipc-0')
})

await test('sanitizeActivity: trims, truncates, drops short texts and bad buttons', () => {
  const activity = sanitizeActivity({
    details: '  Editing main.ts  ', state: 'x', extra: 1,
    timestamps: { start: 12.6 },
    assets: { large_image: 'c', large_text: 'a'.repeat(200), small_text: 'y' },
    buttons: [{ label: 'Repo', url: 'https://example.com/a' }, { label: 'Bad', url: 'file:///etc' }, { label: 'Third', url: 'https://x.y' }],
  })
  assert.equal(activity.details, 'Editing main.ts')
  assert.equal(activity.state, undefined)
  assert.equal(activity.extra, undefined)
  assert.deepEqual(activity.timestamps, { start: 13 })
  assert.equal(activity.assets.large_image, 'c')
  assert.equal(activity.assets.large_text.length, 128)
  assert.equal(activity.assets.small_text, undefined)
  assert.deepEqual(activity.buttons, [{ label: 'Repo', url: 'https://example.com/a' }])
  assert.equal(sanitizeActivity('nope'), null)
})

/* ------------------------------------------------------------------ *
 * Settings, private folders, repository links
 * ------------------------------------------------------------------ */

await test('settings: defaults, types and invalid values', () => {
  const defaults = readSettings({})
  assert.equal(defaults.clientId, DEFAULTS.clientId)
  assert.equal(defaults.showFileName, true)
  assert.equal(defaults.idleMinutes, 5)
  assert.equal(defaults.repoButton, false)
  const odd = readSettings({ clientId: 'abc', idleMinutes: '-3', elapsedFrom: 'x', privateMode: 'x', privateProjects: ' /a \n\n/b/c ' })
  assert.equal(odd.clientId, '')
  assert.equal(odd.idleMinutes, 0)
  assert.equal(odd.elapsedFrom, 'session')
  assert.equal(odd.privateMode, 'names')
  assert.deepEqual(odd.privateProjects, ['/a', '/b/c'])
})

await test('private folders: the folder itself and anything inside, not siblings', () => {
  assert.equal(isInside('/home/me/work/app', ['/home/me/work/']), true)
  assert.equal(isInside('/home/me/work', ['/home/me/work']), true)
  assert.equal(isInside('/home/me/workshop', ['/home/me/work']), false)
  assert.equal(isInside('C:\\Users\\me\\secret\\x', ['C:/Users/me/secret']), true)
  assert.equal(isInside(null, ['/']), false)
})

await test('repository links: ssh, scp-like and https with credentials stripped', () => {
  assert.equal(toWebUrl('git@github.com:owner/repo.git'), 'https://github.com/owner/repo')
  assert.equal(toWebUrl('ssh://git@gitlab.com:2222/group/sub/repo.git'), 'https://gitlab.com/group/sub/repo')
  assert.equal(toWebUrl('https://user:token@codeberg.org/a/b.git'), 'https://codeberg.org/a/b')
  assert.equal(toWebUrl('https://git.example.com:8443/a/b/'), 'https://git.example.com:8443/a/b')
  assert.equal(toWebUrl('/srv/git/repo.git'), null)
  assert.equal(toWebUrl('file:///srv/git/repo.git'), null)
  const config = [
    '[core]', '\tbare = false',
    '[remote "upstream"]', '\turl = https://github.com/up/repo.git',
    '[remote "origin"]', '\turl = git@github.com:me/repo.git', '\tfetch = +refs/heads/*:refs/remotes/origin/*',
    '[branch "main"]', '\tremote = origin',
  ].join('\n')
  assert.equal(repoUrlFromGitConfig(config), 'https://github.com/me/repo')
  assert.equal(repoUrlFromGitConfig('[remote "fork"]\n  url = https://x.org/a/b\n'), 'https://x.org/a/b')
  assert.equal(repoUrlFromGitConfig('[core]\n'), null)
})

/* ------------------------------------------------------------------ *
 * The activity
 * ------------------------------------------------------------------ */

const base = {
  file: { path: '/p/src/Main.java', languageId: 'java', languageName: 'Java' },
  project: { root: '/p', name: 'my-app' },
  private: false, idle: false, start: 1000, version: '0.5.0', repoUrl: 'https://github.com/me/app',
}

await test('activity: file, project, language, time', () => {
  const activity = buildActivity(base, settings(), t)
  assert.equal(activity.details, 'Editing Main.java')
  assert.equal(activity.state, 'in my-app')
  assert.deepEqual(activity.timestamps, { start: 1000 })
  assert.deepEqual(activity.assets, { large_image: 'java', large_text: 'Java', small_image: 'lumen', small_text: 'Lumen 0.5.0' })
  assert.equal(activity.buttons, undefined)
})

await test('activity: each part can be switched off', () => {
  const activity = buildActivity(base, settings({ showFileName: 'false', showProject: 'false', showLanguage: 'false', showElapsed: 'false' }), t)
  assert.equal(activity.details, 'Editing a file')
  assert.equal(activity.state, undefined)
  assert.equal(activity.timestamps, undefined)
  assert.deepEqual(activity.assets, { large_image: 'lumen', large_text: 'Lumen 0.5.0' })
})

await test('activity: no file shows the idle text; a language id becomes an asset key', () => {
  assert.equal(buildActivity({ ...base, file: null }, settings(), t).details, 'Idle')
  assert.equal(buildActivity({ ...base, file: null }, settings({ idleText: 'Thinking' }), t).details, 'Thinking')
  const cpp = buildActivity({ ...base, file: { path: 'a.cpp', languageId: 'C++' } }, settings(), t)
  assert.equal(cpp.assets.large_image, 'c__')
  assert.equal(cpp.assets.large_text, 'C++')
})

await test('activity: idle shows the idle text or nothing', () => {
  const idle = buildActivity({ ...base, idle: true }, settings({ idleText: 'Away' }), t)
  assert.equal(idle.details, 'Away')
  assert.equal(idle.assets.large_image, 'lumen')
  assert.equal(buildActivity({ ...base, idle: true }, settings({ idleAction: 'clear' }), t), null)
})

await test('activity: the repository button only when asked for and never in private projects', () => {
  const shown = buildActivity(base, settings({ repoButton: 'true' }), t)
  assert.deepEqual(shown.buttons, [{ label: 'View repository', url: 'https://github.com/me/app' }])
  assert.equal(buildActivity({ ...base, repoUrl: null }, settings({ repoButton: 'true' }), t).buttons, undefined)
  assert.equal(buildActivity({ ...base, private: true }, settings({ repoButton: 'true' }), t).buttons, undefined)
})

await test('activity: private projects hide names, or everything', () => {
  const hidden = buildActivity({ ...base, private: true }, settings(), t)
  assert.equal(hidden.details, 'Editing a file')
  assert.equal(hidden.state, 'in a private project')
  assert.equal(hidden.assets.large_image, 'java')
  assert.ok(!JSON.stringify(hidden).includes('my-app'))
  assert.ok(!JSON.stringify(hidden).includes('Main.java'))
  assert.equal(buildActivity({ ...base, private: true }, settings({ privateMode: 'hide' }), t), null)
})

await test('i18n: all eight languages carry the same keys, fallback works', () => {
  assert.equal(LANGUAGES.length, 8)
  const keys = keysOf('en').sort()
  for (const language of LANGUAGES) assert.deepEqual(keysOf(language).sort(), keys, language)
  assert.equal(createT({ locale: () => 'xx' })('activity.editing', { file: 'a' }), 'Editing a')
  assert.equal(createT({ locale: () => 'pt-BR' })('activity.idle'), 'Ocioso')
  assert.equal(createT({ locale: () => 'de' })('activity.editing', { file: 'a' }), 'Bearbeitet a')
})

/* ------------------------------------------------------------------ *
 * The client against a fake Discord
 * ------------------------------------------------------------------ */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumen-discord-'))

/** A fake Discord on a Unix socket: answers the handshake with READY and records every frame. */
function fakeDiscord(file, { onHandshake } = {}) {
  const received = []
  const sockets = new Set()
  const server = net.createServer((socket) => {
    sockets.add(socket)
    let buffer = Buffer.alloc(0)
    socket.on('data', (chunk) => {
      const { frames, rest } = decodeFrames(Buffer.concat([buffer, chunk]))
      buffer = rest
      for (const frame of frames) {
        received.push(frame)
        if (frame.op !== OP_HANDSHAKE) continue
        if (onHandshake?.(socket, frame)) continue
        socket.write(encodeFrame(OP_FRAME, { cmd: 'DISPATCH', evt: 'READY', data: { v: 1, user: { username: 'tester', global_name: 'Tester' } } }))
      }
    })
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => {})
  })
  return new Promise((resolve) => server.listen(file, () => resolve({
    received,
    sockets,
    activities: () => received.filter((frame) => frame.op === OP_FRAME && frame.data?.cmd === 'SET_ACTIVITY').map((frame) => frame.data.args.activity),
    close: () => new Promise((done) => {
      for (const socket of sockets) socket.destroy()
      server.close(() => done())
    }),
  })))
}

if (process.platform === 'win32') {
  process.stdout.write('- IPC client tests skipped on Windows (named pipes)\n')
}

if (process.platform !== 'win32') {
  await test('client: handshake, READY, activity, throttle, ping, clearing', async () => {
    const file = path.join(dir, 'discord-ipc-0')
    const discord = await fakeDiscord(file)
    const states = []
    const client = new DiscordIpcClient({
      throttleMs: 150,
      socketPaths: () => [path.join(dir, 'missing-ipc'), file],
      onStatus: (status) => states.push(status),
      log: () => {},
    })
    client.update('123456789', { details: 'one' })
    await until(() => client.status().state === 'connected')
    assert.deepEqual(client.status(), { state: 'connected', user: 'Tester' })
    assert.deepEqual(discord.received[0], { op: OP_HANDSHAKE, data: { v: 1, client_id: '123456789' } })
    await until(() => discord.activities().length === 1)
    assert.deepEqual(discord.activities()[0], { details: 'one' })

    // Within the throttle window only the latest state goes out, once.
    client.update('123456789', { details: 'two' })
    client.update('123456789', { details: 'three' })
    await sleep(40)
    assert.equal(discord.activities().length, 1)
    await until(() => discord.activities().length === 2)
    assert.deepEqual(discord.activities()[1], { details: 'three' })
    // The same activity again is not sent.
    client.update('123456789', { details: 'three' })
    await sleep(200)
    assert.equal(discord.activities().length, 2)

    const [socket] = discord.sockets
    socket.write(encodeFrame(OP_PING, { n: 7 }))
    await until(() => discord.received.some((frame) => frame.op === OP_PONG))
    assert.deepEqual(discord.received.find((frame) => frame.op === OP_PONG).data, { n: 7 })

    client.stop()
    await until(() => discord.activities().length === 3)
    assert.equal(discord.activities()[2], null)
    assert.equal(client.status().state, 'disconnected')
    assert.deepEqual(states.map((status) => status.state), ['connecting', 'connected', 'disconnected'])
    await discord.close()
  })

  await test('client: Discord closing with an error reports it', async () => {
    const file = path.join(dir, 'discord-ipc-1')
    const discord = await fakeDiscord(file, {
      onHandshake(socket) {
        socket.write(encodeFrame(OP_CLOSE, { code: 4000, message: 'Invalid Client ID' }))
        return true
      },
    })
    const client = new DiscordIpcClient({ socketPaths: () => [file], retryMs: 60_000, log: () => {} })
    client.update('1', { details: 'x' })
    await until(() => client.status().state === 'error')
    assert.equal(client.status().message, 'Invalid Client ID')
    client.stop()
    await discord.close()
  })

  await test('client: without Discord it waits, retries and connects once Discord is there', async () => {
    const file = path.join(dir, 'discord-ipc-2')
    const client = new DiscordIpcClient({ socketPaths: () => [file], retryMs: 80, maxRetryMs: 80, log: () => {} })
    client.update('42', { details: 'later' })
    await until(() => client.status().state === 'disconnected')
    const discord = await fakeDiscord(file)
    await until(() => client.status().state === 'connected')
    await until(() => discord.activities().length === 1)
    assert.deepEqual(discord.activities()[0], { details: 'later' })

    // The connection drops: the client notices and comes back by itself.
    for (const socket of discord.sockets) socket.destroy()
    await until(() => client.status().state !== 'connected')
    await until(() => client.status().state === 'connected')
    client.stop()
    await discord.close()
  })

  await test('client: an empty client id or null clears and does not connect', async () => {
    let connects = 0
    const client = new DiscordIpcClient({ socketPaths: () => { connects++; return [] }, log: () => {} })
    client.update('', { details: 'x' })
    client.update('5', null)
    await sleep(20)
    assert.equal(connects, 0)
    assert.equal(client.status().state, 'disconnected')
  })
}

fs.rmSync(dir, { recursive: true, force: true })
process.stdout.write(`\n${passed} passed\n`)
