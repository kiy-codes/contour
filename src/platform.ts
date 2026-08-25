// No platform-detection plugin in this project — the WebView's own user
// agent reliably identifies Android, which is the only per-platform branch
// this app needs (real capability/hardware differences — geolocation
// permission flow, GPU memory available for terrain mesh caching — not
// viewport width, which is what useIsMobile.ts checks instead).
export const isAndroid = typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
