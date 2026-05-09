# TestFlight Build 3 First-Impression Polish Design

## Summary

Build 3 is a focused first-impression release for TestFlight. It fixes the visible
phone feedback from Build 2 and adds a controlled first slice of real venue media.
The goal is for Nightloop to feel more stable, mature, truthful, and visually
credible without turning this pass into a full redesign.

The release has two layers:

- Hotfix polish: map sheet behavior, scroll insets, preview filters, off-hours
  actions, onboarding maturity, Decision entry, Profile/Account polish, and
  bottom navigation alignment.
- Venue media: build the reusable backend media pipeline, but only run and
  publish it for a Core 10 dry-run batch if the rights and fit gates pass.

## Product Intent

Nightloop should feel like a premium nightlife utility: sleek, energetic, refined,
and honest. The app should not look like a prototype, a stock iOS form, or a fake
live feed. During daytime/off-hours it should help people plan tonight, not imply
that current crowd state is known.

Build 3 should fix patterns across the app rather than patching one screen at a
time. A behavior used in Home and Map should share the same contract. Bottom
spacing should be consistent across all tab surfaces. Off-hours action rules should
apply to Home, Map, Venue Detail, and any signal entry path.

## Core UI And UX Changes

### Shared Bottom Layout

- Keep the custom Nightloop tab bar and elevated Decision action.
- Refine tab icon/label baselines so the non-center tabs do not look too high,
  too low, or visually unrelated to the center action.
- Introduce a shared bottom content inset contract so final cards and CTAs can
  scroll fully above the tab bar.
- Add a deliberate end-of-list breathing area/fade to Home, Map, and other long
  lists so the last item is never partially trapped behind bottom chrome.
- Floating CTAs use shared offsets instead of per-screen guesses.

### Map Sheet

- Revert the Build 2 handle-only drag behavior.
- The sheet can be dragged naturally, but while a finger is down it must move
  continuously without snapping, vibrating, or changing card density.
- Snap to peek/half/full only on release.
- Do not change `sheetVenueLimit` or collapse the list to two cards during an
  active drag. Peek may show fewer rows only after it is settled.
- Aim for Apple Maps-style feel: sheet movement first, then natural list
  scrolling once expanded enough.
- Smooth map padding updates so the map does not visibly jitter while the sheet
  is moving.

### Home And Map Preview Filters

- Preview chips become real shared filters, not decorative pills.
- Selected state persists visually.
- Apply the same semantics in Home and Map:
  - `All`: all preview-eligible content.
  - `expected`: expected-tonight venues.
  - `opens later`: venues with opens-later liveness.
  - `source-backed`: venues with stronger hours/event/source evidence.
- Avoid daytime `Packed / Active / Chill` emphasis. Use preview-safe copy and
  labels.

### Off-Hours Actions And Expected Energy

- During Tonight Preview/off-hours, replace live signal CTAs with `I'm going`.
- Do not show `Packed` or live report CTAs as primary actions unless the venue is
  eligible for live signals under the existing liveness contract.
- If a user reaches a signal path off-hours, show clear copy such as: `Live
  signals open when the venue opens tonight.`
- `I'm going` is recorded/displayed now, but does not affect ranking or expected
  energy in Build 3.
- Separate live pulse from expected energy:
  - Live pulse remains strict and verified.
  - Expected energy uses preview-specific bands such as `expected mellow`,
    `expected steady`, `expected lively`, and `expected packed`.
- Recalibrate preview labels so daytime expected venues do not all collapse into
  current `Chill` copy just because scores are under 40.

### Auth Landing

- Replace the grid with a deep black/orchid gradient and restrained neon wash.
- Re-layout the landing page into intentional zones:
  - upper: launch pill and `nightloop.` wordmark, left aligned;
  - middle: concise value prop and one sleek proof line/card;
  - lower: Apple sign-in and neutral `Log in`;
  - bottom edge: `21+ · live first in SF · built for nights out, not doomscrolling`.
- Replace the three KPI pills with one readable proof line/card:
  `136 SF venues · 129 future events · 553 venue datapoints`.
- No ellipsized metric labels.
- Release UI must not expose dev/reviewer/demo language.

### Decision Entry And Create Room

- Do not show the create-room screen for a split second before auto-entering a
  room. Keep loading, empty, active-room, and lobby states distinct.
- If the user has an active room, open into the focused room view only after room
  state has loaded.
- If the user has no real room/friends, show a polished empty state:
  - primary framing: `Pick a spot with friends`;
  - CTAs: `Invite friends`, `Join with code`;
  - quieter always-available option: `Plan solo tonight`.
- `Plan solo tonight` is a real user-facing path, not a dev-only workaround.
- Replace free-text `Neighborhood` and `Type` fields with `Tune the room`.
- `Tune the room` opens a sheet with explicit choices:
  - Neighborhood list/pills from known market neighborhoods.
  - Vibe instead of type, using user-facing labels.
  - Energy: `Any`, `Chill`, `Active`, `Packed`.

### Profile And Account

- Remove stale `social phase is not wired` copy.
- Show a compact `Your crew` card only if it can display truthful data such as
  friend count, rooms tonight, or ghost mode status.
- If there is no useful social data, omit the card rather than showing filler.
- Restyle Account actions as Nightloop settings rows:
  - `Sign out`: calm neutral row.
  - `Delete account`: separated destructive row with clear red treatment.
- Avoid stock-looking iOS buttons on bare Nightloop backgrounds.

## Venue Media Pipeline

### Goal

Build the reusable media pipeline now, but keep Build 3 rollout limited to a Core
10 dry run and a small public apply if the results are good. The pipeline should
improve visual credibility without publishing sketchy or low-quality images.

### Core 10 Dry-Run Batch

Seed the first dry run with venues that appear to have viable official media
sources:

1. 1015 Folsom
2. Audio SF
3. Novela
4. Black Cat
5. Bottom of the Hill
6. Lone Star Saloon
7. Monarch SF
8. Public Works
9. Cafe Du Nord
10. Make-Out Room

The batch is allowed to publish fewer than 10 venues. If a venue only has flyers,
crowd shots, artist promos, social embeds, or unclear rights, it keeps fallback
art.

### Discovery Sources

- Start from each approved venue's existing `website_url`.
- Check common paths including `/press`, `/media`, `/media-kit`, `/press-kit`,
  `/newsroom`, `/assets`, `/brand`, `/gallery`, `/about`, `/epk`, `/photos`,
  and venue/private-event pages.
- Respect robots.txt and same-host crawl limits.
- Extract candidates from explicit image/download links, OpenGraph/Twitter image
  metadata, structured data, venue-owned gallery/media pages, and PDF/media-kit
  references.

### Rights And Fit Classification

- Auto-approve only images from venue-owned pages when the image is same-origin or
  from a clearly first-party/website-builder CDN referenced by the official page.
- Auto-approve explicit press/media-kit downloads only when page text clearly
  supports press/media/marketing use.
- Review-only: crowd/patron photos, dancefloor closeups, photographer-credited
  photos, ambiguous gallery images, and images where the venue likely may not own
  reuse rights.
- Reject by default: event flyers, posters, menus, screenshots, ticket widgets,
  social embeds, memes, artist promo images, and third-party event pages.
- Image fit gate:
  - minimum useful resolution for hero display;
  - acceptable aspect ratio for card crops;
  - content category such as `venue_space`, `stage`, `bar`, `exterior`,
    `crowd_review`, or `flyer_rejected`;
  - dedupe by URL/content hash where practical.

### Data And Publication Flow

- Add a candidate/review layer before public assets.
- Candidate records store venue ID, source page URL, image URL, source type,
  rights status, rights basis, proof excerpt, robots status, attribution fields,
  retrieval timestamp, visual-fit metadata, and optional storage path after
  approval.
- Approved candidates upload to Supabase Storage and create existing
  `venue_assets` rows.
- Use existing public asset fields:
  - `url`, `alt_text`, `credit_text`, `credit_url`, `license_name`,
    `license_url`, `rights_status`, `source`, `is_approved`, `metadata`.
- Public app consumes only approved `venue_assets`.
- Candidate proof/screenshots/raw crawl data remain internal only.

### iOS Media Display

- Keep existing `VenueArtView` and `VenueAsset` as the primary display path.
- Add a fit/maturity pass for real photos:
  - better loading and failure fallback;
  - consistent crop behavior for hero cards, rows, Decision cards, Venue Detail,
    and Friends group cards where venue art appears;
  - avoid cluttered credit overlays on small cards;
  - preserve fallback art for venues without approved media.

## Testing And Acceptance

- Backend tests:
  - media discovery dry-run writes nothing;
  - robots-disallowed pages are skipped;
  - classifier auto-approves same-origin venue/interior media;
  - classifier rejects flyers, social embeds, ticketing widgets, and artist promo
    images;
  - crowd/patron photos become review-only;
  - approved candidates create `venue_assets`, rejected/review records do not;
  - public venue payloads expose only approved asset fields.
- iOS tests:
  - preview filters select and filter in both Home and Map;
  - off-hours actions resolve to `I'm going`, not live signal;
  - map sheet drag state does not change settled detent or venue limit mid-drag;
  - bottom inset helper clears custom tab bar;
  - Decision loading state does not flash create-room before rooms load;
  - stale Profile copy is absent;
  - landing proof line uses readable compact copy.
- Manual TestFlight/simulator QA:
  - Auth landing spacing and gradient;
  - Home preview chips and final-card scroll;
  - Map sheet drag, list size, and final-card scroll;
  - off-hours venue actions;
  - Decision empty state, solo plan, and Tune the room sheet;
  - Profile and Account;
  - approved media cards on the Core 10 venues that pass the media gates.

## Rollout

- Build and verify the code normally.
- Run media discovery as a Core 10 dry run first.
- Apply/publish only if dry-run output is clean enough.
- Upload TestFlight build `0.1.0 (3)` after full backend, web, iOS, and visual
  verification passes.

## Assumptions

- Build 3 is still a focused first-impression release, not a full Friends/Decision
  redesign.
- The media pipeline is real and reusable, but rollout is Core 10 only.
- Real photos are allowed only when rights and visual-fit gates pass.
- `I'm going` is recorded/displayed but does not influence recommendations in
  Build 3.
- Unknown/off-hours venues still never claim live/open/closed outside the
  existing liveness contract.
