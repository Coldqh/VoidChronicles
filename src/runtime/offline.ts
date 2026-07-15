export interface OfflineRuntimeOptions {
  applyUpdate(): void | Promise<void>;
}

export interface OfflineRuntimeController {
  markOfflineReady(): void;
  markUpdateAvailable(): void;
  refreshConnectionState(): void;
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function ensurePanel(): HTMLElement {
  const existing = document.getElementById('offline-runtime-panel');
  if (existing) return existing;
  const panel = document.createElement('aside');
  panel.id = 'offline-runtime-panel';
  panel.className = 'offline-runtime-panel';
  panel.setAttribute('aria-live', 'polite');
  panel.innerHTML = '<span data-offline-state>ПОДГОТОВКА ОФЛАЙН</span><button type="button" data-offline-action hidden></button>';
  document.body.appendChild(panel);
  return panel;
}

export function installOfflineRuntime(options: OfflineRuntimeOptions): OfflineRuntimeController {
  const panel = ensurePanel();
  const state = panel.querySelector<HTMLElement>('[data-offline-state]')!;
  const action = panel.querySelector<HTMLButtonElement>('[data-offline-action]')!;
  let offlineReady = false;
  let updateAvailable = false;
  let installPrompt: InstallPromptEvent | null = null;

  const render = () => {
    const online = navigator.onLine;
    panel.classList.toggle('is-offline', !online);
    panel.classList.toggle('has-update', updateAvailable);
    if (!online) state.textContent = offlineReady ? 'ОФЛАЙН · ЛОКАЛЬНЫЙ СЕЙВ' : 'ОФЛАЙН · КЭШ НЕ ПОДТВЕРЖДЁН';
    else if (updateAvailable) state.textContent = 'ДОСТУПНО ОБНОВЛЕНИЕ';
    else if (offlineReady) state.textContent = 'ОФЛАЙН-РЕЖИМ ГОТОВ';
    else state.textContent = 'СЕТЬ ПОДКЛЮЧЕНА';

    if (updateAvailable) {
      action.hidden = false;
      action.textContent = 'Сохранить и обновить';
      action.onclick = () => { void options.applyUpdate(); };
    } else if (installPrompt) {
      action.hidden = false;
      action.textContent = 'Установить';
      action.onclick = async () => {
        const prompt = installPrompt;
        installPrompt = null;
        await prompt?.prompt();
        await prompt?.userChoice;
        render();
      };
    } else {
      action.hidden = true;
      action.onclick = null;
    }
  };

  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    render();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    offlineReady = true;
    render();
  });

  render();
  return {
    markOfflineReady() { offlineReady = true; render(); },
    markUpdateAvailable() { updateAvailable = true; render(); },
    refreshConnectionState: render
  };
}
