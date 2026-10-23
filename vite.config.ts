import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `--mode single` inlines everything into one HTML file for sharing as a web preview.
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: mode === 'single' ? { outDir: 'dist-single' } : {},
}))
