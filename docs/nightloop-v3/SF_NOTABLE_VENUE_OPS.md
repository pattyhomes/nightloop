# SF Notable Venue Ops

This pass builds SF nightlife coverage from Nightloop curation first, then uses
providers for verification and enrichment.

## Scope

Include clubs, lounges, LGBTQ nightlife, late-night social bars, karaoke, and
live-music nightlife. Do not try to index every ordinary bar or restaurant.

## Canonical Data Rule

`venues` is the canonical table. Google Places and Foursquare are provider
evidence, not the source of truth. New curated venues enter as pending review
items and become public only after admin approval.

## Curated Import

Candidate source:

```text
data/venues/sf_notable_candidates.csv
```

Preview without writes:

```bash
npm --prefix backend run import:sf-notable -- --dry-run
```

Apply review candidates:

```bash
npm --prefix backend run import:sf-notable -- --apply
```

The import creates `provider_records` with `provider='manual'` and pending
`venue_review_items`. It never directly creates approved public venues.

## Google Verification

Use an admin provider run:

- Provider: `google_places`
- Mode: `live`
- Google run kind: `curated_qa`
- Cap: `50`

Google verification creates new Google-backed review items from pending manual
curated candidates. A clean operational match may include `create_venue`, but it
still requires admin approval. Duplicates, closed statuses, low-confidence
matches, and missing coordinates are held for manual review.

Allowed field mask:

```text
places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType,places.businessStatus,places.googleMapsUri
```

Do not add Google ratings, reviews, photos, phone, website, or hours in this
pass.

## Foursquare Enrichment

Foursquare is supplemental and capped at 20 per run. Use it after curated/Google
approval for category and operational hints only. It should not overwrite
canonical venue identity by default.

For this curated pass, use:

- Provider: `foursquare`
- Mode: `live`
- Target: `curated_sf_notable`
- Cap: `20`

This prioritizes approved `curated:sf_notable` rows with Google IDs and applies
metadata-only review proposals.

## Review Defaults

- Exact provider ID duplicate: reject or attach to existing venue.
- Same/similar nearby name: hold manual.
- Temporarily/permanently closed: hide/deactivate or hold, never hard-delete.
- Clean curated + Google match: approve only after spot review.
