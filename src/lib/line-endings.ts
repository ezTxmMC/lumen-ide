/**
 * Line endings between disk and editor.
 *
 * The editor only knows "\n": CodeMirror splits on \r\n as well and joins
 * with \n. Handing it a CRLF file as is made the tab's content differ from
 * its saved text the moment the editor touched it — the tab showed as edited,
 * saving quietly turned the file into LF, and changes on disk (an agent's
 * edit) were held back as a conflict instead of reloading. So tabs hold LF
 * text, remember the file's ending, and write it back the way it was.
 */

export type LineEnding = '\n' | '\r\n'

/** Split a file's text into LF text and the ending it uses (the majority, for mixed files). */
export function fromDisk(raw: string): { text: string; eol: LineEnding } {
  if (!raw.includes('\r')) return { text: raw, eol: '\n' }
  const crlf = raw.match(/\r\n/g)?.length ?? 0
  const lf = (raw.match(/\n/g)?.length ?? 0) - crlf
  return { text: raw.replace(/\r\n?/g, '\n'), eol: crlf > lf ? '\r\n' : '\n' }
}

/** The text to write for a tab: LF text in the file's own line ending. */
export function toDisk(text: string, eol: LineEnding | undefined): string {
  if (eol !== '\r\n') return text
  return text.replace(/\r?\n/g, '\r\n')
}

/** Read a file for a tab: LF text plus the file's line ending. */
export async function readText(path: string): Promise<{ text: string; eol: LineEnding }> {
  return fromDisk(await window.lumen.fs.readFile(path))
}
