import type { RawVenueSignalsInput } from "../scoring";

export const mockSignalsByVenueId: Record<string, RawVenueSignalsInput> = {
  "venue-mission-district-01": {
    venueId: "venue-mission-district-01",
    crowdLevel: 62,
    lineLengthMinutes: 18,
    socialActivity: 84,
    popularity: 79,
    confidence: 0.92,
    observedAt: "2026-03-09T20:20:00.000Z"
  },
  "venue-north-beach-01": {
    venueId: "venue-north-beach-01",
    crowdLevel: 48,
    lineLengthMinutes: 8,
    socialActivity: 67,
    popularity: 70,
    confidence: 0.86,
    observedAt: "2026-03-09T20:10:00.000Z"
  },
  "venue-hayes-valley-01": {
    venueId: "venue-hayes-valley-01",
    crowdLevel: 38,
    lineLengthMinutes: 6,
    socialActivity: 61,
    popularity: 65,
    confidence: 0.83,
    observedAt: "2026-03-09T20:15:00.000Z"
  },
  "venue-soma-01": {
    venueId: "venue-soma-01",
    crowdLevel: 86,
    lineLengthMinutes: 34,
    socialActivity: 90,
    popularity: 93,
    confidence: 0.95,
    observedAt: "2026-03-09T20:19:00.000Z"
  },
  "venue-marina-01": {
    venueId: "venue-marina-01",
    crowdLevel: 55,
    lineLengthMinutes: 12,
    socialActivity: 58,
    popularity: 63,
    confidence: 0.81,
    observedAt: "2026-03-09T20:05:00.000Z"
  },
  "venue-castro-01": {
    venueId: "venue-castro-01",
    crowdLevel: 44,
    lineLengthMinutes: 9,
    socialActivity: 76,
    popularity: 82,
    confidence: 0.9,
    observedAt: "2026-03-09T20:18:00.000Z"
  },
  "venue-nopa-01": {
    venueId: "venue-nopa-01",
    crowdLevel: 33,
    lineLengthMinutes: 5,
    socialActivity: 54,
    popularity: 57,
    confidence: 0.78,
    observedAt: "2026-03-09T20:12:00.000Z"
  }
};
