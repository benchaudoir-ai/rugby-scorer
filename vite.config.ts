import { copyFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { defineConfig, type ResolvedConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** Copy index.html to 404.html so GitHub Pages (and similar) serve the SPA for /admin etc. */
function copy404Plugin() {
  let outDir = 'dist'
  return {
    name: 'copy-404',
    configResolved(config: ResolvedConfig) {
      outDir = resolve(config.root, config.build?.outDir ?? 'dist')
    },
    closeBundle() {
      const src = resolve(outDir, 'index.html')
      const dest = resolve(outDir, '404.html')
      if (existsSync(src)) copyFileSync(src, dest)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), copy404Plugin()],
})
