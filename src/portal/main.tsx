import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './portal.css';
import { Portal } from './Portal';
import { ErrorBoundary } from './components/ErrorBoundary';

const host = document.getElementById('root');
if (!host) throw new Error('#root missing from index.html');

createRoot(host).render(
  <StrictMode>
    <ErrorBoundary>
      <Portal />
    </ErrorBoundary>
  </StrictMode>,
);

/**
 * SAY WHICH BUILD THIS IS, on every load.
 *
 * A stale tab and a broken fix look identical from the outside, and only one of
 * them is worth debugging. Injected by vite.config.ts from git at server start;
 * `[vite] hot updated:` in the console covers the edits since.
 */
const build = import.meta.env.VITE_BUILD ?? 'unknown';
console.info(`%c[looking-glass] build ${build}`, 'color:#7fb2d6');
(window as unknown as { __build?: string }).__build = build;

/**
 * The save button costs nothing to run and used to cost a sweep to TEST. See
 * stitchTest — `window.__testSave(3)` in the console exercises the whole
 * download path on clips made locally.
 */
if (import.meta.env.DEV) {
  void import('./lib/stitchTest').then((m) => {
    (window as unknown as { __testSave?: (n?: number) => Promise<void> }).__testSave = m.testSave;
    console.info('[looking-glass] window.__testSave(n) — test the video download, free');
  });
}
