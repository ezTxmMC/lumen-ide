/** The running Lumen's version, read once at startup — extension compatibility is decided against it. */

let current = '0.0.0'

export const appVersion = () => current

export async function loadAppVersion(): Promise<string> {
  const info = await window.lumen.app.info().catch(() => null)
  if (info?.version) current = info.version
  return current
}
