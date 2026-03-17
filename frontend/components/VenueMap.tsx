"use client";

// VenueMap — client-only (leaflet requires window). Always loaded via dynamic() with ssr: false.
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import Link from "next/link";
import { useEffect } from "react";
import SignalButtons from "./SignalButtons";
import type { Recommendation } from "../types/recommendation";

// ─── trust signal helpers ─────────────────────────────────────────────────────

function getFreshnessLabel(minutes: number): { label: string; text: string; background: string; border: string } {
  if (minutes <= 5) return { label: "Live", text: "#065f46", background: "#ecfdf5", border: "#a7f3d0" };
  if (minutes <= 30) return { label: `${minutes}m ago`, text: "#92400e", background: "#fffbeb", border: "#fde68a" };
  if (minutes <= 90) return { label: `${minutes}m ago`, text: "#6b7280", background: "#f9fafb", border: "#e5e7eb" };
  return { label: `${Math.round(minutes / 60)}h ago`, text: "#9ca3af", background: "#f9fafb", border: "#f3f4f6" };
}

function hasEventTonight(recentActivity: Recommendation["recentActivity"]): boolean {
  return recentActivity.some((a) => a.signalType === "event_report" && a.minutesAgo < 24 * 60);
}

// ─── pulse → marker color ─────────────────────────────────────────────────────

const PULSE_COLORS: Record<1 | 2 | 3, string> = {
  1: "#22c55e", // chill / low
  2: "#f59e0b", // active / medium
  3: "#ef4444" // packed / high
};

const PULSE_LABELS: Record<1 | 2 | 3, string> = {
  1: "Chill",
  2: "Active",
  3: "Packed"
};

function makeMarkerIcon(pulseLevel: 1 | 2 | 3): L.DivIcon {
  const color = PULSE_COLORS[pulseLevel];
  return L.divIcon({
    className: "",
    html: `<div style="
      width:22px;height:22px;border-radius:50%;
      background:${color};border:3px solid white;
      box-shadow:0 2px 6px rgba(0,0,0,0.35);
    "></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -14]
  });
}

// ─── map flyTo on activeVenueId change ────────────────────────────────────────

type FlyToProps = {
  recommendations: Recommendation[];
  activeVenueId: string | null;
};

function FlyToActive({ recommendations, activeVenueId }: FlyToProps) {
  const map = useMap();

  useEffect(() => {
    if (!activeVenueId) return;
    const rec = recommendations.find((r) => r.venueId === activeVenueId);
    if (!rec || (!rec.latitude && !rec.longitude)) return;
    map.flyTo([rec.latitude, rec.longitude], 15, { duration: 0.8 });
  }, [activeVenueId, recommendations, map]);

  return null;
}

// ─── component ────────────────────────────────────────────────────────────────

type VenueMapProps = {
  recommendations: Recommendation[];
  activeVenueId: string | null;
  onVenueSelect: (venueId: string) => void;
  onSignalSubmitted: () => void;
};

const SF_CENTER: [number, number] = [37.773972, -122.431297];
const DEFAULT_ZOOM = 13;

export default function VenueMap({ recommendations, activeVenueId, onVenueSelect, onSignalSubmitted }: VenueMapProps) {
  // Only plot venues that have valid coordinates.
  const mappable = recommendations.filter((r) => r.latitude !== 0 || r.longitude !== 0);

  return (
    <div
      style={{
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #e5e7eb",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)"
      }}
    >
      <MapContainer
        center={SF_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ width: "100%", height: 400 }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FlyToActive recommendations={recommendations} activeVenueId={activeVenueId} />

        {mappable.map((rec) => (
          <Marker
            key={rec.venueId}
            position={[rec.latitude, rec.longitude]}
            icon={makeMarkerIcon(rec.pulseLevel)}
            eventHandlers={{ click: () => onVenueSelect(rec.venueId) }}
          >
            <Popup minWidth={220} maxWidth={260}>
              <div style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: 13, lineHeight: 1.4 }}>
                {/* Venue name */}
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>
                  <Link href={`/venue/${rec.venueId}`} style={{ color: "#1d4ed8", textDecoration: "none" }}>
                    {rec.venueName}
                  </Link>
                </div>

                {/* Neighborhood + category */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ color: "#6b7280" }}>{rec.neighborhood}</span>
                  {rec.category && (
                    <span
                      style={{
                        borderRadius: 999,
                        border: "1px solid #e5e7eb",
                        background: "#f9fafb",
                        color: "#9ca3af",
                        padding: "1px 6px",
                        fontSize: 11,
                        fontWeight: 500
                      }}
                    >
                      {rec.category === "live_music" ? "Live Music" : rec.category === "club" ? "Nightclub" : rec.category === "bar" ? "Bar" : rec.category === "lounge" ? "Lounge" : rec.category}
                    </span>
                  )}
                </div>

                {/* Status badges */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                  <span
                    style={{
                      background: PULSE_COLORS[rec.pulseLevel] + "22",
                      color: PULSE_COLORS[rec.pulseLevel],
                      border: `1px solid ${PULSE_COLORS[rec.pulseLevel]}55`,
                      borderRadius: 999,
                      padding: "2px 8px",
                      fontWeight: 600,
                      fontSize: 12
                    }}
                  >
                    {PULSE_LABELS[rec.pulseLevel]} pulse
                  </span>
                  <span
                    style={{
                      background: "#eff6ff",
                      color: "#1d4ed8",
                      border: "1px solid #dbeafe",
                      borderRadius: 999,
                      padding: "2px 8px",
                      fontWeight: 600,
                      fontSize: 12
                    }}
                  >
                    {rec.confidenceLabel} confidence
                  </span>
                  <span
                    style={{
                      background: "#f3f4f6",
                      color: "#374151",
                      border: "1px solid #d1d5db",
                      borderRadius: 999,
                      padding: "2px 8px",
                      fontWeight: 600,
                      fontSize: 12
                    }}
                  >
                    {rec.entryStatus}
                  </span>
                </div>

                {/* Why snippet */}
                {rec.why && (
                  <p style={{ margin: "0 0 8px", color: "#374151", fontSize: 12 }}>
                    {rec.why.length > 110 ? rec.why.slice(0, 110) + "…" : rec.why}
                  </p>
                )}

                {/* Trust bar: freshness + event tonight */}
                {(() => {
                  const fp = getFreshnessLabel(rec.lastUpdatedAgoMinutes);
                  const evt = hasEventTonight(rec.recentActivity);
                  return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8, alignItems: "center" }}>
                      <span
                        style={{
                          borderRadius: 999,
                          border: `1px solid ${fp.border}`,
                          background: fp.background,
                          color: fp.text,
                          padding: "2px 6px",
                          fontSize: 11,
                          fontWeight: 700
                        }}
                      >
                        {fp.label}
                      </span>
                      {evt && (
                        <span
                          style={{
                            borderRadius: 999,
                            border: "1px solid #ddd6fe",
                            background: "#f5f3ff",
                            color: "#6d28d9",
                            padding: "2px 6px",
                            fontSize: 11,
                            fontWeight: 600
                          }}
                        >
                          Event tonight
                        </span>
                      )}
                    </div>
                  );
                })()}

                {/* Signal buttons */}
                <SignalButtons venueId={rec.venueId} onSubmitted={onSignalSubmitted} />

                {/* Detail link */}
                <div style={{ marginTop: 8, textAlign: "right" }}>
                  <Link
                    href={`/venue/${rec.venueId}`}
                    style={{ color: "#1d4ed8", fontSize: 12, fontWeight: 600 }}
                  >
                    Full details →
                  </Link>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
