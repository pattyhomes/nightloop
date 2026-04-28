import { createHash } from "crypto";
import path from "path";
import { config as loadDotenv } from "dotenv";
import { dbQuery, getDBClient } from "../lib/db";
import {
  parseIcsEvents,
  parseJsonFeedEvents,
  parseJsonLdEvents,
  parseRssEvents,
  parseVenueOwnedEventDetailLinks,
  parseVenueOwnedHtmlEvents,
  robotsAllowsPath,
  sanitizeFetchedEvent,
  type FetchedEvent,
  type SanitizedFetchedEvent
} from "../services/v1/eventIngestionService";

type Args = {
  apply: boolean;
  fetchDryRun: boolean;
  market: string;
  limit: number;
  reportMode: boolean;
  summaryOnly: boolean;
};

type EventSourceRow = {
  id: string;
  venue_id: string;
  venue_name: string;
  market_id: string;
  source_type: string;
  source_url: string | null;
  provider_id: string | null;
  trust_status: "trusted" | "review_required" | "blocked";
  robots_status: string;
  metadata: Record<string, unknown>;
};

type SourceFetchReport = {
  source_id: string;
  venue_name: string;
  source_type: string;
  source_url: string | null;
  provider_id: string | null;
  trust_status: EventSourceRow["trust_status"];
  robots_status: string;
  events_count: number;
};

const EVENTBRITE_BASE = "https://www.eventbriteapi.com/v3";
const DETAIL_FETCH_LIMIT = 25;

function parseArgs(argv: string[]): Args {
  const apply = argv.includes("--apply");
  return {
    apply,
    fetchDryRun: argv.includes("--fetch-dry-run"),
    market: argv.find((arg) => arg.startsWith("--market="))?.slice("--market=".length) ?? "san-francisco",
    limit: Number(argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length) ?? (apply ? "25" : "50")),
    reportMode: argv.includes("--report"),
    summaryOnly: argv.includes("--summary")
  };
}

async function getMarketId(market: string): Promise<string> {
  const result = await dbQuery<{ id: string }>(
    "SELECT id FROM markets WHERE id::text = $1 OR slug = $1 LIMIT 1",
    [market]
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Market not found: ${market}`);
  return row.id;
}

async function loadSources(marketId: string, limit: number): Promise<EventSourceRow[]> {
  const result = await dbQuery<EventSourceRow>(
    `
      SELECT
        ves.id,
        ves.venue_id,
        v.name AS venue_name,
        ves.market_id,
        ves.source_type,
        ves.source_url,
        ves.provider_id,
        ves.trust_status,
        ves.robots_status,
        COALESCE(ves.metadata, '{}'::jsonb) AS metadata
      FROM venue_event_sources ves
      JOIN venues v ON v.id = ves.venue_id
      WHERE ves.market_id = $1::uuid
        AND ves.trust_status <> 'blocked'
        AND v.is_active = true
        AND v.admin_status = 'approved'
        AND COALESCE(v.source, '') <> 'phase2-test'
        AND COALESCE(v.metadata->>'fixture', 'false') <> 'true'
        AND COALESCE(v.metadata->>'test_run_id', '') = ''
        AND v.name NOT ILIKE 'Phase 2 %'
      ORDER BY ves.last_fetched_at ASC NULLS FIRST, v.name ASC
      LIMIT $2
    `,
    [marketId, Math.max(1, Math.min(500, Math.floor(limit)))]
  );
  return result.rows;
}

function hashEvent(event: SanitizedFetchedEvent, source: EventSourceRow): string {
  return createHash("sha256")
    .update(`${source.id}:${event.url ?? ""}:${event.title}:${event.starts_at}`)
    .digest("hex")
    .slice(0, 24);
}

function eventSourceName(source: EventSourceRow): "eventbrite" | "venue_website" {
  return source.source_type.startsWith("eventbrite") ? "eventbrite" : "venue_website";
}

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "NightloopBot/0.1 (+https://nightloop.local)",
      ...headers
    }
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Event source fetch failed: ${response.status} ${body.slice(0, 180)}`);
  }
  return response.text();
}

async function robotsAllowed(sourceUrl: string): Promise<{ allowed: boolean; status: string }> {
  const url = new URL(sourceUrl);
  const robotsUrl = `${url.origin}/robots.txt`;
  try {
    const robots = await fetchText(robotsUrl);
    return {
      allowed: robotsAllowsPath(robots, url.pathname),
      status: robotsAllowsPath(robots, url.pathname) ? "allowed" : "disallowed"
    };
  } catch {
    return { allowed: true, status: "error" };
  }
}

function eventbriteEventsFromResponse(payload: unknown, sourceUrl: string): FetchedEvent[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const events = Array.isArray(record.events) ? record.events : [];
  return events
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((event) => ({
      source_event_id: typeof event.id === "string" ? event.id : null,
      title: typeof event.name === "object" && event.name
        ? String((event.name as Record<string, unknown>).text ?? "")
        : null,
      starts_at: typeof event.start === "object" && event.start
        ? String((event.start as Record<string, unknown>).utc ?? "")
        : null,
      ends_at: typeof event.end === "object" && event.end
        ? String((event.end as Record<string, unknown>).utc ?? "")
        : null,
      url: typeof event.url === "string" ? event.url : null,
      source_url: sourceUrl
    }));
}

function sanitizeFetchedEvents(events: FetchedEvent[]): SanitizedFetchedEvent[] {
  const sanitized: SanitizedFetchedEvent[] = [];
  for (const event of events) {
    try {
      sanitized.push(sanitizeFetchedEvent(event));
    } catch {
      continue;
    }
  }
  return sanitized;
}

async function fetchEventsForSource(source: EventSourceRow): Promise<{
  events: SanitizedFetchedEvent[];
  robotsStatus: string;
}> {
  if (source.source_type.startsWith("eventbrite")) {
    const token = process.env.EVENTBRITE_API_TOKEN;
    if (!token) throw new Error("EVENTBRITE_API_TOKEN is required for Eventbrite event source sync.");
    if (!source.provider_id) throw new Error("Eventbrite source is missing provider_id.");
    const pathName = source.source_type === "eventbrite_venue"
      ? `/venues/${encodeURIComponent(source.provider_id)}/events/`
      : `/organizations/${encodeURIComponent(source.provider_id)}/events/`;
    const url = new URL(`${EVENTBRITE_BASE}${pathName}`);
    url.searchParams.set("status", "live");
    const payload = JSON.parse(await fetchText(url.toString(), { Authorization: `Bearer ${token}` }));
    return {
      events: sanitizeFetchedEvents(eventbriteEventsFromResponse(payload, url.toString())),
      robotsStatus: "not_applicable"
    };
  }

  if (!source.source_url) throw new Error("Venue website event source is missing source_url.");
  const robots = await robotsAllowed(source.source_url);
  if (!robots.allowed) return { events: [], robotsStatus: robots.status };
  const body = await fetchText(source.source_url);
  let fetched: FetchedEvent[] = [];
  if (source.source_type === "venue_ical") fetched = parseIcsEvents(body, source.source_url);
  else if (source.source_type === "venue_json") fetched = parseJsonFeedEvents(JSON.parse(body), source.source_url);
  else if (source.source_type === "venue_rss") fetched = parseRssEvents(body, source.source_url);
  else {
    fetched = [...parseJsonLdEvents(body, source.source_url), ...parseVenueOwnedHtmlEvents(body, source.source_url)];
    for (const detailUrl of parseVenueOwnedEventDetailLinks(body, source.source_url, DETAIL_FETCH_LIMIT)) {
      try {
        const detailRobots = await robotsAllowed(detailUrl);
        if (!detailRobots.allowed) continue;
        const detailBody = await fetchText(detailUrl);
        fetched.push(...parseVenueOwnedHtmlEvents(detailBody, detailUrl));
      } catch {
        continue;
      }
    }
  }
  return {
    events: sanitizeFetchedEvents(fetched),
    robotsStatus: robots.status
  };
}

async function applyEvent(source: EventSourceRow, event: SanitizedFetchedEvent): Promise<string> {
  const eventSource = eventSourceName(source);
  const sourceEventId = event.source_event_id ?? `${source.source_type}:${hashEvent(event, source)}`;
  const approved = source.trust_status === "trusted";
  const result = await dbQuery<{ id: string }>(
    `
      INSERT INTO events (
        venue_id,
        market_id,
        title,
        starts_at,
        ends_at,
        source,
        source_event_id,
        url,
        is_approved,
        metadata
      )
      VALUES ($1::uuid, $2::uuid, $3, $4::timestamptz, $5::timestamptz, $6, $7, $8, $9, $10::jsonb)
      ON CONFLICT (source, source_event_id)
      WHERE source_event_id IS NOT NULL
      DO UPDATE SET
        venue_id = EXCLUDED.venue_id,
        market_id = EXCLUDED.market_id,
        title = EXCLUDED.title,
        starts_at = EXCLUDED.starts_at,
        ends_at = EXCLUDED.ends_at,
        url = EXCLUDED.url,
        is_approved = EXCLUDED.is_approved,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
      RETURNING id
    `,
    [
      source.venue_id,
      source.market_id,
      event.title,
      event.starts_at,
      event.ends_at,
      eventSource,
      sourceEventId,
      event.url,
      approved,
      JSON.stringify({
        ...event.metadata,
        venue_event_source_id: source.id,
        source_type: source.source_type
      })
    ]
  );

  if (!approved) {
    const existingProviderRecord = await dbQuery<{ id: string }>(
      `
        SELECT id
        FROM provider_records
        WHERE provider = $1
          AND provider_record_id = $2
          AND record_type = 'event'
          AND market_id = $3::uuid
        ORDER BY created_at ASC
        LIMIT 1
      `,
      [eventSource, sourceEventId, source.market_id]
    );
    const providerRecord = existingProviderRecord.rows[0] ? existingProviderRecord : await dbQuery<{ id: string }>(
      `
        INSERT INTO provider_records (
          provider,
          provider_record_id,
          record_type,
          market_id,
          venue_id,
          raw_payload,
          normalized_payload,
          match_confidence,
          match_status,
          license,
          attribution
        )
        VALUES ($1, $2, 'event', $3::uuid, $4::uuid, '{}'::jsonb, $5::jsonb, 0.8, 'candidate', $6::jsonb, $7::jsonb)
        ON CONFLICT DO NOTHING
        RETURNING id
      `,
      [
        eventSource,
        sourceEventId,
        source.market_id,
        source.venue_id,
        JSON.stringify(event),
        JSON.stringify({ provider_terms: eventSource, copied_promotional_content: false }),
        JSON.stringify({ provider: eventSource, source_url: event.metadata.source_url })
      ]
    );
    const providerRecordId = providerRecord.rows[0]?.id;
    if (providerRecordId) {
      await dbQuery(
        `
          INSERT INTO venue_review_items (
            provider_record_id,
            venue_id,
            market_id,
            proposed_changes
          )
          SELECT $1::uuid, $2::uuid, $3::uuid, $4::jsonb
          WHERE NOT EXISTS (
            SELECT 1
            FROM venue_review_items
            WHERE provider_record_id = $1::uuid
              AND COALESCE(venue_id, $2::uuid) = $2::uuid
              AND status = 'pending'
          )
        `,
        [
          providerRecordId,
          source.venue_id,
          source.market_id,
          JSON.stringify({ event_id: result.rows[0]?.id, review_context: { action_bucket: "event_review" } })
        ]
      );
    }
  }

  return result.rows[0]?.id;
}

async function markSource(source: EventSourceRow, robotsStatus: string, error?: string): Promise<void> {
  await dbQuery(
    `
      UPDATE venue_event_sources
      SET robots_status = $2,
          last_fetched_at = NOW(),
          last_error = $3,
          updated_at = NOW()
      WHERE id = $1::uuid
    `,
    [source.id, robotsStatus, error ?? null]
  );
}

async function main(): Promise<void> {
  loadDotenv({ path: path.resolve(process.cwd(), ".env"), quiet: true });
  loadDotenv({ path: path.resolve(process.cwd(), "../backend/.env"), quiet: true });
  const args = parseArgs(process.argv.slice(2));
  const marketId = await getMarketId(args.market);
  const sources = await loadSources(marketId, args.limit);
  const shouldFetch = args.apply || args.fetchDryRun || args.reportMode;

  const summary = {
    mode: args.apply ? "apply" : "dry-run",
    market_id: marketId,
    event_sources: sources.length,
    planned_fetches: shouldFetch ? sources.length : 0,
    writes_planned: args.apply ? "source-dependent" : 0
  };

  if (!shouldFetch) {
    console.log(JSON.stringify({
      ...summary,
      note: "Dry-run did not fetch event sources. Pass --fetch-dry-run to validate source responses without writing.",
      sources
    }, null, 2));
    return;
  }

  const events: Array<{ source_id: string; venue_name: string; event: SanitizedFetchedEvent }> = [];
  const errors: Array<{ source_id: string; venue_name: string; error: string }> = [];
  const sourceReports: SourceFetchReport[] = [];
  const seenEvents = new Set<string>();
  for (const source of sources) {
    try {
      const fetched = await fetchEventsForSource(source);
      let sourceEventCount = 0;
      for (const event of fetched.events) {
        const eventKey = `${eventSourceName(source)}:${event.source_event_id ?? event.url ?? event.title}:${event.starts_at}`;
        if (seenEvents.has(eventKey)) continue;
        seenEvents.add(eventKey);
        if (Date.parse(event.starts_at) >= Date.now() - 6 * 60 * 60 * 1000) {
          events.push({ source_id: source.id, venue_name: source.venue_name, event });
          sourceEventCount += 1;
          if (args.apply) await applyEvent(source, event);
        }
      }
      sourceReports.push({
        source_id: source.id,
        venue_name: source.venue_name,
        source_type: source.source_type,
        source_url: source.source_url,
        provider_id: source.provider_id,
        trust_status: source.trust_status,
        robots_status: fetched.robotsStatus,
        events_count: sourceEventCount
      });
      if (args.apply) await markSource(source, fetched.robotsStatus);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ source_id: source.id, venue_name: source.venue_name, error: message });
      if (args.apply) await markSource(source, "error", message);
    }
  }

  console.log(JSON.stringify({
    ...summary,
    writes_completed: args.apply ? events.length : 0,
    events_count: events.length,
    errors_count: errors.length,
    report_summary: args.reportMode ? {
      fetched_sources: sourceReports.length,
      zero_event_sources: sourceReports.filter((source) => source.events_count === 0).length,
      errored_sources: errors.length
    } : undefined,
    source_report: args.reportMode && !args.summaryOnly ? {
      zero_event_sources: sourceReports.filter((source) => source.events_count === 0),
      errored_sources: errors
    } : undefined,
    events: args.summaryOnly ? undefined : events,
    errors: args.summaryOnly ? undefined : errors
  }, null, 2));
}

main().catch((error) => {
  console.error("[venue-events] ERROR:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await getDBClient().close?.();
});
