import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { designFsPlugin } from './framework/vite-plugins/design-fs/plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    designFsPlugin({ contentRoot: path.resolve(__dirname, 'apps') }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'framework/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['framework/**/*.test.ts'],
  },
})
