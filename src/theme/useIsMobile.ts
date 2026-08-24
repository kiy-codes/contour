import { useEffect, useState } from "react";

const QUERY = "(max-width: 700px)";

/** True for phone-sized viewports — used to switch between the desktop
 * stacked-panel layout and the mobile bottom-sheet/FAB layout, which are
 * different enough in structure (not just size) to need actual conditional
 * rendering rather than a pure CSS breakpoint. */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
