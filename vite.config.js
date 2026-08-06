import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Must match your GitHub repo name exactly — GitHub Pages serves this
  // from https://<username>.github.io/<repo-name>/, so every asset path
  // needs that repo name as a prefix or they'll 404.
  base: '/social-flow/',
  build: {
    // Output straight into /docs so GitHub Pages can serve this branch's
    // docs folder directly — no gh-pages branch, no Actions workflow needed.
    outDir: 'docs',
  },
})
