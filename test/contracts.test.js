const test = require('node:test');
const assert = require('node:assert/strict');
const { venuesListResponseSchema, venueDetailResponseSchema } = require('../src/contracts/venues');

test('GET /venues response matches contract schema', () => {
  const payload = {
    items: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Temple',
        canonical_type: 'club',
        distance_km: 1.2,
        tags: [{ key: 'rowdy', confidence: 0.88 }],
        live_state: {
          crowd_level: 'high',
          line_wait_bin: 'moderate',
          status_confidence: 0.76,
          updated_at: '2026-03-09T00:00:00Z',
        },
        summary_short: 'High-energy crowd tonight; line risk building after 10:30pm.',
      },
    ],
    next_cursor: null,
  };

  assert.doesNotThrow(() => venuesListResponseSchema.parse(payload));
});

test('GET /venues/:id response matches contract schema', () => {
  const payload = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Temple',
    location: { lat: 37.78, lng: -122.4, address: '540 Howard St, San Francisco, CA' },
    price_band: '$$',
    music_genres: ['hip_hop', 'top_40'],
    tags: [{ key: 'rowdy', confidence: 0.88 }],
    summary: {
      summary_short: 'High-energy crowd tonight.',
      bullets: ['Best after 10pm', 'Mostly college crowd'],
      confidence: 0.81,
    },
    live_state: {
      crowd_level: 'high',
      line_wait_bin: 'moderate',
      status_confidence: 0.76,
      updated_at: '2026-03-09T00:00:00Z',
    },
  };

  assert.doesNotThrow(() => venueDetailResponseSchema.parse(payload));
});
