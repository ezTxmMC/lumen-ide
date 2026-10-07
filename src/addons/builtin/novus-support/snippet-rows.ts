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
 * The snippets of the Novus language server, as vscode-novus/snippets/novus.json
 * of release v0.1.0-pre.alpha.8 ships them (generated there from
 * lsp/services/snippets/). Same prefixes, same bodies (TextMate syntax, which
 * the snippet engine reads), tabs replaced by the four spaces of `.nv`.
 *
 * Each row: the prefixes (every one is a completion), the description, the body.
 */
export type SnippetRow = [prefixes: string[], description: string, body: string];

/** Program, packages and imports. */
export const SNIPPETS_PROGRAM: SnippetRow[] = [
  [['main'], 'Program entry point', 'method main {\n    $0\n}'],
  [['psvm', 'mainargs'], 'Program entry point receiving the command line arguments', 'method main(array<string> args) {\n    $0\n}'],
  [['maine', 'psvmi'], 'Entry point whose return value is the exit code', 'method main(array<string> args): integer {\n    $0\n    return ${1:0}\n}'],
  [['pkg', 'package'], 'Package declaration (must equal the folder name, or main)', 'package ${1:main}\n\n$0'],
  [['import'], 'Import a package folder or a standard module', 'import ${1:json}'],
  [['importf', 'importfile'], 'Import one file of the project (no extension)', 'import @${1:geo}/${2:circle}'],
  [['importn', 'importnested'], 'Import a nested package folder', 'import ${1:geo}/${2:shapes}'],
  [['importm', 'importmod'], 'Import a dependency module (path from require in project.nv)', 'import "${1:github.com/user/module}"'],
  [['psf', 'const', 'final'], 'Top-level constant', 'private final ${1:NAME} = ${2:0}'],
  [['gvar'], 'Top-level mutable global', 'var ${1:name} = ${2:0}'],
];

/** Methods. */
export const SNIPPETS_METHODS: SnippetRow[] = [
  [['method', 'meth'], 'Method with parameters and return type', 'method ${1:name}(${2:integer value})${3:: ${4:integer}} {\n    $0\n}'],
  [['methodv', 'methodn'], 'Method without a parameter list', 'method ${1:name} {\n    $0\n}'],
  [['methoda', 'async'], 'Async method: calls start on a virtual thread and return a task', 'async method ${1:name}(${2:integer value}): ${3:integer} {\n    $0\n    return ${4:value}\n}'],
  [['tryrun', 'guarded'], 'Run a task so that a runtime error becomes a value (natives as in std/toml.nv). Insert once per package: a second copy duplicates the three native declarations', 'method tryRun(object task): object native "nv_try_run"\nmethod tryFailed(): bool native "nv_try_failed"\nmethod tryError(): string native "nv_try_error"\n\ndefine class ${1:GuardedTask} {\n    method run(): object {\n        $0\n        return 0\n    }\n}'],
  [['doc'], 'Documentation comment (a // block above the declaration)', '// ${1:What it does and why}'],
];

/** Types and members. */
export const SNIPPETS_TYPES: SnippetRow[] = [
  [['class', 'cls'], 'Class with fields and a constructor', 'define class ${1:Name} {\n    ${2:string} ${3:field}\n\n    construct(${2} ${3}) {\n        this.${3} = ${3}\n    }\n\n    $0\n}'],
  [['classb', 'extends'], 'Class based on another class, abstract class or interface', 'define class ${1:Name} based ${2:Base} {\n    $0\n}'],
  [['abstract', 'abstractclass'], 'Abstract class', 'define abstract ${1:Name} {\n    abstract method ${2:name}(): ${3:string}\n\n    $0\n}'],
  [['interface', 'iface'], 'Interface', 'define interface ${1:Name} {\n    ${2:name}(): ${3:string}\n    $0\n}'],
  [['impl', 'implements'], 'Class implementing an interface', 'define class ${1:Name} based ${2:Shape} {\n    ${3:name}(): ${4:string} {\n        $0\n        return ${5:""}\n    }\n}'],
  [['enum'], 'Enum', 'define enum ${1:Name} {\n    ${2:FIRST},\n    ${3:SECOND}\n}'],
  [['enumv', 'enumc'], 'Enum with a value per constant', 'define enum ${1:Name} {\n    ${2:FIRST}(${3:1}),\n    ${4:SECOND}(${5:2});\n\n    ${6:integer} ${7:code}\n\n    construct(${6} ${7}) {\n        this.${7} = ${7}\n    }\n}'],
  [['annotation', 'anno'], 'Annotation definition (the braces are required)', 'define annotation ${1:Name} {\n    $0\n}'],
  [['@Deprecated', 'deprecated'], 'Mark a method as deprecated', '@Deprecated{\n    text="${1:Reason}",\n    since="${2:0.1.0}"\n}'],
  [['construct', 'ctor'], 'Constructor assigning one field', 'construct(${1:string} ${2:name}) {\n    this.${2} = ${2}\n    $0\n}'],
  [['field', 'fld'], 'Field', '${1:string} ${2:name}'],
  [['fieldg', 'getter'], 'Field with a getter', '${1:string} ${2:name}: get'],
  [['fieldgs', 'accessors'], 'Field with getter and/or setter', '${1:string} ${2:name}: ${3|get,get\\, set,set|}'],
  [['abstractm', 'absm'], 'Abstract method signature', 'abstract method ${1:name}(${2}): ${3:string}'],
  [['ctord', 'constructall'], 'Constructor taking two fields', 'construct(${1:string} ${2:first}, ${3:integer} ${4:second}) {\n    this.${2} = ${2}\n    this.${4} = ${4}\n}'],
];

/** Output and variables. */
export const SNIPPETS_OUTPUT: SnippetRow[] = [
  [['sout', 'println', 'pl'], 'Print a line', 'println "${1:text}"'],
  [['soutv', 'printv'], 'Print a variable with its name', 'println "${1:value} = \\${${1}}"'],
  [['soutm', 'printm'], 'Print the current method name', 'println "${1:Class}.${2:method}()"'],
  [['soutp', 'printp'], 'Print a parameter with its name', 'println "${1:value} = \\${${1}}"'],
  [['serr', 'eprintln'], 'Print a line to standard error', 'eprintln "${1:message}"'],
  [['print'], 'Print without a line break', 'print ${1:text}'],
  [['var'], 'Variable', 'var ${1:name} = ${2:value}'],
  [['vart', 'tvar'], 'Variable with an explicit type', 'var ${1:name}: ${2:integer} = ${3:value}'],
  [['cascade', 'casc'], 'Cascade: several calls on one receiver, which stays the value', '${1:items}..append(${2:value})..append(${3:value})'],
  [['local', 'typed'], 'Typed local declaration', '${1:integer} ${2:name} = ${3:value}'],
  [['ret', 'return'], 'Return a value', 'return ${1:value}'],
  [['mapl', 'newmap'], 'Map literal', 'var ${1:table} = {"${2:key}": ${3:value}}'],
  [['arrl', 'newarr'], 'Array literal', 'var ${1:list} = [${2:1, 2, 3}]'],
  [['struct', 'obj'], 'Object literal with named fields (skips the constructor, so collection fields stay nil; use new for the constructor call)', '${1:Point}{\n    ${2:x}=${3:1}\n}'],
  [['new'], 'Constructor call (runs construct; Novus has no new keyword)', '${1:Point}(${2})'],
  [['todo'], 'TODO comment', '// TODO: ${1:describe}'],
];

/** Control flow. */
export const SNIPPETS_FLOW: SnippetRow[] = [
  [['fori', 'forc'], 'Counted loop (a while loop: Novus has no C-style for). Do not use continue inside it (the increment would be skipped); use forrange', 'var ${1:i} = 0\nwhile (${1} < ${2:count}) {\n    $0\n    ${1} = ${1} + 1\n}'],
  [['forir', 'forr'], 'Counting down', 'var ${1:i} = ${2:count} - 1\nwhile (${1} >= 0) {\n    $0\n    ${1} = ${1} - 1\n}'],
  [['forrange', 'fora'], 'For-in over arrays.range (continue-safe counting loop)', 'for (${1:i} in arrays.range(0, ${2:count})) {\n    $0\n}'],
  [['foreach', 'iter', 'for', 'itar'], 'For-in over an array', 'for (${1:item} in ${2:items}) {\n    $0\n}'],
  [['itmap', 'formap'], 'Iterate the keys of a map (sorted) and read the value', 'for (${1:key} in ${2:names}) {\n    var ${3:value} = ${2}[${1}]\n    $0\n}'],
  [['itstr', 'forchar'], 'Iterate the characters (bytes) of a string', 'for (${1:ch} in ${2:text}) {\n    $0\n}'],
  [['if'], 'If', 'if (${1:condition}) {\n    $0\n}'],
  [['ifelse', 'ife'], 'If / else', 'if (${1:condition}) {\n    ${2}\n} else {\n    $0\n}'],
  [['elif', 'elseif'], 'Else-if branch (after an if block)', 'else if (${1:condition}) {\n    $0\n}'],
  [['else'], 'Else branch (after an if block)', 'else {\n    $0\n}'],
  [['guard', 'ifret'], 'Guard clause: leave early', 'if (${1:!condition}) {\n    return ${2}\n}\n$0'],
  [['ifnot', 'ifn'], 'If not', 'if (!${1:condition}) {\n    $0\n}'],
  [['ifhas'], 'If a map has the key', 'if (${1:names}.has("${2:key}")) {\n    $0\n}'],
  [['while'], 'While loop', 'while (${1:condition}) {\n    $0\n}'],
  [['wh1', 'loop'], 'Endless loop with a way out', 'while (true) {\n    $0\n    if (${1:done}) {\n        break\n    }\n}'],
];

/** Concurrency. */
export const SNIPPETS_CONCURRENCY: SnippetRow[] = [
  [['thread', 'osthread'], 'Run a method call on an operating-system thread', 'var ${1:task} = thread ${2:work}(${3})'],
  [['virtual', 'vthread'], 'Run a method call on a virtual thread', 'var ${1:task} = virtual ${2:work}(${3})'],
  [['await'], 'Wait for a task and take its value', 'var ${1:result} = await ${2:task}'],
  [['joinall'], 'Wait for all tasks', 'var ${1:results} = thread.joinAll(${2:tasks})'],
  [['sync'], 'Block guarded by the program-wide lock', 'sync {\n    $0\n}'],
  [['syncl', 'synchronized'], 'Block guarded by a mutex', 'sync (${1:lock}) {\n    $0\n}'],
  [['chan', 'channel'], 'Create a channel', 'var ${1:channel} = thread.channel(${2:16})'],
];

/** Tests, command line and the standard library. */
export const SNIPPETS_LIBRARY: SnippetRow[] = [
  [['testmain', 'tmain'], 'Test program: assertions, then the exit code', 'import test\n\nmethod main {\n    test.assertEqual(${1:1 + 1}, ${2:2}, "${3:addition}")\n    $0\n    exit(test.report())\n}'],
  [['maincli', 'cli'], 'Entry point parsing --options and positional arguments', 'import cli\n\nmethod main(array<string> args) {\n    var parsed = cli.parse(args)\n    var ${1:input} = cli.argument(parsed, 0, "${2:default}")\n    $0\n}'],
  [['asserteq', 'assertequal'], 'Compare two values in a test', 'test.assertEqual(${1:actual}, ${2:expected}, "${3:name}")'],
  [['asserttrue', 'assert'], 'Assert a condition in a test', 'test.assert(${1:condition}, "${2:name}")'],
  [['cliopt'], 'Read a command line option', 'var ${1:parsed} = cli.parse(args())\nvar ${2:port} = cli.option(${1}, "${3:port}", "${4:8080}")'],
  [['cliflag'], 'Read a command line flag', 'var ${1:verbose} = cli.flag(${2:parsed}, "${3:verbose}")'],
  [['httpget', 'get'], 'HTTP GET returning the body', 'var ${1:body} = http.get("${2:https://example.com}")'],
  [['httppost', 'post'], 'HTTP POST of a map or array as JSON', 'var ${1:body} = http.post("${2:https://example.com}", ${3:{"key": "value"\\}})'],
  [['httpjson', 'getjson'], 'HTTP GET parsed as JSON', 'var ${1:data} = http.getJson("${2:https://example.com/data.json}")'],
  [['httpreq', 'http'], 'HTTP request with status, body and headers', 'var ${1:response} = http.request("${2:GET}", "${3:https://example.com}", "", {})\nif (${1}["ok"]) {\n    $0\n}'],
  [['jsonparse', 'jparse'], 'Parse JSON text (aborts on invalid input)', 'var ${1:data} = json.parse(${2:text})'],
  [['jsonstr', 'jstringify'], 'Serialize a value to JSON', 'var ${1:text} = json.stringify(${2:value})'],
  [['jsonpretty', 'jpretty'], 'Serialize a value to indented JSON', 'var ${1:text} = json.pretty(${2:value})'],
  [['jsonload', 'jload'], 'Load a JSON file', 'var ${1:data} = json.load("${2:data.json}")'],
  [['jsonsave', 'jsave'], 'Save a value as a JSON file', 'json.save(${1:value}, "${2:out}", "${3:data.json}")'],
  [['jsontry', 'jtry'], 'Parse JSON text without aborting (tryParse gives nil on invalid input; test it with typeOf)', 'var ${1:data} = json.tryParse(${2:text})\nif (typeOf(${1}) == "unknown") {\n    $0\n}'],
  [['readfile', 'rf'], 'Read a whole file', 'var ${1:content} = readFile("${2:path}")'],
  [['writefile', 'wf'], 'Write a whole file', 'writeFile("${1:path}", ${2:text})'],
  [['readlines', 'rl'], 'Loop over the lines of a file', 'for (${1:line} in strings.lines(readFile("${2:path}"))) {\n    $0\n}'],
  [['listdir', 'ls'], 'Loop over the entries of a directory', 'for (${1:entry} in os.listDir("${2:.}")) {\n    $0\n}'],
  [['exec', 'shell'], 'Run a shell command and get its exit code', 'var ${1:code} = os.exec("${2:command}")'],
  [['stdin', 'readline'], 'Read a line from standard input', 'var ${1:line} = io.readLine()'],
];
