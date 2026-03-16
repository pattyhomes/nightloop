import type { Report } from "../types/report";

// Override via NIGHTLOOP_FIXED_NOW env var (dev/test only, off by default).
function getNowMs(): number {
  return process.env.NIGHTLOOP_FIXED_NOW ? Date.parse(process.env.NIGHTLOOP_FIXED_NOW) : Date.now();
}

function minsAgo(n: number): string {
  return new Date(getNowMs() - n * 60_000).toISOString();
}

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
    createdAt: minsAgo(20),
    updatedAt: minsAgo(20)
  };
}

export const MOCK_REPORTS: Report[] = [
  buildReport({
    venueId: "venue-monarch",
    suffix: "a",
    reportedAt: minsAgo(6),
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
    reportedAt: minsAgo(14),
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
    reportedAt: minsAgo(8),
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
    reportedAt: minsAgo(16),
    status: "submitted",
    crowdLevel: 50,
    lineLengthMinutes: 21,
    socialActivity: 80,
    popularity: 72,
    confidence: 0.84,
    notes: "Moderate crowd and easy bar access."
  }),
  buildReport({
    venueId: "venue-audio",
    suffix: "a",
    reportedAt: minsAgo(9),
    status: "reviewed",
    crowdLevel: 53,
    lineLengthMinutes: 22,
    socialActivity: 90,
    popularity: 88,
    confidence: 0.87,
    notes: "Very active room with manageable wait."
  }),
  buildReport({
    venueId: "venue-audio",
    suffix: "b",
    reportedAt: minsAgo(17),
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
    reportedAt: minsAgo(10),
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
    reportedAt: minsAgo(18),
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
    reportedAt: minsAgo(11),
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
    reportedAt: minsAgo(19),
    status: "submitted",
    crowdLevel: 69,
    lineLengthMinutes: 37,
    socialActivity: 79,
    popularity: 81,
    confidence: 0.82,
    notes: "Steady foot traffic between rooms."
  }),
  buildReport({
    venueId: "venue-temple-nightclub",
    suffix: "a",
    reportedAt: minsAgo(12),
    status: "reviewed",
    crowdLevel: 78,
    lineLengthMinutes: 49,
    socialActivity: 94,
    popularity: 96,
    confidence: 0.89,
    notes: "Great vibe but entry line is long right now."
  }),
  buildReport({
    venueId: "venue-temple-nightclub",
    suffix: "b",
    reportedAt: minsAgo(20),
    status: "submitted",
    crowdLevel: 82,
    lineLengthMinutes: 54,
    socialActivity: 92,
    popularity: 94,
    confidence: 0.85,
    notes: "Packed main floor near peak time."
  })
];
