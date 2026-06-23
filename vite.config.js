import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Client env vars must be prefixed VITE_ (see .env.local / .env.production).
// base: GitHub Pages serves a project site under /<repo>/, so the production
// build uses that path; dev server stays at '/'.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/giant-programV2/' : '/',
}))
