export type MockVenue = {
  id: string;
  name: string;
  neighborhood: string;
};

export const mockVenues: MockVenue[] = [
  { id: "venue-mission-district-01", name: "Valencia Social Hall", neighborhood: "Mission District" },
  { id: "venue-north-beach-01", name: "Coit Corner Lounge", neighborhood: "North Beach" },
  { id: "venue-hayes-valley-01", name: "Hayes Vinyl Room", neighborhood: "Hayes Valley" },
  { id: "venue-soma-01", name: "SOMA Pulse Club", neighborhood: "SoMa" },
  { id: "venue-marina-01", name: "Marina Harbor Taproom", neighborhood: "Marina District" },
  { id: "venue-castro-01", name: "Castro Neon Bar", neighborhood: "Castro" },
  { id: "venue-nopa-01", name: "Nopa Garden Loft", neighborhood: "NOPA" }
];
