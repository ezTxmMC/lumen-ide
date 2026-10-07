/*
 * Copyright (C) 2026 ezTxmMC
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * This file is part of Lumen IDE. It is free software: you can redistribute it
 * and/or modify it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the License,
 * or (at your option) any later version. See the LICENSE file for details.
 */

/**
 * The public functions of the standard modules of Novus v0.1.0-pre.alpha.8 —
 * the `method`s of std/*.nv that are not `private` (the README table of the
 * release is the reference where a module has helper methods: toml, yaml,
 * properties, config, web, csv, log, base64 list only what it documents).
 * `project` is no file of std/: the compiler answers it from the project.nv.
 */
export const STD_FUNCTIONS: Record<string, string[]> = {
  arrays: ['sort', 'sortDesc', 'reverse', 'unique', 'range', 'slice', 'concat', 'sum', 'min', 'max', 'first', 'last', 'isEmpty', 'countOf', 'copy', 'chunk'],
  'base64': ['encode', 'decode'],
  bits: ['ushr', 'not', 'rotateLeft', 'rotateRight', 'mask', 'wrappingAdd', 'wrappingSub', 'wrappingMul', 'toI32', 'toUnsignedFloat', 'countOnes', 'highestBit', 'isSet', 'set', 'clear', 'bitsFor'],
  bytes: ['size', 'slice', 'join', 'zeros', 'indexOf', 'equal', 'failed', 'clearError', 'u8', 'u16', 'u32', 'i8', 'i16', 'i32', 'i64', 'f32', 'f64', 'varInt', 'varIntSize', 'varLong', 'varLongSize', 'putU8', 'putI16', 'putI32', 'putI64', 'putF32', 'putF64', 'putVarInt', 'putVarLong', 'varIntSizeOf', 'hex', 'fromHex', 'toArray', 'ofArray', 'putBool', 'boolAt', 'putString'],
  cli: ['parse', 'option', 'flag', 'argument'],
  config: ['load', 'save', 'format', 'parse', 'stringify', 'get'],
  crypto: ['sha1', 'sha256', 'md5', 'random', 'cipher', 'update', 'release', 'signedHexDigest', 'rsaGenerate', 'rsaPublicDer', 'rsaDecrypt', 'rsaEncrypt', 'rsaRelease', 'uuidText', 'hex', 'uuid3', 'uuid4'],
  csv: ['parse', 'parseWith', 'stringify', 'stringifyWith'],
  fmt: ['fixed', 'thousands', 'bytes', 'percent', 'table'],
  hash: ['fnv1a', 'crc32', 'bucket', 'hex'],
  http: ['get', 'post', 'put', 'delete', 'request', 'download', 'getJson', 'postJson'],
  io: ['readLine', 'readAll', 'readBytes', 'eof', 'write', 'writeErr', 'flush', 'readLines', 'prompt'],
  json: ['stringify', 'pretty', 'parse', 'tryParse', 'isValid', 'load', 'save', 'parseOr'],
  log: ['setLevel', 'setTimestamps', 'debug', 'info', 'warn', 'error'],
  maps: ['merge', 'fromPairs', 'invert', 'copy', 'isEmpty', 'entries', 'countValues'],
  math: ['sqrt', 'pow', 'floor', 'toFloat32', 'ceil', 'round', 'sin', 'cos', 'tan', 'atan2', 'log', 'exp', 'toFloat', 'toInt', 'pi', 'abs', 'min', 'max', 'clamp', 'sign', 'isEven', 'isOdd', 'gcd', 'lcm', 'powInt', 'isPrime', 'roundTo'],
  net: ['listen', 'accept', 'connect', 'recv', 'send', 'close', 'poll', 'pollWrite', 'status', 'error', 'peer', 'ok', 'again', 'closed', 'failed', 'peerHost', 'sendSome'],
  os: ['mkdir', 'rmdir', 'remove', 'removeAll', 'listDir', 'exists', 'isDir', 'isFile', 'rename', 'copy', 'fileSize', 'modified', 'modifiedMillis', 'realpath', 'isSymlink', 'readFile', 'writeFile', 'appendFile', 'cwd', 'chdir', 'temp', 'home', 'exec', 'output', 'run', 'shellQuote', 'shellQuoteFor', 'env', 'setEnv', 'exit', 'platform', 'args', 'pid', 'time', 'clock', 'sleep', 'readLine', 'catchInterrupt', 'interrupted', 'hasCommand', 'envOr'],
  path: ['join', 'absolute', 'normalize', 'relative', 'dirname', 'basename', 'stem', 'extension', 'isAbsolute', 'exists', 'isDir', 'isFile', 'temp', 'separator', 'withExtension', 'segments'],
  properties: ['parse', 'sections', 'stringify', 'stringifySections', 'load', 'loadSections', 'save'],
  random: ['seed', 'next', 'int', 'float', 'bool', 'pick', 'shuffle', 'string'],
  strings: ['repeat', 'padLeft', 'padRight', 'padLeftWith', 'padRightWith', 'reverse', 'lines', 'words', 'count', 'lastIndexOf', 'capitalize', 'isDigit', 'isAlpha', 'isSpace', 'isNumeric', 'chars', 'stripPrefix', 'stripSuffix', 'truncate', 'compare'],
  test: ['assert', 'assertEqual', 'report'],
  thread: ['join', 'done', 'joinAll', 'sleep', 'yield', 'isVirtual', 'id', 'cpus', 'parallelism', 'setParallelism', 'running', 'supportsVirtual', 'mutex', 'lock', 'unlock', 'tryLock', 'channel', 'send', 'recv', 'tryRecv', 'received', 'close', 'closed', 'length', 'counter', 'add', 'get', 'set', 'compareAndSet', 'increment', 'decrement', 'group', 'groupAdd', 'groupDone', 'groupWait'],
  time: ['now', 'clock', 'sleep', 'iso', 'format', 'parts', 'nowIso', 'elapsedMs', 'duration'],
  toml: ['parse', 'parseOr', 'isValid', 'errorOf', 'stringify', 'load', 'save'],
  unicode: ['utf16Length', 'byteToUtf16', 'utf16ToByte', 'codePointAt', 'fromCodePoint', 'isValidUtf8', 'charLength'],
  web: ['page', 'files', 'tick', 'keepViews', 'silent', 'port', 'escape', 'text', 'attr', 'toInt', 'toFloat', 'toBool', 'toStr', 'view', 'render', 'renderHtml', 'trigger', 'input', 'document', 'serve'],
  yaml: ['parse', 'parseOr', 'isValid', 'errorOf', 'stringify', 'load', 'save'],
  zlib: ['compress', 'decompress', 'failed', 'inflate'],
  project: ['name', 'version', 'main', 'lib', 'output', 'novus', 'requires', 'replaces', 'get', 'all'],
};

/** Every standard module, `import <module>`. */
export const STD_MODULES: string[] = Object.keys(STD_FUNCTIONS);

/** The function names of all modules, once each — the words completion offers. */
export const STD_FUNCTION_WORDS: string[] = [...new Set(Object.values(STD_FUNCTIONS).flat())];
