#!/usr/bin/env node
import { resolve } from 'node:path'
import { findDesignRoots } from './lib.mjs'

const repoRoot = resolve(process.argv[2] ?? process.cwd())
const roots = findDesignRoots(repoRoot)
if (roots.length === 0) {
  console.error('No design.project.json found. Install a design-engineering project.')
  process.exit(2)
}
if (roots.length > 1) {
  console.error('Multiple design projects found; choose one:')
  for (const r of roots) console.log(r)
  process.exit(3)
}
console.log(roots[0])
