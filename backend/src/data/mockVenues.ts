import type { Venue } from "../types/venue";

export interface MockVenue extends Venue {
  neighborhood: string;
}

const FIXED_CREATED_AT = "2026-03-01T00:00:00.000Z";
const FIXED_UPDATED_AT = "2026-03-09T03:30:00.000Z";

export const MOCK_VENUES: MockVenue[] = [
  {
    id: "venue-audio-sf",
    slug: "audio-sf",
    name: "Audio",
    neighborhood: "SoMa",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.7816,
    longitude: -122.3976,
    source: "mock",
    metadata: {
      musicStyle: "house/techno",
      typicalOpenHour: 22
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-monarch",
    slug: "monarch-sf",
    name: "Monarch",
    neighborhood: "SoMa",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.7826,
    longitude: -122.4096,
    source: "mock",
    metadata: {
      musicStyle: "house/disco",
      typicalOpenHour: 21
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-public-works",
    slug: "public-works",
    name: "Public Works",
    neighborhood: "Mission",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.7643,
    longitude: -122.4217,
    source: "mock",
    metadata: {
      musicStyle: "electronic/multi-room",
      typicalOpenHour: 21
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-1015-folsom",
    slug: "1015-folsom",
    name: "1015 Folsom",
    neighborhood: "SoMa",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.7785,
    longitude: -122.4057,
    source: "mock",
    metadata: {
      musicStyle: "electronic/edm",
      typicalOpenHour: 22
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-temple",
    slug: "temple-nightclub",
    name: "Temple Nightclub",
    neighborhood: "SoMa",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.7876,
    longitude: -122.4003,
    source: "mock",
    metadata: {
      musicStyle: "open-format/electronic",
      typicalOpenHour: 22
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-the-midway",
    slug: "the-midway",
    name: "The Midway",
    neighborhood: "Dogpatch",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.7597,
    longitude: -122.3882,
    source: "mock",
    metadata: {
      musicStyle: "electronic/live events",
      typicalOpenHour: 20
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  }
];
