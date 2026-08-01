#!/usr/bin/env node
import { listAppIds } from './lib.mjs'

const designRoot = process.argv[2]
if (!designRoot) {
  console.error('Usage: list-apps.mjs <designRoot>')
  process.exit(1)
}
for (const id of listAppIds(designRoot)) console.log(id)
