import type { AvalancheRegionFeature } from "../providers/AvalancheProvider";
import "./PlaceInfoPanel.css";
import "./AvalancheInfoPanel.css";

export interface AvalancheInfoPanelProps {
  feature: AvalancheRegionFeature;
  onClose: () => void;
}

export default function AvalancheInfoPanel({ feature, onClose }: AvalancheInfoPanelProps) {
  const p = feature.properties;
  const hasRating = p.danger_level >= 0;

  return (
    <div className="place-info-panel avalanche-info-panel">
      <button className="place-info-panel__close" onClick={onClose} aria-label="Close avalanche information">
        ×
      </button>
      <div className="place-info-panel__type">Avalanche forecast center</div>
      <h2 className="place-info-panel__name">{p.name}</h2>

      <dl className="place-info-panel__facts">
        {p.state && (
          <>
            <dt>State</dt>
            <dd>{p.state}</dd>
          </>
        )}
        <dt>Current rating</dt>
        <dd>
          <span
            className="avalanche-info-panel__badge"
            style={{ background: hasRating ? p.color : "transparent", color: hasRating ? "#fff" : "var(--text-primary)" }}
          >
            {p.danger}
          </span>
        </dd>
        {p.off_season && (
          <>
            <dt>Status</dt>
            <dd>Off-season — this center is not issuing forecasts right now</dd>
          </>
        )}
      </dl>

      {p.travel_advice && <p className="avalanche-info-panel__advice">{p.travel_advice}</p>}

      <a className="avalanche-info-panel__link" href={p.link || p.center_link} target="_blank" rel="noreferrer">
        View full official forecast ↗
      </a>

      <p className="avalanche-info-panel__disclaimer">
        This is a summary of {p.center}'s published rating, not a substitute for the full official forecast. Always consult official
        local avalanche services, check current conditions, and get proper avalanche safety training before travelling in avalanche
        terrain.
      </p>
    </div>
  );
}
