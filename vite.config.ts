import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Base path for GitHub Pages
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      // ONLY the portal ships.
      //
      // The v1 dashboard entry is no longer built or shipped. Two audits found that
      // roughly half of all defects in this codebase were v1-only, on a surface
      // nobody maintains — and extending the dial to 252 million years finished
      // it off: v1's year slider is a plain <input type="range"> over the same
      // MIN_YEAR, so it is now a 252,003,050-value control in which the whole of
      // recorded history falls inside the final pixel, and its era strip renders
      // fifteen bands at a combined 0.016px.
      //
      // The file stays in the repo, and restoring it is one line here — but
      // publishing a page whose primary control is provably unusable, on a
      // surface that doubles the exposure of an app holding the visitor's API
      // key, is not something to do by inertia.
      input: {
        main: 'index.html',
      },
    },
  },
})
