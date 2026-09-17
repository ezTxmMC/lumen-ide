/**
 * Checking an extension manifest.
 *
 * The server accepts only what it can also describe: the catalogue and the
 * project pages are built from the same fields. The check happens here by
 * design rather than in Lumen — a manifest the server accepts must work out in
 * every client, an older one included.
 *
 * Deliberately without a dependency on Lumen's source: the server runs on its
 * own, often on another machine and in another version. It checks the shell —
 * the id, the version, the size, the rough shape — and does not touch the
 * contents of the add-on. What stands in there Lumen checks once more itself
 * before loading it.
 */

/** The version of the manifest format this server understands. */
export const MANIFEST_SCHEMA = 1

/** Ids: `ext.` for server extensions, `user.` for ones built by hand. */
export const ID_PATTERN = /^ext\.[a-z0-9][a-z0-9._-]{0,63}$/

/** A semantic version, optionally with a prerelease tag (`1.2.0-beta.1`). */
export const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** A manifest larger than this the server does not accept. */
export const MAX_MANIFEST_BYTES = 4 * 1024 * 1024

const CATEGORIES = new Set(['language', 'theme', 'tool'])
const SETTING_TYPES = new Set(['text', 'number', 'toggle', 'select'])
const PAGE_FORMATS = new Set(['markdown', 'html'])
const PAGE_LOCATIONS = new Set(['sidebar', 'editor'])

export class ManifestError extends Error {
  constructor(message, field) {
    super(message)
    this.name = 'ManifestError'
    this.field = field
  }
}

const fail = (message, field) => { throw new ManifestError(message, field) }

function text(value, field, { max = 200, required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) fail(`${field} fehlt`, field)
    return undefined
  }
  if (typeof value !== 'string') fail(`${field} muss Text sein`, field)
  if (value.length > max) fail(`${field} ist länger als ${max} Zeichen`, field)
  return value
}

function list(value, field, { max = 64 } = {}) {
  if (value === undefined) return []
  if (!Array.isArray(value)) fail(`${field} muss eine Liste sein`, field)
  if (value.length > max) fail(`${field} hat mehr als ${max} Einträge`, field)
  return value
}

/** `https:` only — and `http:` for local servers during development alone. */
function link(value, field) {
  const raw = text(value, field, { max: 500 })
  if (!raw) return undefined
  let url
  try {
    url = new URL(raw)
  } catch {
    fail(`${field} ist keine gültige Adresse`, field)
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    fail(`${field} muss über https laufen`, field)
  }
  return raw
}

function checkSetting(setting, index) {
  const where = `settings[${index}]`
  if (!setting || typeof setting !== 'object') fail(`${where} muss ein Objekt sein`, where)
  const key = text(setting.key, `${where}.key`, { max: 64, required: true })
  if (!/^[a-z][a-zA-Z0-9]*$/.test(key)) fail(`${where}.key muss mit einem Kleinbuchstaben beginnen und darf nur Buchstaben und Ziffern enthalten`, `${where}.key`)
  text(setting.label, `${where}.label`, { max: 120, required: true })
  text(setting.hint, `${where}.hint`, { max: 400 })
  const type = setting.type ?? 'text'
  if (!SETTING_TYPES.has(type)) fail(`${where}.type muss eines von ${[...SETTING_TYPES].join(', ')} sein`, `${where}.type`)
  if (type !== 'select') return key
  const choices = list(setting.choices, `${where}.choices`, { max: 128 })
  if (!choices.length) fail(`${where}.choices fehlt — eine Auswahl braucht Einträge`, `${where}.choices`)
  choices.forEach((choice, i) => {
    text(choice?.value, `${where}.choices[${i}].value`, { max: 120, required: true })
    text(choice?.label, `${where}.choices[${i}].label`, { max: 120, required: true })
  })
  return key
}

function checkPage(page, index) {
  const where = `pages[${index}]`
  if (!page || typeof page !== 'object') fail(`${where} muss ein Objekt sein`, where)
  const id = text(page.id, `${where}.id`, { max: 64, required: true })
  if (!/^[a-z][a-z0-9-]*$/.test(id)) fail(`${where}.id darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten`, `${where}.id`)
  text(page.title, `${where}.title`, { max: 120, required: true })
  text(page.icon, `${where}.icon`, { max: 64 })
  const format = page.format ?? 'markdown'
  if (!PAGE_FORMATS.has(format)) fail(`${where}.format muss markdown oder html sein`, `${where}.format`)
  const location = page.location ?? 'editor'
  if (!PAGE_LOCATIONS.has(location)) fail(`${where}.location muss sidebar oder editor sein`, `${where}.location`)
  text(page.content, `${where}.content`, { max: 512 * 1024, required: true })
  return id
}

/** Report duplicate ids in a list. */
function requireUnique(ids, what) {
  const seen = new Set()
  for (const id of ids) {
    if (seen.has(id)) fail(`${what} „${id}“ kommt mehrfach vor`, what)
    seen.add(id)
  }
}

/**
 * Check a manifest and return it in the shape in which it is stored.
 *
 * Throws `ManifestError` naming the field concerned — the caller turns that
 * into an answer telling the publisher what to change.
 */
export function checkManifest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Manifest muss ein Objekt sein')
  if (raw.schema !== MANIFEST_SCHEMA) {
    fail(`schema muss ${MANIFEST_SCHEMA} sein (gelesen: ${JSON.stringify(raw.schema)})`, 'schema')
  }

  const id = text(raw.id, 'id', { max: 64, required: true })
  if (!ID_PATTERN.test(id)) fail('id muss mit „ext.“ beginnen und darf nur Kleinbuchstaben, Ziffern, Punkt, Bindestrich und Unterstrich enthalten', 'id')

  const version = text(raw.version, 'version', { max: 64, required: true })
  if (!VERSION_PATTERN.test(version)) fail('version muss der Form 1.2.3 folgen', 'version')

  const name = text(raw.name, 'name', { max: 80, required: true })
  const category = raw.category ?? 'tool'
  if (!CATEGORIES.has(category)) fail(`category muss eines von ${[...CATEGORIES].join(', ')} sein`, 'category')

  const addon = raw.addon
  if (!addon || typeof addon !== 'object' || Array.isArray(addon)) fail('addon fehlt — darin steht, was die Erweiterung mitbringt', 'addon')
  if (addon.id !== id) fail('addon.id muss der id der Erweiterung entsprechen', 'addon.id')
  if (addon.version !== version) fail('addon.version muss der version der Erweiterung entsprechen', 'addon.version')

  const settings = list(raw.settings, 'settings', { max: 64 })
  requireUnique(settings.map(checkSetting), 'settings.key')

  const pages = list(raw.pages, 'pages', { max: 16 })
  requireUnique(pages.map(checkPage), 'pages.id')

  const keywords = list(raw.keywords, 'keywords', { max: 16 })
  keywords.forEach((word, i) => text(word, `keywords[${i}]`, { max: 40, required: true }))

  return {
    schema: MANIFEST_SCHEMA,
    id,
    name,
    version,
    category,
    description: text(raw.description, 'description', { max: 300 }) ?? '',
    author: text(raw.author, 'author', { max: 120}) ?? '',
    icon: text(raw.icon, 'icon', { max: 64 }) ?? name.slice(0, 2),
    color: text(raw.color, 'color', { max: 32 }) ?? '#7c8cff',
    license: text(raw.license, 'license', { max: 64 }),
    homepage: link(raw.homepage, 'homepage'),
    repository: link(raw.repository, 'repository'),
    minAppVersion: text(raw.minAppVersion, 'minAppVersion', { max: 32 }),
    keywords,
    readme: text(raw.readme, 'readme', { max: 512 * 1024 }) ?? '',
    settings,
    pages,
    addon,
  }
}

/** Descending by version: `2.0.0` before `1.9.0` before `1.9.0-beta.1`. */
export function compareVersions(a, b) {
  const [coreA, preA = ''] = String(a).split('-', 2)
  const [coreB, preB = ''] = String(b).split('-', 2)
  const partsA = coreA.split('.').map(Number)
  const partsB = coreB.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (partsB[i] || 0) - (partsA[i] || 0)
    if (diff !== 0) return diff
  }
  // A prerelease comes after the finished version of the same number.
  if (preA === preB) return 0
  if (!preA) return -1
  if (!preB) return 1
  return preA < preB ? 1 : -1
}
