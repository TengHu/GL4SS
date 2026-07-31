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
