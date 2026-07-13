import { flushPendingSave } from '../persistence/db';
import { APP_VERSION } from '../version';

export interface UpdateResult {
  registrations: number;
  cachesCleared: number;
}

export async function forceApplicationUpdate(): Promise<UpdateResult> {
  // Commit the newest ironman state before the service worker can reload the page.
  await flushPendingSave();
  const registrations = 'serviceWorker' in navigator
    ? await navigator.serviceWorker.getRegistrations()
    : [];

  for (const registration of registrations) {
    try {
      await registration.update();
      registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
      registration.installing?.postMessage({ type: 'SKIP_WAITING' });
    } catch (error) {
      console.warn('Service worker update failed', error);
    }
  }

  let cachesCleared = 0;
  if ('caches' in window) {
    const keys = await caches.keys();
    const results = await Promise.all(keys.map((key) => caches.delete(key)));
    cachesCleared = results.filter(Boolean).length;
  }

  localStorage.setItem('void-chronicles:last-forced-update', JSON.stringify({
    appVersion: APP_VERSION,
    requestedAt: new Date().toISOString()
  }));

  const url = new URL(window.location.href);
  url.searchParams.set('update', Date.now().toString());
  window.location.replace(url.toString());

  return { registrations: registrations.length, cachesCleared };
}
