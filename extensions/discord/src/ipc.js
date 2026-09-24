/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/**
 * A Discord IPC client (rich presence) without dependencies — so that it can
 * be tested in Node on its own, against a fake socket.
 *
 * The protocol: a local socket `discord-ipc-N` (Unix) or a named pipe
 * (Windows). Every frame carries an opcode (4 bytes LE), a length (4 bytes LE)
 * and UTF-8 JSON.
 *   0 HANDSHAKE `{ v: 1, client_id }` → Discord answers with DISPATCH/READY
 *   1 FRAME     commands (`SET_ACTIVITY`) and events
 *   2 CLOSE     Discord ends the connection (an invalid client id, say)
 *   3 PING → 4 PONG with the same payload
 *
 * Discord allows roughly one update every 15 s: changes are gathered, the first
 * goes out at once, after that only the latest state per window.
 */

import { createConnection } from 'node:net';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export const OP_HANDSHAKE = 0;
export const OP_FRAME = 1;
export const OP_CLOSE = 2;
export const OP_PING = 3;
export const OP_PONG = 4;

const MAX_TEXT = 128;
const MAX_BUTTON_LABEL = 32;
const MAX_BUTTON_URL = 512;
/** Larger buffers point to a broken stream — drop the connection. */
const MAX_BUFFER = 1024 * 1024;

/* ------------------------------------------------------------------ *
 * Frames
 * ------------------------------------------------------------------ */

export function encodeFrame(op, payload) {
  const json = Buffer.from(JSON.stringify(payload ?? {}), 'utf8');
  const header = Buffer.alloc(8);
  header.writeInt32LE(op, 0);
  header.writeInt32LE(json.length, 4);
  return Buffer.concat([header, json]);
}

/**
 * Splits buffered data into complete frames. Returns the remainder — frames may
 * be spread over any number of `data` events.
 */
export function decodeFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (buffer.length - offset >= 8) {
    const op = buffer.readUInt32LE(offset);
    const length = buffer.readUInt32LE(offset + 4);
    if (buffer.length - offset - 8 < length) {
      break;
    }
    const body = buffer.subarray(offset + 8, offset + 8 + length).toString('utf8');
    offset += 8 + length;
    frames.push({ op, data: parseJson(body) });
  }
  return { frames, rest: buffer.subarray(offset) };
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Where the socket lives
 * ------------------------------------------------------------------ */

export function defaultSocketPaths(platform = process.platform, env = process.env) {
  const ids = Array.from({ length: 10 }, (_, i) => i);
  if (platform === 'win32') {
    return ids.map((i) => `\\\\?\\pipe\\discord-ipc-${i}`);
  }
  const base = env.XDG_RUNTIME_DIR || env.TMPDIR || env.TMP || env.TEMP || '/tmp';
  const paths = ids.map((i) => path.join(base, `discord-ipc-${i}`));
  if (!env.XDG_RUNTIME_DIR) {
    return paths;
  }
  // Flatpak and Snap put the socket in a subfolder.
  for (const sub of ['app/com.discordapp.Discord', 'snap.discord']) {
    for (const i of ids) {
      paths.push(path.join(env.XDG_RUNTIME_DIR, sub, `discord-ipc-${i}`));
    }
  }
  return paths;
}

/* ------------------------------------------------------------------ *
 * Checking the activity
 * ------------------------------------------------------------------ */

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

function text(value, minLength = 2, max = MAX_TEXT) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  // Discord rejects texts shorter than 2 characters; image keys like `c` are allowed.
  if (trimmed.length < minLength) {
    return undefined;
  }
  if (trimmed.length <= max) {
    return trimmed;
  }
  return `${trimmed.slice(0, max - 1)}…`;
}

function sanitizeButtons(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const buttons = [];
  for (const entry of value.slice(0, 2)) {
    if (!isRecord(entry)) {
      continue;
    }
    const label = text(entry.label, 1, MAX_BUTTON_LABEL);
    const url = typeof entry.url === 'string' ? entry.url.trim() : '';
    if (!label || !/^https?:\/\//.test(url) || url.length > MAX_BUTTON_URL) {
      continue;
    }
    buttons.push({ label, url });
  }
  return buttons.length ? buttons : undefined;
}

/** Takes only known fields of the right type; `null` on invalid input. */
export function sanitizeActivity(value) {
  if (!isRecord(value)) {
    return null;
  }
  const activity = {};
  const details = text(value.details);
  const state = text(value.state);
  if (details) {
    activity.details = details;
  }
  if (state) {
    activity.state = state;
  }
  if (isRecord(value.timestamps) && typeof value.timestamps.start === 'number' && Number.isFinite(value.timestamps.start)) {
    activity.timestamps = { start: Math.round(value.timestamps.start) };
  }
  const buttons = sanitizeButtons(value.buttons);
  if (buttons) {
    activity.buttons = buttons;
  }
  if (!isRecord(value.assets)) {
    return activity;
  }
  const assets = {};
  for (const key of ['large_image', 'large_text', 'small_image', 'small_text']) {
    const entry = text(value.assets[key], key.endsWith('_image') ? 1 : 2);
    if (entry) {
      assets[key] = entry;
    }
  }
  if (Object.keys(assets).length) {
    activity.assets = assets;
  }
  return activity;
}

/* ------------------------------------------------------------------ *
 * The client
 * ------------------------------------------------------------------ */

/**
 * Status: `{ state: 'disconnected' | 'connecting' | 'connected' | 'error', message?, user? }`.
 *
 * Options: `throttleMs` (15 s), `retryMs` (15 s, doubling up to `maxRetryMs`,
 * 60 s), `handshakeTimeoutMs` (10 s), `socketPaths()` (tests), `onStatus`,
 * `log`, `pid` (the process Discord ties the activity to).
 */
export class DiscordIpcClient {
  constructor(options = {}) {
    this.throttleMs = options.throttleMs ?? 15_000;
    this.retryMs = options.retryMs ?? 15_000;
    this.maxRetryMs = options.maxRetryMs ?? 60_000;
    this.handshakeTimeoutMs = options.handshakeTimeoutMs ?? 10_000;
    this.socketPaths = options.socketPaths ?? (() => defaultSocketPaths());
    this.onStatus = options.onStatus ?? (() => {});
    this.log = options.log ?? ((message) => console.warn(`[discord] ${message}`));
    this.pid = options.pid ?? process.pid;

    this.clientId = '';
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.ready = false;
    /** The activity wanted; `undefined` means show nothing and do not connect. */
    this.pending = undefined;
    this.lastSentJson = null;
    this.lastSentAt = 0;
    this.nextRetryMs = this.retryMs;
    this.retryTimer = null;
    this.throttleTimer = null;
    this.handshakeTimer = null;
    this.current = { state: 'disconnected' };
    /** The error last reported — the same message reaches the log only once. */
    this.lastLogged = '';
    /** A count of the connection attempts — stale attempts discard their result. */
    this.attempt = 0;
    this.connecting = false;
  }

  status() {
    return this.current;
  }

  /**
   * Set the activity for an application. Without a client id, or with `null`,
   * the display is cleared and the connection ended.
   */
  update(clientId, activity) {
    const id = String(clientId ?? '').trim();
    if (!id || activity === null) {
      this.stop();
      return;
    }
    if (id !== this.clientId) {
      this.stop();
      this.clientId = id;
    }
    this.pending = activity;
    if (this.socket) {
      this.flush();
      return;
    }
    if (this.retryTimer || this.connecting) {
      return;
    }
    this.connect();
  }

  /** Reconnect at once (the “Reconnect” command), resetting the wait. */
  reconnect() {
    this.nextRetryMs = this.retryMs;
    this.clearRetry();
    this.dropSocket();
    if (!this.clientId || !this.pending) {
      this.setStatus({ state: 'disconnected' });
      return;
    }
    this.connect();
  }

  /** Clear the display and close the connection; no further attempt. */
  stop() {
    this.pending = undefined;
    this.clearRetry();
    this.clearThrottle();
    const socket = this.socket;
    if (socket && this.ready && !socket.destroyed) {
      // Clearing passes the throttle by — we are finished afterwards anyway.
      socket.end(encodeFrame(OP_FRAME, { cmd: 'SET_ACTIVITY', args: { pid: this.pid, activity: null }, nonce: randomUUID() }));
    }
    this.dropSocket();
    this.nextRetryMs = this.retryMs;
    this.setStatus({ state: 'disconnected' });
  }

  /* -------------------------------------------------- */

  setStatus(status) {
    const same = status.state === this.current.state && status.message === this.current.message && status.user === this.current.user;
    this.current = status;
    if (same) {
      return;
    }
    this.onStatus(status);
  }

  logOnce(message) {
    if (message === this.lastLogged) {
      return;
    }
    this.lastLogged = message;
    this.log(message);
  }

  clearRetry() {
    if (!this.retryTimer) {
      return;
    }
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  clearThrottle() {
    if (!this.throttleTimer) {
      return;
    }
    clearTimeout(this.throttleTimer);
    this.throttleTimer = null;
  }

  clearHandshake() {
    if (!this.handshakeTimer) {
      return;
    }
    clearTimeout(this.handshakeTimer);
    this.handshakeTimer = null;
  }

  /** Discard the socket without another attempt. */
  dropSocket() {
    this.attempt++;
    this.connecting = false;
    this.clearHandshake();
    this.clearThrottle();
    const socket = this.socket;
    this.socket = null;
    this.ready = false;
    this.buffer = Buffer.alloc(0);
    if (!socket) {
      return;
    }
    socket.removeAllListeners();
    // Do not let late errors of the discarded socket throw as unhandled.
    socket.on('error', () => {});
    if (!socket.destroyed && !socket.writableEnded) {
      socket.destroy();
    }
  }

  connect() {
    this.clearRetry();
    this.connecting = true;
    this.setStatus({ state: 'connecting' });
    this.tryPath(this.socketPaths(), 0, ++this.attempt);
  }

  tryPath(paths, index, attempt) {
    if (attempt !== this.attempt || !this.pending || !this.clientId) {
      return;
    }
    if (index >= paths.length) {
      // Discord is not running — quietly try again later.
      this.connecting = false;
      this.setStatus({ state: 'disconnected' });
      this.scheduleRetry();
      return;
    }
    const socket = createConnection(paths[index]);
    const fail = () => {
      socket.removeAllListeners();
      socket.on('error', () => {});
      socket.destroy();
      this.tryPath(paths, index + 1, attempt);
    };
    socket.once('error', fail);
    socket.once('connect', () => {
      socket.off('error', fail);
      this.attach(socket, attempt);
    });
  }

  attach(socket, attempt) {
    if (attempt !== this.attempt || !this.pending || !this.clientId) {
      socket.on('error', () => {});
      socket.destroy();
      return;
    }
    this.connecting = false;
    this.socket = socket;
    this.ready = false;
    this.buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => this.receive(socket, chunk));
    socket.on('error', (err) => {
      if (socket !== this.socket) {
        return;
      }
      this.logOnce(err.message);
    });
    socket.on('close', () => {
      if (socket !== this.socket) {
        return;
      }
      this.dropSocket();
      if (this.current.state !== 'error') {
        this.setStatus({ state: 'disconnected' });
      }
      this.scheduleRetry();
    });
    this.handshakeTimer = setTimeout(() => {
      this.handshakeTimer = null;
      if (socket !== this.socket || this.ready) {
        return;
      }
      this.setStatus({ state: 'error', message: 'Handshake timeout' });
      socket.destroy();
    }, this.handshakeTimeoutMs);
    socket.write(encodeFrame(OP_HANDSHAKE, { v: 1, client_id: this.clientId }));
  }

  scheduleRetry() {
    if (this.retryTimer || !this.pending || !this.clientId) {
      return;
    }
    const wait = this.nextRetryMs;
    this.nextRetryMs = Math.min(this.nextRetryMs * 2, this.maxRetryMs);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, wait);
  }

  receive(socket, chunk) {
    if (socket !== this.socket) {
      return;
    }
    const { frames, rest } = decodeFrames(Buffer.concat([this.buffer, chunk]));
    this.buffer = rest;
    if (rest.length > MAX_BUFFER) {
      socket.destroy();
      return;
    }
    for (const frame of frames) {
      if (socket !== this.socket) {
        return;
      }
      this.handleFrame(socket, frame.op, frame.data);
    }
  }

  handleFrame(socket, op, data) {
    if (op === OP_PING) {
      socket.write(encodeFrame(OP_PONG, data));
      return;
    }
    if (op === OP_CLOSE) {
      const message = isRecord(data) && typeof data.message === 'string' ? data.message : 'Closed by Discord';
      this.logOnce(message);
      this.setStatus({ state: 'error', message });
      socket.destroy();
      return;
    }
    if (op !== OP_FRAME || !isRecord(data)) {
      return;
    }
    if (data.cmd === 'DISPATCH' && data.evt === 'READY') {
      this.onReady(data.data);
      return;
    }
    if (data.evt !== 'ERROR') {
      return;
    }
    const message = isRecord(data.data) && typeof data.data.message === 'string' ? data.data.message : 'Discord error';
    this.logOnce(message);
    this.setStatus({ ...this.current, message });
  }

  onReady(payload) {
    this.clearHandshake();
    this.ready = true;
    this.nextRetryMs = this.retryMs;
    this.lastLogged = '';
    // Discord forgets the activity along with the connection — send it again.
    this.lastSentJson = null;
    const user = isRecord(payload) && isRecord(payload.user) ? payload.user : null;
    const name = user && typeof user.global_name === 'string' ? user.global_name : user?.username;
    this.setStatus({ state: 'connected', user: typeof name === 'string' ? name : undefined });
    this.flush();
  }

  flush() {
    if (!this.ready || !this.socket || !this.pending) {
      return;
    }
    const json = JSON.stringify(this.pending);
    if (json === this.lastSentJson) {
      return;
    }
    const wait = this.lastSentAt + this.throttleMs - Date.now();
    if (wait > 0) {
      if (this.throttleTimer) {
        return;
      }
      this.throttleTimer = setTimeout(() => {
        this.throttleTimer = null;
        this.flush();
      }, wait);
      return;
    }
    this.lastSentJson = json;
    this.lastSentAt = Date.now();
    this.socket.write(
      encodeFrame(OP_FRAME, {
        cmd: 'SET_ACTIVITY',
        args: { pid: this.pid, activity: this.pending },
        nonce: randomUUID(),
      }),
    );
  }
}
