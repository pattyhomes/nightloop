# Nightloop v3 Design Handoff Summary

Source: https://api.anthropic.com/v1/design/h/KZMBLzGLfObIak9NbGqcqQ?open_file=Nightloop+v3.html

Read for Phase 3:
- `nightloop/README.md`
- `nightloop/chats/chat1.md` through `chat4.md`
- `nightloop/project/Nightloop v3.html`
- `nl-shared.jsx`
- `nl-home.jsx`
- `nl-map.jsx`
- `nl-detail.jsx`
- `nl-profile.jsx`
- `nl-onboarding-b.jsx`
- `nl-decision.jsx`
- `nl-friends.jsx`
- `primitives.jsx`
- `data.jsx`

## Production Interpretation

The handoff is a design source, not a production codebase. Phase 3 ports the durable product decisions into a native SwiftUI foundation and leaves design scaffolding behind.

## Core Shell

Nightloop is a five-tab iPhone app:
- Home
- Map
- Decision
- Friends
- Profile

Each tab gets its own `NavigationStack`. Home and Venue Detail are the first real API smoke surfaces because they are the highest-traffic consumer flows.

## Visual Direction

The theme is "Midnight Orchid":
- deep orchid background: `#0b0616`
- card surface: `#140b24`
- elevated surface: `#1c1030`
- purple primary: `#a855f7`
- purple deep: `#7c3aed`
- packed rose: `#f43f5e`
- active amber: `#f59e0b`
- chill blue: `#3b5ff7`
- signal FAB orange: `#ff6b2c`

Energy is a 0-100 score displayed as a number plus a label, for example `82 · Packed`. It should not be displayed as `82/100`.

Pulse levels stay three-state:
- `1`: Chill
- `2`: Active
- `3`: Packed

## Feature Mapping

| Design file | Production SwiftUI area |
| --- | --- |
| `nl-shared.jsx` | `NightloopTheme`, shared SwiftUI atoms |
| `nl-home.jsx` | `HomeView` |
| `nl-map.jsx` | `MapShellView` now, Mapbox tab in Phase 5 |
| `nl-detail.jsx` | `VenueDetailView` |
| `nl-profile.jsx` | `ProfileView` |
| `nl-onboarding-b.jsx` | Phase 4 onboarding |
| `nl-decision.jsx` | Phase 7 group decision mode |
| `nl-friends.jsx` | Phase 6 social feed |
| `primitives.jsx` | SF Symbols/native SwiftUI equivalents |
| `data.jsx` | Fixture reference only; production reads `/api/v1` |

## Explicit Non-Ports

Do not port these into production:
- `design-canvas.jsx`
- `ios-frame.jsx`
- `PhoneFrame`
- `TweaksPanel`
- raw mock data as production truth
- the hand-drawn stylized SVG map

The production map should use Mapbox/MapLibre with a custom Midnight Orchid style in Phase 5.

## Phase 3 Scope

Phase 3 creates:
- native XcodeGen project scaffold;
- safe local config pattern;
- Supabase session restore and debug email sign-in;
- bearer-token API client;
- five-tab shell;
- live API smoke screens for Home, Venue Detail, Map placeholder, and Profile.

Phase 3 deliberately does not finish production auth, onboarding, Mapbox, social, or decision sessions.
