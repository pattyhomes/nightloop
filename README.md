# Nightloop

Nightloop is a college-focused nightlife decision app, starting in San Francisco.

## Product intent
Help users answer **"where should we go tonight?"** in under 60 seconds using:
- map + category/filter discovery
- AI-generated venue tags and concise summaries
- live crowd/line signals from user reports
- personalization from favorites and preference signals

## Current status
Planning/docs phase. This repository currently contains MVP planning artifacts and core technical contracts.

## MVP scope (phase 1)
- venue catalog + discovery APIs
- favorites
- live reports (crowd/line/vibe)
- moderation + trust scoring
- live-state aggregation
- auto-tagging + summary generation workers
- personalized feed endpoint

## Out of scope (later)
- pre-pay cover / priority entry
- full club SaaS dashboards
- advanced social/group planning
- computer-vision line monitoring

## Core docs
- `PROJECT_STATE.md` — one-page project truth
- `MVP_TICKETS.md` — ordered execution tasks
- `schema.sql` — initial Postgres schema
- `api_contracts.md` — API surface + sample payloads

## Suggested next build step
Implement the backend foundation in this order:
1. apply `schema.sql`
2. build `GET /venues` and `GET /venues/:id`
3. add `POST /reports` + moderation queue scaffolding
4. expose live-state fields in venue responses
