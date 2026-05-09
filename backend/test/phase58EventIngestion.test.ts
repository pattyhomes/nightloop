import { describe, expect, it, vi } from "vitest";
import {
  parseIcsEvents,
  parseJsonFeedEvents,
  parseJsonLdEvents,
  parseRssEvents,
  parseVenueOwnedEventDetailLinks,
  parseVenueOwnedHtmlEvents,
  robotsAllowsPath,
  sanitizeFetchedEvent
} from "../src/services/v1/eventIngestionService";
import { analyzeEventSourcesFromHtml, discoverEventSourcesFromHtml } from "../src/services/v1/eventSourceDiscovery";

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

  it("parses Audio SF same-host event detail pages with date-only precision", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T12:00:00Z"));
    try {
      const events = parseVenueOwnedHtmlEvents(`
<title>SPECIAL GUEST - Friday, May 01 | Audio SF</title>
<div id="event-container-date"><a href="#">Fri. May 01</a></div>
<div id="event-container-title">SPECIAL GUEST</div>
<form target="_blank" action="https://eventim.us/event/special-guest/688309?afflky=AudioSF" method="get"></form>
<img src="https://audiosf.com/images/uploaded_files/poster.jpg">
`, "https://www.audiosf.com/event/special-guest-05-01/");

      expect(sanitizeFetchedEvent(events[0])).toMatchObject({
        source_event_id: "https://www.audiosf.com/event/special-guest-05-01/",
        title: "SPECIAL GUEST",
        starts_at: "2026-05-02T05:00:00.000Z",
        url: "https://eventim.us/event/special-guest/688309?afflky=AudioSF",
        metadata: {
          source_url: "https://www.audiosf.com/event/special-guest-05-01/",
          time_precision: "date_only_default_22"
        }
      });
      expect(JSON.stringify(sanitizeFetchedEvent(events[0]))).not.toContain("poster.jpg");
    } finally {
      vi.useRealTimers();
    }
  });

  it("parses 1015 official event blocks without fetching Eventim", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T12:00:00Z"));
    try {
      const events = parseVenueOwnedHtmlEvents(`
<a href="https://wl.eventim.us/event/angrybaby/677895?afflky=1015Folsom">
  <img data-nectar-img-src="https://1015.com/wp-content/uploads/poster.jpg" />
</a>
<div class="wpb_text_column"><div class="wpb_wrapper">
  <h4>Friday, May 1st</h4>
  <h3><strong>Angrybaby</strong></h3>
</div></div>
`, "https://1015.com/");

      expect(sanitizeFetchedEvent(events[0])).toMatchObject({
        title: "Angrybaby",
        starts_at: "2026-05-02T05:00:00.000Z",
        url: "https://wl.eventim.us/event/angrybaby/677895?afflky=1015Folsom",
        metadata: {
          source_url: "https://1015.com/",
          time_precision: "date_only_default_22"
        }
      });
      expect(JSON.stringify(sanitizeFetchedEvent(events[0]))).not.toContain("poster.jpg");
    } finally {
      vi.useRealTimers();
    }
  });

  it("parses Boom Boom Room RHP event cards without storing ticket provider payloads", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-28T12:00:00Z"));
    try {
      const events = parseVenueOwnedHtmlEvents(`
<div class="col-12 p-0 rhp-events-list-widget-events">
  <div class="mb-2 eventDate eventMonth text-uppercase font0by875">fri, Jun 12</div>
  <h4 class="entry-title summary mb-0">
    <a href="https://boomboomroom.com/event/tracorum/client-club-demo/san-francisco-california/" rel="bookmark">
      TRACORUM and BON BON VIVANT
    </a>
  </h4>
  <a class="btn" href="https://www.etix.com/ticket/p/70236779/example">Tickets</a>
</div>
`, "https://boomboomroom.com/");

      expect(sanitizeFetchedEvent(events[0])).toMatchObject({
        source_event_id: "https://boomboomroom.com/event/tracorum/client-club-demo/san-francisco-california/",
        title: "TRACORUM and BON BON VIVANT",
        starts_at: "2026-06-13T05:00:00.000Z",
        url: "https://boomboomroom.com/event/tracorum/client-club-demo/san-francisco-california/",
        metadata: {
          source_url: "https://boomboomroom.com/",
          time_precision: "date_only_default_22"
        }
      });
      expect(JSON.stringify(sanitizeFetchedEvent(events[0]))).not.toContain("etix.com");
    } finally {
      vi.useRealTimers();
    }
  });

  it("parses Bottom of the Hill RSS event dates and door times", () => {
    const events = parseRssEvents(`
<rss><channel>
  <item>
    <guid>bottom-20260512</guid>
    <title>2026 05/12 : Electric Six ~ Tragedy</title>
    <description><![CDATA[<b>Electric Six<br />Tragedy</b><br />8PM doors -- music 9PM<br />$22]]></description>
    <link>http://www.bottomofthehill.com/20260512.html</link>
    <pubDate>Tue, 06 Jan 2026 00:00:00 -0800</pubDate>
  </item>
</channel></rss>
`, "https://bottomofthehill.com/RSS.xml");

    expect(sanitizeFetchedEvent(events[0])).toMatchObject({
      source_event_id: "bottom-20260512",
      title: "Electric Six ~ Tragedy",
      starts_at: "2026-05-13T03:00:00.000Z",
      url: "http://www.bottomofthehill.com/20260512.html",
      metadata: {
        source_url: "https://bottomofthehill.com/RSS.xml"
      }
    });
  });

  it("marks Bottom of the Hill RSS dates without door times as date-only defaults", () => {
    const events = parseRssEvents(`
<rss><channel>
  <item>
    <guid>bottom-20260513</guid>
    <title>2026 05/13 : Mystery Show</title>
    <description><![CDATA[<b>Mystery Show</b><br />$18]]></description>
    <link>http://www.bottomofthehill.com/20260513.html</link>
  </item>
</channel></rss>
`, "https://bottomofthehill.com/RSS.xml");

    expect(sanitizeFetchedEvent(events[0])).toMatchObject({
      starts_at: "2026-05-14T05:00:00.000Z",
      metadata: {
        time_precision: "date_only_default_22"
      }
    });
  });

  it("extracts only same-host venue detail links for one-hop enrichment", () => {
    const links = parseVenueOwnedEventDetailLinks(`
<a href="/event/special-guest-05-01/">Special Guest</a>
<a href="/tm-event/otis-kane/">Otis Kane</a>
<a href="https://wl.eventim.us/event/angrybaby/677895">Tickets</a>
<a href="https://facebook.com/events/123">Facebook</a>
`, "https://www.audiosf.com/events/");

    expect(links).toEqual([
      "https://www.audiosf.com/event/special-guest-05-01/",
      "https://www.audiosf.com/tm-event/otis-kane/"
    ]);
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

  it("discovers venue-owned RSS/XML feeds even when the link label is generic", () => {
    const sources = discoverEventSourcesFromHtml(`
<html><body>
  <a href="/RSS.xml"><img src="/rsslogo.png"></a>
  <a href="/comments/feed/">Comments Feed</a>
</body></html>
`, "https://venue.example/calendar.html");

    expect(sources).toEqual([
      expect.objectContaining({ source_type: "venue_rss", source_url: "https://venue.example/RSS.xml" })
    ]);
    expect(JSON.stringify(sources)).not.toContain("comments/feed");
  });

  it("does not discover generic non-event RSS feeds as venue event sources", () => {
    const sources = discoverEventSourcesFromHtml(`
<html><body>
  <a href="/feed/">Blog Feed</a>
  <a href="/wp-json/wp/v2/posts">Posts JSON</a>
  <a href="/events/feed/">Events Feed</a>
</body></html>
`, "https://venue.example/");

    expect(sources).toEqual([
      expect.objectContaining({ source_type: "venue_rss", source_url: "https://venue.example/events/feed/" })
    ]);
    expect(JSON.stringify(sources)).not.toContain("https://venue.example/feed/");
    expect(JSON.stringify(sources)).not.toContain("wp-json");
  });

  it("does not persist one-off event detail pages as reusable event sources", () => {
    const sources = discoverEventSourcesFromHtml(`
<html><body>
  <a href="/events/">All Events</a>
  <a href="/tm-event/otis-kane/">More Info</a>
  <a href="/event/coco-breezy-05-02/">Coco Breezy</a>
  <a href="/calendar">Calendar</a>
</body></html>
`, "https://venue.example/");

    expect(sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ source_url: "https://venue.example/events/" }),
      expect.objectContaining({ source_url: "https://venue.example/calendar" })
    ]));
    expect(JSON.stringify(sources)).not.toContain("/tm-event/");
    expect(JSON.stringify(sources)).not.toContain("/event/coco-breezy");
  });

  it("reports durable, detail-page, rejected, and errored discovery buckets for ops review", () => {
    const report = analyzeEventSourcesFromHtml(`
<html><body>
  <a href="/events">Events</a>
  <a href="/tm-event/otis-kane/">More Info</a>
  <a href="/private">Private</a>
  <link href="/wp-content/themes/site.css">
  <a href="https://www.eventbrite.com/o/nightloop-room-123456789">Eventbrite</a>
</body></html>
`, "https://venue.example/");

    expect(report.durable_sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ source_url: "https://venue.example/events" }),
      expect.objectContaining({ source_type: "eventbrite_organizer", provider_id: "123456789" })
    ]));
    expect(report.detail_page_candidates).toEqual([
      expect.objectContaining({ source_url: "https://venue.example/tm-event/otis-kane/", reason: "one_off_event_detail_page" })
    ]);
    expect(report.rejected_candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ source_url: "https://venue.example/private", reason: "static_or_excluded" }),
      expect.objectContaining({ source_url: "https://venue.example/wp-content/themes/site.css", reason: "static_or_excluded" })
    ]));
    expect(report.errored_candidates).toEqual([]);
  });
});
