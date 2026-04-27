export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type GeoJsonPolygon = {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
};

export type NeighborhoodFeature = {
  display_name: string;
  polygon: GeoJsonPolygon;
};

const nameMap: Record<string, string> = {
  "south of market": "SoMa",
  soma: "SoMa",
  mission: "Mission",
  "mission district": "Mission",
  "north beach": "North Beach",
  castro: "Castro",
  marina: "Marina",
  "hayes valley": "Hayes Valley",
  "financial district/south beach": "Financial District",
  "financial district": "Financial District",
  "tenderloin": "Tenderloin",
  "potrero hill": "Potrero Hill",
  dogpatch: "Dogpatch",
  "western addition": "Fillmore",
  "nob hill": "Lower Nob Hill/Polk",
  "russian hill": "Lower Nob Hill/Polk"
};

export function normalizeSfNeighborhoodName(value: string | null | undefined): string {
  const normalized = (value ?? "").trim();
  if (!normalized) return "Unknown";
  const key = normalized.toLowerCase();
  return nameMap[key] ?? normalized;
}

function ringContains(point: Coordinate, ring: number[][]): boolean {
  let inside = false;
  const x = point.longitude;
  const y = point.latitude;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i]?.[0]);
    const yi = Number(ring[i]?.[1]);
    const xj = Number(ring[j]?.[0]);
    const yj = Number(ring[j]?.[1]);
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonContains(point: Coordinate, polygon: number[][][]): boolean {
  const [outer, ...holes] = polygon;
  if (!outer || !ringContains(point, outer)) return false;
  return !holes.some((hole) => ringContains(point, hole));
}

export function pointInPolygon(point: Coordinate, polygon: GeoJsonPolygon): boolean {
  if (polygon.type === "Polygon") {
    return polygonContains(point, polygon.coordinates as number[][][]);
  }
  return (polygon.coordinates as number[][][][]).some((part) => polygonContains(point, part));
}

export function resolveSfNeighborhoodFromFeatures(
  point: Coordinate,
  features: NeighborhoodFeature[]
): string | null {
  const match = features.find((feature) => pointInPolygon(point, feature.polygon));
  return match ? normalizeSfNeighborhoodName(match.display_name) : null;
}
