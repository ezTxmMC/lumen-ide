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
export const ID_PATTERN = /^(?:ext|user)\.[a-z0-9][a-z0-9._-]{0,63}$/

/** A semantic version, optionally with a prerelease tag (`1.2.0-beta.1`). */
export const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** A manifest larger than this the server does not accept. */
export const MAX_MANIFEST_BYTES = 6 * 1024 * 1024

const CATEGORIES = new Set(['language', 'theme', 'tool'])
const SETTING_TYPES = new Set(['text', 'number', 'toggle', 'select', 'multiselect', 'list', 'textarea', 'path', 'color', 'secret'])
const PAGE_FORMATS = new Set(['markdown', 'html'])
const PAGE_LOCATIONS = new Set(['sidebar', 'left', 'right', 'bottom', 'editor'])
const VIEW_LOCATIONS = new Set(['left', 'right', 'bottom'])
/** A view may also be a tab in the editor area, opened by its code. */
const CODE_VIEW_LOCATIONS = new Set([...VIEW_LOCATIONS, 'editor'])
const LOCAL_ID = /^[a-z][a-z0-9.-]{0,63}$/

/** The bundled program code of an extension may not be larger than this. */
export const MAX_CODE_CHARS = 3 * 1024 * 1024

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

const LANGUAGE_KEY = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/

/**
 * `i18n: { en: { label: '…' }, fr: { … } }` — the same texts in other
 * interface languages. `limits` names each allowed text field with its length.
 */
function checkI18n(value, where, limits, { choices = false } = {}) {
  if (value === undefined) return
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${where}.i18n muss ein Objekt sein`, `${where}.i18n`)
  const languages = Object.keys(value)
  if (languages.length > 32) fail(`${where}.i18n hat mehr als 32 Sprachen`, `${where}.i18n`)
  for (const language of languages) {
    const field = `${where}.i18n.${language}`
    if (!LANGUAGE_KEY.test(language)) fail(`${field} — unbekanntes Sprachkürzel`, field)
    const texts = value[language]
    if (!texts || typeof texts !== 'object' || Array.isArray(texts)) fail(`${field} muss ein Objekt sein`, field)
    for (const key of Object.keys(texts)) {
      if (key === 'choices' && choices) continue
      if (!(key in limits)) fail(`${field}.${key} ist hier nicht übersetzbar`, `${field}.${key}`)
      text(texts[key], `${field}.${key}`, { max: limits[key] })
    }
    if (texts.choices === undefined) continue
    if (!texts.choices || typeof texts.choices !== 'object' || Array.isArray(texts.choices)) fail(`${field}.choices muss ein Objekt sein`, `${field}.choices`)
    for (const [choice, label] of Object.entries(texts.choices)) text(label, `${field}.choices.${choice}`, { max: 120 })
  }
}

function checkSetting(setting, index) {
  const where = `settings[${index}]`
  if (!setting || typeof setting !== 'object') fail(`${where} muss ein Objekt sein`, where)
  const key = text(setting.key, `${where}.key`, { max: 64, required: true })
  if (!/^[a-z][a-zA-Z0-9]*$/.test(key)) fail(`${where}.key muss mit einem Kleinbuchstaben beginnen und darf nur Buchstaben und Ziffern enthalten`, `${where}.key`)
  text(setting.label, `${where}.label`, { max: 120, required: true })
  text(setting.hint, `${where}.hint`, { max: 400 })
  text(setting.section, `${where}.section`, { max: 80 })
  text(setting.when, `${where}.when`, { max: 120 })
  text(setting.placeholder, `${where}.placeholder`, { max: 200 })
  for (const field of ['min', 'max', 'step', 'rows']) {
    if (setting[field] !== undefined && typeof setting[field] !== 'number') fail(`${where}.${field} muss eine Zahl sein`, `${where}.${field}`)
  }
  if (setting.pathKind !== undefined && setting.pathKind !== 'file' && setting.pathKind !== 'folder') {
    fail(`${where}.pathKind muss file oder folder sein`, `${where}.pathKind`)
  }
  const type = setting.type ?? 'text'
  if (!SETTING_TYPES.has(type)) fail(`${where}.type muss eines von ${[...SETTING_TYPES].join(', ')} sein`, `${where}.type`)
  if (type === 'secret' && setting.default) fail(`${where}.default — ein Geheimnis hat keinen Vorgabewert`, `${where}.default`)
  checkI18n(setting.i18n, where, { label: 120, hint: 400, section: 80, placeholder: 200 }, { choices: true })
  if (type !== 'select' && type !== 'multiselect') return key
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
  if (!PAGE_LOCATIONS.has(location)) fail(`${where}.location muss eines von ${[...PAGE_LOCATIONS].join(', ')} sein`, `${where}.location`)
  text(page.content, `${where}.content`, { max: 512 * 1024, required: true })
  return id
}

function checkAgent(agent, index) {
  const where = `agents[${index}]`
  if (!agent || typeof agent !== 'object') fail(`${where} muss ein Objekt sein`, where)
  const id = text(agent.id, `${where}.id`, { max: 64, required: true })
  if (!/^[a-z][a-z0-9-]*$/.test(id)) fail(`${where}.id darf nur Kleinbuchstaben, Ziffern und Bindestriche enthalten`, `${where}.id`)
  text(agent.name, `${where}.name`, { max: 80, required: true })
  text(agent.description, `${where}.description`, { max: 300 })
  text(agent.icon, `${where}.icon`, { max: 64 })
  text(agent.placeholder, `${where}.placeholder`, { max: 200 })
  const modes = list(agent.modes, `${where}.modes`, { max: 8 })
  const modeIds = modes.map((mode, i) => {
    const modeId = text(mode?.id, `${where}.modes[${i}].id`, { max: 64, required: true })
    text(mode?.label, `${where}.modes[${i}].label`, { max: 60, required: true })
    text(mode?.description, `${where}.modes[${i}].description`, { max: 200 })
    return modeId
  })
  requireUnique(modeIds, `${where}.modes.id`)
  const models = list(agent.models, `${where}.models`, { max: 32 })
  requireUnique(models.map((model, i) => {
    const modelId = text(model?.id, `${where}.models[${i}].id`, { max: 120, required: true })
    text(model?.label, `${where}.models[${i}].label`, { max: 80, required: true })
    text(model?.description, `${where}.models[${i}].description`, { max: 200 })
    const efforts = list(model?.efforts, `${where}.models[${i}].efforts`, { max: 12 })
    requireUnique(efforts.map((effort, j) => {
      const effortId = text(effort?.id, `${where}.models[${i}].efforts[${j}].id`, { max: 32, required: true })
      text(effort?.label, `${where}.models[${i}].efforts[${j}].label`, { max: 60 })
      text(effort?.description, `${where}.models[${i}].efforts[${j}].description`, { max: 200 })
      return effortId
    }), `${where}.models[${i}].efforts.id`)
    text(model?.defaultEffort, `${where}.models[${i}].defaultEffort`, { max: 32 })
    if (model?.isDefault !== undefined && typeof model.isDefault !== 'boolean') fail(`${where}.models[${i}].isDefault muss true oder false sein`, `${where}.models[${i}].isDefault`)
    return modelId
  }), `${where}.models.id`)
  text(agent.modelSetting, `${where}.modelSetting`, { max: 64 })
  if (agent.location !== undefined && !VIEW_LOCATIONS.has(agent.location)) fail(`${where}.location muss left, right oder bottom sein`, `${where}.location`)
  list(agent.suggestions, `${where}.suggestions`, { max: 12 }).forEach((entry, i) => text(entry, `${where}.suggestions[${i}]`, { max: 200, required: true }))
  if (agent.images !== undefined && typeof agent.images !== 'boolean') fail(`${where}.images muss true oder false sein`, `${where}.images`)
  return id
}

function checkView(view, index) {
  const where = `views[${index}]`
  if (!view || typeof view !== 'object') fail(`${where} muss ein Objekt sein`, where)
  const id = text(view.id, `${where}.id`, { max: 64, required: true })
  if (!LOCAL_ID.test(id)) fail(`${where}.id darf nur Kleinbuchstaben, Ziffern, Punkt und Bindestrich enthalten`, `${where}.id`)
  text(view.title, `${where}.title`, { max: 80, required: true })
  checkI18n(view.i18n, where, { title: 80 })
  text(view.icon, `${where}.icon`, { max: 64 })
  if (view.location !== undefined && !CODE_VIEW_LOCATIONS.has(view.location)) fail(`${where}.location muss left, right, bottom oder editor sein`, `${where}.location`)
  if (view.order !== undefined && typeof view.order !== 'number') fail(`${where}.order muss eine Zahl sein`, `${where}.order`)
  return id
}

function checkCommand(command, index) {
  const where = `commands[${index}]`
  if (!command || typeof command !== 'object') fail(`${where} muss ein Objekt sein`, where)
  const id = text(command.id, `${where}.id`, { max: 64, required: true })
  if (!LOCAL_ID.test(id)) fail(`${where}.id darf nur Kleinbuchstaben, Ziffern, Punkt und Bindestrich enthalten`, `${where}.id`)
  text(command.title, `${where}.title`, { max: 120, required: true })
  text(command.category, `${where}.category`, { max: 60 })
  text(command.keybinding, `${where}.keybinding`, { max: 60 })
  text(command.icon, `${where}.icon`, { max: 64 })
  checkI18n(command.i18n, where, { title: 120, category: 60 })
  return id
}

/**
 * Program code, run once the user has approved it: `main` in Lumen's main
 * process, `renderer` in its window (an add-on with computed templates and
 * project kinds). At least one of the two.
 */
function checkCode(code) {
  if (code === undefined) return undefined
  if (!code || typeof code !== 'object' || Array.isArray(code)) fail('code muss ein Objekt sein', 'code')
  const main = text(code.main, 'code.main', { max: MAX_CODE_CHARS })
  const renderer = text(code.renderer, 'code.renderer', { max: MAX_CODE_CHARS })
  if (!main && !renderer) fail('code braucht main oder renderer', 'code')
  return { ...(main ? { main } : {}), ...(renderer ? { renderer } : {}) }
}

/** A kind of file the extension opens itself: a command of its own and name patterns (`*.db`). */
function checkOpenWith(entry, index, commandIds) {
  const where = `openWith[${index}]`
  if (!entry || typeof entry !== 'object') fail(`${where} muss ein Objekt sein`, where)
  const command = text(entry.command, `${where}.command`, { max: 64, required: true })
  if (!commandIds.includes(command)) fail(`${where}.command „${command}“ steht nicht unter commands`, `${where}.command`)
  const title = text(entry.title, `${where}.title`, { max: 80, required: true })
  checkI18n(entry.i18n, where, { title: 80 })
  const patterns = list(entry.patterns, `${where}.patterns`, { max: 32 })
  if (!patterns.length) fail(`${where}.patterns fehlt`, `${where}.patterns`)
  patterns.forEach((pattern, i) => {
    text(pattern, `${where}.patterns[${i}]`, { max: 64, required: true })
    if (pattern.slice(1).includes('*') || /[\\/]/.test(pattern)) fail(`${where}.patterns[${i}] — nur ein führendes * und ein Dateiname`, `${where}.patterns[${i}]`)
  })
  return { command, title, patterns, ...(entry.i18n ? { i18n: entry.i18n } : {}) }
}

/** The oldest Lumen the extension needs: a version number such as `0.5.0`. */
function checkMinAppVersion(value) {
  const version = text(value, 'minAppVersion', { max: 32 })
  if (version !== undefined && !/^\d+(\.\d+){0,2}(-[\w.]+)?$/.test(version)) {
    fail('minAppVersion muss eine Versionsnummer sein, etwa 0.5.0', 'minAppVersion')
  }
  return version
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
  if (!ID_PATTERN.test(id)) fail('id muss mit „ext.“ oder „user.“ beginnen und darf nur Kleinbuchstaben, Ziffern, Punkt, Bindestrich und Unterstrich enthalten', 'id')

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

  const agents = list(raw.agents, 'agents', { max: 8 })
  requireUnique(agents.map(checkAgent), 'agents.id')
  const views = list(raw.views, 'views', { max: 16 })
  requireUnique(views.map(checkView), 'views.id')
  const commands = list(raw.commands, 'commands', { max: 128 })
  const commandIds = commands.map(checkCommand)
  requireUnique(commandIds, 'commands.id')
  const openWith = list(raw.openWith, 'openWith', { max: 16 }).map((entry, index) => checkOpenWith(entry, index, commandIds))
  const code = checkCode(raw.code)
  if (agents.length && !code?.main) fail('agents braucht code.main — ohne Programmcode gibt es keinen Agenten', 'code')
  if (views.length && !code?.main) fail('views braucht code.main — ohne Programmcode hat eine Ansicht keinen Inhalt', 'code')
  if (commands.length && !code?.main) fail('commands braucht code.main — ohne Programmcode tut ein Befehl nichts', 'code')

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
    minAppVersion: checkMinAppVersion(raw.minAppVersion),
    keywords,
    readme: text(raw.readme, 'readme', { max: 512 * 1024 }) ?? '',
    settings,
    pages,
    agents,
    views,
    commands,
    ...(openWith.length ? { openWith } : {}),
    ...(code ? { code } : {}),
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
