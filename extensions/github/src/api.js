/**
 * The GitHub REST API, from the main process.
 *
 * The token comes from the extension's secret (`token`, set under
 * *Settings → Extensions* or with *GitHub: Sign in*); without one, the token
 * of the GitHub CLI (`gh auth token`) is used when `gh` is installed.
 */

import { hostsOf } from './remote.js'

const API_VERSION = '2022-11-28'
const TIMEOUT_MS = 20_000

/** A failed request; `kind` says what the views should offer. */
export class ApiError extends Error {
  constructor(message, status, kind) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.kind = kind
  }
}

/** The kind of a failure, by status and headers. */
function failureKind(response) {
  if (response.status === 401) return 'auth'
  const remaining = response.headers.get('x-ratelimit-remaining')
  if ((response.status === 403 || response.status === 429) && remaining === '0') return 'rateLimit'
  if (response.status === 404) return 'notFound'
  return 'other'
}

/** A response body as JSON; an HTML error page from a proxy becomes `null`. */
function parseJson(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export function createApi(ctx, t) {
  let cachedToken = null
  let cachedUser = null

  const hosts = () => hostsOf((ctx.settings.get('apiUrl') ?? '').trim() || undefined)

  async function ghToken() {
    const host = hosts().host
    const result = await ctx.exec('gh', ['auth', 'token', '--hostname', host], { timeoutMs: 10_000 }).catch(() => null)
    if (!result || result.code !== 0) return null
    return result.stdout.trim() || null
  }

  /** The token to use, and where it came from; cached until the settings change. */
  async function token() {
    if (cachedToken) return cachedToken
    const own = await ctx.secrets.get('token').catch(() => undefined)
    if (own) {
      cachedToken = { value: own, source: 'secret' }
      return cachedToken
    }
    if (ctx.settings.get('useGhCli') === 'false') return null
    const fromGh = await ghToken()
    if (!fromGh) return null
    cachedToken = { value: fromGh, source: 'gh' }
    return cachedToken
  }

  async function request(method, route, body, { auth = true, tokenOverride } = {}) {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VERSION,
      'User-Agent': 'Lumen-IDE-GitHub',
    }
    const credential = tokenOverride ?? (auth ? (await token())?.value : undefined)
    if (credential) headers.Authorization = `Bearer ${credential}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let response
    try {
      response = await fetch(`${hosts().api}${route}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (err) {
      throw new ApiError(t('error.network', { message: err.name === 'AbortError' ? t('error.timeout') : err.message }), 0, 'network')
    } finally {
      clearTimeout(timer)
    }
    if (response.status === 204) return null
    const text = await response.text()
    const data = parseJson(text)
    if (response.ok) return data
    const kind = failureKind(response)
    if (kind === 'rateLimit') {
      const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000
      throw new ApiError(t('error.rateLimit', { time: new Date(reset).toLocaleTimeString(ctx.locale()) }), response.status, kind)
    }
    const detail = data?.errors?.map((entry) => entry.message ?? entry.code).filter(Boolean).join('; ')
    throw new ApiError([data?.message ?? `HTTP ${response.status}`, detail].filter(Boolean).join(' — '), response.status, kind)
  }

  return {
    hosts,
    token,
    get: (route) => request('GET', route),
    post: (route, body) => request('POST', route, body ?? {}),
    patch: (route, body) => request('PATCH', route, body),
    put: (route, body) => request('PUT', route, body ?? {}),
    /** Check a token before storing it; returns the account. */
    verify: (value) => request('GET', '/user', undefined, { tokenOverride: value }),
    async user() {
      if (cachedUser) return cachedUser
      if (!(await token())) return null
      cachedUser = await request('GET', '/user')
      return cachedUser
    },
    /** Forget the token and the account — after signing in or out. */
    reset() {
      cachedToken = null
      cachedUser = null
    },
  }
}
