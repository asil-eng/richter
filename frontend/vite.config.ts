import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// data/ is served statically (models, snapshots, cached notes) so the demo repos
// work with no backend; /api is proxied to FastAPI for live analysis and the agent.
// The GitHub Pages build (scripts/build-pages.sh) overrides the base path and data dir.
export default defineConfig({
  plugins: [react()],
  base: process.env.RICHTER_BASE ?? '/',
  publicDir: process.env.RICHTER_DATA ?? '../data',
  server: { proxy: { '/api': 'http://localhost:8000' } },
})
