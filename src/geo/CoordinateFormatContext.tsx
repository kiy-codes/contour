import { createContext, useContext, useState, type ReactNode } from "react";
import type { CoordinateFormat } from "./coordinateFormat";

interface CoordinateFormatApi {
  format: CoordinateFormat;
  toggle: () => void;
}

const CoordinateFormatContext = createContext<CoordinateFormatApi | null>(null);

export function CoordinateFormatProvider({ children }: { children: ReactNode }) {
  const [format, setFormat] = useState<CoordinateFormat>("dd");
  return (
    <CoordinateFormatContext.Provider value={{ format, toggle: () => setFormat((f) => (f === "dd" ? "dms" : "dd")) }}>
      {children}
    </CoordinateFormatContext.Provider>
  );
}

export function useCoordinateFormat(): CoordinateFormatApi {
  const ctx = useContext(CoordinateFormatContext);
  if (!ctx) throw new Error("useCoordinateFormat must be used within a CoordinateFormatProvider");
  return ctx;
}
