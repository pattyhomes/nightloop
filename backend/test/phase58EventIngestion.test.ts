import { describe, expect, it } from "vitest";
import {
  parseIcsEvents,
  parseJsonFeedEvents,
  parseJsonLdEvents,
  parseRssEvents,
  robotsAllowsPath,
  sanitizeFetchedEvent
} from "../src/services/v1/eventIngestionService";

describe("Phase 5.8 venue event ingestion", () => {
  it("parses iCal feeds and stores only approved event fields", () => {
    const events = parseIcsEvents(`
BEGIN:VCALENDAR
BEGIN:VEVENT
UID:event-101@example.com
SUMMARY:Saturday Night Dance
DTSTART:20260426T050000Z
DTEND:20260426T090000Z
DESCRIPTION:Long promo copy should be dropped.
URL:https://venue.example/events/saturday
END:VEVENT
END:VCALENDAR
`, "https://venue.example/events.ics");

    expect(events).toHaveLength(1);
    expect(sanitizeFetchedEvent(events[0])).toEqual({
      source_event_id: "event-101@example.com",
      title: "Saturday Night Dance",
      starts_at: "2026-04-26T05:00:00.000Z",
      ends_at: "2026-04-26T09:00:00.000Z",
      url: "https://venue.example/events/saturday",
      metadata: {
        source_url: "https://venue.example/events.ics"
      }
    });
  });

  it("parses website JSON-LD without retaining descriptions or images", () => {
    const events = parseJsonLdEvents(`
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "Basement Room",
  "startDate": "2026-04-25T22:00:00-07:00",
  "endDate": "2026-04-26T02:00:00-07:00",
  "url": "https://venue.example/basement-room",
  "description": "Artist bio and promo copy",
  "image": "https://venue.example/poster.jpg",
  "offers": { "price": "20" }
}
</script>
</head></html>
`, "https://venue.example/events");

    const sanitized = sanitizeFetchedEvent(events[0]);
    expect(sanitized).toMatchObject({
      title: "Basement Room",
      starts_at: "2026-04-26T05:00:00.000Z",
      ends_at: "2026-04-26T09:00:00.000Z",
      url: "https://venue.example/basement-room",
      metadata: {
        cover_amount_dollars: 20,
        source_url: "https://venue.example/events"
      }
    });
    expect(JSON.stringify(sanitized)).not.toContain("Artist bio");
    expect(JSON.stringify(sanitized)).not.toContain("poster.jpg");
  });

  it("parses simple venue JSON and RSS feeds", () => {
    const jsonEvents = parseJsonFeedEvents({
      events: [
        {
          id: "json-1",
          title: "Late Set",
          start: "2026-04-25T23:00:00-07:00",
          end: "2026-04-26T02:00:00-07:00",
          url: "https://venue.example/json-1"
        }
      ]
    }, "https://venue.example/events?format=json");

    const rssEvents = parseRssEvents(`
<rss><channel>
  <item>
    <guid>rss-1</guid>
    <title>House Night</title>
    <link>https://venue.example/rss-1</link>
    <startDate>2026-04-25T22:30:00-07:00</startDate>
    <endDate>2026-04-26T01:30:00-07:00</endDate>
    <description>Drop this promo copy.</description>
  </item>
</channel></rss>
`, "https://venue.example/feed");

    expect(sanitizeFetchedEvent(jsonEvents[0]).source_event_id).toBe("json-1");
    expect(sanitizeFetchedEvent(rssEvents[0])).toMatchObject({
      source_event_id: "rss-1",
      title: "House Night",
      starts_at: "2026-04-26T05:30:00.000Z"
    });
  });

  it("respects robots disallow rules for venue-owned website fetches", () => {
    const robots = `
User-agent: *
Disallow: /private
Allow: /events
`;

    expect(robotsAllowsPath(robots, "/events")).toBe(true);
    expect(robotsAllowsPath(robots, "/private/show")).toBe(false);
  });
});
