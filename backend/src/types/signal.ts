export interface Signal {
  id: string;
  venueId: string;
  signalType: string;
  signalValue: number | null;
  confidence: number | null;
  observedAt: string;
  source: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
