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
 * A load-time repair for jdtls' javac backend.
 *
 * The backend's CachingClassSymbolClassReader replays cached class templates
 * with whatever `currentModule` the class read before left behind. After a
 * JDK class that is `java.base`, and the types in the next template's
 * signatures land there — javac then reports “cannot access
 * net.minecraft.data.loot.LootTableSubProvider, class file not found” for
 * code the build compiles, from the second check of a session on.
 *
 * Lumen compiles a small Java agent (below) once per agent version with the
 * JDK that runs jdtls, against the ASM jdtls ships, and hands it to jdtls as
 * `-javaagent`. The agent wraps `readClassFile` so it restores the module
 * afterwards. Without a compiled agent Lumen does not switch the backend on.
 */

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const AGENT_SOURCE = `import java.lang.instrument.ClassFileTransformer;
import java.lang.instrument.Instrumentation;
import java.security.ProtectionDomain;
import org.objectweb.asm.ClassReader;
import org.objectweb.asm.ClassVisitor;
import org.objectweb.asm.ClassWriter;
import org.objectweb.asm.Label;
import org.objectweb.asm.MethodVisitor;
import org.objectweb.asm.Opcodes;

/**
 * Written and compiled by Lumen — see electron/features/jdtls-agent.ts.
 *
 * Repairs jdtls' javac backend at load time: CachingClassSymbolClassReader
 * replays cached class templates with whatever currentModule the last class
 * read left behind — a JDK class leaves java.base, and types from the next
 * template's signatures are entered there (“cannot access …, class file not
 * found”). readClassFile now saves the module and restores it afterwards.
 */
public final class LumenJdtlsAgent {
  private static final String TARGET = "org/eclipse/jdt/internal/javac/CachingClassSymbolClassReader";
  private static final String METHOD = "readClassFile";
  private static final String DESC = "(Lcom/sun/tools/javac/code/Symbol$ClassSymbol;)V";
  private static final String RENAMED = "lumen$readClassFile";
  private static final String MODULE = "Lcom/sun/tools/javac/code/Symbol$ModuleSymbol;";

  public static void premain(String args, Instrumentation instrumentation) {
    instrumentation.addTransformer(new ClassFileTransformer() {
      @Override
      public byte[] transform(Module module, ClassLoader loader, String name, Class<?> redefined, ProtectionDomain domain, byte[] bytes) {
        if (!TARGET.equals(name)) return null;
        try {
          return patch(bytes);
        } catch (Throwable error) {
          System.err.println("[lumen] jdtls javac patch not applied: " + error);
          return null;
        }
      }
    });
  }

  static byte[] patch(byte[] bytes) {
    ClassReader reader = new ClassReader(bytes);
    ClassWriter writer = new ClassWriter(reader, ClassWriter.COMPUTE_MAXS);
    boolean[] found = { false };
    reader.accept(new ClassVisitor(Opcodes.ASM9, writer) {
      @Override
      public MethodVisitor visitMethod(int access, String name, String desc, String signature, String[] exceptions) {
        if (!METHOD.equals(name) || !DESC.equals(desc)) return super.visitMethod(access, name, desc, signature, exceptions);
        found[0] = true;
        return super.visitMethod(Opcodes.ACC_PRIVATE, RENAMED, desc, signature, exceptions);
      }

      @Override
      public void visitEnd() {
        if (found[0]) addWrapper(cv);
        super.visitEnd();
      }
    }, 0);
    if (!found[0]) return null;
    return writer.toByteArray();
  }

  /** readClassFile(c) { saved = currentModule; try { lumen$readClassFile(c); } finally { currentModule = saved; } } */
  private static void addWrapper(ClassVisitor visitor) {
    MethodVisitor mv = visitor.visitMethod(Opcodes.ACC_PUBLIC, METHOD, DESC, null, null);
    mv.visitCode();
    Label start = new Label();
    Label end = new Label();
    Label handler = new Label();
    mv.visitTryCatchBlock(start, end, handler, null);
    mv.visitVarInsn(Opcodes.ALOAD, 0);
    mv.visitFieldInsn(Opcodes.GETFIELD, TARGET, "currentModule", MODULE);
    mv.visitVarInsn(Opcodes.ASTORE, 2);
    mv.visitLabel(start);
    mv.visitVarInsn(Opcodes.ALOAD, 0);
    mv.visitVarInsn(Opcodes.ALOAD, 1);
    mv.visitMethodInsn(Opcodes.INVOKESPECIAL, TARGET, RENAMED, DESC, false);
    mv.visitLabel(end);
    mv.visitVarInsn(Opcodes.ALOAD, 0);
    mv.visitVarInsn(Opcodes.ALOAD, 2);
    mv.visitFieldInsn(Opcodes.PUTFIELD, TARGET, "currentModule", MODULE);
    mv.visitInsn(Opcodes.RETURN);
    mv.visitLabel(handler);
    mv.visitFrame(Opcodes.F_FULL,
      3, new Object[] { TARGET, "com/sun/tools/javac/code/Symbol$ClassSymbol", "com/sun/tools/javac/code/Symbol$ModuleSymbol" },
      1, new Object[] { "java/lang/Throwable" });
    mv.visitVarInsn(Opcodes.ASTORE, 3);
    mv.visitVarInsn(Opcodes.ALOAD, 0);
    mv.visitVarInsn(Opcodes.ALOAD, 2);
    mv.visitFieldInsn(Opcodes.PUTFIELD, TARGET, "currentModule", MODULE);
    mv.visitVarInsn(Opcodes.ALOAD, 3);
    mv.visitInsn(Opcodes.ATHROW);
    mv.visitMaxs(0, 0);
    mv.visitEnd();
  }
}
`;

const exe = (name: string) => (process.platform === 'win32' ? `${name}.exe` : name);

async function exists(file: string): Promise<boolean> {
  return fs.access(file).then(() => true, () => false);
}

const building = new Map<string, Promise<string | null>>();

async function build(dir: string, javaHome: string, asmJar: string): Promise<string | null> {
  const agent = path.join(dir, 'lumen-jdtls-agent.jar');
  if (await exists(agent)) {
    return agent;
  }
  const javac = path.join(javaHome, 'bin', exe('javac'));
  const jar = path.join(javaHome, 'bin', exe('jar'));
  if (!(await exists(javac)) || !(await exists(jar))) {
    return null;
  }
  const work = path.join(dir, 'build');
  await fs.rm(work, { recursive: true, force: true });
  await fs.mkdir(path.join(work, 'classes'), { recursive: true });
  const source = path.join(work, 'LumenJdtlsAgent.java');
  await fs.writeFile(source, AGENT_SOURCE, 'utf8');
  // Next to the agent, so the manifest's relative Class-Path finds it.
  await fs.copyFile(asmJar, path.join(dir, 'asm.jar'));
  await run(javac, ['--release', '21', '-cp', path.join(dir, 'asm.jar'), '-d', path.join(work, 'classes'), source], { timeout: 120_000 });
  const manifest = path.join(work, 'manifest.txt');
  await fs.writeFile(manifest, 'Premain-Class: LumenJdtlsAgent\nClass-Path: asm.jar\n', 'utf8');
  const partial = `${agent}.part`;
  await run(jar, ['--create', '--file', partial, '--manifest', manifest, '-C', path.join(work, 'classes'), '.'], { timeout: 120_000 });
  await fs.rename(partial, agent);
  await fs.rm(work, { recursive: true, force: true });
  return agent;
}

/**
 * The agent jar below `baseDir` — compiled on first use with the JDK at
 * `javaHome` against `asmJar`. `null` when that JDK has no compiler or the
 * build fails.
 */
export function ensureJdtlsAgent(baseDir: string, javaHome: string, asmJar: string): Promise<string | null> {
  const key = createHash('sha256').update(AGENT_SOURCE).update(path.basename(asmJar)).digest('hex').slice(0, 16);
  const dir = path.join(baseDir, key);
  const pending = building.get(dir);
  if (pending) {
    return pending;
  }
  const task = fs.mkdir(dir, { recursive: true })
    .then(() => build(dir, javaHome, asmJar))
    .catch((error: unknown) => {
      console.error('[lumen] jdtls agent:', error);
      return null;
    })
    .finally(() => building.delete(dir));
  building.set(dir, task);
  return task;
}
