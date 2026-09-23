/**
 * Errors the extension explains itself: `code` names a text under `error.`
 * in the translations, `params` fill it in. Anything else a driver throws
 * (the server's own message) is shown as it is.
 */
export class DriverError extends Error {
  constructor(code, params = {}) {
    super(code)
    this.name = 'DriverError'
    this.code = code
    this.params = params
  }
}

/** The text for an error, in the interface language. */
export function errorText(t, err) {
  if (err instanceof DriverError) return t(`error.${err.code}`, err.params)
  const message = err?.message || String(err)
  // Aggregate errors (a host with several addresses) carry the useful part inside.
  if (!message && Array.isArray(err?.errors) && err.errors.length) return errorText(t, err.errors[0])
  return message || t('error.unknown')
}
