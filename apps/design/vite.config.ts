import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import { canvasAssistantPlugin } from './framework/vite-plugins/canvas-assistant/plugin'
import { designFsPlugin } from './framework/vite-plugins/design-fs/plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  publicDir: path.resolve(__dirname, 'framework/public'),
  plugins: [
    react(),
    designFsPlugin({
      contentRoot: path.resolve(__dirname, 'apps'),
      assetsRoot: path.resolve(__dirname, 'framework/public/assets'),
    }),
    canvasAssistantPlugin({
      contentRoot: path.resolve(__dirname, 'apps'),
      stylesRoot: path.resolve(
        __dirname,
        'framework/public/assets/designmd',
      ),
      layoutsRoot: path.resolve(
        __dirname,
        'framework/public/assets/layoutmd',
      ),
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'framework/src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-assistant-ui': ['@assistant-ui/react'],
          'vendor-ai-sdk': ['ai', '@ai-sdk/anthropic', '@ai-sdk/openai'],
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['framework/**/*.test.ts', 'framework/**/*.test.tsx'],
    setupFiles: ['framework/src/setup-jsdom-compat.ts'],
  },
})
