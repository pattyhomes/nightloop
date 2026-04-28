import { describe, expect, it, vi } from "vitest";
import {
  parseIcsEvents,
  parseJsonFeedEvents,
  parseJsonLdEvents,
  parseRssEvents,
  parseVenueOwnedHtmlEvents,
  robotsAllowsPath,
  sanitizeFetchedEvent
} from "../src/services/v1/eventIngestionService";
import { discoverEventSourcesFromHtml } from "../src/services/v1/eventSourceDiscovery";

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

  it("parses venue-owned TicketWeb plugin event markup without image or description payloads", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T12:00:00Z"));
    try {
      const events = parseVenueOwnedHtmlEvents(`
<div class="three columns date-img-wrapper">
  <span class="tw-event-date">5.1</span>
  <a href="https://venue.example/tm-event/otis-kane/" title="Event Name - Otis Kane with Hugo de la Lune | Event Date - 01 May"><span>Otis Kane</span></a>
  <span class="tw-event-time">Show: 8:00 pm</span>
  <img src="https://venue.example/poster.jpg" alt="promo art">
  <div class="tw-description">Long promo text.</div>
</div>
`, "https://venue.example/tm-event/otis-kane/");

      expect(sanitizeFetchedEvent(events[0])).toMatchObject({
        source_event_id: "https://venue.example/tm-event/otis-kane/",
        title: "Otis Kane with Hugo de la Lune",
        starts_at: "2026-05-02T03:00:00.000Z",
        ends_at: null,
        url: "https://venue.example/tm-event/otis-kane/",
        metadata: {
          source_url: "https://venue.example/tm-event/otis-kane/"
        }
      });
      expect(JSON.stringify(sanitizeFetchedEvent(events[0]))).not.toContain("poster.jpg");
      expect(JSON.stringify(sanitizeFetchedEvent(events[0]))).not.toContain("Long promo text");
    } finally {
      vi.useRealTimers();
    }
  });

  it("discovers venue-owned event pages and feeds without storing promo content", () => {
    const sources = discoverEventSourcesFromHtml(`
<html><body>
  <a href="/events">Events</a>
  <a href="/events/feed">Events RSS</a>
  <a href="/calendar.ics">iCal</a>
  <a href="/">Calendar</a>
  <link href="/wp-content/themes/site/css/build/style-non-critical.css?ver=1">
  <link href="/comments/feed/">
  <a href="/venue-rental">Book An Event</a>
  <a href="/private">Private</a>
  <a href="https://tickets.example.com/venue">Third-party tickets</a>
  <a href="https://www.eventbrite.com/o/nightloop-room-123456789">Eventbrite</a>
</body></html>
`, "https://venue.example/");

    expect(sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ source_type: "venue_json_ld", source_url: "https://venue.example/events" }),
      expect.objectContaining({ source_type: "venue_rss", source_url: "https://venue.example/events/feed" }),
      expect.objectContaining({ source_type: "venue_ical", source_url: "https://venue.example/calendar.ics" }),
      expect.objectContaining({ source_type: "eventbrite_organizer", provider_id: "123456789", source_url: null })
    ]));
    expect(JSON.stringify(sources)).not.toContain("tickets.example.com");
    expect(JSON.stringify(sources)).not.toContain("/private");
    expect(JSON.stringify(sources)).not.toContain("non-critical.css");
    expect(JSON.stringify(sources)).not.toContain("comments/feed");
    expect(JSON.stringify(sources)).not.toContain("venue-rental");
    expect(JSON.stringify(sources)).not.toContain("\"https://venue.example/\"");
  });
});
