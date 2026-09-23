import type { ProjectTemplate } from '../../../../src/core/types'
import { architecturyTemplate } from './architectury'
import { forgeTemplate } from './forge'
import { fabricTemplate, quiltTemplate } from './loom'
import { neoforgeTemplate } from './neoforge'
import { PLUGIN_TEMPLATES } from './plugins'

export const TEMPLATES: ProjectTemplate[] = [
  ...PLUGIN_TEMPLATES,
  fabricTemplate,
  neoforgeTemplate,
  forgeTemplate,
  quiltTemplate,
  architecturyTemplate,
]
