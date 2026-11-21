// Registers the service worker that lets the web app install and run offline
// (see pwa/sw.js), and reports when it is ready or when an update is waiting.
import { isDesktop } from './store';

export type OfflineState = 'offline-ready' | 'update-ready';

/** The desktop app and the dev server never use the service worker. */
export function shouldRegister(env: { prod: boolean; desktop: boolean; supported: boolean; secure: boolean }) {
  return env.prod && !env.desktop && env.supported && env.secure;
}

let waiting: ServiceWorker | null = null;

export function registerServiceWorker(onState: (s: OfflineState) => void) {
  const supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  if (!shouldRegister({ prod: import.meta.env.PROD, desktop: isDesktop(), supported, secure: window.isSecureContext })) return;

  const hadController = !!navigator.serviceWorker.controller;
  const watch = (worker: ServiceWorker) => {
    worker.addEventListener('statechange', () => {
      if (worker.state !== 'installed') return;
      if (navigator.serviceWorker.controller) {
        waiting = worker;
        onState('update-ready');
      } else onState('offline-ready');
    });
  };

  // Relative URL: on GitHub Pages this is /<repo>/sw.js, scoped to /<repo>/.
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      if (reg.waiting && hadController) {
        waiting = reg.waiting;
        onState('update-ready');
      }
      if (reg.installing) watch(reg.installing);
      reg.addEventListener('updatefound', () => reg.installing && watch(reg.installing));
    })
    .catch(() => {
      /* Offline support is a bonus; the app works without it. */
    });
}

/** Switches to the waiting update and reloads once it has taken over. */
export function applyUpdate() {
  if (!waiting) return location.reload();
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true });
  waiting.postMessage({ type: 'skip-waiting' });
}
