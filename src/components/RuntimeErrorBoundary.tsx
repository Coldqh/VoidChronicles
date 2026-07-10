import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class RuntimeErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Void Chronicles runtime crash', error, info.componentStack);
  }

  private reload = (): void => window.location.reload();

  private clearLocalData = async (): Promise<void> => {
    try {
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('void-chronicles');
        request.onsuccess = () => resolve();
        request.onerror = () => resolve();
        request.onblocked = () => resolve();
      });
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.includes('void') || key.includes('workbox')).map((key) => caches.delete(key)));
      }
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
    } finally {
      window.location.reload();
    }
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return <main className="crash-screen">
      <span className="eyebrow">АВАРИЙНЫЙ РЕЖИМ</span>
      <h1>Интерфейс корабля остановлен</h1>
      <p>{this.state.error.message || 'Неизвестная ошибка выполнения'}</p>
      <details><summary>Технические данные</summary><pre>{this.state.error.stack}</pre></details>
      <div className="menu-actions">
        <button className="primary-button" onClick={this.reload}>Перезапустить интерфейс</button>
        <button className="danger-button" onClick={() => void this.clearLocalData()}>Удалить локальный сейв и кэш</button>
      </div>
    </main>;
  }
}
