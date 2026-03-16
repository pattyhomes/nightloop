import type { Venue, VenueCategory } from "../types/venue";

export interface MockVenue extends Venue {
  neighborhood: string;
  category: VenueCategory;
}

const FIXED_CREATED_AT = "2026-03-01T00:00:00.000Z";
const FIXED_UPDATED_AT = "2026-03-10T00:00:00.000Z";

export const MOCK_VENUES: MockVenue[] = [
  {
    id: "venue-audio",
    slug: "audio",
    name: "Audio",
    neighborhood: "SoMa",
    category: "club",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.780591,
    longitude: -122.41405,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-halcyon",
    slug: "halcyon",
    name: "Halcyon",
    neighborhood: "SoMa",
    category: "club",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.775125,
    longitude: -122.410482,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-1015-folsom",
    slug: "1015-folsom",
    name: "1015 Folsom",
    neighborhood: "SoMa",
    category: "club",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.782047,
    longitude: -122.402319,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-temple-nightclub",
    slug: "temple-nightclub",
    name: "Temple Nightclub",
    neighborhood: "SoMa",
    category: "club",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.784383,
    longitude: -122.412935,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-monarch",
    slug: "monarch",
    name: "Monarch",
    neighborhood: "SoMa",
    category: "club",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.777329,
    longitude: -122.413964,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-butter-sf",
    slug: "butter-sf",
    name: "Butter SF",
    neighborhood: "SoMa",
    category: "club",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.77428,
    longitude: -122.405404,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-public-works",
    slug: "public-works",
    name: "Public Works",
    neighborhood: "SoMa",
    category: "live_music",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.771398,
    longitude: -122.410921,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-the-midway",
    slug: "the-midway",
    name: "The Midway",
    neighborhood: "Dogpatch",
    category: "live_music",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.760716,
    longitude: -122.395285,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-great-northern",
    slug: "great-northern",
    name: "Great Northern",
    neighborhood: "SoMa",
    category: "club",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.780748,
    longitude: -122.404691,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-dna-lounge",
    slug: "dna-lounge",
    name: "DNA Lounge",
    neighborhood: "SoMa",
    category: "club",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.774307,
    longitude: -122.403893,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-the-endup",
    slug: "the-endup",
    name: "The EndUp",
    neighborhood: "SoMa",
    category: "club",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.783141,
    longitude: -122.414383,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-raven-bar",
    slug: "raven-bar",
    name: "Raven Bar",
    neighborhood: "SoMa",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.783087,
    longitude: -122.401933,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-district-san-francisco",
    slug: "district-san-francisco",
    name: "District San Francisco",
    neighborhood: "SoMa",
    category: "club",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.776104,
    longitude: -122.411701,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-oasis-arts-soma-pop-up",
    slug: "oasis-arts-soma-pop-up",
    name: "Oasis Arts (SoMa Pop-up)",
    neighborhood: "SoMa",
    category: "lounge",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.785358,
    longitude: -122.408441,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-cat-club",
    slug: "cat-club",
    name: "Cat Club",
    neighborhood: "SoMa",
    category: "club",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.772391,
    longitude: -122.412759,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-f8-1192",
    slug: "f8-1192",
    name: "F8 1192",
    neighborhood: "SoMa",
    category: "club",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.783712,
    longitude: -122.403633,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-el-rio",
    slug: "el-rio",
    name: "El Rio",
    neighborhood: "Mission",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.764107,
    longitude: -122.410665,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-make-out-room",
    slug: "make-out-room",
    name: "Make-Out Room",
    neighborhood: "Mission",
    category: "live_music",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.760043,
    longitude: -122.406284,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-the-chapel",
    slug: "the-chapel",
    name: "The Chapel",
    neighborhood: "Mission",
    category: "live_music",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.757678,
    longitude: -122.413863,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-valencia-room",
    slug: "valencia-room",
    name: "Valencia Room",
    neighborhood: "Mission",
    category: "live_music",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.764441,
    longitude: -122.412667,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-blondie-s-bar",
    slug: "blondie-s-bar",
    name: "Blondie's Bar",
    neighborhood: "Mission",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.764926,
    longitude: -122.413408,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-the-beehive-sf",
    slug: "the-beehive-sf",
    name: "The Beehive SF",
    neighborhood: "Mission",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.762569,
    longitude: -122.422975,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-abv",
    slug: "abv",
    name: "ABV",
    neighborhood: "Mission",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.755418,
    longitude: -122.418591,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-trick-dog",
    slug: "trick-dog",
    name: "Trick Dog",
    neighborhood: "Mission",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.753197,
    longitude: -122.41961,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-lolinda-bar",
    slug: "lolinda-bar",
    name: "Lolinda Bar",
    neighborhood: "Mission",
    category: "lounge",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.753515,
    longitude: -122.418796,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-dr-teeth-and-the-electric-mayhem",
    slug: "dr-teeth-and-the-electric-mayhem",
    name: "Dr. Teeth and the Electric Mayhem",
    neighborhood: "Mission",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.761535,
    longitude: -122.417233,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-latin-american-club",
    slug: "latin-american-club",
    name: "Latin American Club",
    neighborhood: "Mission",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.757553,
    longitude: -122.420029,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-shotwell-s",
    slug: "shotwell-s",
    name: "Shotwell's",
    neighborhood: "Mission",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.756005,
    longitude: -122.40694,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-bender-s-bar-grill",
    slug: "bender-s-bar-grill",
    name: "Bender's Bar & Grill",
    neighborhood: "Mission",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.761721,
    longitude: -122.412836,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-zeitgeist",
    slug: "zeitgeist",
    name: "Zeitgeist",
    neighborhood: "Mission",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.754567,
    longitude: -122.410676,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-kilowatt",
    slug: "kilowatt",
    name: "Kilowatt",
    neighborhood: "Mission",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.754451,
    longitude: -122.41697,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-the-cafe",
    slug: "the-cafe",
    name: "The Cafe",
    neighborhood: "Castro",
    category: "club",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.768243,
    longitude: -122.43248,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-beaux",
    slug: "beaux",
    name: "Beaux",
    neighborhood: "Castro",
    category: "club",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.761754,
    longitude: -122.431677,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-twin-peaks-tavern",
    slug: "twin-peaks-tavern",
    name: "Twin Peaks Tavern",
    neighborhood: "Castro",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.766043,
    longitude: -122.430032,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-440-castro",
    slug: "440-castro",
    name: "440 Castro",
    neighborhood: "Castro",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.756836,
    longitude: -122.443422,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-moby-dick",
    slug: "moby-dick",
    name: "Moby Dick",
    neighborhood: "Castro",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.758132,
    longitude: -122.439181,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-toad-hall",
    slug: "toad-hall",
    name: "Toad Hall",
    neighborhood: "Castro",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.756565,
    longitude: -122.427028,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-last-call",
    slug: "last-call",
    name: "Last Call",
    neighborhood: "Castro",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.766546,
    longitude: -122.438336,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-badlands",
    slug: "badlands",
    name: "Badlands",
    neighborhood: "Castro",
    category: "club",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.763232,
    longitude: -122.436879,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-the-mix",
    slug: "the-mix",
    name: "The Mix",
    neighborhood: "Castro",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.767118,
    longitude: -122.435741,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-hi-tops",
    slug: "hi-tops",
    name: "Hi Tops",
    neighborhood: "Castro",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.757373,
    longitude: -122.439561,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-lookout",
    slug: "lookout",
    name: "Lookout",
    neighborhood: "Castro",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.761821,
    longitude: -122.439271,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-midnight-sun",
    slug: "midnight-sun",
    name: "Midnight Sun",
    neighborhood: "Castro",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.762169,
    longitude: -122.427839,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-the-edge",
    slug: "the-edge",
    name: "The Edge",
    neighborhood: "Castro",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.759391,
    longitude: -122.440052,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-pilsner-inn",
    slug: "pilsner-inn",
    name: "Pilsner Inn",
    neighborhood: "Castro",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.768363,
    longitude: -122.434829,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-harvey-s",
    slug: "harvey-s",
    name: "Harvey's",
    neighborhood: "Castro",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.754764,
    longitude: -122.443152,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-the-saloon",
    slug: "the-saloon",
    name: "The Saloon",
    neighborhood: "North Beach",
    category: "live_music",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.795945,
    longitude: -122.406806,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-comstock-saloon",
    slug: "comstock-saloon",
    name: "Comstock Saloon",
    neighborhood: "North Beach",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.806181,
    longitude: -122.410501,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-tony-nik-s-cafe",
    slug: "tony-nik-s-cafe",
    name: "Tony Nik's Cafe",
    neighborhood: "North Beach",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.795253,
    longitude: -122.411231,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-15-romolo",
    slug: "15-romolo",
    name: "15 Romolo",
    neighborhood: "North Beach",
    category: "lounge",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.809242,
    longitude: -122.408576,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-bodega-north-beach",
    slug: "bodega-north-beach",
    name: "Bodega North Beach",
    neighborhood: "North Beach",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.808866,
    longitude: -122.402606,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-specs-twelve-adler-museum-cafe",
    slug: "specs-twelve-adler-museum-cafe",
    name: "Specs' Twelve Adler Museum Cafe",
    neighborhood: "North Beach",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.794472,
    longitude: -122.405127,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-maggie-mcgarry-s",
    slug: "maggie-mcgarry-s",
    name: "Maggie McGarry's",
    neighborhood: "North Beach",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.804526,
    longitude: -122.408435,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-the-boardroom",
    slug: "the-boardroom",
    name: "The Boardroom",
    neighborhood: "North Beach",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.798302,
    longitude: -122.406563,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-savoy-tivoli",
    slug: "savoy-tivoli",
    name: "Savoy Tivoli",
    neighborhood: "North Beach",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.795973,
    longitude: -122.410274,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-belle-cora",
    slug: "belle-cora",
    name: "Belle Cora",
    neighborhood: "North Beach",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.801106,
    longitude: -122.400931,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-vesuvio-cafe",
    slug: "vesuvio-cafe",
    name: "Vesuvio Cafe",
    neighborhood: "North Beach",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.807438,
    longitude: -122.413359,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-tupelo",
    slug: "tupelo",
    name: "Tupelo",
    neighborhood: "North Beach",
    category: "live_music",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.801809,
    longitude: -122.414884,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-gino-carlo",
    slug: "gino-carlo",
    name: "Gino & Carlo",
    neighborhood: "North Beach",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.807989,
    longitude: -122.402431,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-li-po-lounge",
    slug: "li-po-lounge",
    name: "Li Po Lounge",
    neighborhood: "North Beach",
    category: "lounge",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.798777,
    longitude: -122.406599,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-columbus-cafe",
    slug: "columbus-cafe",
    name: "Columbus Cafe",
    neighborhood: "North Beach",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.803435,
    longitude: -122.415349,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-balboa-cafe",
    slug: "balboa-cafe",
    name: "Balboa Cafe",
    neighborhood: "Marina",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.805138,
    longitude: -122.436891,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-white-rabbit",
    slug: "white-rabbit",
    name: "White Rabbit",
    neighborhood: "Marina",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.805379,
    longitude: -122.437054,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-westwood",
    slug: "westwood",
    name: "Westwood",
    neighborhood: "Marina",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.793709,
    longitude: -122.440765,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-the-tipsy-pig",
    slug: "the-tipsy-pig",
    name: "The Tipsy Pig",
    neighborhood: "Marina",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.793992,
    longitude: -122.429876,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-palm-house",
    slug: "palm-house",
    name: "Palm House",
    neighborhood: "Marina",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.806881,
    longitude: -122.43163,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-monaghan-s",
    slug: "monaghan-s",
    name: "Monaghan's",
    neighborhood: "Marina",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.798313,
    longitude: -122.445557,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-the-dorian",
    slug: "the-dorian",
    name: "The Dorian",
    neighborhood: "Marina",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.80687,
    longitude: -122.429555,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-reed-greenough",
    slug: "reed-greenough",
    name: "Reed & Greenough",
    neighborhood: "Marina",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.794985,
    longitude: -122.437852,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-silver-cloud",
    slug: "silver-cloud",
    name: "Silver Cloud",
    neighborhood: "Marina",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.794738,
    longitude: -122.432909,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-the-blue-light",
    slug: "the-blue-light",
    name: "The Blue Light",
    neighborhood: "Marina",
    category: "live_music",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.805188,
    longitude: -122.444289,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-the-brixton",
    slug: "the-brixton",
    name: "The Brixton",
    neighborhood: "Marina",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.800829,
    longitude: -122.436704,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-campus-sf",
    slug: "campus-sf",
    name: "Campus SF",
    neighborhood: "Marina",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.797676,
    longitude: -122.430896,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-del-mar",
    slug: "del-mar",
    name: "Del Mar",
    neighborhood: "Marina",
    category: "lounge",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.800047,
    longitude: -122.442788,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-lush-lounge",
    slug: "lush-lounge",
    name: "Lush Lounge",
    neighborhood: "Marina",
    category: "lounge",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.801789,
    longitude: -122.433461,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-the-patio",
    slug: "the-patio",
    name: "The Patio",
    neighborhood: "Marina",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.796717,
    longitude: -122.440989,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-kozy-kar",
    slug: "kozy-kar",
    name: "Kozy Kar",
    neighborhood: "Lower Nob Hill/Polk",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.797327,
    longitude: -122.418302,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-mayes-oyster-house",
    slug: "mayes-oyster-house",
    name: "Mayes Oyster House",
    neighborhood: "Lower Nob Hill/Polk",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.788972,
    longitude: -122.420684,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-mcteague-s-saloon",
    slug: "mcteague-s-saloon",
    name: "McTeague's Saloon",
    neighborhood: "Lower Nob Hill/Polk",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.784215,
    longitude: -122.425955,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-hemlock-tavern-annex",
    slug: "hemlock-tavern-annex",
    name: "Hemlock Tavern Annex",
    neighborhood: "Lower Nob Hill/Polk",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.787471,
    longitude: -122.41941,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-harper-rye",
    slug: "harper-rye",
    name: "Harper & Rye",
    neighborhood: "Lower Nob Hill/Polk",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.785852,
    longitude: -122.426036,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-route-101",
    slug: "route-101",
    name: "Route 101",
    neighborhood: "Lower Nob Hill/Polk",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.783465,
    longitude: -122.41864,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-polkcha",
    slug: "polkcha",
    name: "Polkcha",
    neighborhood: "Lower Nob Hill/Polk",
    category: "lounge",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.785834,
    longitude: -122.413702,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-hi-lo-club",
    slug: "hi-lo-club",
    name: "Hi-Lo Club",
    neighborhood: "Lower Nob Hill/Polk",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.795295,
    longitude: -122.428725,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-decodance-bar",
    slug: "decodance-bar",
    name: "Decodance Bar",
    neighborhood: "Lower Nob Hill/Polk",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.78597,
    longitude: -122.417958,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-r-bar",
    slug: "r-bar",
    name: "R Bar",
    neighborhood: "Lower Nob Hill/Polk",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.785614,
    longitude: -122.427618,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-nite-cap",
    slug: "nite-cap",
    name: "Nite Cap",
    neighborhood: "Lower Nob Hill/Polk",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.796433,
    longitude: -122.419721,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-jackalope",
    slug: "jackalope",
    name: "Jackalope",
    neighborhood: "Lower Nob Hill/Polk",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.78949,
    longitude: -122.415877,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-rouge-nightclub",
    slug: "rouge-nightclub",
    name: "Rouge Nightclub",
    neighborhood: "Lower Nob Hill/Polk",
    category: "club",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.794512,
    longitude: -122.426573,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-peacekeeper",
    slug: "peacekeeper",
    name: "Peacekeeper",
    neighborhood: "Lower Nob Hill/Polk",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.783854,
    longitude: -122.422241,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-stookey-s-club-moderne",
    slug: "stookey-s-club-moderne",
    name: "Stookey's Club Moderne",
    neighborhood: "Lower Nob Hill/Polk",
    category: "lounge",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.788754,
    longitude: -122.421594,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-linden-room",
    slug: "linden-room",
    name: "Linden Room",
    neighborhood: "Hayes Valley",
    category: "lounge",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.779836,
    longitude: -122.420979,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-absinthe-brasserie-bar",
    slug: "absinthe-brasserie-bar",
    name: "Absinthe Brasserie Bar",
    neighborhood: "Hayes Valley",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.783662,
    longitude: -122.431328,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-anina",
    slug: "anina",
    name: "Anina",
    neighborhood: "Hayes Valley",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.774939,
    longitude: -122.426993,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-hazie-s",
    slug: "hazie-s",
    name: "Hazie’s",
    neighborhood: "Hayes Valley",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.781825,
    longitude: -122.428624,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-sugar-lounge",
    slug: "sugar-lounge",
    name: "Sugar Lounge",
    neighborhood: "Hayes Valley",
    category: "lounge",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.771753,
    longitude: -122.425025,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-smuggler-s-cove",
    slug: "smuggler-s-cove",
    name: "Smuggler's Cove",
    neighborhood: "Hayes Valley",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.775228,
    longitude: -122.428086,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-phonobar",
    slug: "phonobar",
    name: "Phonobar",
    neighborhood: "Hayes Valley",
    category: "live_music",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.772647,
    longitude: -122.416481,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-brass-tacks",
    slug: "brass-tacks",
    name: "Brass Tacks",
    neighborhood: "Hayes Valley",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.775547,
    longitude: -122.417596,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-fig-thistle",
    slug: "fig-thistle",
    name: "Fig & Thistle",
    neighborhood: "Hayes Valley",
    category: "bar",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.777155,
    longitude: -122.432189,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
  {
    id: "venue-rich-table-bar",
    slug: "rich-table-bar",
    name: "Rich Table Bar",
    neighborhood: "Hayes Valley",
    category: "lounge",
    city: "San Francisco",
    state: "CA",
    countryCode: "US",
    latitude: 37.783889,
    longitude: -122.418052,
    source: "seed:mvp",
    metadata: {
      coordinateAccuracy: "approximate",
      seedVersion: "mvp_sf_2026_03"
    },
    createdAt: FIXED_CREATED_AT,
    updatedAt: FIXED_UPDATED_AT
  },
];
