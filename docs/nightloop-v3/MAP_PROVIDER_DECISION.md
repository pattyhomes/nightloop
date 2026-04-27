# Map Provider Decision Notes

Phase 5 keeps Mapbox as the default map while we audit provider provenance.
The switch threshold is compliance risk, not logo preference.

## Current Default

Use Mapbox for the production-shaped Phase 5 map because:

- Nightloop already has a custom `Nightloop Midnight Orchid` Studio style.
- The app owns venue markers, glow, filters, sheets, and signal UI.
- Mapbox labels can be tuned in Studio without rebuilding iOS.

Mapbox logo and attribution must remain visible. They can be repositioned and
minimized with SDK ornament options, but must not be hidden or obscured.

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
safe to render on Mapbox or MapKit.

## Decision Matrix

| Provider | Keep When | Risk |
| --- | --- | --- |
| Mapbox | Best visual match; Google is verification only. | Required Mapbox attribution; must audit Google-derived venue fields. |
| Google Maps SDK | Google-derived venue content is materially used in the map. | More Google-looking base map unless Cloud styling is excellent; required Google logo/legal. |
| MapKit | Native simplicity matters and visual style is good enough. | Less control over Midnight Orchid styling and label suppression. |
| MapLibre | We are ready to pick/host non-Mapbox tiles/styles. | Larger infrastructure and licensing decision; not a quick Phase 5 fix. |

## Spike Requirements

If we spike Google Maps, test Cloud-based styling, label suppression, legal/logo
placement, bottom-sheet padding, and Nightloop marker overlays.

If we spike MapKit, test whether Apple styling can stay dark, minimal, and
nightlife-first without noisy default POIs.

Do not render raw Google provider records in iOS for either spike.

References: [Mapbox attribution](https://docs.mapbox.com/help/getting-started/attribution/), [Google Maps Platform Service Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms), [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies), [Google Maps iOS Cloud Styling](https://developers.google.com/maps/documentation/ios-sdk/cloud-customization).
