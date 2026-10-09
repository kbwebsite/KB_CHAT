// PWA helpers: service-worker registration + install-prompt state.
// The worker registers in production builds only — dev (vite) serves
// unhashed modules where a caching worker would serve stale code.

export const APP_SW_URL = '/app-sw.js';

export function swSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

/** Register the app-shell worker once. Resolves true when registered. */
export async function registerAppSW(): Promise<boolean> {
  if (!swSupported()) return false;
  try {
    await navigator.serviceWorker.register(APP_SW_URL, { scope: '/' });
    return true;
  } catch {
    return false;
  }
}

export function isStandalone(): boolean {
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    return (navigator as any).standalone === true; // iOS Safari
  } catch {
    return false;
  }
}

export function isIOS(): boolean {
  try {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  } catch {
    return false;
  }
}

export type InstallState =
  | { kind: 'installed' }
  | { kind: 'prompt'; install: () => Promise<boolean> }
  | { kind: 'ios-manual' }
  | { kind: 'unavailable' };

let deferredPrompt: any = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    // Hold the browser prompt so the in-app Install button fires it.
    e.preventDefault();
    deferredPrompt = e;
    window.dispatchEvent(new CustomEvent('kryzen:installable'));
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    window.dispatchEvent(new CustomEvent('kryzen:installed'));
  });
}

/** Current install affordance. Pure read — safe to call in render. */
export function installState(): InstallState {
  if (isStandalone()) return { kind: 'installed' };
  if (deferredPrompt) {
    return {
      kind: 'prompt',
      install: async () => {
        try {
          deferredPrompt.prompt();
          const choice = await deferredPrompt.userChoice;
          deferredPrompt = null;
          return choice?.outcome === 'accepted';
        } catch {
          return false;
        }
      },
    };
  }
  if (isIOS()) return { kind: 'ios-manual' };
  return { kind: 'unavailable' };
}
