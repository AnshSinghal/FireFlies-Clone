import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    // Playwright owns e2e/; vitest must not try to run those specs.
    exclude: ['node_modules', '.next', '../e2e/**'],
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
})
