# Map Provider Decision Notes

Phase 5.5 switches the production native map path to Google Maps. This is a
compliance-first decision: Nightloop uses Google Places for venue verification,
and approved venue content may include Google-backed identity, address,
coordinates, type, or provider IDs.

## Current Default

Use Google Maps SDK for iOS for the production-shaped map because:

- It is the safest path when Google Places data is part of venue QA/enrichment.
- Google Cloud Map IDs can carry the subdued dark base styling.
- The app still owns venue markers, glow, filters, sheets, and signal UI.

Google logo and attribution/legal UI must remain visible. They must not be
hidden, cropped, or obscured by Nightloop controls.

## Provider Provenance Rule

Nightloop's `venues` table is canonical. Google Places and Foursquare are
verification/enrichment providers, not the iOS data source.

Before App Store-facing release, run:

```bash
npm --prefix backend run audit:venue-provenance
npm --prefix backend run audit:venue-provenance -- --json
```

The audit classifies approved venues as:

- `nightloop_owned`: seed/manual row with no Google evidence.
- `manual_curated`: curated row with no Google evidence.
- `google_verified`: Nightloop/manual identity with Google evidence.
- `google_derived`: canonical identity, address, type, or coordinates appear to
  depend on Google as the source.

Rows classified as `google_derived` must be reviewed before assuming they are
safe to render outside Google Maps. In the current production path, those rows
are expected to render on Google Maps.

## Decision Matrix

| Provider | Keep When | Risk |
| --- | --- | --- |
| Google Maps SDK | Google-derived venue content is materially used in the map. | More Google-looking base map unless Cloud styling is excellent; required Google logo/legal. |
| Mapbox | Only if Google-derived venue content is removed or independently reverified. | Required Mapbox attribution; compliance risk if Google Maps Content is rendered on a non-Google map. |
| MapKit | Native simplicity matters and visual style is good enough. | Less control over Midnight Orchid styling and label suppression. |
| MapLibre | We are ready to pick/host non-Mapbox tiles/styles. | Larger infrastructure and licensing decision; not a quick Phase 5 fix. |

## Spike Requirements

For Google Maps, test Cloud-based styling, label suppression, legal/logo
placement, bottom-sheet padding, and Nightloop marker overlays before TestFlight.

If we spike MapKit, test whether Apple styling can stay dark, minimal, and
nightlife-first without noisy default POIs.

Do not render raw Google provider records in iOS.

References: [Mapbox attribution](https://docs.mapbox.com/help/getting-started/attribution/), [Google Maps Platform Service Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms), [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies), [Google Maps iOS Cloud Styling](https://developers.google.com/maps/documentation/ios-sdk/cloud-customization).
