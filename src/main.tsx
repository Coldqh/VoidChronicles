import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { RuntimeErrorBoundary } from './components/RuntimeErrorBoundary';
import { installGlobalDiagnostics } from './runtime/diagnostics';
import { installOfflineRuntime } from './runtime/offline';
import { flushPendingSave } from './persistence/db';
import './styles/mobileDenseScreens.css';
import './styles/settlements.css';
import './styles/offline.css';

installGlobalDiagnostics();

const flushBeforeLeave = () => { void flushPendingSave(); };
window.addEventListener('pagehide', flushBeforeLeave);
window.addEventListener('beforeunload', flushBeforeLeave);

let applyServiceWorkerUpdate: (reloadPage?: boolean) => Promise<void> = async () => undefined;
const offlineRuntime = installOfflineRuntime({
  async applyUpdate() {
    await flushPendingSave();
    await applyServiceWorkerUpdate(true);
  }
});

applyServiceWorkerUpdate = registerSW({
  immediate: true,
  onOfflineReady() {
    offlineRuntime.markOfflineReady();
  },
  onNeedRefresh() {
    offlineRuntime.markUpdateAvailable();
  },
  onRegisterError(error: unknown) {
    console.error('Service worker registration failed', error);
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RuntimeErrorBoundary><App /></RuntimeErrorBoundary>
  </React.StrictMode>
);
