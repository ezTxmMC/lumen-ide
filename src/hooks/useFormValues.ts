/**
 * The values of a form: typed input over defaults, with fetched choices.
 *
 * Owns a `ChoiceLoader` per `scope` (a template id, a form spec): whenever the
 * resolved values change, the loader starts what they call for, and each
 * arriving list resolves the values again — which is how a dependent field
 * reloads once the field it depends on has settled.
 */

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { ChoiceLoader, type LoadedChoices } from '@/core/project/choices'
import { resolveValues } from '@/core/project/scaffold'
import type { FormField, FormValues } from '@/core/types'

export interface FormValuesState {
  values: FormValues
  loaded: LoadedChoices
  retry: (id: string) => void
}

export function useFormValues(
  fields: FormField[], base: FormValues, touched: FormValues, scope: unknown,
): FormValuesState {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new scope means a new form
  const loader = useMemo(() => new ChoiceLoader(), [scope])
  useEffect(() => () => loader.dispose(), [loader])
  const loaded = useSyncExternalStore(loader.subscribe, loader.snapshot)
  const baseKey = JSON.stringify(base)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `base` compared by content
  const values = useMemo(() => resolveValues(fields, base, touched, loaded), [fields, baseKey, touched, loaded])

  useEffect(() => {
    loader.sync(fields, values)
  }, [loader, fields, values])

  return { values, loaded, retry: loader.retry }
}
