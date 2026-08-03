import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * WHICH BUILD IS THIS TAB RUNNING?
 *
 * A question with no answer until now, and one worth minutes every time an edit
 * seems not to have taken effect — a stale tab and a broken fix look identical
 * from the outside, and only one of them is worth debugging.
 *
 * Read once when the dev server or the build starts, so it names the commit the
 * bundle was assembled from. A tab that has hot-reloaded since is NEWER than
 * this says; a tab that has not been reloaded since a server restart may be
 * older. `[vite] hot updated:` in the console is the per-edit signal; this is
 * the per-reload one.
 */
function stamp(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim() ? '+' : ''
    const subject = execSync('git log -1 --format=%s', { encoding: 'utf8' }).trim()
    return `${sha}${dirty} ${subject}`
  } catch {
    return 'unknown'
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: { __BUILD__: JSON.stringify(stamp()) },
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
