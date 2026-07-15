import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { RuntimeErrorBoundary } from './components/RuntimeErrorBoundary';
import { installGlobalDiagnostics } from './runtime/diagnostics';
import { flushPendingSave } from './persistence/db';
import './styles/mobileDenseScreens.css';

installGlobalDiagnostics();

const flushBeforeLeave = () => { void flushPendingSave(); };
window.addEventListener('pagehide', flushBeforeLeave);
window.addEventListener('beforeunload', flushBeforeLeave);

let serviceWorkerReloading = false;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (serviceWorkerReloading) return;
    serviceWorkerReloading = true;
    window.location.reload();
  });
}

registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    void registration?.update();
  },
  onRegisterError(error) {
    console.error('Service worker registration failed', error);
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RuntimeErrorBoundary><App /></RuntimeErrorBoundary>
  </React.StrictMode>
);
