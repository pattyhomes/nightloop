import type { RawUserReportInput } from "../scoring";

export const mockReportsByVenueId: Record<string, RawUserReportInput[]> = {
  "venue-mission-district-01": [
    {
      reportId: "rpt-mission-1",
      venueId: "venue-mission-district-01",
      crowdLevel: 58,
      lineLengthMinutes: 15,
      socialActivity: 82,
      popularity: 77,
      confidence: 0.8,
      reportedAt: "2026-03-09T20:16:00.000Z"
    }
  ],
  "venue-north-beach-01": [
    {
      reportId: "rpt-nb-1",
      venueId: "venue-north-beach-01",
      crowdLevel: 42,
      lineLengthMinutes: 7,
      socialActivity: 64,
      popularity: 69,
      confidence: 0.76,
      reportedAt: "2026-03-09T20:08:00.000Z"
    }
  ],
  "venue-hayes-valley-01": [
    {
      reportId: "rpt-hv-1",
      venueId: "venue-hayes-valley-01",
      crowdLevel: 36,
      lineLengthMinutes: 5,
      socialActivity: 59,
      popularity: 62,
      confidence: 0.72,
      reportedAt: "2026-03-09T20:09:00.000Z"
    }
  ],
  "venue-soma-01": [
    {
      reportId: "rpt-soma-1",
      venueId: "venue-soma-01",
      crowdLevel: 90,
      lineLengthMinutes: 38,
      socialActivity: 92,
      popularity: 94,
      confidence: 0.86,
      reportedAt: "2026-03-09T20:17:00.000Z"
    }
  ],
  "venue-marina-01": [
    {
      reportId: "rpt-marina-1",
      venueId: "venue-marina-01",
      crowdLevel: 52,
      lineLengthMinutes: 11,
      socialActivity: 57,
      popularity: 61,
      confidence: 0.7,
      reportedAt: "2026-03-09T20:03:00.000Z"
    }
  ],
  "venue-castro-01": [
    {
      reportId: "rpt-castro-1",
      venueId: "venue-castro-01",
      crowdLevel: 46,
      lineLengthMinutes: 10,
      socialActivity: 78,
      popularity: 84,
      confidence: 0.83,
      reportedAt: "2026-03-09T20:14:00.000Z"
    }
  ],
  "venue-nopa-01": [
    {
      reportId: "rpt-nopa-1",
      venueId: "venue-nopa-01",
      crowdLevel: 30,
      lineLengthMinutes: 4,
      socialActivity: 52,
      popularity: 55,
      confidence: 0.68,
      reportedAt: "2026-03-09T20:07:00.000Z"
    }
  ]
};
