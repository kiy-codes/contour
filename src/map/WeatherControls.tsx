import type { WeatherMapLayerId } from "../providers/WeatherProvider";
import { weatherMapProvider } from "../providers/weatherInstances";
import type { WeatherTileStatus } from "../weather/useWeatherMapLayer";
import type { WeatherForecastState } from "../weather/useWeatherForecast";
import "./TerrainControls.css";
import "./WeatherControls.css";

export interface WeatherControlsProps {
  hasOwmKey: boolean;
  activeMapLayer: WeatherMapLayerId | "none";
  onActiveMapLayerChange: (layer: WeatherMapLayerId | "none") => void;
  tileStatus: WeatherTileStatus;
  lastRefreshedAt: number | null;
  forecastEnabled: boolean;
  onForecastEnabledChange: (enabled: boolean) => void;
  forecast: WeatherForecastState;
  hourIndex: number;
  onHourIndexChange: (index: number) => void;
  onRefreshForecast: () => void;
}

function relativeTime(ms: number | null): string {
  if (ms === null) return "—";
  const deltaS = Math.round((Date.now() - ms) / 1000);
  if (deltaS < 5) return "just now";
  if (deltaS < 60) return `${deltaS}s ago`;
  const deltaM = Math.round(deltaS / 60);
  return `${deltaM}m ago`;
}

function formatHourLabel(timeIso: string): string {
  const d = new Date(timeIso);
  return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

const TILE_STATUS_LABEL: Record<WeatherTileStatus, string> = {
  idle: "Off",
  loading: "Loading…",
  ready: "Live",
  error: "Provider error",
};

export default function WeatherControls({
  hasOwmKey,
  activeMapLayer,
  onActiveMapLayerChange,
  tileStatus,
  lastRefreshedAt,
  forecastEnabled,
  onForecastEnabledChange,
  forecast,
  hourIndex,
  onHourIndexChange,
  onRefreshForecast,
}: WeatherControlsProps) {
  const activeLayerDef = weatherMapProvider.layers.find((l) => l.id === activeMapLayer);
  const hour = forecast.data?.hours[hourIndex];

  return (
    <div className="terrain-controls weather-controls">
      <span className="settings-menu__section-label">Weather map</span>
      <div className="weather-controls__layers" role="group" aria-label="Weather map layer">
        <button
          className={activeMapLayer === "none" ? "weather-controls__pill weather-controls__pill--active" : "weather-controls__pill"}
          onClick={() => onActiveMapLayerChange("none")}
        >
          None
        </button>
        {weatherMapProvider.layers.map((layer) => (
          <button
            key={layer.id}
            className={activeMapLayer === layer.id ? "weather-controls__pill weather-controls__pill--active" : "weather-controls__pill"}
            disabled={!hasOwmKey}
            title={hasOwmKey ? layer.label : "Needs a free OpenWeatherMap API key — not configured yet"}
            onClick={() => onActiveMapLayerChange(layer.id)}
          >
            {layer.label}
          </button>
        ))}
      </div>

      {!hasOwmKey && (
        <p className="weather-controls__hint">Map overlay unavailable — add VITE_OWM_API_KEY to use live weather tiles (see README).</p>
      )}

      {hasOwmKey && activeMapLayer !== "none" && (
        <div className="weather-controls__status-row">
          <span className={`weather-controls__status weather-controls__status--${tileStatus}`}>{TILE_STATUS_LABEL[tileStatus]}</span>
          <span className="weather-controls__timestamp">Updated {relativeTime(lastRefreshedAt)}</span>
        </div>
      )}
      {activeLayerDef && <p className="weather-controls__legend-hint">{activeLayerDef.legendHint}</p>}

      <div className="settings-menu__divider" />

      <label className="terrain-controls__row">
        <input type="checkbox" checked={forecastEnabled} onChange={(e) => onForecastEnabledChange(e.target.checked)} />
        Forecast for map center
      </label>

      {forecastEnabled && (
        <div className="weather-controls__forecast">
          {forecast.status === "loading" && <p className="weather-controls__hint">Loading forecast…</p>}
          {forecast.status === "error" && (
            <p className="weather-controls__hint weather-controls__hint--error">Forecast unavailable: {forecast.error}</p>
          )}
          {forecast.status === "ready" && forecast.data && hour && (
            <>
              <input
                type="range"
                min={0}
                max={forecast.data.hours.length - 1}
                value={hourIndex}
                onChange={(e) => onHourIndexChange(Number(e.target.value))}
                className="weather-controls__slider"
              />
              <div className="weather-controls__hour-label">
                {hourIndex === 0 ? "Now" : "Forecast"} — {formatHourLabel(hour.timeIso)}
              </div>
              <div className="weather-controls__grid">
                <div>
                  <span className="weather-controls__value">{hour.temperatureC ?? "—"}°C</span>
                  <span className="weather-controls__label">Temp</span>
                </div>
                <div>
                  <span className="weather-controls__value">{hour.precipitationMm ?? "—"} mm</span>
                  <span className="weather-controls__label">Precip</span>
                </div>
                <div>
                  <span className="weather-controls__value">{hour.snowfallCm ?? "—"} cm</span>
                  <span className="weather-controls__label">Snowfall</span>
                </div>
                <div>
                  <span className="weather-controls__value">{hour.windSpeedKmh ?? "—"} km/h</span>
                  <span className="weather-controls__label">Wind</span>
                </div>
                <div>
                  <span className="weather-controls__value">{hour.cloudCoverPercent ?? "—"}%</span>
                  <span className="weather-controls__label">Clouds</span>
                </div>
                <div>
                  <span className="weather-controls__value">{hour.freezingLevelM ?? "—"} m</span>
                  <span className="weather-controls__label">Freezing lvl</span>
                </div>
              </div>
              <div className="weather-controls__status-row">
                {forecast.isStale && <span className="weather-controls__status weather-controls__status--error">Stale data</span>}
                <button className="glass-btn" onClick={onRefreshForecast}>
                  Refresh
                </button>
              </div>
            </>
          )}
          <p className="weather-controls__attribution">Weather data by Open-Meteo.com</p>
        </div>
      )}
    </div>
  );
}
