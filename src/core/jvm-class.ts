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
 * “New Java/Kotlin class” like in IntelliJ: `a.b.Name` creates the package
 * folders `a/b` and the file `Name.java` / `Name.kt` with the package
 * declaration and a skeleton of the chosen type.
 */

export type JvmLanguage = 'java' | 'kotlin';

export type JavaKind = 'class' | 'abstractClass' | 'interface' | 'enum' | 'record' | 'annotation';
export type KotlinKind = 'class' | 'dataClass' | 'openClass' | 'abstractClass' | 'sealedClass' | 'sealedInterface' | 'interface' | 'enum' | 'object' | 'valueClass' | 'annotation';

export const JAVA_KINDS: JavaKind[] = ['class', 'abstractClass', 'interface', 'enum', 'record', 'annotation'];
export const KOTLIN_KINDS: KotlinKind[] = ['class', 'dataClass', 'openClass', 'abstractClass', 'sealedClass', 'sealedInterface', 'interface', 'enum', 'object', 'valueClass', 'annotation'];

export const JAVA_TARGETS = ['TYPE', 'FIELD', 'METHOD', 'PARAMETER', 'CONSTRUCTOR', 'LOCAL_VARIABLE', 'ANNOTATION_TYPE', 'PACKAGE', 'TYPE_PARAMETER', 'TYPE_USE', 'MODULE', 'RECORD_COMPONENT'];
export const KOTLIN_TARGETS = ['CLASS', 'ANNOTATION_CLASS', 'TYPE_PARAMETER', 'PROPERTY', 'FIELD', 'LOCAL_VARIABLE', 'VALUE_PARAMETER', 'CONSTRUCTOR', 'FUNCTION', 'PROPERTY_GETTER', 'PROPERTY_SETTER', 'TYPE', 'EXPRESSION', 'FILE', 'TYPEALIAS'];
export const JAVA_RETENTIONS = ['SOURCE', 'CLASS', 'RUNTIME'];
export const KOTLIN_RETENTIONS = ['SOURCE', 'BINARY', 'RUNTIME'];

export interface AnnotationOptions {
  targets: string[];
  retention: string;
}

/** Where a folder sits in a JVM source tree: the source root, the package below it, the language of the root. */
export interface SourceLocation {
  root: string;
  packageName: string;
  language: JvmLanguage | null;
}

const SOURCE_DIR = /^(.*\/src\/[^/]+\/(java|kotlin))(?:\/(.*))?$/;

export function locateSource(dir: string): SourceLocation {
  const normal = dir.replace(/\\/g, '/').replace(/\/+$/, '');
  const match = SOURCE_DIR.exec(normal);
  if (!match) {
    return { root: normal, packageName: '', language: null };
  }
  return { root: match[1], packageName: (match[3] ?? '').split('/').filter(Boolean).join('.'), language: match[2] as JvmLanguage };
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const JAVA_RESERVED = new Set(['abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while', 'true', 'false', 'null']);

export interface ParsedName {
  /** Package parts typed in front of the class name (relative to the folder's package). */
  packageParts: string[];
  className: string;
}

/** The error key (`explorer.jvmError.*`) when the name is not usable, else null. */
export function validateJvmName(input: string, mode: 'class' | 'package'): string | null {
  const parts = input.trim().split(/[./\\]+/);
  if (!input.trim() || parts.some((part) => part === '')) {
    return 'empty';
  }
  const bad = parts.some((part) => !IDENTIFIER.test(part));
  if (bad) {
    return 'invalid';
  }
  const reserved = mode === 'package' ? parts.some((part) => JAVA_RESERVED.has(part)) : JAVA_RESERVED.has(parts[parts.length - 1]);
  return reserved ? 'reserved' : null;
}

export function parseJvmName(input: string, mode: 'class' | 'package'): ParsedName {
  const parts = input.trim().split(/[./\\]+/).filter(Boolean);
  if (mode === 'package') {
    return { packageParts: parts, className: '' };
  }
  return { packageParts: parts.slice(0, -1), className: parts[parts.length - 1] };
}

export const joinPackage = (...parts: (string | string[])[]) => parts.flat().filter(Boolean).join('.');

export function javaSource(packageName: string, name: string, kind: JavaKind, annotation: AnnotationOptions): string {
  const header = packageName ? `package ${packageName};\n\n` : '';
  if (kind === 'annotation') {
    const imports = ['java.lang.annotation.Retention', 'java.lang.annotation.RetentionPolicy'];
    const lines: string[] = [];
    if (annotation.targets.length) {
      imports.unshift('java.lang.annotation.ElementType');
      imports.push('java.lang.annotation.Target');
      lines.push(`@Target({${annotation.targets.map((target) => `ElementType.${target}`).join(', ')}})`);
    }
    lines.push(`@Retention(RetentionPolicy.${annotation.retention})`, `public @interface ${name} {`, '}');
    return `${header}${imports.sort().map((line) => `import ${line};`).join('\n')}\n\n${lines.join('\n')}\n`;
  }
  const declaration: Record<Exclude<JavaKind, 'annotation'>, string> = {
    class: `public class ${name} {\n}`,
    abstractClass: `public abstract class ${name} {\n}`,
    interface: `public interface ${name} {\n}`,
    enum: `public enum ${name} {\n}`,
    record: `public record ${name}() {\n}`,
  };
  return `${header}${declaration[kind]}\n`;
}

export function kotlinSource(packageName: string, name: string, kind: KotlinKind, annotation: AnnotationOptions): string {
  const header = packageName ? `package ${packageName}\n\n` : '';
  if (kind === 'annotation') {
    const lines: string[] = [];
    if (annotation.targets.length) {
      lines.push(`@Target(${annotation.targets.map((target) => `AnnotationTarget.${target}`).join(', ')})`);
    }
    lines.push(`@Retention(AnnotationRetention.${annotation.retention})`, `annotation class ${name}`);
    return `${header}${lines.join('\n')}\n`;
  }
  const declaration: Record<Exclude<KotlinKind, 'annotation'>, string> = {
    class: `class ${name}`,
    dataClass: `data class ${name}(val value: String)`,
    openClass: `open class ${name}`,
    abstractClass: `abstract class ${name}`,
    sealedClass: `sealed class ${name}`,
    sealedInterface: `sealed interface ${name}`,
    interface: `interface ${name}`,
    enum: `enum class ${name} {\n}`,
    object: `object ${name}`,
    valueClass: `@JvmInline\nvalue class ${name}(val value: String)`,
  };
  return `${header}${declaration[kind]}\n`;
}
