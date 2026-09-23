/**
 * What the approval hash of an extension's program code is taken over.
 *
 * The user approves the code once and the SHA-256 is pinned; the main process
 * checks it again before saving and at every start. Main-process code alone
 * hashes as the plain module — as it always did, so approvals made before the
 * renderer part existed stay valid. With a renderer part both go in, in a
 * fixed shape. Shared by the renderer (`src/core/extensions/manager.ts`) and
 * the main process (`index.ts`), so both compute the same.
 */

export interface CodeParts {
  main?: string
  renderer?: string
}

export function codeHashInput(code: CodeParts): string {
  if (!code.renderer) return code.main ?? ''
  return JSON.stringify({ main: code.main ?? '', renderer: code.renderer })
}
