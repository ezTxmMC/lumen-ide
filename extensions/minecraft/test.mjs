#!/usr/bin/env node
/**
 * Tests of the Minecraft extension.
 *
 *   node extensions/minecraft/test.mjs             # offline: rules, parsers, templates from the defaults
 *   node extensions/minecraft/test.mjs --network   # also the live version sources
 */

import process from 'node:process'
import { runTs } from './tools/run.mjs'

const network = process.argv.includes('--network')
await runTs('test/unit.ts')
if (network) await runTs('test/network.ts')
