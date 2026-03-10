export interface Venue {
  id: string;
  slug: string | null;
  name: string;
  city: string | null;
  state: string | null;
  countryCode: string | null;
  latitude: number;
  longitude: number;
  source: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
