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

## DataSF POE Evidence

DataSF Active Entertainment Permits are now a free evidence layer for SF
coverage. They are useful for finding licensed entertainment venues and gaps,
but they are not direct product truth.

Sources:

- Live API: `https://data.sfgov.org/resource/86e8-rfem.json`
- Local review CSV: `/Users/chuckclaw/Downloads/poe_operating_status_review_20260424.csv`

Dry-run the reviewed CSV:

```bash
npm --prefix backend run import:datasf-poe -- --csv="/Users/chuckclaw/Downloads/poe_operating_status_review_20260424.csv" --dry-run
```

Use `--summary-only` when checking full-batch counts without printing every raw
candidate:

```bash
npm --prefix backend run import:datasf-poe -- --csv="/Users/chuckclaw/Downloads/poe_operating_status_review_20260424.csv" --dry-run --summary-only
```

Apply creates `provider_records` with `provider='datasf_poe'` and pending
`venue_review_items` for reviewable rows; rows classified as
`reject_non_nightlife` are skipped. It never creates public approved venues
directly.

Filtering notes:

- Prefer rows marked `likely_operating_city_registry` or
  `web_verified_operating`.
- Hold `needs_name_review_active_address` for manual review.
- Exclude or hold obvious hotels, museums, offices, gyms, generic restaurants,
  cultural-only venues, closed rows, and superseded rows.
- Use the DataSF row as evidence for licensing/operation, then verify public
  nightlife relevance through review and provider enrichment.

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
