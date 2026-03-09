const { z } = require('zod');

const CANONICAL_TYPES = ['club', 'bar', 'lounge', 'hybrid'];
const CROWD_LEVELS = ['low', 'medium', 'high', 'packed'];
const LINE_WAIT_BINS = ['none', 'short', 'moderate', 'long'];
const SORT_TYPES = ['distance', 'match', 'trending'];
const PRICE_BANDS = ['$', '$$', '$$$', '$$$$'];

const canonicalTypeSchema = z.enum(CANONICAL_TYPES);
const liveStateSchema = z.object({
  crowd_level: z.enum(CROWD_LEVELS).nullable(),
  line_wait_bin: z.enum(LINE_WAIT_BINS).nullable(),
  status_confidence: z.number().min(0).max(1).nullable(),
  updated_at: z.string().datetime(),
});

const venueTagSchema = z.object({
  key: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

const listVenueItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  canonical_type: canonicalTypeSchema,
  distance_km: z.number().nonnegative(),
  tags: z.array(venueTagSchema),
  live_state: liveStateSchema.nullable(),
  summary_short: z.string().nullable(),
});

const venuesListResponseSchema = z.object({
  items: z.array(listVenueItemSchema),
  next_cursor: z.string().nullable(),
});

const venueDetailResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    address: z.string().nullable(),
  }),
  price_band: z.enum(PRICE_BANDS).nullable(),
  music_genres: z.array(z.string()),
  tags: z.array(venueTagSchema),
  summary: z.object({
    summary_short: z.string().nullable(),
    bullets: z.array(z.string()),
    confidence: z.number().min(0).max(1).nullable(),
  }),
  live_state: liveStateSchema.nullable(),
});

function parseCsv(value) {
  if (value == null || value === '') {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item).split(','))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const venuesQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius_km: z.coerce.number().positive().max(50).default(5),
  q: z.string().trim().min(1).max(120).optional(),
  types: z.preprocess(parseCsv, z.array(canonicalTypeSchema).max(4).optional()),
  tags: z.preprocess(parseCsv, z.array(z.string().min(1).max(64)).max(20).optional()),
  sort: z.enum(SORT_TYPES).default('match'),
  limit: z.coerce.number().int().positive().max(50).default(20),
  cursor: z.coerce.number().int().min(0).default(0),
});

const venueIdParamSchema = z.object({
  id: z.string().uuid(),
});

module.exports = {
  venuesQuerySchema,
  venueIdParamSchema,
  venuesListResponseSchema,
  venueDetailResponseSchema,
};
