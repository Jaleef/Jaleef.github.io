/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { postsIndexPlugin } from './vite/postsIndexPlugin.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), postsIndexPlugin()],
  test: {
    // 只测纯逻辑（slug、Front Matter、发布流程、公式切分），不需要 DOM 环境
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
