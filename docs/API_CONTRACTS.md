# Nightloop API Contracts

This document captures the product-facing MVP API surface worth preserving from the older Nightloop work.

These contracts are a planning target for the current `backend/` + `frontend/` architecture. They are not a claim that every route already exists.

## Current implemented routes

- `GET /health`
- `GET /api/recommendations`
- `GET /api/signals`
- `POST /api/signals`

## Target MVP routes to add next

Base path: `/api`

## GET /venues

Search venues by geo and product filters.

### Query

- `lat` required
- `lng` required
- `radius_km` default `5`
- `q` optional
- `types` csv: `club,bar,lounge,hybrid`
- `tags` csv
- `sort` one of `distance|match|trending`, default `match`
- `limit` default `20`
- `cursor` optional

### 200 example

```json
{
  "items": [
    {
      "id": "uuid",
      "name": "Temple",
      "canonical_type": "club",
      "distance_km": 1.2,
      "tags": [
        {
          "key": "rowdy",
          "confidence": 0.88
        }
      ],
      "live_state": {
        "crowd_level": "high",
        "line_wait_bin": "moderate",
        "status_confidence": 0.76,
        "updated_at": "2026-03-09T00:00:00Z"
      },
      "summary_short": "High-energy crowd tonight; line risk building after 10:30pm."
    }
  ],
  "next_cursor": null
}
```

## GET /venues/:id

Fetch a venue detail page payload.

### 200 example

```json
{
  "id": "uuid",
  "name": "Temple",
  "location": {
    "lat": 37.78,
    "lng": -122.4,
    "address": "..."
  },
  "price_band": "$$",
  "music_genres": [
    "hip_hop",
    "top_40"
  ],
  "tags": [
    {
      "key": "rowdy",
      "confidence": 0.88
    }
  ],
  "summary": {
    "summary_short": "High-energy crowd tonight.",
    "bullets": [
      "Best after 10pm",
      "Mostly college crowd"
    ],
    "confidence": 0.81
  },
  "live_state": {
    "crowd_level": "high",
    "line_wait_bin": "moderate",
    "status_confidence": 0.76,
    "updated_at": "2026-03-09T00:00:00Z"
  }
}
```

## POST /reports

Submit a nightlife status report tied to a venue.

### Request example

```json
{
  "venue_id": "uuid",
  "crowd_level": "high",
  "line_wait_bin": "moderate",
  "vibe_tags": [
    "rowdy",
    "dance_heavy"
  ],
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

### 200 example

```json
{
  "ok": true
}
```

## DELETE /users/:id/favorites/:venueId

Unfavorite a venue.

### 200 example

```json
{
  "ok": true
}
```

## GET /feed/personalized

Return a ranked recommendation feed for a user.

### Query

- `user_id` required
- `lat` required
- `lng` required
- `limit` default `20`

### 200 example

```json
{
  "items": [
    {
      "venue_id": "uuid",
      "score": 0.842,
      "reason_codes": [
        "pref_match_music",
        "nearby",
        "live_confidence_high"
      ],
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
    "details": {
      "field": "tags"
    }
  }
}
```
