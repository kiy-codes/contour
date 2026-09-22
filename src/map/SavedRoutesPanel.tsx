import { useEffect, useMemo, useState } from "react";
import type { RoutingMode } from "../providers/RoutingProvider";
import { deleteSavedRoute, listSavedRoutes, sortSavedRoutes, updateSavedRoute, type SavedRoute } from "../routing/savedRoutes";
import { useUnits } from "../units/UnitsContext";
import "./SavedRoutesPanel.css";

const MODE_LABEL: Record<RoutingMode, string> = {
  hiking: "Hiking",
  walking: "Walking",
  cycling: "Cycling",
  driving: "Driving",
  manual: "Manual",
};

export interface SavedRoutesPanelProps {
  onClose: () => void;
  /** Loads the route onto the map — waypoint-editable if it has waypoints,
   * otherwise as a view-only imported track. Caller also closes the panel. */
  onLoad: (route: SavedRoute) => void;
}

export default function SavedRoutesPanel({ onClose, onLoad }: SavedRoutesPanelProps) {
  const { formatDistance, formatElevation } = useUnits();
  const [routes, setRoutes] = useState<SavedRoute[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    let cancelled = false;
    listSavedRoutes().then((rows) => {
      if (!cancelled) {
        setRoutes(rows);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const filtered = trimmed ? routes.filter((r) => r.name.toLowerCase().includes(trimmed)) : routes;
    return sortSavedRoutes(filtered);
  }, [routes, query]);

  const handleToggleStarred = async (route: SavedRoute) => {
    const updated = await updateSavedRoute(route.id, { starred: !route.starred });
    if (updated) setRoutes((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
  };

  const handleTogglePinned = async (route: SavedRoute) => {
    const updated = await updateSavedRoute(route.id, { pinned: !route.pinned });
    if (updated) setRoutes((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
  };

  const handleStartEdit = (route: SavedRoute) => {
    setEditingId(route.id);
    setEditingName(route.name);
  };

  const handleCommitEdit = async (id: string) => {
    setEditingId(null);
    const name = editingName.trim();
    if (!name) return;
    const updated = await updateSavedRoute(id, { name });
    if (updated) setRoutes((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
  };

  const handleDelete = async (route: SavedRoute) => {
    if (!window.confirm(`Delete "${route.name}"? This can't be undone.`)) return;
    await deleteSavedRoute(route.id);
    setRoutes((rs) => rs.filter((r) => r.id !== route.id));
  };

  return (
    <div className="saved-routes-backdrop" onClick={onClose}>
      <div className="saved-routes-panel" onClick={(e) => e.stopPropagation()}>
        <div className="saved-routes-panel__header">
          <span>Saved routes</span>
          <button className="saved-routes-panel__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {routes.length > 0 && (
          <input
            className="saved-routes-panel__search"
            type="text"
            placeholder="Search saved routes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}

        {!loaded ? null : routes.length === 0 ? (
          <div className="saved-routes-panel__empty">
            No saved routes yet — plan or draw a route, then use "Save route" to keep it here.
          </div>
        ) : visible.length === 0 ? (
          <div className="saved-routes-panel__empty">No routes match "{query}".</div>
        ) : (
          <ul className="saved-routes-panel__list">
            {visible.map((route) => (
              <SavedRouteRow
                key={route.id}
                route={route}
                editing={editingId === route.id}
                editingName={editingName}
                onEditingNameChange={setEditingName}
                onStartEdit={() => handleStartEdit(route)}
                onCommitEdit={() => handleCommitEdit(route.id)}
                onLoad={() => onLoad(route)}
                onToggleStarred={() => handleToggleStarred(route)}
                onTogglePinned={() => handleTogglePinned(route)}
                onDelete={() => handleDelete(route)}
                formatDistance={formatDistance}
                formatElevation={formatElevation}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface SavedRouteRowProps {
  route: SavedRoute;
  editing: boolean;
  editingName: string;
  onEditingNameChange: (value: string) => void;
  onStartEdit: () => void;
  onCommitEdit: () => void;
  onLoad: () => void;
  onToggleStarred: () => void;
  onTogglePinned: () => void;
  onDelete: () => void;
  formatDistance: (meters: number) => string;
  formatElevation: (meters: number) => string;
}

function SavedRouteRow({
  route,
  editing,
  editingName,
  onEditingNameChange,
  onStartEdit,
  onCommitEdit,
  onLoad,
  onToggleStarred,
  onTogglePinned,
  onDelete,
  formatDistance,
  formatElevation,
}: SavedRouteRowProps) {
  return (
    <li className={route.pinned ? "saved-routes-panel__row saved-routes-panel__row--pinned" : "saved-routes-panel__row"}>
      <div className="saved-routes-panel__row-main">
        {editing ? (
          <input
            autoFocus
            value={editingName}
            onChange={(e) => onEditingNameChange(e.target.value)}
            onBlur={onCommitEdit}
            onKeyDown={(e) => e.key === "Enter" && onCommitEdit()}
            className="saved-routes-panel__name-input"
          />
        ) : (
          <button className="saved-routes-panel__name" onClick={onLoad} title="Load this route">
            {route.name}
          </button>
        )}
        <button className="saved-routes-panel__icon-btn" onClick={onStartEdit} title="Rename" aria-label="Rename">
          ✎
        </button>
      </div>
      <div className="saved-routes-panel__meta">
        <span>{MODE_LABEL[route.mode]}</span>
        <span>{formatDistance(route.result.distanceMeters)}</span>
        {route.result.ascentMeters !== undefined && <span>↑ {formatElevation(route.result.ascentMeters)}</span>}
        <span>{new Date(route.updatedAt).toLocaleDateString()}</span>
        {route.waypoints === undefined && <span title="Loads as a view-only track, not waypoint-editable">view-only</span>}
      </div>
      <div className="saved-routes-panel__actions">
        <button
          className={route.starred ? "saved-routes-panel__icon-btn saved-routes-panel__icon-btn--active" : "saved-routes-panel__icon-btn"}
          onClick={onToggleStarred}
          title={route.starred ? "Unstar" : "Star"}
          aria-label={route.starred ? "Unstar" : "Star"}
        >
          {route.starred ? "★" : "☆"}
        </button>
        <button
          className={route.pinned ? "saved-routes-panel__icon-btn saved-routes-panel__icon-btn--active" : "saved-routes-panel__icon-btn"}
          onClick={onTogglePinned}
          title={route.pinned ? "Unpin from top" : "Pin to top"}
          aria-label={route.pinned ? "Unpin from top" : "Pin to top"}
        >
          📌
        </button>
        <button onClick={onLoad}>Load</button>
        <button onClick={onDelete}>Delete</button>
      </div>
    </li>
  );
}
