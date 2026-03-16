import type { Signal } from "../types/signal";

// Override via NIGHTLOOP_FIXED_NOW env var (dev/test only, off by default).
function getNowMs(): number {
  return process.env.NIGHTLOOP_FIXED_NOW ? Date.parse(process.env.NIGHTLOOP_FIXED_NOW) : Date.now();
}

function minsAgo(n: number): string {
  return new Date(getNowMs() - n * 60_000).toISOString();
}

type SignalBundle = {
  venueId: string;
  observedAt: string;
  confidence: number;
  crowdLevel: number;
  lineLengthMinutes: number;
  socialActivity: number;
  popularity: number;
};

function buildSignal(
  venueId: string,
  signalType: string,
  signalValue: number,
  observedAt: string,
  confidence: number
): Signal {
  return {
    id: `signal-${venueId}-${signalType}`,
    venueId,
    signalType,
    signalValue,
    confidence,
    observedAt,
    source: "mock-sensor",
    payload: {
      signalType,
      units: signalType === "line_length_minutes" ? "minutes" : "index_0_100"
    },
    createdAt: minsAgo(20),
    updatedAt: minsAgo(20)
  };
}

function buildVenueSignals(bundle: SignalBundle): Signal[] {
  return [
    buildSignal(bundle.venueId, "crowd_level", bundle.crowdLevel, bundle.observedAt, bundle.confidence),
    buildSignal(
      bundle.venueId,
      "line_length_minutes",
      bundle.lineLengthMinutes,
      bundle.observedAt,
      bundle.confidence
    ),
    buildSignal(bundle.venueId, "social_activity", bundle.socialActivity, bundle.observedAt, bundle.confidence),
    buildSignal(bundle.venueId, "popularity", bundle.popularity, bundle.observedAt, bundle.confidence)
  ];
}

export const MOCK_SIGNALS: Signal[] = [
  ...buildVenueSignals({
    venueId: "venue-monarch",
    observedAt: minsAgo(5),
    confidence: 0.92,
    crowdLevel: 40,
    lineLengthMinutes: 14,
    socialActivity: 72,
    popularity: 66
  }),
  ...buildVenueSignals({
    venueId: "venue-public-works",
    observedAt: minsAgo(7),
    confidence: 0.9,
    crowdLevel: 48,
    lineLengthMinutes: 19,
    socialActivity: 82,
    popularity: 74
  }),
  ...buildVenueSignals({
    venueId: "venue-audio-sf",
    observedAt: minsAgo(8),
    confidence: 0.88,
    crowdLevel: 55,
    lineLengthMinutes: 23,
    socialActivity: 89,
    popularity: 86
  }),
  ...buildVenueSignals({
    venueId: "venue-1015-folsom",
    observedAt: minsAgo(9),
    confidence: 0.86,
    crowdLevel: 62,
    lineLengthMinutes: 30,
    socialActivity: 84,
    popularity: 90
  }),
  ...buildVenueSignals({
    venueId: "venue-the-midway",
    observedAt: minsAgo(10),
    confidence: 0.87,
    crowdLevel: 68,
    lineLengthMinutes: 36,
    socialActivity: 81,
    popularity: 83
  }),
  ...buildVenueSignals({
    venueId: "venue-temple",
    observedAt: minsAgo(11),
    confidence: 0.9,
    crowdLevel: 80,
    lineLengthMinutes: 52,
    socialActivity: 93,
    popularity: 95
  })
];
