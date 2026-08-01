#!/usr/bin/env node
import { checkAppTokens } from './lib.mjs'

const [designRoot, appId] = process.argv.slice(2)
if (!designRoot || !appId) {
  console.error('Usage: check-app-tokens.mjs <designRoot> <appId>')
  process.exit(1)
}
const r = checkAppTokens(designRoot, appId)
if (!r.ok) {
  console.error(r.reason)
  process.exit(1)
}
console.log('ok')
