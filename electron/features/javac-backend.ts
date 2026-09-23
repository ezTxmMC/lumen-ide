/**
 * Reading jdtls' javac backend bundle (`org.eclipse.jdt.core.javac_*.jar`):
 * which JDKs it runs on. Kept apart from `jdtls-support.ts` — no Electron
 * here, so the checks can import it.
 */

import zlib from 'node:zlib'

/** One entry of a zip archive (a jar), or `null` when it is not there. */
export function zipEntry(archive: Buffer, name: string): Buffer | null {
  // The end-of-central-directory record sits in the last 64 KiB + 22 bytes.
  const floor = Math.max(0, archive.length - 65_557)
  let end = -1
  for (let at = archive.length - 22; at >= floor && end < 0; at--) {
    if (archive.readUInt32LE(at) === 0x06054b50) end = at
  }
  if (end < 0) return null
  const count = archive.readUInt16LE(end + 10)
  let at = archive.readUInt32LE(end + 16)
  for (let i = 0; i < count && archive.readUInt32LE(at) === 0x02014b50; i++) {
    const method = archive.readUInt16LE(at + 10)
    const size = archive.readUInt32LE(at + 20)
    const nameLength = archive.readUInt16LE(at + 28)
    const skip = nameLength + archive.readUInt16LE(at + 30) + archive.readUInt16LE(at + 32)
    const local = archive.readUInt32LE(at + 42)
    if (archive.toString('utf8', at + 46, at + 46 + nameLength) === name) {
      const data = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28)
      const raw = archive.subarray(data, data + size)
      if (method === 0) return raw
      if (method === 8) return zlib.inflateRawSync(raw)
      return null
    }
    at += 46 + skip
  }
  return null
}

/** The JDKs a javac backend runs on: from its `Require-Capability` up to the JDK it was built with. */
export interface JavacBackend {
  minJava: number
  buildJava: number
}

/** The range read from the backend bundle's manifest (continuation lines start with a space). */
export function javacBackendRange(manifest: string): JavacBackend | null {
  const text = manifest.replace(/\r?\n /g, '')
  const min = /osgi\.ee=JavaSE\)\(version=(\d+)/.exec(text)
  const build = /^Build-Jdk-Spec:\s*(\d+)/m.exec(text)
  if (!min || !build) return null
  return { minJava: Number(min[1]), buildJava: Number(build[1]) }
}
