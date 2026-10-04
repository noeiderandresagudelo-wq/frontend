import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, cpSync, existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

function copyPwaAssets() {
  return {
    name: 'alarvix-copy-pwa-assets',
    closeBundle() {
      const root = process.cwd()
      const dist = resolve(root, 'dist')
      mkdirSync(dist, { recursive: true })
      const manifest = resolve(root, 'manifest.json')
      if (existsSync(manifest)) copyFileSync(manifest, resolve(dist, 'manifest.json'))
      const icons = resolve(root, 'icons')
      if (existsSync(icons)) cpSync(icons, resolve(dist, 'icons'), { recursive: true })
      const sw = resolve(root, 'sw.js')
      if (existsSync(sw) && !existsSync(resolve(dist, 'sw.js'))) copyFileSync(sw, resolve(dist, 'sw.js'))
      const inventarioKardex = resolve(root, 'inventario-kardex.js')
      if (existsSync(inventarioKardex)) copyFileSync(inventarioKardex, resolve(dist, 'inventario-kardex.js'))
    }
  }
}

export default defineConfig({
  plugins: [react(), copyPwaAssets()],
})
