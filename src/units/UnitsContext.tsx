import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type UnitSystem = "metric" | "imperial";

export interface UnitsApi {
  system: UnitSystem;
  toggle: () => void;
  /** Long-form distance, e.g. "1.55 km" / "0.96 mi". */
  formatDistance: (meters: number) => string;
  /** Short elevation/height, e.g. "1,234 m" / "4,048 ft". */
  formatElevation: (meters: number) => string;
  /** Slope/grade as a percentage — unit-independent, kept here for one
   * consistent formatting call site. */
  formatSlope: (percent: number) => string;
}

const UnitsContext = createContext<UnitsApi | null>(null);

const METERS_PER_MILE = 1609.344;
const METERS_PER_FOOT = 0.3048;

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [system, setSystem] = useState<UnitSystem>("metric");

  const api = useMemo<UnitsApi>(() => {
    const formatDistance = (meters: number) => {
      if (system === "imperial") {
        const miles = meters / METERS_PER_MILE;
        return miles < 0.1 ? `${Math.round(meters / METERS_PER_FOOT)} ft` : `${miles.toFixed(2)} mi`;
      }
      return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(2)} km`;
    };

    const formatElevation = (meters: number) => {
      if (system === "imperial") return `${Math.round(meters / METERS_PER_FOOT).toLocaleString()} ft`;
      return `${Math.round(meters).toLocaleString()} m`;
    };

    const formatSlope = (percent: number) => `${percent.toFixed(1)}%`;

    return {
      system,
      toggle: () => setSystem((s) => (s === "metric" ? "imperial" : "metric")),
      formatDistance,
      formatElevation,
      formatSlope,
    };
  }, [system]);

  return <UnitsContext.Provider value={api}>{children}</UnitsContext.Provider>;
}

export function useUnits(): UnitsApi {
  const ctx = useContext(UnitsContext);
  if (!ctx) throw new Error("useUnits must be used within a UnitsProvider");
  return ctx;
}
