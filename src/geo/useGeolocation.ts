// Wraps the standard Web Geolocation API (navigator.geolocation) for
// desktop GPS display. Tauri's own geolocation plugin is mobile-only (see
// the offline-maps/GPS plan notes) — on Windows, WebView2 (Chromium)
// already implements this API natively, no plugin needed. Requires a
// secure context in the packaged app: see tauri.conf.json's
// "useHttpsScheme" on the window config.
import { useCallback, useEffect, useRef, useState } from "react";
import type { LngLat } from "../providers/types";

export type GeolocationStatus = "idle" | "locating" | "active" | "denied" | "unavailable" | "error";

export interface GeolocationFix {
  point: LngLat;
  /** Meters, as reported by the platform location provider. */
  accuracy: number;
}

export interface GeolocationState {
  status: GeolocationStatus;
  position: GeolocationFix | null;
  errorMessage: string | null;
  /** Starts watching position. Safe to call again while already active —
   * just restarts the watch. */
  enable: () => void;
  /** Stops watching immediately (clearWatch) and resets to idle. This is
   * the actual "stop watching" behavior, not just a UI state flip. */
  disable: () => void;
}

// enableHighAccuracy targets GPS hardware specifically, which desktops
// generally don't have — the network/Wi-Fi based position most desktops
// get doesn't improve from it, so leaving it off keeps responses faster.
// maximumAge lets the browser hand back a recent cached fix instead of
// forcing a fresh lookup on every internal poll, which is what keeps this
// from generating excessive update frequency — watchPosition itself is
// push-based (event-driven from the OS location provider), not a manual
// setInterval loop.
const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 15000,
  maximumAge: 5000,
};

function describeError(err: GeolocationPositionError): { status: GeolocationStatus; message: string } {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return {
        status: "denied",
        message:
          "Location access was denied. Allow it if your browser/app prompts again, and check Windows Settings → Privacy & security → Location is turned on for desktop apps.",
      };
    case err.POSITION_UNAVAILABLE:
      return {
        status: "unavailable",
        message:
          "Your position couldn't be determined. Windows Location Services may be off, or there's no Wi-Fi/network signal available to estimate a position from.",
      };
    case err.TIMEOUT:
      return { status: "error", message: "Timed out waiting for a position — try again." };
    default:
      return { status: "error", message: "Couldn't get your location." };
  }
}

/** Local-only — nothing here ever transmits or stores the position beyond
 * this hook's own React state. */
export function useGeolocation(): GeolocationState {
  const [status, setStatus] = useState<GeolocationStatus>("idle");
  const [position, setPosition] = useState<GeolocationFix | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const clearActiveWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const disable = useCallback(() => {
    clearActiveWatch();
    setStatus("idle");
    setPosition(null);
    setErrorMessage(null);
  }, [clearActiveWatch]);

  const enable = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus("unavailable");
      setErrorMessage("This app's webview doesn't support geolocation.");
      return;
    }
    clearActiveWatch();
    setStatus("locating");
    setErrorMessage(null);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setStatus("active");
        setErrorMessage(null);
        setPosition({
          point: { lng: pos.coords.longitude, lat: pos.coords.latitude },
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => {
        const { status: nextStatus, message } = describeError(err);
        setStatus(nextStatus);
        setErrorMessage(message);
        setPosition(null);
      },
      WATCH_OPTIONS,
    );
  }, [clearActiveWatch]);

  // Belt-and-braces: stop watching on unmount regardless of whether
  // disable() was ever called explicitly.
  useEffect(() => clearActiveWatch, [clearActiveWatch]);

  return { status, position, errorMessage, enable, disable };
}
