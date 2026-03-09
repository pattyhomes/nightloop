# API Contracts (MVP v1)

Base path: `/api/v1`

## GET /venues
Search venues by geo + filters.

### Query
- `lat` (required)
- `lng` (required)
- `radius_km` (default 5)
- `q` (optional)
- `types` (csv: club,bar,lounge,hybrid)
- `tags` (csv)
- `sort` (`distance|match|trending`, default `match`)
- `limit` (default 20)
- `cursor` (optional)

### 200 example
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "Temple",
      "canonical_type": "club",
      "distance_km": 1.2,
      "tags": [{"key":"rowdy","confidence":0.88}],
      "live_state": {
        "crowd_level":"high",
        "line_wait_bin":"moderate",
        "status_confidence":0.76,
        "updated_at":"2026-03-09T00:00:00Z"
      },
      "summary_short": "High-energy crowd tonight; line risk building after 10:30pm."
    }
  ],
  "next_cursor": null
}
```

## GET /venues/:id
Get venue profile.

### 200 example
```json
{
  "id": "uuid",
  "name": "Temple",
  "location": {"lat":37.78,"lng":-122.40,"address":"..."},
  "price_band": "$$",
  "music_genres": ["hip_hop","top_40"],
  "tags": [{"key":"rowdy","confidence":0.88}],
  "summary": {
    "summary_short": "High-energy crowd tonight.",
    "bullets": ["Best after 10pm","Mostly college crowd"],
    "confidence": 0.81
  },
  "live_state": {
    "crowd_level":"high",
    "line_wait_bin":"moderate",
    "status_confidence":0.76,
    "updated_at":"2026-03-09T00:00:00Z"
  }
}
```

## POST /reports
Submit a live venue report.

### Request example
```json
{
  "venue_id": "uuid",
  "crowd_level": "high",
  "line_wait_bin": "moderate",
  "vibe_tags": ["rowdy", "dance_heavy"],
  "note_text": "Line moved quickly around 10:45"
}
```

### 202 example
```json
{
  "id": "report_uuid",
  "moderation_state": "pending",
  "accepted_for_processing": true
}
```

## POST /users/:id/favorites/:venueId
Favorite a venue.

### 200
```json
{"ok": true}
```

## DELETE /users/:id/favorites/:venueId
Unfavorite a venue.

### 200
```json
{"ok": true}
```

## GET /feed/personalized
Ranked recommendations.

### Query
- `user_id` (required)
- `lat` (required)
- `lng` (required)
- `limit` (default 20)

### 200 example
```json
{
  "items": [
    {
      "venue_id": "uuid",
      "score": 0.842,
      "reason_codes": ["pref_match_music","nearby","live_confidence_high"],
      "explanation": "Matches your preferred vibe, close by, and confidence is high right now."
    }
  ]
}
```

## Standard error envelope
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid value for tags",
    "details": {"field":"tags"}
  }
}
```
