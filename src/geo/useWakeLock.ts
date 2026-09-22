// Keeps the screen from sleeping while `active` is true — e.g. during live
// navigation, where the geolocation plugin tears down GPS updates the
// moment the app is backgrounded/screen-locks (see useGeolocation.ts),
// so a normal screen timeout mid-hike would otherwise silently pause
// tracking.
//
// Uses the standard Screen Wake Lock API (navigator.wakeLock) rather than a
// custom native Tauri command — both WebView2 (desktop) and the Android
// WebView are Chromium-based and support it directly, no plugin needed.
// Best-effort: silently no-ops if the API isn't available, or if the OS
// revokes the lock itself (it does this automatically on tab/app hide,
// which matches the plugin's own foreground-only behavior anyway — nothing
// extra to reconcile).
import { useEffect } from "react";

export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    void navigator.wakeLock.request("screen").then(
      (lock) => {
        if (cancelled) {
          void lock.release();
          return;
        }
        sentinel = lock;
      },
      () => {
        // Best-effort — e.g. the document isn't visible yet, or the
        // platform declined. Navigation still works, it just won't keep
        // the screen on.
      },
    );

    return () => {
      cancelled = true;
      void sentinel?.release();
    };
  }, [active]);
}
