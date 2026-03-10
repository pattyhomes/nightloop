import type { Report } from "../types/report";

const FIXED_CREATED_AT = "2026-03-09T03:40:00.000Z";
const FIXED_UPDATED_AT = "2026-03-09T03:40:00.000Z";

type ReportSnapshot = {
  venueId: string;
  suffix: string;
  reportedAt: string;
  status: Report["status"];
  crowdLevel: number;
  lineLengthMinutes: number;
  socialActivity: number;
  popularity: number;
  confidence: number;
  notes: string;
};

function buildReport(snapshot: ReportSnapshot): Report {
  return {
    id: `report-${snapshot.venueId}-${snapshot.suffix}`,
    venueId: snapshot.venueId,
    reporterId: `mock-user-${snapshot.suffix}`,
    reportType: "venue_observation",
    status: snapshot.status,
    notes: snapshot.notes,
    reportData: {
      crowdLevel: snapshot.crowdLevel,
      lineLengthMinutes: snapshot.lineLengthMinutes,
      socialActivity: snapshot.socialActivity,
      popularity: snapshot.popularity,
      confidence: snapshot.confidence
    },
    reportedAt: snapshot.reportedAt,
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  };
}

export const MOCK_REPORTS: Report[] = [
  buildReport({
    venueId: "venue-monarch",
    suffix: "a",
    reportedAt: "2026-03-09T03:54:00.000Z",
    status: "reviewed",
    crowdLevel: 38,
    lineLengthMinutes: 12,
    socialActivity: 74,
    popularity: 68,
    confidence: 0.9,
    notes: "Fast entry and room to move near main floor."
  }),
  buildReport({
    venueId: "venue-monarch",
    suffix: "b",
    reportedAt: "2026-03-09T03:46:00.000Z",
    status: "submitted",
    crowdLevel: 42,
    lineLengthMinutes: 15,
    socialActivity: 70,
    popularity: 64,
    confidence: 0.86,
    notes: "Steady but not packed yet."
  }),
  buildReport({
    venueId: "venue-public-works",
    suffix: "a",
    reportedAt: "2026-03-09T03:52:00.000Z",
    status: "reviewed",
    crowdLevel: 46,
    lineLengthMinutes: 18,
    socialActivity: 84,
    popularity: 76,
    confidence: 0.88,
    notes: "Dance floor has strong energy and quick entrance."
  }),
  buildReport({
    venueId: "venue-public-works",
    suffix: "b",
    reportedAt: "2026-03-09T03:44:00.000Z",
    status: "submitted",
    crowdLevel: 50,
    lineLengthMinutes: 21,
    socialActivity: 80,
    popularity: 72,
    confidence: 0.84,
    notes: "Moderate crowd and easy bar access."
  }),
  buildReport({
    venueId: "venue-audio-sf",
    suffix: "a",
    reportedAt: "2026-03-09T03:51:00.000Z",
    status: "reviewed",
    crowdLevel: 53,
    lineLengthMinutes: 22,
    socialActivity: 90,
    popularity: 88,
    confidence: 0.87,
    notes: "Very active room with manageable wait."
  }),
  buildReport({
    venueId: "venue-audio-sf",
    suffix: "b",
    reportedAt: "2026-03-09T03:43:00.000Z",
    status: "submitted",
    crowdLevel: 56,
    lineLengthMinutes: 24,
    socialActivity: 87,
    popularity: 84,
    confidence: 0.83,
    notes: "Busy dance floor, line moves at a steady pace."
  }),
  buildReport({
    venueId: "venue-1015-folsom",
    suffix: "a",
    reportedAt: "2026-03-09T03:50:00.000Z",
    status: "reviewed",
    crowdLevel: 60,
    lineLengthMinutes: 28,
    socialActivity: 86,
    popularity: 92,
    confidence: 0.85,
    notes: "High energy across rooms, moderate queue."
  }),
  buildReport({
    venueId: "venue-1015-folsom",
    suffix: "b",
    reportedAt: "2026-03-09T03:42:00.000Z",
    status: "submitted",
    crowdLevel: 64,
    lineLengthMinutes: 32,
    socialActivity: 82,
    popularity: 88,
    confidence: 0.82,
    notes: "Crowding picks up closer to headliner set."
  }),
  buildReport({
    venueId: "venue-the-midway",
    suffix: "a",
    reportedAt: "2026-03-09T03:49:00.000Z",
    status: "reviewed",
    crowdLevel: 66,
    lineLengthMinutes: 34,
    socialActivity: 82,
    popularity: 84,
    confidence: 0.86,
    notes: "Large space keeps movement easy despite turnout."
  }),
  buildReport({
    venueId: "venue-the-midway",
    suffix: "b",
    reportedAt: "2026-03-09T03:41:00.000Z",
    status: "submitted",
    crowdLevel: 69,
    lineLengthMinutes: 37,
    socialActivity: 79,
    popularity: 81,
    confidence: 0.82,
    notes: "Steady foot traffic between rooms."
  }),
  buildReport({
    venueId: "venue-temple",
    suffix: "a",
    reportedAt: "2026-03-09T03:48:00.000Z",
    status: "reviewed",
    crowdLevel: 78,
    lineLengthMinutes: 49,
    socialActivity: 94,
    popularity: 96,
    confidence: 0.89,
    notes: "Great vibe but entry line is long right now."
  }),
  buildReport({
    venueId: "venue-temple",
    suffix: "b",
    reportedAt: "2026-03-09T03:40:00.000Z",
    status: "submitted",
    crowdLevel: 82,
    lineLengthMinutes: 54,
    socialActivity: 92,
    popularity: 94,
    confidence: 0.85,
    notes: "Packed main floor near peak time."
  })
];
