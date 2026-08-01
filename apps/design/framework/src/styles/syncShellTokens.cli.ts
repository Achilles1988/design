import { runSyncShellTokensCli } from './syncShellTokens.ts'

runSyncShellTokensCli({ check: process.argv.includes('--check') })
