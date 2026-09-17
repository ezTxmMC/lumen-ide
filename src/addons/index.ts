/**
 * The add-on directory.
 *
 * Adding a new add-on = import it and enter it in one of the two lists.
 * Nothing more happens here.
 */

import type { Addon } from '@/core/types'

// Side effect: registers the named tokenizers, so that `"tokenizer":
// "markdown"` and its like resolve for extensions. Anything that compiles
// add-on data outside the app imports the same module directly.
import './lib/builtin-tokenizers'

// Built in — always active, cannot be switched off.
import { themesAddon } from './builtin/themes'
import { iconsAddon } from './builtin/icons'
import { novusAddon } from './builtin/novus'
import { javaAddon } from './builtin/java'
import { htmlAddon } from './builtin/html'
import { cssAddon } from './builtin/css'
import { javascriptAddon } from './builtin/javascript'
import { typescriptAddon } from './builtin/typescript'

// Bundled, active by default, can be switched off at any time.
//
// Only what an extension cannot be: both of these have an `activate()`, and a
// manifest carries data, never code. Everything else that used to stand here —
// the languages, the project kinds and the templates for Go, Rust, PHP,
// Crystal, React, Vue, Angular, Astro, Tailwind, MDX, C, C++, C#, Kotlin,
// Python and the build tools — now comes from an extension server.
import { minecraftAddon } from './extra/minecraft'
import { discordAddon } from './extra/discord'

export const BUILTIN_ADDONS: Addon[] = [
  themesAddon,
  iconsAddon,
  novusAddon,
  javaAddon,
  htmlAddon,
  cssAddon,
  javascriptAddon,
  typescriptAddon,
]

export const BUNDLED_ADDONS: Addon[] = [
  minecraftAddon,
  discordAddon,
]

export const ALL_ADDONS: Addon[] = [...BUILTIN_ADDONS, ...BUNDLED_ADDONS]

/** Bundled, but active only on request (because data goes to a third party, say). */
const OPT_IN = new Set([discordAddon.id])

/** Active on the first start. */
export const DEFAULT_ENABLED = BUNDLED_ADDONS.map((a) => a.id).filter((id) => !OPT_IN.has(id))

/** The fallback when no language fits. */
export const PLAIN_TEXT = {
  id: 'plaintext',
  name: 'Klartext',
  extensions: [],
  icon: '·',
  color: '#8b939f',
} as const
