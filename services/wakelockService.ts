/** Screen wake lock used only while an active quiz is visible. */
let wakeLock: WakeLockSentinel | null = null;
let shouldRun = false;

async function requestWakeLock(): Promise<void> {
  if (!shouldRun || typeof document === 'undefined' || document.visibilityState !== 'visible') return;
  if (!('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      wakeLock = null;
    }, { once: true });
  } catch (error) {
    console.warn('[Wakelock] Screen wake lock unavailable:', error);
  }
}

async function releaseWakeLock(): Promise<void> {
  const current = wakeLock;
  wakeLock = null;
  if (current) {
    try {
      await current.release();
    } catch {
      // Already released by the browser.
    }
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void requestWakeLock();
  });
}

export function setWakelockRunning(enabled: boolean): void {
  shouldRun = enabled;
  if (enabled) void requestWakeLock();
  else void releaseWakeLock();
}
