import { useEffect, useRef, useState } from "react";
import type { GeocodingProvider, SearchResult } from "../providers/GeocodingProvider";
import { useExitTransition } from "../theme/useExitTransition";
import "./SearchBar.css";

const CLOSE_ANIMATION_MS = 180;

export interface SearchBarProps {
  provider: GeocodingProvider;
  onSelect: (result: SearchResult) => void;
}

const DEBOUNCE_MS = 300;

const TYPE_LABEL: Record<SearchResult["type"], string> = {
  country: "Country",
  region: "Region",
  city: "City",
  town: "Town",
  village: "Village",
  street: "Street",
  address: "Address",
  peak: "Peak",
  lake: "Water",
  poi: "Place",
  other: "Place",
};

export default function SearchBar({ provider, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { rendered, closing } = useExitTransition(open, CLOSE_ANIMATION_MS);
  // pick() sets query to the selected result's label, which would otherwise
  // re-trigger the search effect below and reopen the list once that
  // re-search resolves — set right before that setQuery call, consumed
  // (and cleared) by the very next effect run so it only skips that one.
  const suppressNextSearchRef = useRef(false);

  useEffect(() => {
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      setError(false);
      return;
    }

    setLoading(true);
    setError(false);
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const found = await provider.search(trimmed, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setResults(found);
        setOpen(true);
        setActiveIndex(-1);
      } catch {
        if (controller.signal.aborted) return;
        setResults([]);
        setError(true);
        setOpen(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, provider]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const pick = (result: SearchResult) => {
    onSelect(result);
    suppressNextSearchRef.current = true;
    setQuery(result.label);
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = results[activeIndex] ?? results[0];
      if (chosen) pick(chosen);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="search-bar" ref={containerRef}>
      <div className="search-bar__input-row">
        <svg className="search-bar__icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="search-results-listbox"
          aria-label="Search for a place"
          placeholder="Search countries, cities, streets, peaks…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {loading && <span className="search-bar__spinner" aria-hidden="true" />}
      </div>

      {rendered && (
        <ul
          id="search-results-listbox"
          role="listbox"
          className={closing ? "search-bar__results search-bar__results--closing" : "search-bar__results"}
        >
          {error && <li className="search-bar__message">Search is temporarily unavailable — try again shortly.</li>}
          {!error && results.length === 0 && <li className="search-bar__message">No results</li>}
          {!error &&
            results.map((r, i) => (
              <li
                key={r.id}
                role="option"
                aria-selected={i === activeIndex}
                className={i === activeIndex ? "search-bar__result search-bar__result--active" : "search-bar__result"}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(r)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <span className="search-bar__result-type">{TYPE_LABEL[r.type]}</span>
                <span className="search-bar__result-label">{r.label}</span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
