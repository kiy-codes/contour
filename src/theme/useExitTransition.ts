import { useEffect, useRef, useState } from "react";

/** Keeps a conditionally-rendered element mounted for `durationMs` after
 * `open` goes false, so a CSS close animation (applied via the returned
 * `closing` flag) has time to actually play instead of the element just
 * vanishing instantly when React unmounts it. */
export function useExitTransition(open: boolean, durationMs: number): { rendered: boolean; closing: boolean } {
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (open) {
      clearTimeout(timerRef.current);
      setRendered(true);
      setClosing(false);
    } else if (rendered) {
      setClosing(true);
      timerRef.current = setTimeout(() => {
        setRendered(false);
        setClosing(false);
      }, durationMs);
    }
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, durationMs]);

  return { rendered, closing };
}
